'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { searchLiterature, expandQuery } = require('../lib/research');
const { createStudioServer } = require('../scripts/studio');
const studioFetch = require('./helpers/studio-fetch');

const topic = '心房颤动脉冲电场消融术';
const searchQuery = '"atrial fibrillation" AND "pulsed field ablation"';
const rescueTopic = '急性心肌梗死黄金抢救 120 分钟';

test('中文预设使用完整术语，保留英文文献检索式', () => {
  assert.equal(expandQuery(topic), searchQuery);
  assert.equal(expandQuery('经导管主动脉瓣置换术 (TAVR)'), '"transcatheter aortic valve replacement" AND TAVR');
  assert.equal(expandQuery('脑卒中早期识别与 FAST 口诀'), '"stroke" AND FAST');
  assert.equal(expandQuery('"diabetes mellitus" OR asthma'), '"diabetes mellitus" OR asthma');
  assert.match(expandQuery(rescueTopic), /STEMI\) AND \("time to reperfusion".*"door-to-balloon time"/);
  assert.equal(expandQuery('急性心肌梗死'), '"acute myocardial infarction"');
  assert.match(expandQuery('高血压长期服药三大常见误区'), /"hypertension" AND \("medication adherence"/);
});

test('救治时间选题使用相关性优先分页，并保持 PubMed 返回顺序', async t => {
  const get = t.mock.method(axios, 'get', async (url, { params }) => {
    assert.match(url, /eutils\.ncbi\.nlm\.nih\.gov/);
    if (url.endsWith('esearch.fcgi')) {
      assert.equal(params.term, expandQuery(rescueTopic));
      assert.equal(params.sort, 'relevance');
      assert.equal(params.retmax, 15);
      assert.equal(params.usehistory, 'y');
      const ids = Array.from({ length: 15 }, (_, i) => String(200 - i));
      return { data: { esearchresult: { idlist: ids, count: '16', webenv: 'MCID_TEST', querykey: '1' } } };
    }
    if (!params.id) {
      assert.equal(params.WebEnv, 'MCID_TEST');
      assert.equal(params.query_key, '1');
      assert.equal(params.retstart, 15);
      return { data: { result: { uids: ['42'], 42: { title: 'Reperfusion study 42' } } } };
    }
    const result = Object.fromEntries(params.id.split(',').map(id => [id, { title: `Reperfusion study ${id}` }]));
    return { data: { result } };
  });
  const first = await searchLiterature(rescueTopic);
  assert.equal(first.articles.length, 15);
  assert.equal(first.articles[0].id, 'pmid_200');
  assert.equal(first.total, 16);
  assert.equal(first.nextPage.offset, 15);
  const second = await searchLiterature(rescueTopic, { page: first.nextPage });
  assert.match(get.mock.calls[2].arguments[0], /esummary\.fcgi$/);
  assert.equal(second.articles[0].id, 'pmid_42');
  assert.equal(second.nextPage, null);
});

test('Europe PMC 继续使用原检索的游标，文献标题解码为纯文本', async t => {
  const get = t.mock.method(axios, 'get', async (url, { params }) => {
    assert.match(url, /ebi\.ac\.uk/);
    const first = params.cursorMark === '*';
    const id = first ? '1' : '2';
    return { data: {
      hitCount: 2, nextCursorMark: first ? 'next-cursor' : 'last-cursor',
      resultList: { result: [{ id, title: '&lt;b&gt;A &amp; B&lt;/b&gt;: p < 0.05' }] }
    } };
  });
  const first = await searchLiterature(topic, { maxResults: 1 });
  assert.equal(first.articles[0].title, 'A & B: p < 0.05');
  const second = await searchLiterature(topic, { maxResults: 1, page: first.nextPage });
  assert.equal(get.mock.calls[1].arguments[1].params.cursorMark, 'next-cursor');
  assert.equal(second.articles[0].id, 'epmc_MED_2');
  assert.equal(second.nextPage, null);
  assert.equal((await searchLiterature(topic, { page: { provider: 'invalid', offset: 1 } })).status, 'invalid');
  assert.equal(get.mock.callCount(), 2);
});

test('OpenAlex 追加下一页时使用基础分页和相关性排序', async t => {
  const get = t.mock.method(axios, 'get', async (url, { params }) => {
    if (!url.includes('api.openalex.org')) throw new Error('Unavailable');
    assert.equal(params.sort, 'relevance_score:desc');
    assert.equal(params.per_page, 1);
    return { data: {
      meta: { count: 2 },
      results: [{ id: `https://openalex.org/W${params.page}`, title: 'A relevant paper' }]
    } };
  });
  const first = await searchLiterature(topic, { maxResults: 1 });
  assert.equal(first.articles[0].id, 'oalex_W1');
  const second = await searchLiterature(topic, { maxResults: 1, page: first.nextPage });
  assert.equal(second.articles[0].id, 'oalex_W2');
  assert.equal(second.nextPage, null);
  assert.equal(get.mock.callCount(), 4);
});

test('Europe PMC 无命中或请求失败时从 PubMed 获取书目', async (t) => {
  for (const firstFails of [false, true]) {
    await t.test(firstFails ? '上游失败' : '上游无命中', async (sub) => {
      const calls = [];
      sub.mock.method(axios, 'get', async (url, { params }) => {
        calls.push(url);
        if (url.includes('/europepmc/')) {
          assert.equal(params.query, searchQuery);
          if (firstFails) throw Object.assign(new Error('unavailable'), { response: { status: 503 } });
          return { data: { hitCount: 0, resultList: { result: [] } } };
        }
        if (url.endsWith('esearch.fcgi')) {
          assert.equal(params.term, searchQuery);
          assert.equal(params.retmax, 3);
          return { data: { esearchresult: { idlist: ['37634148'] } } };
        }
        if (url.endsWith('esummary.fcgi')) {
          assert.equal(params.id, '37634148');
          return { data: { result: { 37634148: { title: 'Pulsed Field or Conventional Thermal Ablation', pubdate: '2023 Nov 2', articleids: [{ idtype: 'doi', value: '10.1056/NEJMoa2307291' }] } } } };
        }
        throw new Error('Unexpected provider');
      });
      const result = await searchLiterature(topic, { maxResults: 3 });
      assert.equal(calls.length, 3);
      assert.equal(result.status, 'found');
      assert.equal(result.provider, 'PubMed');
      assert.equal(result.articles[0].url, 'https://pubmed.ncbi.nlm.nih.gov/37634148/');
      assert.equal(result.articles[0].year, '2023');
      assert.deepEqual(result.extractedFacts, []);
      assert.equal(result.attempts[0].status, firstFails ? 'error' : 'empty');
    });
  }
});

test('HTTP API 区分上游全失败与正常无命中', async (t) => {
  let allFail = true;
  t.mock.method(axios, 'get', async (url) => {
    if (url.includes('europepmc') && !allFail) return { data: { hitCount: 0, resultList: { result: [] } } };
    if (url.includes('openalex')) throw Object.assign(new Error('rate limited'), { response: { status: 429 } });
    if (url.includes('ncbi.nlm.nih.gov')) return { data: '<html>Bad gateway</html>' };
    throw Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
  });
  const app = createStudioServer({ port: 0 });
  const { port } = await app.start();
  t.after(() => app.close());
  const post = query => studioFetch(app)(`http://127.0.0.1:${port}/api/research`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query })
  });
  assert.equal((await post('  ')).status, 400);
  const failed = await post('example');
  assert.equal(failed.status, 503);
  const body = await failed.json();
  assert.equal(body.status, 'unavailable');
  assert.deepEqual(body.attempts.map(a => a.reason), ['超时', '返回格式异常', 'HTTP 429']);
  allFail = false;
  const empty = await post('example');
  assert.equal(empty.status, 200);
  const emptyBody = await empty.json();
  assert.equal(emptyBody.status, 'empty');
  assert.match(emptyBody.message, /Europe PMC（无命中）.*OpenAlex（HTTP 429）/);
});

test('PubMed 摘要按选中的 ID 获取，拒绝非文献 URL', async t => {
  const { fetchArticleAbstract } = require('../lib/research');
  const get = t.mock.method(axios, 'get', async (url, { params }) => {
    assert.equal(url, 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi');
    assert.equal(params.id, '37634148');
    return { data: '<PubmedArticleSet><PubmedArticle><MedlineCitation><Article><Abstract><AbstractText Label="METHODS">Trial with <i>two groups</i> &amp; follow-up.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>' };
  });
  assert.equal(await fetchArticleAbstract('pmid_37634148'), 'METHODS: Trial with two groups & follow-up.');
  await assert.rejects(() => fetchArticleAbstract('https://example.com/'), { statusCode: 400 });
  assert.equal(get.mock.callCount(), 1);
});

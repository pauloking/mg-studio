'use strict';
/* research.js — 权威医学与科学文献检索引擎
 * 支持 Europe PMC、PubMed 与 OpenAlex 的书目检索及常见中文术语映射。
 */
const axios = require('axios');
const { DOMParser } = require('@xmldom/xmldom');

// 常见医学与生命科学术语，优先匹配较长的中文短语。
const TERM_MAP = {
  '房颤': 'atrial fibrillation',
  '心房颤动': 'atrial fibrillation',
  '脉冲电场消融术': 'pulsed field ablation',
  '脉冲电场消融': 'pulsed field ablation',
  '脉冲场消融': 'pulsed field ablation',
  '消融': 'catheter ablation',
  '脉冲消融': 'pulsed field ablation',
  '冷冻消融': 'cryoballoon ablation',
  '高血压': 'hypertension',
  '冠心病': 'coronary artery disease',
  '急性心肌梗死': 'acute myocardial infarction',
  '心肌梗死': 'myocardial infarction',
  '心梗': 'myocardial infarction',
  '支架': 'coronary stent',
  '胸痛': 'chest pain angina',
  '心律失常': 'cardiac arrhythmia',
  '心衰': 'heart failure',
  '心力衰竭': 'heart failure',
  '脑卒中': 'stroke',
  '中风': 'stroke',
  '溶栓': 'thrombolytic therapy',
  '糖尿病': 'diabetes mellitus',
  '降压药': 'antihypertensive drugs',
  '心肺复苏': 'cardiopulmonary resuscitation',
  '他汀': 'statin lipid lowering',
  '经导管主动脉瓣置换术': 'transcatheter aortic valve replacement',
  '经导管主动脉瓣置换': 'transcatheter aortic valve replacement',
  '主动脉瓣': 'aortic valve',
  '人工智能': 'artificial intelligence healthcare',
  '基因治疗': 'gene therapy'
};

// 内置权威医学高频选题与循证证据库（离线与高可用回退）
const CURATED_KNOWLEDGE = {
  '房颤': [
    { claim: '心房颤动是最常见的持续性心律失常，可增加5倍脑卒中风险。', source: 'ESC Guidelines for the management of atrial fibrillation', year: '2024' },
    { claim: '脉冲电场消融（PFA）利用高压电脉冲引起细胞膜不可逆电穿孔，具备心肌组织选择性。', source: 'New England Journal of Medicine (ADVENT Trial)', year: '2024' },
    { claim: '导管消融可有效恢复并维持窦性心律，显著改善患者活动耐量与生活质量。', source: 'Circulation (Heart Rhythm Society Consensus)', year: '2023' }
  ],
  '心梗': [
    { claim: '急性心肌梗死发病后120分钟内为黄金救治时间窗口。', source: '中华医学会心血管病学分会《急性STEMI诊断与治疗指南》', year: '2023' },
    { claim: '突发胸骨后压榨样疼痛持续超过15分钟且休息不缓解，应立即停止活动并拨打120。', source: 'AHA/ACC Clinical Practice Guidelines', year: '2024' },
    { claim: '尽早开通闭塞冠状动脉（急诊PCI或溶栓）是挽救濒死心肌、降低死亡率的关键。', source: 'The Lancet (Global Burden of Ischemic Heart Disease)', year: '2023' }
  ],
  '高血压': [
    { claim: '绝大多数原发性高血压患者需长期规范服药，切忌无症状自行停药或间歇服药。', source: '中国高血压防治指南（2024年修订版）', year: '2024' },
    { claim: '长效降压药物可平稳控制24小时血压，保护心脑肾等重要靶器官。', source: 'Journal of the American College of Cardiology', year: '2023' },
    { claim: '限制钠盐摄入（每日低于5克）与规律有氧运动可协同辅助降低收缩压。', source: 'WHO Global Report on Hypertension', year: '2023' }
  ],
  '脑卒中': [
    { claim: '识别中风快速口诀FAST：看面部、查手臂、听语言、快就医。', source: 'American Stroke Association', year: '2024' },
    { claim: '缺血性卒中静脉溶栓时间窗严格限制在发病4.5小时内。', source: '中国急性缺血性脑卒中诊治指南', year: '2023' },
    { claim: '大血管闭塞患者符合适应症者可在24小时内评估行急诊血管内机械取栓。', source: 'New England Journal of Medicine (Endovascular Thrombectomy)', year: '2023' }
  ],
  'tavr': [
    { claim: '经导管主动脉瓣置换术（TAVR）无需开胸体外循环，通过微创介入途径植入人工瓣膜。', source: 'Journal of the American College of Cardiology (PARTNER 3)', year: '2024' },
    { claim: '重度主动脉瓣狭窄患者出现晕厥、心绞痛或心衰症状后，药物治疗2年死亡率高达50%。', source: 'Circulation: Cardiovascular Interventions', year: '2023' },
    { claim: 'TAVR 现已从外科手术高危/禁忌患者扩展至中低危老年主动脉瓣严重钙化狭窄人群。', source: 'ESC/EACTS Guidelines for the management of valvular heart disease', year: '2024' }
  ]
};

const CHINESE_TERM = new RegExp(Object.keys(TERM_MAP).sort((a, b) => b.length - a.length).join('|'), 'g');
const INFARCTION = /急性心肌梗死|心肌梗死|心梗|STEMI/i;
const RESCUE_TIMING = /黄金(?:抢救|救治)|(?:抢救|救治|再灌注)(?:时间|时限)|时间窗|120\s*分钟/;
const BLOOD_PRESSURE_ADHERENCE = /长期(?:用|服)药|用药误区|服药依从|停药/;

function expandQuery(query) {
  const terms = new Set();
  const infarctionTiming = INFARCTION.test(query) && RESCUE_TIMING.test(query);
  const remainder = query.replace(CHINESE_TERM, term => {
    if (!infarctionTiming || !INFARCTION.test(term)) terms.add(`"${TERM_MAP[term]}"`);
    return ' ';
  });
  if (infarctionTiming) {
    terms.add('("ST elevation myocardial infarction" OR "acute myocardial infarction" OR STEMI)');
    terms.add('("time to reperfusion" OR "reperfusion delay" OR "door-to-balloon time" OR "first medical contact" OR "treatment delay")');
  }
  if (!terms.size) return query;
  if (query.includes('高血压') && BLOOD_PRESSURE_ADHERENCE.test(query)) {
    terms.add('("medication adherence" OR "treatment persistence" OR "antihypertensive withdrawal")');
  }
  // Retain typed acronyms and English phrases while dropping untranslated prose.
  for (const word of (infarctionTiming ? remainder.replace(/\bSTEMI\b/gi, '') : remainder).match(/"[^"\r\n]+"|[a-z][a-z0-9-]*/gi) || []) {
    if (!/^(AND|OR|NOT)$/i.test(word)) terms.add(word);
  }
  return [...terms].join(' AND ');
}

async function getJson(url, params, headers) {
  const timeout = 5500;
  const { data } = await axios.get(url, { params, headers, timeout, signal: AbortSignal.timeout(timeout) });
  return data;
}

function plainTitle(title) {
  if (!title) return '（无标题）';
  const tags = /<\/?(?:b|i|em|strong|sub|sup|span)(?:\s[^>]*)?>/gi;
  const literal = title.replace(tags, '').replace(/</g, '&lt;');
  const parser = new DOMParser({ errorHandler: { warning() {}, error() {}, fatalError() {} } });
  const decoded = parser.parseFromString(`<body>${literal}</body>`, 'text/html').documentElement.textContent;
  return decoded.replace(tags, '').trim() || '（无标题）';
}

async function searchEuropePMC(query, maxResults, page) {
  const cursor = page?.cursor || '*';
  const data = await getJson('https://www.ebi.ac.uk/europepmc/webservices/rest/search', {
    query, resultType: 'lite', pageSize: maxResults, format: 'json', cursorMark: cursor
  });
  const results = data?.resultList?.result;
  if (data?.hitCount === 0 && !results) return { articles: [], total: 0 };
  if (!Array.isArray(results)) throw new Error('Invalid Europe PMC response');
  const articles = results.map(item => ({
    id: `epmc_${item.source || 'MED'}_${item.id}`,
    title: plainTitle(item.title),
    authors: item.authorString || '',
    journal: item.journalTitle || '',
    year: item.pubYear || '',
    doi: item.doi || '',
    url: item.doi ? `https://doi.org/${item.doi}` : `https://europepmc.org/article/${item.source || 'MED'}/${item.id}`,
    source: 'Europe PMC'
  }));
  const offset = (page?.offset || 0) + results.length;
  const total = data.hitCount;
  const next = results.length && offset < total && data.nextCursorMark && data.nextCursorMark !== cursor
    ? { offset, cursor: data.nextCursorMark } : null;
  return { articles, total, next };
}

const PUBMED_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

async function startPubMedSearch(query, maxResults) {
  const idQuery = /^\d+$/.test(query) ? `${query}[uid]` : query;
  const search = await getJson(`${PUBMED_API}/esearch.fcgi`, {
    db: 'pubmed', term: idQuery, retmode: 'json', retmax: maxResults,
    usehistory: 'y', sort: 'relevance'
  });
  const result = search?.esearchresult;
  const ids = result?.idlist;
  if (!Array.isArray(ids)) throw new Error('Invalid PubMed search response');
  return { ids, total: Number(result.count), history: result.webenv, queryKey: result.querykey, offset: 0 };
}

async function searchPubMed(query, maxResults, page) {
  const search = page || await startPubMedSearch(query, maxResults);
  const { total, history, queryKey, offset } = search;
  if (search.ids?.length === 0) return { articles: [], total };
  // The Entrez History server keeps the original Best Match order while users page.
  const selection = page
    ? { WebEnv: history, query_key: queryKey, retstart: offset, retmax: Math.min(maxResults, 10000 - offset) }
    : { id: search.ids.join(',') };
  const summaries = await getJson(`${PUBMED_API}/esummary.fcgi`, {
    db: 'pubmed', retmode: 'json', ...selection
  });
  const ids = search.ids || summaries?.result?.uids;
  if (!Array.isArray(ids)) throw new Error('Invalid PubMed summaries');
  const articles = ids.map(id => {
    const item = summaries?.result?.[id];
    if (!item?.title) return null;
    return {
      id: `pmid_${id}`,
      title: plainTitle(item.title),
      authors: (item.authors || []).map(a => a.name).join(', '),
      journal: item.fulljournalname || item.source || '',
      year: (item.pubdate || '').match(/\b\d{4}\b/)?.[0] || '',
      doi: (item.articleids || []).find(identifier => identifier.idtype === 'doi')?.value || '',
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      source: 'PubMed'
    };
  }).filter(Boolean);
  if (!articles.length) throw new Error('Invalid PubMed summaries');
  const nextOffset = offset + ids.length;
  const next = history && queryKey && nextOffset < Math.min(total, 10000)
    ? { offset: nextOffset, total, history, queryKey } : null;
  return { articles, total, next };
}

async function searchOpenAlex(query, maxResults, page) {
  const key = process.env.OPENALEX_API_KEY;
  const pageNumber = (page?.offset || 0) / maxResults + 1;
  const data = await getJson('https://api.openalex.org/works', {
    search: query, per_page: maxResults, page: pageNumber, sort: 'relevance_score:desc'
  },
    key ? { Authorization: `Bearer ${key}` } : undefined);
  if (!Array.isArray(data?.results)) throw new Error('Invalid OpenAlex response');
  const articles = data.results.map(item => ({
    id: `oalex_${item.id.replace('https://openalex.org/', '')}`,
    title: plainTitle(item.title),
    authors: (item.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean).join(', '),
    journal: item.primary_location?.source?.display_name || '',
    year: String(item.publication_year || ''),
    doi: item.doi?.replace('https://doi.org/', '') || '',
    url: item.doi || item.id,
    source: 'OpenAlex'
  }));
  const offset = pageNumber * maxResults;
  const total = data.meta?.count;
  const next = articles.length && offset < total && offset + maxResults <= 10000 ? { offset } : null;
  return { articles, total, next };
}

async function fetchArticleAbstract(id) {
  const parser = new DOMParser({ errorHandler: { warning() {}, error() {}, fatalError() {} } });
  const pmid = /^(?:pmid_|epmc_MED_)(\d{1,10})$/.exec(id)?.[1];
  if (pmid) {
    const xml = await getJson(`${PUBMED_API}/efetch.fcgi`, {
      db: 'pubmed', id: pmid, retmode: 'xml', tool: 'mg-studio'
    });
    const article = parser.parseFromString(xml, 'application/xml').getElementsByTagName('PubmedArticle')[0];
    if (!article) throw new Error('PubMed 未返回这篇文献');
    const abstract = article.getElementsByTagName('Abstract')[0];
    if (!abstract) return '';
    return Array.from(abstract.getElementsByTagName('AbstractText'), p => {
      const label = p.getAttribute('Label');
      return (label ? label + ': ' : '') + p.textContent.trim();
    }).join('\n\n').trim();
  }
  const epmc = /^epmc_([A-Z]{2,5})_([A-Za-z0-9.-]{1,48})$/.exec(id);
  if (epmc) {
    const data = await getJson('https://www.ebi.ac.uk/europepmc/webservices/rest/search', {
      query: `EXT_ID:"${epmc[2]}" AND SRC:${epmc[1]}`, resultType: 'core', pageSize: 1, format: 'json'
    });
    const item = data?.resultList?.result?.find(record => record.id === epmc[2] && record.source === epmc[1]);
    if (!item) throw new Error('Europe PMC 未返回这篇文献');
    const html = (item.abstractText || '').replace(/<\/?(?:p|div|br|h[1-6])(?:\s[^>]*)?\s*\/?>/gi, '\n');
    return parser.parseFromString(`<body>${html}</body>`, 'text/html').documentElement.textContent.trim();
  }
  const work = /^oalex_(W\d{1,20})$/.exec(id)?.[1];
  if (work) {
    const key = process.env.OPENALEX_API_KEY;
    const result = await getJson(`https://api.openalex.org/works/${work}`, { select: 'id,abstract_inverted_index' },
      key ? { Authorization: `Bearer ${key}` } : undefined);
    if (result?.id !== `https://openalex.org/${work}`) throw new Error('OpenAlex 未返回这篇文献');
    const words = [];
    for (const [word, positions] of Object.entries(result.abstract_inverted_index || {})) {
      for (const position of positions) if (Number.isInteger(position) && position >= 0 && position < 10000) words[position] = word;
    }
    return words.join(' ').trim();
  }
  throw Object.assign(new Error('无法识别文献编号'), { statusCode: 400 });
}

function getFallbackFacts(query) {
  const qLower = (query || '').toLowerCase();
  for (const [k, facts] of Object.entries(CURATED_KNOWLEDGE)) {
    if (qLower.includes(k)) {
      return facts.map(f => Object.assign({}, f, { verified: false }));
    }
  }
  // 通用医学科普底线事实
  return [
    { claim: `${query}需由专业医生结合临床检查综合评估，不可盲目套用网传经验。`, source: '中华医学会全科医学专业委员会指南', year: '2024', verified: false },
    { claim: '出现剧烈胸痛、突发肢体无力或意识障碍等急危重症体征，须立即就近就医。', source: '中国医师协会急诊医师分会急救共识', year: '2024', verified: false },
    { claim: '科普内容仅供健康常识参考，不构成个体化诊疗处方与医疗方案指导。', source: '国家卫生健康委员会医学科普规范', year: '2024', verified: false }
  ];
}

async function searchLiterature(query, options = {}) {
  const limit = Number(options.maxResults);
  const maxResults = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 20) : 15;
  const cleanQuery = typeof query === 'string' ? query.trim() : '';
  const searchQuery = expandQuery(cleanQuery);
  const attempts = [];
  const base = { query: cleanQuery, searchQuery, articles: [], extractedFacts: [], mode: 'bibliography-only', attempts };
  if (!cleanQuery) return { ...base, ok: false, status: 'invalid', error: '请输入文献检索关键词。' };

  let providers = [
    ['Europe PMC', searchEuropePMC],
    ['PubMed', searchPubMed],
    ['OpenAlex', searchOpenAlex]
  ];
  // Use PubMed Best Match first for focused clinical queries.
  if (searchQuery !== cleanQuery && / OR /.test(searchQuery)) {
    providers = [providers[1], providers[0], providers[2]];
  }
  const page = options.page;
  if (page != null) {
    providers = providers.filter(([provider]) => provider === page.provider);
    const validOffset = Number.isSafeInteger(page.offset) && page.offset > 0;
    let validPosition = false;
    if (page.provider === 'PubMed') {
      validPosition = Number.isSafeInteger(page.total) && page.offset < Math.min(page.total, 10000)
        && typeof page.history === 'string' && /^[\w-]{1,512}$/.test(page.history)
        && typeof page.queryKey === 'string' && /^\d{1,8}$/.test(page.queryKey);
    } else if (page.provider === 'Europe PMC') {
      validPosition = typeof page.cursor === 'string' && page.cursor.length > 0 && page.cursor.length <= 2048;
    } else if (page.provider === 'OpenAlex') {
      validPosition = page.offset % maxResults === 0 && page.offset + maxResults <= 10000;
    }
    if (!providers.length || !validOffset || !validPosition) {
      return { ...base, ok: false, status: 'invalid', error: '分页已失效，请重新检索。' };
    }
  }
  for (const [provider, search] of providers) {
    try {
      const { articles, total, next } = await search(searchQuery, maxResults, page);
      attempts.push({ provider, status: articles.length ? 'found' : 'empty' });
      if (articles.length || page) {
        return { ...base, ok: true, status: articles.length ? 'found' : 'empty', provider, articles,
          total: Number.isSafeInteger(total) ? total : null, nextPage: next ? { provider, ...next } : null };
      }
    } catch (error) {
      const status = error.response?.status;
      const reason = status ? `HTTP ${status}`
        : ['ERR_CANCELED', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code) ? '超时'
          : error.code ? '连接失败' : '返回格式异常';
      attempts.push({ provider, status: 'error', reason });
    }
  }

  const details = attempts.map(a => `${a.provider}（${a.reason || '无命中'}）`).join('、');
  if (attempts.every(a => a.status === 'error')) {
    return { ...base, ok: false, status: 'unavailable', error: `文献数据库暂不可用。${details}。请稍后试一次。` };
  }
  const hint = /\p{Script=Han}/u.test(cleanQuery) ? '可以试用英文关键词、DOI 或 PMID。' : '可以缩短或调整关键词。';
  return { ...base, ok: true, status: 'empty', message: `${details}。${hint}` };
}

function extractEvidenceClaims(query, articles = []) {
  // Search APIs currently return bibliographic metadata only. A title, journal
  // and DOI do not support an evidence claim. Return no claims until grounded
  // extraction from an abstract/full text with a supporting passage is available.
  return [];
}

function getCuratedTopics() {
  return [
    { title: '心房颤动脉冲电场消融术', category: '心血管介入', audience: 'patient', template: 'science' },
    { title: '急性心肌梗死黄金抢救 120 分钟', category: '急救科普', audience: 'patient', template: 'science' },
    { title: '高血压长期服药三大常见误区', category: '慢病管理', audience: 'patient', template: 'science' },
    { title: '经导管主动脉瓣置换术 (TAVR)', category: '微创瓣膜', audience: 'professional', template: 'science' },
    { title: '脑卒中早期识别与 FAST 口诀', category: '神经急救', audience: 'patient', template: 'teaching' }
  ];
}

module.exports = {
  searchLiterature,
  fetchArticleAbstract,
  extractEvidenceClaims,
  getFallbackFacts,
  getCuratedTopics,
  expandQuery
};

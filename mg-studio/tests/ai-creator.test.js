const studioFetch = require('./helpers/studio-fetch');
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { searchLiterature, extractEvidenceClaims, getCuratedTopics } = require('../lib/research');
const { buildStoryboardDefinition, writeAndCompileGeneratedProject } = require('../lib/ai-generator');
const { createStudioServer } = require('../scripts/studio');
const ir = require('../lib/ir');
const { LAYOUT_NAMES } = require('../lib/components');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');

function copyFixture(name, fixture) {
  const work = path.join(ROOT, 'tests', 'work', name);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(FIX, fixture), work, { recursive: true });
  return work;
}

test('research: searchLiterature 与 extractEvidenceClaims 仅返回书目信息，不伪造事实', async (t) => {
  t.mock.method(require('axios'), 'get', async () => ({ data: { resultList: { result: [{ id: '123', title: 'Unrelated paper', pubYear: '2024' }] } } }));
  const res = await searchLiterature('心房颤动脉冲消融', { maxResults: 3 });
  assert.equal(res.ok, true);
  assert.equal(res.query, '心房颤动脉冲消融');
  assert.ok(Array.isArray(res.articles));
  assert.ok(Array.isArray(res.extractedFacts));
  assert.equal(res.articles.length, 1);
  assert.deepEqual(res.extractedFacts, []);
  assert.equal(res.mode, 'bibliography-only');

  const topics = getCuratedTopics();
  assert.ok(Array.isArray(topics));
  assert.ok(topics.length >= 4);
});

test('ai-generator: buildStoryboardDefinition 生成符合 IR v2 与门禁规范的故事骨架与分镜', () => {
  const { story, scenes } = buildStoryboardDefinition({
    topic: '急性心肌梗死急救黄金时间',
    audience: 'patient',
    template: 'science',
    durationTarget: 50,
    style: 'clean-medical',
    facts: [
      { claim: '这份资料介绍了急诊心电图的用途', evidence: '资料甲', _checked: true },
      { claim: '这份资料讨论了研究对象和适用范围', evidence: '资料乙', _checked: true }
    ]
  });

  assert.equal(story.schema, 2);
  assert.equal(story.meta.title, '急性心肌梗死急救黄金时间');
  assert.equal(story.meta.audience, 'patient');
  assert.equal(story.meta.template, 'science');
  assert.equal(story.meta.style, 'clean-medical');
  assert.equal(story.beats.length, 4);

  const roles = story.beats.map(b => b.role);
  assert.deepEqual(roles, ['hook', 'mechanism', 'evidence', 'takeaway']);

  // 情绪跨度验证 (>= 2)
  const emotions = story.beats.map(b => b.emotion);
  const deltaEm = Math.max(...emotions) - Math.min(...emotions);
  assert.ok(deltaEm >= 2, `情绪跨度应 >= 2，实际为: ${deltaEm}`);

  // 患者向免责声明验证
  const outroNarration = story.beats[story.beats.length - 1].narration;
  assert.ok(outroNarration.includes('不构成诊疗建议'), '患者向 outro 必须包含免责声明');

  // 分镜与 beats 1:1 映射
  assert.equal(scenes.length, 4);
  scenes.forEach((sc, idx) => {
    assert.equal(sc.id, story.beats[idx].id);
    assert.equal(sc.beat, story.beats[idx].id);
    assert.ok(LAYOUT_NAMES.includes(sc.layout));
    assert.ok(Array.isArray(sc.elements));
    assert.ok(sc.elements.length > 0);
  });
});

test('ai-generator: writeAndCompileGeneratedProject 患者向初稿被医学门阻断（verified 待核实）', () => {
  const work = path.join(ROOT, 'tests', 'work', 'ai-creator-compile');
  fs.rmSync(work, { recursive: true, force: true });

  const def = buildStoryboardDefinition({
    topic: '高血压用药三大误区',
    audience: 'patient',
    template: 'science',
    style: 'clean-medical',
    facts: [{ claim: '参考资料尚未核实', _checked: false }]
  });

  const res = writeAndCompileGeneratedProject(work, def);
  // 第六轮修复后：AI 初稿 facts 一律待核实 → MED_FACT_UNVERIFIED B 级阻断，不写产物。
  // 创作者在向导逐条核实后才会放行（设计文档 §6 的人工核实流程）。
  assert.equal(res.ok, false);
  assert.ok(res.compile.errors.some(e => e.includes('MED_FACT_UNVERIFIED')), '应命中未核实诊断: ' + res.compile.errors.join('|'));
  assert.ok(!fs.existsSync(path.join(work, 'scene.html')), '阻断时不写 scene.html');
});

test('ai-generator: 全部核实后（_checked）患者向项目放行', () => {
  const work = path.join(ROOT, 'tests', 'work', 'ai-creator-verified');
  fs.rmSync(work, { recursive: true, force: true });

  const def = buildStoryboardDefinition({
    topic: '高血压用药三大误区',
    audience: 'patient',
    template: 'science',
    style: 'clean-medical',
    facts: [
      { claim: '高血压需长期规范服药', source: '中国高血压防治指南', _checked: true },
      { claim: '擅自停药可致血压反弹', source: '中国高血压防治指南', _checked: true },
      { claim: '生活方式干预是基础', source: '中国高血压防治指南', _checked: true }
    ]
  });

  const res = writeAndCompileGeneratedProject(work, def);
  assert.equal(res.ok, true, '全核实后应放行: ' + (res.compile.errors || []).join('|'));
  assert.ok(fs.existsSync(path.join(work, 'scene.html')), '放行时应写 scene.html');
});

test('REST API: 选题检索、一键创建与分镜增删改闭环测试', async (t) => {
  t.mock.method(require('axios'), 'get', async () => ({ data: { resultList: { result: [] } } }));
  let work = copyFixture('ai-creator-server-test', 'mini-style-medical');
  const port = 3980 + Math.floor(Math.random() * 50);
  const projectsDir = path.join(work, 'new-projects');
  const app = createStudioServer({ projectDir: work, port, projectsDir });
  await app.start();
  const fetch = studioFetch(app);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /api/topics
    const resTopics = await fetch(baseUrl + '/api/topics');
    assert.equal(resTopics.status, 200);
    const topicsData = await resTopics.json();
    assert.equal(topicsData.ok, true);
    assert.ok(topicsData.topics.length > 0);

    // 2. POST /api/research
    const resResearch = await fetch(baseUrl + '/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '脑卒中', maxResults: 3 })
    });
    assert.equal(resResearch.status, 200);
    const researchData = await resResearch.json();
    assert.equal(researchData.ok, true);
    assert.deepEqual(researchData.extractedFacts, []);

    // 3. POST /api/create-project (一键生成全新工程)
    const resCreate = await fetch(baseUrl + '/api/create-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: '经导管主动脉瓣置换 (TAVR)',
        audience: 'patient',
        template: 'science',
        durationTarget: 45,
        style: 'clean-medical',
        facts: [{ claim: '资料待核实', _checked: false }]
      })
    });
    assert.equal(resCreate.status, 200);
    const createData = await resCreate.json();
    // 第六轮修复后：检索抽取的 facts 未经创作者核实（无 _checked）→ 医学门阻断编译，
    // 但 API 仍 200 返回生成定义（前端展示"待核实"状态引导人工核实）。
    assert.equal(createData.ok, false, '未核实的患者向初稿应被医学门阻断');
    assert.ok(createData.compile.errors.some(e => e.includes('MED_FACT_UNVERIFIED')), '应命中未核实诊断');
    assert.equal(createData.story.meta.title, '经导管主动脉瓣置换 (TAVR)');
    assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'story.json'))).meta.title, '心律科普');
    assert.equal(app.projectDir, work, '创建失败必须保留当前项目');
    const created = await (await fetch(baseUrl + '/api/create-project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: '新工程', facts: [{ claim: '请结合原始资料理解适用条件', _checked: true }] })
    })).json();
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.notEqual(created.projectDir, work);
    assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'story.json'))).meta.title, '心律科普');
    work = created.projectDir;


    // 4. POST /api/beat/add (动态插入新分镜)
    const resAddBeat = await fetch(baseUrl + '/api/beat/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beat: {
          id: 'custom_detail',
          role: 'mechanism',
          emotion: 3,
          narration: '通过微创鞘管将人工瓣膜送达主动脉根部。'
        },
        layout: 'points',
        afterIndex: 2
      })
    });
    assert.equal(resAddBeat.status, 200);
    const addData = await resAddBeat.json();
    assert.equal(addData.ok, true);
    assert.ok(addData.project.story.beats.some(b => b.id === 'custom_detail'));
    assert.ok(fs.existsSync(path.join(work, 'scenes', 'custom_detail.json')));

    // 5. POST /api/beat/reorder (调整分镜顺序)
    const currentOrder = addData.project.story.beats.map(b => b.id);
    // 把最后一个移到最前面（作为测试）
    const reordered = [currentOrder[currentOrder.length - 1], ...currentOrder.slice(0, -1)];
    const resReorder = await fetch(baseUrl + '/api/beat/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: reordered })
    });
    assert.equal(resReorder.status, 200);
    const reorderData = await resReorder.json();
    assert.equal(reorderData.ok, true);

    // 6. POST /api/beat/delete (删除插入的分镜)
    const resDelBeat = await fetch(baseUrl + '/api/beat/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beatId: 'custom_detail' })
    });
    assert.equal(resDelBeat.status, 200);
    const delData = await resDelBeat.json();
    assert.equal(delData.ok, true);
    assert.ok(!delData.project.story.beats.some(b => b.id === 'custom_detail'));
    assert.ok(!fs.existsSync(path.join(work, 'scenes', 'custom_detail.json')));

  } finally {
    await app.close();
  }
});

test('同一份带来源的分镜预览用于导入，重试时复用已有工程', async t => {
  const work = copyFixture('preview-source', 'mini-style-medical');
  const root = path.join(work, 'generated');
  const app = createStudioServer({ projectDir: work, projectsDir: root, port: 0 });
  const { port } = await app.start();
  t.after(() => app.close());
  const post = (route, body) => studioFetch(app)(`http://127.0.0.1:${port}/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('preview-project', { topic: '演示' })).status, 422);
  const claim = '这项研究比较了两种操作方式';
  const source = { id: 'pmid_37634148', title: 'Trial title', url: 'https://pubmed.ncbi.nlm.nih.gov/37634148/' };
  const facts = [{ claim, citation: source, excerpt: 'Original excerpt', _checked: true }];
  const preview = await (await post('preview-project', { topic: '演示研究', facts })).json();
  assert.equal(preview.ok, true);
  assert.equal(preview.scenes.length, 3);
  assert.equal(preview.scenes[1].elements[0].props.desc, claim);
  assert.deepEqual(preview.story.beats[1].facts[0].citation, source);
  assert.equal(fs.existsSync(root), false);
  const create = await (await post('create-project', { previewId: preview.previewId, topic: 'should not replace preview' })).json();
  assert.equal(create.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(create.projectDir, 'story.json'))), preview.story);
  assert.equal(JSON.parse(fs.readFileSync(path.join(create.projectDir, 'scenes', 'fact_1.json'))).elements[0].props.desc, claim);
  assert.deepEqual((await (await post('create-project', { previewId: preview.previewId })).json()).projectDir, create.projectDir);
  assert.equal(fs.readdirSync(root).length, 1);
});

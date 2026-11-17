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

test('research: searchLiterature 与 extractEvidenceClaims 提供权威文献与结构化事实', async () => {
  const res = await searchLiterature('心房颤动脉冲消融', { maxResults: 3 });
  assert.equal(res.ok, true);
  assert.equal(res.query, '心房颤动脉冲消融');
  assert.ok(Array.isArray(res.articles));
  assert.ok(Array.isArray(res.extractedFacts));
  assert.ok(res.extractedFacts.length >= 3, '应提取至少 3 条事实候选');
  assert.ok(res.extractedFacts[0].claim);
  assert.ok(res.extractedFacts[0].source);

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
    style: 'clean-medical'
  });

  assert.equal(story.schema, 2);
  assert.equal(story.meta.title, '急性心肌梗死急救黄金时间');
  assert.equal(story.meta.audience, 'patient');
  assert.equal(story.meta.template, 'science');
  assert.equal(story.meta.style, 'clean-medical');
  assert.equal(story.beats.length, 5);

  const roles = story.beats.map(b => b.role);
  assert.deepEqual(roles, ['hook', 'conflict', 'mechanism', 'evidence', 'takeaway']);

  // 情绪跨度验证 (>= 2)
  const emotions = story.beats.map(b => b.emotion);
  const deltaEm = Math.max(...emotions) - Math.min(...emotions);
  assert.ok(deltaEm >= 2, `情绪跨度应 >= 2，实际为: ${deltaEm}`);

  // 患者向免责声明验证
  const outroNarration = story.beats[story.beats.length - 1].narration;
  assert.ok(outroNarration.includes('不构成诊疗建议'), '患者向 outro 必须包含免责声明');

  // 分镜与 beats 1:1 映射
  assert.equal(scenes.length, 5);
  scenes.forEach((sc, idx) => {
    assert.equal(sc.id, story.beats[idx].id);
    assert.equal(sc.beat, story.beats[idx].id);
    assert.ok(LAYOUT_NAMES.includes(sc.layout));
    assert.ok(Array.isArray(sc.elements));
    assert.ok(sc.elements.length > 0);
  });
});

test('ai-generator: writeAndCompileGeneratedProject 落地并全量编译成功', () => {
  const work = path.join(ROOT, 'tests', 'work', 'ai-creator-compile');
  fs.rmSync(work, { recursive: true, force: true });

  const def = buildStoryboardDefinition({
    topic: '高血压用药三大误区',
    audience: 'patient',
    template: 'science',
    style: 'clean-medical'
  });

  const res = writeAndCompileGeneratedProject(work, def);
  assert.equal(res.ok, true);
  assert.equal(res.compile.mode, 'v2');
  assert.deepEqual(res.compile.errors, []);
  assert.ok(fs.existsSync(path.join(work, 'story.json')));
  assert.ok(fs.existsSync(path.join(work, 'script.json')));
  assert.ok(fs.existsSync(path.join(work, 'scene.html')));
});

test('REST API: 选题检索、一键创建与分镜增删改闭环测试', async () => {
  const work = copyFixture('ai-creator-server-test', 'mini-style-medical');
  const port = 3980 + Math.floor(Math.random() * 50);
  const app = createStudioServer({ projectDir: work, port });
  await app.start();
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
    assert.ok(researchData.extractedFacts.length >= 3);

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
        facts: researchData.extractedFacts
      })
    });
    assert.equal(resCreate.status, 200);
    const createData = await resCreate.json();
    assert.equal(createData.ok, true);
    assert.equal(createData.story.meta.title, '经导管主动脉瓣置换 (TAVR)');

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

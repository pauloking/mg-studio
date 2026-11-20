'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const director = require('../lib/director');
const { createStudioServer } = require('../scripts/studio');
const { writeAndCompileGeneratedProject } = require('../lib/ai-generator');
const studioFetch = require('./helpers/studio-fetch');

test('three built-in stories compile with distinct narration, visual assets and per-shot movements', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-director-plans-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const sample of Object.keys(director.samples)) {
    const plan = await director.createFromBrief({ sample });
    const result = writeAndCompileGeneratedProject(path.join(dir, sample), plan);
    assert.equal(result.ok, true, JSON.stringify(result.compile.errors));
    assert.equal(result.scenes.length, 4);
    assert.ok(new Set(plan.scenes.flatMap(sc => sc.elements.map(el => el.props.action))).size >= 4);
    const html = fs.readFileSync(result.compile.htmlPath, 'utf8');
    assert.match(html, /updateDirected/);
    assert.match(html, /dir-icon/);
  }
});

test('configured model produces the editable plan, with lock, scope and undo on the API', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-director-api-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let calls = 0;
  const mock = http.createServer(async (req, res) => {
    assert.equal(req.url, '/v1/chat/completions');
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    assert.equal(request.model, 'test-model');
    const { shots } = director.samples.rain;
    const task = JSON.parse(request.messages[1].content);
    if (calls === 0) assert.deepEqual(task.media, { name: '图解.svg', kind: 'image' });
    const plan = calls++ === 0 ? { title: '模型的雨水片', shots: shots.map((shot, i) => ({ ...shot, useReference: i === 2 })) }
      : { shots: [{ ...shots[1], transition: 'push', narration: '这句应该被旁白锁定覆盖。' }] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }));
  });
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => mock.close(resolve)));
  const app = createStudioServer({ projectDir: dir, projectsDir: dir, port: 0 });
  const { port } = await app.start();
  t.after(() => app.close());
  const base = 'http://127.0.0.1:' + port;
  const fetch = studioFetch(app);
  const post = async (route, body) => {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) };
  };
  const drawing = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="10"/></svg>');
  const plan = await post('/api/director/plan', { brief: '给孩子解释城市雨水去哪了',
    media: { name: '图解.svg', source: 'imported', data: 'data:image/svg+xml;base64,' + drawing.toString('base64') }, connection: {
    endpoint: 'http://127.0.0.1:' + mock.address().port + '/v1', model: 'test-model'
  }});
  assert.equal(plan.ok, true);
  assert.equal(plan.story.meta.title, '模型的雨水片');
  assert.ok(plan.scenes[2].elements.some(el => el.props.kind === 'image' && el.props.media.name === '图解.svg'));
  const created = await post('/api/create-project', { previewId: plan.previewId });
  assert.ok(created.ok);
  const file = id => path.join(created.projectDir, 'scenes', id + '.json');
  const neighbor = fs.readFileSync(file('shot_1'), 'utf8');
  const initial = fs.readFileSync(file('shot_2'), 'utf8');
  const narration = () => JSON.parse(fs.readFileSync(path.join(created.projectDir, 'story.json'), 'utf8')).beats[1].narration;
  const previousNarration = narration();
  const shot = (action, body = {}) => post('/api/director/shot', { id: 'shot_2', action, ...body });
  assert.equal((await shot('lock')).locked, true);
  assert.equal((await shot('revise', { instruction: '改成推进式构图' })).status, 409);
  assert.equal((await shot('lock')).locked, false);
  const result = await shot('revise', { instruction: '改成推进式构图', keepNarration: true });
  assert.equal(result.ok, true);
  assert.equal(result.narrationChanged, false);
  assert.equal(narration(), previousNarration);
  assert.equal(JSON.parse(fs.readFileSync(file('shot_2'))).transition, 'push');
  assert.equal(fs.readFileSync(file('shot_1'), 'utf8'), neighbor);
  assert.equal((await shot('undo')).ok, true);
  assert.equal(fs.readFileSync(file('shot_2'), 'utf8'), initial);
  const readModel = (await (await fetch(base + '/api/project')).json()).project.scenes[1];
  const saved = await post('/api/scene', { scene: { ...readModel, narration: '雨水顺着路面流向排水口。' } });
  assert.equal(saved.ok, true);
  assert.equal(narration(), '雨水顺着路面流向排水口。');
  assert.equal(calls, 2);
});

test('locally revised sample can change composition or duration without rewriting evidence', async () => {
  const plan = await director.createFromBrief({ sample: 'medical' });
  const beat = plan.story.beats[1];
  const scene = plan.scenes[1];
  const patch = await director.reviseShot({ project: plan, scene, beat, instruction: '改成同屏对照', keepNarration: true });
  assert.deepEqual(patch.beat.facts, beat.facts);
  assert.equal(patch.beat.narration, beat.narration);
  assert.notDeepEqual(patch.scene.elements, scene.elements);
  const updated = await director.reviseShot({ project: plan, scene, beat, instruction: '把时长压到 7 秒' });
  assert.equal(updated.scene.minSec, 7);
});

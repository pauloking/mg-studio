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

test('built-in stories compile with distinct narration, visual assets and per-shot movements', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-director-plans-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const sample of Object.keys(director.samples)) {
    const plan = await director.createFromBrief({ sample });
    const result = writeAndCompileGeneratedProject(path.join(dir, sample), plan);
    assert.equal(result.ok, true, JSON.stringify(result.compile.errors));
    assert.equal(result.scenes.length, sample === 'rain_scene' ? 2 : sample === 'journey' ? 6 : 4);
    const html = fs.readFileSync(result.compile.htmlPath, 'utf8');
    assert.match(html, /updateDirected/);
    if (sample === 'rain_scene') {
      assert.equal(html.match(/id="world-street"/g).length, 1);
      assert.deepEqual(plan.scenes[0].stage.camera.at(-1), { ...plan.scenes[1].stage.camera[0], t: 1 });
      assert.equal(plan.scenes[0].stage.flow.at(-1).value, plan.scenes[1].stage.flow[0].value);
      assert.deepEqual(plan.story.beats.map(beat => beat.narration), director.samples.journey.shots.slice(1,3).map(shot => shot.narration));
    } else {
      assert.ok(new Set(plan.scenes.flatMap(sc => sc.elements.map(el => el.props.action))).size >= 4);
      assert.match(html, /dir-icon/);
    }
  }
});

test('configured model produces the editable plan, with lock, scope and undo on the API', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-director-api-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const arc = director.samples.journey.arc;
  const mock = http.createServer(async (req, res) => {
    assert.equal(req.url, '/v1/chat/completions');
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    assert.equal(request.model, 'test-model');
    const { shots } = director.samples.rain;
    const task = JSON.parse(request.messages[1].content);
    calls.push(task.stage || 'revision');
    let plan = { shots: [{ ...shots[1], transition: 'push', narration: '这句应该被旁白锁定覆盖。' }] };
    if (task.stage === 'story') {
      assert.deepEqual(task.media, { name: '图解.svg', kind: 'image' });
      assert.deepEqual(task.assets, [{ id: 1, name: '屋顶.svg', kind: 'image' }, { id: 2, name: '路面.svg', kind: 'image' }]);
      plan = { arc };
    } else if (task.stage === 'shots') {
      assert.deepEqual(task.arc, arc);
      plan = { title: '模型的雨水片', shots: shots.map((shot, i) => {
        const layers = shot.layers.map((layer, index) => i < 2 && index === shot.layers.findIndex(el => el.kind === 'icon')
          ? { ...layer, reference: i + 1 } : layer);
        if (i === 3) layers.push({ kind: 'chart', action: 'grow', color: 'accent', x: 12, y: 24, w: 36, h: 31, at: 0.2, span: 0.5,
          series: [{ label: '示例甲', value: 2 }, { label: '示例乙', value: 5 }] });
        return { ...shot, layers, useReference: i === 2 };
      }) };
    }
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
  const files = [];
  for (const [name, body] of [['屋顶.svg', drawing], ['路面.svg', Buffer.from(drawing.toString().replace('r="10"', 'r="9"'))]]) {
    const response = await fetch(base + '/api/director/media?' + new URLSearchParams({ scope: 'draft', name }), { method: 'POST', body });
    const result = await response.json();
    assert.equal(result.ok, true, result.error);
    files.push(result.media.file);
  }
  const plan = await post('/api/director/plan', { brief: '给孩子解释城市雨水去哪了',
    files,
    media: { name: '图解.svg', source: 'imported', data: 'data:image/svg+xml;base64,' + drawing.toString('base64') }, connection: {
    endpoint: 'http://127.0.0.1:' + mock.address().port + '/v1', model: 'test-model'
  }});
  assert.equal(plan.ok, true);
  assert.equal(plan.story.meta.title, '模型的雨水片');
  assert.deepEqual(plan.story.meta.director.arc, arc);
  assert.equal(plan.scenes[0].elements.find(el => el.props.kind === 'image').props.media.file, files[0]);
  assert.equal(plan.scenes[1].elements.find(el => el.props.kind === 'image').props.media.file, files[1]);
  assert.ok(plan.scenes[2].elements.some(el => el.props.kind === 'image' && el.props.media.name === '图解.svg'));
  const created = await post('/api/create-project', { previewId: plan.previewId });
  assert.ok(created.ok);
  assert.ok(fs.existsSync(path.join(created.projectDir, files[1])));
  assert.match(fs.readFileSync(path.join(created.projectDir, 'scene.html'), 'utf8'), /dir-column/);
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
  assert.equal(JSON.parse(fs.readFileSync(file('shot_2'))).elements.find(el => el.props.kind === 'image').props.media.file, files[1]);
  assert.equal(fs.readFileSync(file('shot_1'), 'utf8'), neighbor);
  assert.equal((await shot('undo')).ok, true);
  assert.equal(fs.readFileSync(file('shot_2'), 'utf8'), initial);
  const readModel = (await (await fetch(base + '/api/project')).json()).project.scenes[1];
  const saved = await post('/api/scene', { scene: { ...readModel, narration: '雨水顺着路面流向排水口。' } });
  assert.equal(saved.ok, true);
  assert.equal(narration(), '雨水顺着路面流向排水口。');
  assert.deepEqual(calls, ['story', 'shots', 'revision']);
});

test('medical review records one scene and restores its pending status on visible content changes', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-review-shots-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plan = await director.createFromBrief({ sample: 'medical' });
  plan.story.meta.director.pendingReview = true;
  const { projectDir } = writeAndCompileGeneratedProject(path.join(dir, 'example'), plan);
  const app = createStudioServer({ projectDir, port: 0 });
  const { port } = await app.start();
  t.after(() => app.close());
  const fetch = studioFetch(app);
  const base = 'http://127.0.0.1:' + port;
  const read = async () => (await (await fetch(base + '/api/project')).json()).project;
  const post = async (route, body) => {
    const response = await fetch(base + route, { method: 'POST', body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) };
  };
  const pending = async () => (await read()).story.meta.director.pendingShots;
  assert.deepEqual(await pending(), ['shot_1', 'shot_2', 'shot_3', 'shot_4']);
  assert.equal((await post('/api/director/review', { confirmed: true })).status, 422);
  assert.deepEqual((await post('/api/director/review', { id: 'shot_2', confirmed: true })).pendingShots, ['shot_1', 'shot_3', 'shot_4']);
  const scene = (await read()).scenes[1];
  scene.elements[0].props.at += 0.02;
  assert.equal((await post('/api/scene', { scene })).ok, true);
  assert.deepEqual(await pending(), ['shot_1', 'shot_3', 'shot_4']);
  scene.elements.find(el => el.props.kind === 'text').props.content = '核对更新后的字幕';
  assert.equal((await post('/api/scene', { scene })).ok, true);
  assert.deepEqual(await pending(), ['shot_1', 'shot_2', 'shot_3', 'shot_4']);
  assert.equal((await post('/api/export', {})).status, 422);
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

test('reframing a shot keeps the established motion path of a matched object', async () => {
  const plan = await director.createFromBrief({ sample: 'journey' });
  const beat = plan.story.beats[1];
  const scene = plan.scenes[1];
  const original = scene.elements.find(el => el.props.object === 'rain_drop').props;
  const revised = await director.reviseShot({ project: plan, scene, beat, instruction: '改成同屏对照', keepNarration: true });
  assert.equal(revised.scene.transition, 'match');
  assert.deepEqual(revised.scene.elements.find(el => el.props.object === 'rain_drop').props, original);
});

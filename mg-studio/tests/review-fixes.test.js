'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { EventEmitter } = require('events');
const { createStudioServer } = require('../scripts/studio');
const studioFetch = require('./helpers/studio-fetch');
const { buildStoryboardDefinition, writeAndCompileGeneratedProject } = require('../lib/ai-generator');
const { extractEvidenceClaims } = require('../lib/research');
const { analyzeDocumentText } = require('../lib/doc-parser');
const { lintStory } = require('../lib/story-lint');
const { loadTemplate } = require('../lib/narratives');

async function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-review-'));
  const projectDir = path.join(dir, 'project');
  fs.cpSync(path.join(__dirname, 'fixtures', 'mini-style-medical'), projectDir, { recursive: true });
  const app = createStudioServer({ projectDir, projectsDir: path.join(dir, 'projects'), port: 0, ...options });
  const { port } = await app.start();
  t.after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  return { dir, app, projectDir, base, fetch: studioFetch(app), port };
}
const post = (fetcher, url, data) => fetcher(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
});

test('session: reject foreign origins, untrusted Host, cross-site requests and missing/stale tokens', async t => {
  const f = await fixture(t);
  const html = await (await fetch(f.base)).text();
  assert.ok(html.includes(`const STUDIO_TOKEN = '${f.app.csrfToken}'`));
  assert.equal((await fetch(f.base + '/api/project')).status, 403);
  assert.equal((await fetch(f.base + '/api/project', { headers: { 'X-Studio-Token': 'stale' } })).status, 403);
  for (const method of ['GET', 'POST', 'OPTIONS']) {
    const r = await f.fetch(f.base + '/api/story', { method, headers: { Origin: 'https://untrusted.example' } });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await f.fetch(f.base + '/api/project', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const status = await new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: f.port, path: '/', headers: { Host: 'attacker.example' } }, res => {
      res.resume(); resolve(res.statusCode);
    }).on('error', reject);
  });
  assert.equal(status, 403);
  assert.equal((await f.fetch(f.base + '/api/project', { headers: { Origin: f.base } })).status, 200);
  const second = await fixture(t);
  assert.notEqual(second.app.csrfToken, f.app.csrfToken);
  assert.equal((await f.fetch(second.base + '/api/project')).status, 403);
});

test('scene endpoints reject traversal and unknown IDs without modifying project or outside files', async t => {
  const f = await fixture(t);
  const original = fs.readFileSync(path.join(f.projectDir, 'story.json'), 'utf8');
  const outside = path.join(f.dir, 'outside.json');
  fs.writeFileSync(outside, 'preserve');
  for (const id of ['../../outside', '../story', '/absolute', 'bad\\path', '__proto__', 'unknown']) {
    const scene = { id, beat: id, minSec: 4, layout: 'points', elements: [] };
    assert.equal((await post(f.fetch, f.base + '/api/scene', { scene })).status, 400);
    assert.equal((await post(f.fetch, f.base + '/api/beat/delete', { beatId: id })).status, 400);
  }
  assert.equal((await post(f.fetch, f.base + '/api/beat/add', { beat: { id: '../../outside' } })).status, 400);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'preserve');
  assert.equal(fs.readFileSync(path.join(f.projectDir, 'story.json'), 'utf8'), original);
  assert.deepEqual(fs.readdirSync(path.join(f.projectDir, 'scenes')).sort(), ['hook.json', 'takeaway.json']);
});

test('scene symlinks cannot be used to overwrite, remove or read outside files', async t => {
  const f = await fixture(t);
  const outside = path.join(f.dir, 'outside.json'); fs.writeFileSync(outside, 'preserve');
  const target = path.join(f.projectDir, 'scenes', 'hook.json');
  const scene = JSON.parse(fs.readFileSync(target));
  fs.unlinkSync(target); fs.symlinkSync(outside, target);
  assert.equal((await post(f.fetch, f.base + '/api/scene', { scene })).status, 400);
  assert.equal((await post(f.fetch, f.base + '/api/beat/delete', { beatId: 'hook' })).status, 400);
  assert.equal((await fetch(f.base + '/scenes/hook.json')).status, 403);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'preserve');
});

test('fixed project files cannot be symlinks for story or style writes', async t => {
  const f = await fixture(t);
  const storyFile = path.join(f.projectDir, 'story.json');
  const story = fs.readFileSync(storyFile, 'utf8');
  const outside = path.join(f.dir, 'outside.json'); fs.writeFileSync(outside, story);
  fs.unlinkSync(storyFile); fs.symlinkSync(outside, storyFile);
  assert.equal((await post(f.fetch, f.base + '/api/story', { story: JSON.parse(story) })).status, 400);
  assert.equal((await post(f.fetch, f.base + '/api/style', { style: 'warm-editorial' })).status, 400);
  assert.equal(fs.readFileSync(outside, 'utf8'), story);
});

test('reorder must preserve all beats; invalid scene/story saves have no side effects', async t => {
  const f = await fixture(t);
  const file = path.join(f.projectDir, 'story.json'); const original = fs.readFileSync(file, 'utf8');
  for (const order of [['hook'], ['hook', 'hook'], ['hook', 'unknown']]) {
    assert.equal((await post(f.fetch, f.base + '/api/beat/reorder', { order })).status, 400);
  }
  const story = JSON.parse(original); story.beats[0].id = '../../outside';
  assert.equal((await post(f.fetch, f.base + '/api/story', { story })).status, 400);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  const sceneFile = path.join(f.projectDir, 'scenes', 'hook.json');
  const sceneText = fs.readFileSync(sceneFile, 'utf8'); const scene = JSON.parse(sceneText); scene.layout = 'unknown';
  assert.equal((await post(f.fetch, f.base + '/api/scene', { scene })).status, 400);
  assert.equal(fs.readFileSync(sceneFile, 'utf8'), sceneText);
});

test('failed generation keeps current project byte-for-byte; successful creation uses a separate directory', async t => {
  const f = await fixture(t);
  const story = fs.readFileSync(path.join(f.projectDir, 'story.json'));
  const scene = fs.readFileSync(path.join(f.projectDir, 'scenes', 'hook.json'));
  const failed = await (await post(f.fetch, f.base + '/api/create-project', {
    topic: '骨折', facts: [{ claim: '该事实尚未核实', _checked: false }]
  })).json();
  assert.equal(failed.ok, false); assert.equal(f.app.projectDir, f.projectDir);
  const empty = await (await post(f.fetch, f.base + '/api/create-project', { topic: '任意选题' })).json();
  assert.equal(empty.ok, false); assert.match(empty.compile.errors[0], /GEN_FACTS_REQUIRED/);

  assert.equal(fs.existsSync(failed.projectDir), false);
  const created = await (await post(f.fetch, f.base + '/api/create-project', {
    topic: '骨折', durationTarget: 60, facts: [{ claim: '该资料用于说明适用条件', _checked: true }]
  })).json();
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.notEqual(created.projectDir, f.projectDir);
  assert.deepEqual(fs.readFileSync(path.join(f.projectDir, 'story.json')), story);
  assert.deepEqual(fs.readFileSync(path.join(f.projectDir, 'scenes', 'hook.json')), scene);
  assert.equal(f.app.projectDir, created.projectDir);
  assert.equal(created.story.meta.durationTarget, 60);
  assert.deepEqual(fs.readdirSync(path.join(f.dir, 'projects')), [path.basename(created.projectDir)]);
  assert.throws(() => writeAndCompileGeneratedProject(f.projectDir, buildStoryboardDefinition({})), /already exists/);
});

test('generation copies supplied evidence into narration and visuals without inventing effects or statistics', () => {
  const claim = '本资料仅报告骨折随访结果，未评估心脑血管结局';
  for (const template of ['science', 'product', 'teaching', 'free']) {
    const def = buildStoryboardDefinition({ topic: '骨折', template, facts: [{ claim, source: '用户原文', _checked: true }] });
    const scene = def.scenes.find(s => s.id === 'fact_1');
    assert.equal(def.scenes.length, 3, 'one fact should yield one main scene and no placeholder');
    assert.ok(def.story.beats[1].narration.includes(claim));
    assert.equal(scene.elements[0].props.desc, claim);
    assert.equal(def.story.beats[1].facts[0].source, '用户原文');
    assert.ok(!JSON.stringify(def).includes('35.8'));
    assert.ok(!JSON.stringify(def).includes('降低了35%'));
    assert.ok(!def.scenes.some(s => s.layout === 'stat'));
    assert.equal(lintStory({ story: def.story, template: loadTemplate(def.story.meta.template) }).filter(d => d.level === 'B').length, 0);
  }
});

test('bibliographic metadata never becomes a clinical claim; uploads remain unverified', () => {
  assert.deepEqual(extractEvidenceClaims('骨折', [{ title: 'Unrelated paper', doi: 'unrelated', source: 'Journal' }]), []);
  const result = analyzeDocumentText('某项研究报告治疗有效率为 72%，具体适用条件需要核实。', 'note.txt');
  assert.ok(result.facts.length > 0); assert.ok(result.facts.every(f => f.verified === false));
});

test('export reports process startup errors instead of leaving the task running', async t => {
  const f = await fixture(t, { spawnProcess: () => {
    const sub = new EventEmitter(); sub.stdout = new EventEmitter(); sub.stderr = new EventEmitter();
    setImmediate(() => sub.emit('error', new Error('worker missing'))); return sub;
  } });
  const { taskId } = await (await post(f.fetch, f.base + '/api/export', {})).json();
  let task;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 10));
    task = await (await f.fetch(f.base + '/api/task-status?taskId=' + taskId)).json();
    if (task.status !== 'running') break;
  }
  assert.equal(task.status, 'error'); assert.ok(task.log.includes('worker missing'));
});

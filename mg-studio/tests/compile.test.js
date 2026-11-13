const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { compileProject, normalizeScene, buildScriptJson } = require('../lib/compile');
const ir = require('../lib/ir');
const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');

function copyFixture(name, fixture) {
  const work = path.join(ROOT, 'tests', 'work', name);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(FIX, fixture), work, { recursive: true });
  return work;
}

test('normalizeScene 填默认值并拒绝非法预设', () => {
  const sc = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'scenes', 'hook.json'), 'utf8'));
  const n = normalizeScene(sc);
  assert.equal(n.elements[0].enter.at, 0.4);
  assert.equal(n.elements[0].enter.dur, 0.9);
  assert.deepEqual(n.elements[0].emphasis, []);
  assert.equal(n.elements[0].exit, null);
  const bad = JSON.parse(JSON.stringify(sc)); bad.elements[0].enter.preset = 'nope';
  assert.throws(() => normalizeScene(bad), /预设/);
});

test('compileProject v2 产出 script.json v2 与契约 scene.html', () => {
  const work = copyFixture('compile-mini', 'mini-v2');
  const r = compileProject(work);
  assert.equal(r.mode, 'v2');
  assert.deepEqual(r.errors, []);
  const script = JSON.parse(fs.readFileSync(path.join(work, 'script.json'), 'utf8'));
  assert.equal(script.schema, 2);
  assert.equal(script.fps, 30);
  assert.deepEqual(script.scenes.map(s => s.id), ['hook', 'takeaway']);
  assert.deepEqual(script.scenes[0].subs, ['你好，世界。']);
  assert.equal(script.scenes[0].narration, '你好，世界。');
  assert.equal(script.scenes[0].beat.role, 'hook');
  assert.equal(script.tts.backend, 'local');
  const html = fs.readFileSync(path.join(work, 'scene.html'), 'utf8');
  for (const needle of ['window.__ready', 'window.__N', 'window.__frame', 'window.__err', 'SPECS', 'const PRE', 'up_hook', 'up_takeaway', ':root', "URLSearchParams(location.search).get('scene')", 'sc.audioDur = sc.dur; sc.dur = (sc.end - sc.start) / tl.fps'])
    assert.ok(html.includes(needle), 'scene.html 缺少 ' + needle);
});

test('subsOverride 与旁白不一致时阻断', () => {
  const work = copyFixture('compile-badsubs', 'mini-v2');
  const sp = path.join(work, 'scenes', 'hook.json');
  const sc = JSON.parse(fs.readFileSync(sp, 'utf8'));
  sc.subsOverride = ['完全不同的字幕'];
  fs.writeFileSync(sp, JSON.stringify(sc));
  const r = compileProject(work);
  assert.ok(r.errors.some(e => /字幕/.test(e)));
  assert.ok(!fs.existsSync(path.join(work, 'script.json')), '有 B 级错误不得写文件');
  assert.ok(!fs.existsSync(path.join(work, 'scene.html')), '有 B 级错误不得写 scene.html');
});

test('v1 直通：不写任何文件', () => {
  const work = copyFixture('compile-v1', 'mini-v1');
  const before = fs.readFileSync(path.join(work, 'script.json'));
  const r = compileProject(work);
  assert.equal(r.mode, 'v1');
  assert.ok(fs.readFileSync(path.join(work, 'script.json')).equals(before));
});

test('custom 逃生舱 M1 显式阻断', () => {
  const work = copyFixture('compile-custom', 'mini-v2');
  const sp = path.join(work, 'scenes', 'hook.json');
  const sc = JSON.parse(fs.readFileSync(sp, 'utf8')); sc.custom = 'handwritten.js';
  fs.writeFileSync(sp, JSON.stringify(sc));
  const r = compileProject(work);
  assert.ok(r.errors.some(e => /custom/.test(e)));
});

test('CLI：v2 输出 compile OK，v1 输出 passthrough', () => {
  const work = copyFixture('compile-cli', 'mini-v2');
  const out = execFileSync('node', [path.join(ROOT, 'scripts', 'compile.js')], { cwd: work, encoding: 'utf8' });
  assert.ok(out.includes('compile OK'));
  const work1 = copyFixture('compile-cli-v1', 'mini-v1');
  const out1 = execFileSync('node', [path.join(ROOT, 'scripts', 'compile.js')], { cwd: work1, encoding: 'utf8' });
  assert.ok(out1.includes('v1 passthrough'));
});
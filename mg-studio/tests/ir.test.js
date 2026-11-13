const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const ir = require('../lib/ir');
const FIX = path.join(__dirname, 'fixtures');
const story = () => JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'story.json'), 'utf8'));

test('合法 story 通过校验', () => {
  const r = ir.validateStory(story());
  assert.deepEqual(r.errors, []); assert.ok(r.ok);
});
test('非法 role / 重复 beat id / 缺 narration 报错', () => {
  const s = story(); s.beats[0].role = 'nope';
  assert.ok(!ir.validateStory(s).ok);
  const s2 = story(); s2.beats[1].id = 'hook';
  assert.ok(!ir.validateStory(s2).ok);
  const s3 = story(); s3.beats[0].narration = '';
  assert.ok(!ir.validateStory(s3).ok);
});
test('scene 引用不存在的 beat / 非法 layout 报错', () => {
  const sc = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'scenes', 'hook.json'), 'utf8'));
  assert.ok(ir.validateScene(sc, ['hook', 'takeaway'], ['title-card', 'points']).ok);
  sc.beat = 'ghost';
  assert.ok(!ir.validateScene(sc, ['hook', 'takeaway'], ['title-card', 'points']).ok);
  sc.beat = 'hook'; sc.layout = 'nope';
  assert.ok(!ir.validateScene(sc, ['hook', 'takeaway'], ['title-card', 'points']).ok);
});
test('tokens 非法色值报错', () => {
  const tk = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'tokens.json'), 'utf8'));
  assert.ok(ir.validateTokens(tk).ok);
  tk.colors.bg = 'red';
  assert.ok(!ir.validateTokens(tk).ok);
});
test('loadProject v2：按 beats 顺序合并 narration', () => {
  const p = ir.loadProject(path.join(FIX, 'mini-v2'), ['title-card', 'points', 'waveform', 'stat']);
  assert.equal(p.mode, 'v2');
  assert.deepEqual(p.scenes.map(s => s.id), ['hook', 'takeaway']);
  assert.equal(p.scenes[0].narration, '你好，世界。');
  assert.equal(p.scenes[0].beat.role, 'hook');
});
test('loadProject v1：仅 script.json 时直通', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-v1-'));
  fs.copyFileSync(path.join(FIX, 'mini-v1', 'script.json'), path.join(dir, 'script.json'));
  const p = ir.loadProject(dir, []);
  assert.equal(p.mode, 'v1');
  assert.equal(p.script.scenes[0].id, 'intro');
});
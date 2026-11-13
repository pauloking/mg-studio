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
test('loadProject：scene.id 与 beat 不匹配时报错且不合并', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-pair-'));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'story.json'), path.join(dir, 'story.json'));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'tokens.json'), path.join(dir, 'tokens.json'));
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'scenes', 'takeaway.json'), path.join(dir, 'scenes', 'hook.json'));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'scenes', 'takeaway.json'), path.join(dir, 'scenes', 'takeaway.json'));
  assert.throws(() => ir.loadProject(dir, ['title-card', 'points']),
    e => Array.isArray(e.irErrors) && e.irErrors.some(m => /不匹配/.test(m)));
});
test('validateScene(null) 返回 {ok:false} 而非抛 TypeError', () => {
  const r = ir.validateScene(null, ['hook'], ['title-card']);
  assert.ok(!r.ok);
});
test('validateTokens({colors:null}) 返回 {ok:false} 而非抛 TypeError', () => {
  const r = ir.validateTokens({ colors: null });
  assert.ok(!r.ok);
});
test('loadProject：story 缺 beats 时抛带 irErrors 的 Error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-nobeats-'));
  fs.writeFileSync(path.join(dir, 'story.json'), JSON.stringify({ schema: 2, meta: { title: '测试片', audience: 'general', template: 'free', durationTarget: 20 } }));
  assert.throws(() => ir.loadProject(dir, []),
    e => e instanceof Error && Array.isArray(e.irErrors) && e.irErrors.some(m => /beats/.test(m)));
});
test('validateStory：beats 为非数组（5/{}/true）时报错而非抛 TypeError', () => {
  for (const bad of [5, {}, true]) {
    const s = story(); s.beats = bad;
    const r = ir.validateStory(s);
    assert.ok(!r.ok);
    assert.ok(r.errors.some(m => /beats/.test(m)));
  }
});
test('loadProject：story.beats 为 {} 时抛带 irErrors 的 Error 而非 TypeError', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-objbeats-'));
  fs.writeFileSync(path.join(dir, 'story.json'), JSON.stringify({ schema: 2, meta: { title: '测试片', audience: 'general', template: 'free', durationTarget: 20 }, beats: {} }));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'tokens.json'), path.join(dir, 'tokens.json'));
  assert.throws(() => ir.loadProject(dir, []),
    e => e instanceof Error && !(e instanceof TypeError) && Array.isArray(e.irErrors) && e.irErrors.some(m => /beats/.test(m)));
});
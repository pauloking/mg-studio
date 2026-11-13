const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { lintMotion, contrastRatio, estDur } = require('../lib/motion-lint');
const { normalizeScene } = require('../lib/compile');
const { COMPONENTS } = require('../lib/components');
const FIX = path.join(__dirname, 'fixtures');
const tokens = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'tokens.json'), 'utf8'));
const loadSc = (f, id) => normalizeScene(JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'scenes', f), 'utf8')));

test('contrastRatio 黑白约 21，同色 1', () => {
  assert.ok(Math.abs(contrastRatio('#ffffff', '#000000') - 21) < 0.01);
  assert.equal(contrastRatio('#123456', '#123456'), 1);
});
test('干净 fixture 无 B 级', () => {
  const scenes = [Object.assign(loadSc('hook.json'), { narration: '你好，世界。' }), Object.assign(loadSc('takeaway.json'), { narration: '要点一，要点二。' })];
  const out = lintMotion({ scenes, tokens, components: COMPONENTS });
  assert.deepEqual(out.filter(l => l.level === 'B'), []);
});
test('侵入字幕区 → B SUBTITLE_ZONE', () => {
  const sc = Object.assign(loadSc('takeaway.json'), { narration: '要点一，要点二。' });
  sc.elements[0].props.y = 700; // 盒底 700+260=960 > 940
  const out = lintMotion({ scenes: [sc], tokens, components: COMPONENTS });
  assert.ok(out.some(l => l.level === 'B' && l.code === 'SUBTITLE_ZONE' && l.el === 'c0'));
});
test('文字停留不足 → B TEXT_DWELL', () => {
  const sc = Object.assign(loadSc('hook.json'), { narration: '短。', minSec: 2 });
  sc.elements[0].props.content = '长'.repeat(40); // 需要 11.2s，estDur≈2.32
  const out = lintMotion({ scenes: [sc], tokens, components: COMPONENTS });
  assert.ok(out.some(l => l.level === 'B' && l.code === 'TEXT_DWELL' && l.el === 'title'));
});
test('低对比度 → B CONTRAST', () => {
  const bad = JSON.parse(JSON.stringify(tokens)); bad.colors.ink = '#666666';
  const sc = Object.assign(loadSc('hook.json'), { narration: '你好，世界。' });
  const out = lintMotion({ scenes: [sc], tokens: bad, components: COMPONENTS });
  assert.ok(out.some(l => l.level === 'B' && l.code === 'CONTRAST'));
});
test('同屏运动峰值 >6 → W DENSITY', () => {
  const sc = Object.assign(loadSc('takeaway.json'), { narration: '要点一，要点二。' });
  sc.elements = Array.from({ length: 8 }, (_, i) => ({ id: 'c' + i, type: 'card', props: { title: 't', desc: 'd', x: 130 + (i % 3) * 570, y: 300 + Math.floor(i / 3) * 200 }, enter: { preset: 'rise', at: 0, dur: 1 }, emphasis: [], exit: null }));
  const out = lintMotion({ scenes: [sc], tokens, components: COMPONENTS });
  assert.ok(out.some(l => l.level === 'W' && l.code === 'DENSITY'));
});
test('compileProject 接入：B 级 lint 阻断写文件', () => {
  const { compileProject } = require('../lib/compile');
  const work = path.join(__dirname, 'work', 'lint-block');
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(FIX, 'mini-v2'), work, { recursive: true });
  const sp = path.join(work, 'scenes', 'takeaway.json');
  const sc = JSON.parse(fs.readFileSync(sp, 'utf8')); sc.elements[0].props.y = 700;
  fs.writeFileSync(sp, JSON.stringify(sc));
  const r = compileProject(work);
  assert.ok(r.errors.some(e => /SUBTITLE_ZONE/.test(e)));
  assert.ok(!fs.existsSync(path.join(work, 'script.json')));
});
test('mini-av stat 组件 lint 洁净（accent2 对比度 + label-only dwell）', () => {
  const def = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'templates', 'tokens.default.json'), 'utf8'));
  const statSc = normalizeScene(JSON.parse(fs.readFileSync(path.join(FIX, 'mini-av', 'scenes', 'stat.json'), 'utf8')));
  statSc.narration = '三十五点二毫秒。';
  const out = lintMotion({ scenes: [statSc], tokens: def, components: COMPONENTS });
  assert.deepEqual(out.filter(l => l.level === 'B'), []);
});
test('盒超出画布 → B SCREEN_BOUNDS', () => {
  const sc = Object.assign(loadSc('takeaway.json'), { narration: '要点一，要点二。' });
  sc.elements[0].props.x = 1500; // 盒 x1500 w520 → x+w=2020 > 1920
  const out = lintMotion({ scenes: [sc], tokens, components: COMPONENTS });
  assert.ok(out.some(l => l.level === 'B' && l.code === 'SCREEN_BOUNDS' && l.el === 'c0'));
});
test('hexToRgb 守卫：contrastRatio(undefined,...) 不抛（缺色键防御）', () => {
  assert.doesNotThrow(() => contrastRatio(undefined, '#070b16'));
  assert.equal(typeof contrastRatio(undefined, '#070b16'), 'number');
});

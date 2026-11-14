const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { checkElementProps, checkSceneProps } = require('../lib/props');
const { COMPONENTS } = require('../lib/components');
const { normalizeScene, compileProject } = require('../lib/compile');

const FIX = path.join(__dirname, 'fixtures');
const ROOT = path.join(__dirname, '..');
const loadSc = (fixture, file) => JSON.parse(fs.readFileSync(path.join(FIX, fixture, 'scenes', file), 'utf8'));

function copyFixture(name, fixture) {
  const work = path.join(ROOT, 'tests', 'work', name);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(FIX, fixture), work, { recursive: true });
  return work;
}

test('props：points 坐标非有限数（"130px" / 注入串）被拒绝', () => {
  for (const bad of ['130px', "0';window.__PWN=1;'"]) {
    const el = { id: 'c1', type: 'card', props: { title: 't', desc: 'd', x: bad, y: 420 } };
    const errs = checkElementProps('points', el, COMPONENTS);
    assert.ok(errs.some(e => /props\.x/.test(e)), `x=${JSON.stringify(bad)} 应报错，实际: ${JSON.stringify(errs)}`);
  }
});

test('props：stat / waveform 坐标与尺寸同样被拒绝', () => {
  const stat = { id: 's1', type: 'stat', props: { value: 1, x: '760px', y: 400 } };
  assert.ok(checkElementProps('stat', stat, COMPONENTS).some(e => /props\.x/.test(e)));
  const wave = loadSc('mini-av', 'wave.json').elements[0];
  wave.props.h = '160';
  assert.ok(checkElementProps('waveform', wave, COMPONENTS).some(e => /props\.h/.test(e)));
});

test('props：文本字段非字符串被拒绝', () => {
  const el = { id: 'c1', type: 'card', props: { title: { a: 1 }, desc: 'd' } };
  assert.ok(checkElementProps('points', el, COMPONENTS).some(e => /title 须为字符串/.test(e)));
});

test('props：未知元素类型 / 未知 layout 被拒绝', () => {
  assert.ok(checkElementProps('points', { id: 'x', type: 'svg', props: {} }, COMPONENTS).some(e => /不支持元素类型/.test(e)));
  assert.ok(checkElementProps('nope', { id: 'x', type: 'card', props: {} }, COMPONENTS).some(e => /未知 layout/.test(e)));
});

test('props：checkSceneProps 汇总整场景', () => {
  const sc = { id: 'a', layout: 'points', elements: [{ id: 'c1', type: 'card', props: { title: 't', desc: 'd', y: 'x' } }] };
  assert.equal(checkSceneProps(sc, COMPONENTS).length, 1);
});

test('normalizeScene 抛错时带上具体 props 诊断', () => {
  const sc = loadSc('mini-v2', 'takeaway.json');
  sc.elements[0].props.x = '130px';
  assert.throws(() => normalizeScene(sc, COMPONENTS), /props\.x 须为有限数/);
});

test('compileProject：坐标注入串不再进入生成的 scene.html（P0 回归）', () => {
  const work = copyFixture('props-inject', 'mini-v2');
  const sp = path.join(work, 'scenes', 'takeaway.json');
  const sc = JSON.parse(fs.readFileSync(sp, 'utf8'));
  sc.elements[0].props.x = "0';window.__PWN=1;'";
  fs.writeFileSync(sp, JSON.stringify(sc));
  const r = compileProject(work);
  assert.ok(r.errors.some(e => /props\.x/.test(e)), '应阻断');
  assert.ok(!fs.existsSync(path.join(work, 'scene.html')), '阻断时不得写出 scene.html');
});

test('compileProject：合法数值坐标以 JSON 字面量落地（200 → "200px"，不是 200pxpx）', () => {
  const work = copyFixture('props-ok', 'mini-v2');
  const sp = path.join(work, 'scenes', 'takeaway.json');
  const sc = JSON.parse(fs.readFileSync(sp, 'utf8'));
  sc.elements[0].props.x = 200; sc.elements[0].props.y = 500;
  fs.writeFileSync(sp, JSON.stringify(sc));
  const r = compileProject(work);
  assert.deepEqual(r.errors, []);
  const html = fs.readFileSync(path.join(work, 'scene.html'), 'utf8');
  assert.ok(html.includes('style.left="200px"'), '坐标应为 "200px" 字符串字面量');
  assert.ok(!/style\.left='/.test(html), '不得再有单引号字符串插值的坐标');
  assert.ok(!html.includes('pxpx'), '不得出现重复单位');
});

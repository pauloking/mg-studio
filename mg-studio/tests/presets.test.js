const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { PRE_RUNTIME, PRESET_DEFAULT_DUR, ENTER_PRESETS, EMPHASIS_PRESETS, EXIT_PRESETS } = require('../lib/presets');

function sandbox() {
  const ctx = {
    Math, TL: { fps: 30 },
    eo: p => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3),
    seg: (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)))
  };
  vm.createContext(ctx); vm.runInContext(PRE_RUNTIME, ctx); return ctx;
}
test('rise 起止通道', () => {
  const c = sandbox();
  assert.deepEqual(c.PRE.rise(0), { op: 0, ty: 48 });
  assert.deepEqual(c.PRE.rise(1), { op: 1, ty: 0 });
});
test('put 恒等时清 transform/filter（坑①回归）', () => {
  const c = sandbox(); const e = { style: {} };
  c.put(e, c.chan());
  assert.equal(e.style.transform, 'none');
  assert.equal(e.style.opacity, 1);
  assert.equal(e.style.filter, 'none');
});
test('chan 合成：opacity 相乘、位移相加、scale 相乘', () => {
  const c = sandbox();
  const r = c.chan({ op: .5, ty: 10, sc: 1.1 }, { op: .5, ty: 5, sc: 2 });
  assert.equal(r.op, .25); assert.equal(r.ty, 15); assert.equal(r.sc, 2.2);
});
test('cueLt：narration 比例映射旁白窗口，lt 直读', () => {
  const c = sandbox();
  const sc = { start: 300, audioStart: 10.7, dur: 4 };
  assert.equal(c.cueLt('narration:0.5', sc), 2.7);
  assert.equal(c.cueLt('lt:1.2', sc), 1.2);
});
test('upEl：emphasis 结束后回到恒等，stat 数字滚动', () => {
  const c = sandbox();
  const e = { style: {}, __num: { textContent: '' } };
  const sp = { type: 'stat', props: { value: 35.2, decimals: 1 }, enter: { preset: 'rise', at: 0.5, dur: 1.5 }, emphasis: [{ preset: 'pulse', cue: 'lt:3', dur: .5 }], exit: null };
  c.upEl(e, sp, 2.0, 5, { start: 0, audioStart: 0, dur: 4 });
  assert.equal(e.__num.textContent, '35.2');
  assert.equal(e.style.transform, 'none');
  c.upEl(e, sp, 0.5, 5, { start: 0, audioStart: 0, dur: 4 });
  assert.equal(e.__num.textContent, '0.0');
});
test('所有预设都有默认时长', () => {
  for (const n of [...ENTER_PRESETS, ...EMPHASIS_PRESETS, ...EXIT_PRESETS]) assert.ok(PRESET_DEFAULT_DUR[n] > 0, n);
});
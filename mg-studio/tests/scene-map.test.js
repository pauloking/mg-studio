'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { pickSmokeFrames } = require('../lib/scene-map');

function tl() {
  return { fps: 30, scenes: [
    { id: 'a', start: 0, end: 300 },   // 10s
    { id: 'b', start: 300, end: 600 }  // 10s
  ] };
}

test('默认取 min(dur*0.6, 4)s：每场一帧并带场景名', () => {
  const m = pickSmokeFrames(tl(), {});
  assert.equal(m.length, 2);
  // a: min(10*0.6,4)=4s -> 0+round(4*30)=120
  assert.equal(m[0].frame, 120);
  assert.equal(m[0].scene, 'a');
  assert.equal(m[0].file, 'f_0120.png');
  assert.equal(m[0].time, 4);
  // b: 4s -> 300+120=420
  assert.equal(m[1].frame, 420);
  assert.equal(m[1].scene, 'b');
  assert.equal(m[1].file, 'f_0420.png');
});

test('smokePicks 覆盖：按给定秒数出多帧', () => {
  const m = pickSmokeFrames(tl(), { a: [1, 2.5] });
  assert.deepEqual(m.filter(x => x.scene === 'a').map(x => x.frame), [30, 75]);
  // 未指定的 b 仍走默认
  assert.equal(m.filter(x => x.scene === 'b').length, 1);
});

test('帧号钳制在场景内：[start, end-1]', () => {
  const m = pickSmokeFrames({ fps: 30, scenes: [ { id: 'z', start: 0, end: 30 } ] }, { z: [100] }); // 100s 远超场景
  assert.equal(m[0].frame, 29, '应钳制到 end-1');
});

test('缺 fps 时回退 30', () => {
  const m = pickSmokeFrames({ scenes: [ { id: 'q', start: 0, end: 300 } ] }, { q: [1] });
  assert.equal(m[0].frame, 30);
});

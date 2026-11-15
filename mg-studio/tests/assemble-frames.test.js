'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { assemble } = require('../scripts/assemble_frames');

function mkFrames(dir, tl) {
  for (const sc of tl.scenes) {
    const d = path.join(dir, 'frames', sc.id); fs.mkdirSync(d, { recursive: true });
    for (let k = 0; k < sc.end - sc.start; k++) fs.writeFileSync(path.join(d, `f_${String(k).padStart(4, '0')}.png`), `p${sc.id}${k}`);
  }
}
const TL = { fps: 30, scenes: [ { id: 'a', start: 0, end: 3 }, { id: 'b', start: 3, end: 5 } ] };

test('按时间轴顺序拼接到 frames/all，全局帧号连续', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-'));
  mkFrames(dir, TL);
  const r = assemble({ dir, timeline: TL });
  assert.equal(r.count, 5); assert.deepEqual(r.missing, []);
  const all = fs.readdirSync(path.join(dir, 'frames', 'all')).sort();
  assert.deepEqual(all, ['f_0000.png', 'f_0001.png', 'f_0002.png', 'f_0003.png', 'f_0004.png']);
  assert.equal(fs.readFileSync(path.join(dir, 'frames', 'all', 'f_0003.png'), 'utf8'), 'pb0');
});

test('缺帧 → 记入 missing，count 只计已有', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-'));
  mkFrames(dir, TL); fs.rmSync(path.join(dir, 'frames', 'b', 'f_0001.png'));
  const r = assemble({ dir, timeline: TL });
  assert.equal(r.count, 4); assert.equal(r.missing.length, 1);
});

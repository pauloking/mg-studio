'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { generateAmbientAsset, generateAmbientScene, hash, LICENSE } = require('../lib/ambient-gen');

const ambBeat = { id: 'open', role: 'hook', emotion: 4, intent: '开场氛围', narration: '欢迎观看本视频。', facts: [] };
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'mg-amb-')); }
// mock exec：模拟 bl --out-dir 下载产出（不真调百炼）
function mockExec(calls) {
  return (cmd, args) => {
    calls.push({ cmd, args });
    const outDir = args[args.indexOf('--out-dir') + 1];
    const prefix = args[args.indexOf('--out-prefix') + 1];
    fs.writeFileSync(path.join(outDir, prefix + '-0.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    return '{}';
  };
}
test('ambient：未授权不调用百炼（consent 闭环）', () => {
  const calls = [];
  const r = generateAmbientAsset({ beat: ambBeat, dir: tmp(), yes: false, exec: mockExec(calls), env: {} });
  assert.equal(r.ok, false);
  assert.equal(r.consent, true);
  assert.equal(calls.length, 0, '未授权不得调用 bl');
});
test('ambient：授权后生成带许可证素材+索引+directed 场景', () => {
  const dir = tmp(), calls = [];
  const r = generateAmbientScene({ beat: ambBeat, dir, yes: true, exec: mockExec(calls), env: {} });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'bl');
  assert.ok(calls[0].args.includes('--seed'), '应带 seed 复现');
  assert.equal(r.asset.license, LICENSE);
  assert.equal(r.scene.layout, 'directed');
  assert.equal(r.scene.elements[0].props.kind, 'image');
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'index.json'), 'utf8'));
  assert.equal(idx[0].license, LICENSE);
});
test('ambient：缓存命中复用不再调用', () => {
  const dir = tmp(), calls = [];
  generateAmbientAsset({ beat: ambBeat, dir, yes: true, exec: mockExec(calls), env: {} });
  const r2 = generateAmbientAsset({ beat: ambBeat, dir, yes: true, exec: mockExec(calls), env: {} });
  assert.equal(r2.reused, true);
  assert.equal(calls.length, 1, '第二次应复用不调用');
});
test('ambient：非 ambient 类型不生成', () => {
  const r = generateAmbientAsset({ beat: { id: 'a', narration: '室间隔剖面。' }, dir: tmp(), yes: true, exec: mockExec([]), env: {} });
  assert.equal(r.ok, false);
});
test('ambient：seed 由 prompt 决定（确定性）', () => {
  assert.equal(hash('abc'), hash('abc'));
  assert.notEqual(hash('abc'), hash('abd'));
});

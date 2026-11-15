'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const fc = require('../lib/fcache');

test('visualHash 确定性 + 随 scene/tokens 变化', () => {
  const a = fc.visualHash({ scene: { id: 'x', a: 1 }, tokens: { colors: { accent: '#000' } }, compVersion: '1', compilerVersion: '1' });
  const b = fc.visualHash({ scene: { id: 'x', a: 1 }, tokens: { colors: { accent: '#000' } }, compVersion: '1', compilerVersion: '1' });
  assert.equal(a, b);
  const c = fc.visualHash({ scene: { id: 'x', a: 2 }, tokens: { colors: { accent: '#000' } }, compVersion: '1', compilerVersion: '1' });
  assert.notEqual(a, c);
});

test('hashFile：读文件内容哈希，缺失返回 null', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fc-')), 'a.txt');
  fs.writeFileSync(f, 'hello'); const h1 = fc.hashFile(f);
  fs.writeFileSync(f, 'world'); assert.notEqual(fc.hashFile(f), h1);
  assert.equal(fc.hashFile(path.join(path.dirname(f), 'nope')), null);
});

test('decide：新增/视觉变/帧数变 → 重渲；全同 → 跳过', () => {
  assert.equal(fc.decide({ visualHash: 'v', audioHash: 'a', frameCount: 10, cached: null }).render, true);
  assert.equal(fc.decide({ visualHash: 'v2', audioHash: 'a', frameCount: 10, cached: { visualHash: 'v', frameCount: 10 } }).render, true);
  assert.equal(fc.decide({ visualHash: 'v', audioHash: 'a', frameCount: 11, cached: { visualHash: 'v', frameCount: 10 } }).render, true);
  assert.equal(fc.decide({ visualHash: 'v', audioHash: 'a2', frameCount: 10, cached: { visualHash: 'v', frameCount: 10 } }).render, false);
});

test('index 读写往返', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-'));
  assert.deepEqual(fc.loadIndex(dir), {});
  fc.saveIndex(dir, { x: { visualHash: 'v', frameCount: 3 } });
  assert.equal(fc.loadIndex(dir).x.frameCount, 3);
});

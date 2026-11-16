'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const fc = require('../lib/fcache');

test('visualHash：M5 新 token 面（bgType/card/titleBar/style）进哈希，样式变化须触发重渲', () => {
  const scene = { id: 'a', layout: 'points', elements: [] };
  const base = { colors: { bg: '#070b16' }, font: { family: 'x' }, subtitle: { bottom: 64 } };
  const h0 = fc.visualHash({ scene, tokens: base });
  const hBg = fc.visualHash({ scene, tokens: Object.assign({}, base, { bgType: 'aurora-soft' }) });
  const hCard = fc.visualHash({ scene, tokens: Object.assign({}, base, { card: { radius: 30 } }) });
  const hBar = fc.visualHash({ scene, tokens: Object.assign({}, base, { titleBar: { height: 8 } }) });
  const hStyle = fc.visualHash({ scene, tokens: Object.assign({}, base, { style: 'deep-tech' }) });
  assert.notEqual(h0, hBg, 'bgType 变化须换哈希');
  assert.notEqual(h0, hCard, 'card 变化须换哈希');
  assert.notEqual(h0, hBar, 'titleBar 变化须换哈希');
  assert.notEqual(h0, hStyle, 'style 变化须换哈希');
  assert.equal(h0, fc.visualHash({ scene, tokens: base }), '同 tokens 哈希稳定');
});

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

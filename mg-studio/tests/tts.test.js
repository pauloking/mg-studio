'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseArgs, selectScenes } = require('../scripts/tts');

test('parseArgs：默认无 --only', () => {
  assert.deepEqual(parseArgs([]), { backend: null, dir: null, only: null });
});

test('parseArgs：--backend + --only 空格形式', () => {
  assert.deepEqual(parseArgs(['--backend', 'bailian', '--only', 'a,b']), { backend: 'bailian', dir: null, only: 'a,b' });
});

test('parseArgs：--only= 等号形式 + 位置目录', () => {
  assert.deepEqual(parseArgs(['--only=x,y', 'proj']), { backend: null, dir: 'proj', only: 'x,y' });
});

test('parseArgs：--backend= 等号形式', () => {
  assert.equal(parseArgs(['--backend=bailian']).backend, 'bailian');
});

const S = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('selectScenes：无 only → 全部，无 missing', () => {
  assert.deepEqual(selectScenes(S, null), { scenes: S, missing: [] });
  assert.deepEqual(selectScenes(S, ''), { scenes: S, missing: [] });
});

test('selectScenes：按 only 过滤且保留原顺序', () => {
  const r = selectScenes(S, 'c,a');
  assert.deepEqual(r.scenes.map(x => x.id), ['a', 'c']);
  assert.deepEqual(r.missing, []);
});

test('selectScenes：未命中 id 归入 missing', () => {
  const r = selectScenes(S, 'a,z');
  assert.deepEqual(r.scenes.map(x => x.id), ['a']);
  assert.deepEqual(r.missing, ['z']);
});

test('selectScenes：忽略空白项与多余逗号', () => {
  const r = selectScenes(S, ' a , , b ');
  assert.deepEqual(r.scenes.map(x => x.id), ['a', 'b']);
  assert.deepEqual(r.missing, []);
});

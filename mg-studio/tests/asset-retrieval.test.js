'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { findAssets } = require('../lib/asset-retrieval');

test('图标库：按结构匹配且带许可证', () => {
  const c = findAssets({ brief: { structures: ['心脏'], type: 'anatomy', subject: '心脏' }, dir: os.tmpdir() });
  assert.ok(c.length > 0);
  assert.ok(c[0].license);
  assert.ok(c.some(x => x.id === 'heart-pulse'));
});

test('本地 manifest：有 license+tags 命中；无 license 排除', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-'));
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'index.json'), JSON.stringify([
    { id: 'sep', kind: 'image', license: 'CC-BY', source: 'OpenAnatomy', tags: ['室间隔'], path: 'sep.png' },
    { id: 'nolic', kind: 'image', source: 'unknown', tags: ['室间隔'], path: 'x.png' }
  ]));
  const c = findAssets({ brief: { structures: ['室间隔'], type: 'anatomy', subject: '室间隔' }, dir });
  assert.ok(c.some(x => x.id === 'sep'));
  assert.ok(!c.some(x => x.id === 'nolic'));
});

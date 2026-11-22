'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const { resolveVisual } = require('../lib/topic-visual');
const vr = require('../lib/visual-review');

test('resolveVisual：anatomy 需人工门', () => {
  const r = resolveVisual({ beat: { narration: '室间隔与左束支剖面。' }, dir: os.tmpdir() });
  assert.equal(r.brief.type, 'anatomy');
  assert.equal(r.needsReview, true);
});
test('resolveVisual：ambient 不需人工门', () => {
  const r = resolveVisual({ beat: { narration: '欢迎观看。' }, dir: os.tmpdir() });
  assert.equal(r.needsReview, false);
});
test('visual-review：topic-visual / visualBrief 触发门', () => {
  assert.equal(vr.needsReview({ layout: 'topic-visual' }), true);
  assert.equal(vr.needsReview({ layout: 'points', visualBrief: { type: 'panorama' } }), true);
  assert.equal(vr.needsReview({ layout: 'points', visualBrief: { type: 'ambient' } }), false);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { extractBrief } = require('../lib/visual-intent');

test('anatomy：识别解剖结构+剖面视角', () => {
  const b = extractBrief({ narration: '电极旋入室间隔剖面，接近左束支。', intent: '导线进心肌' });
  assert.equal(b.type, 'anatomy');
  assert.ok(b.structures.includes('室间隔') && b.structures.includes('左束支'));
  assert.equal(b.view, 'cross');
});
test('device：器械', () => {
  assert.equal(extractBrief({ narration: '起搏器导线与电极。' }).type, 'device');
});
test('panorama：全景', () => {
  assert.equal(extractBrief({ narration: '展示手术全景视野。' }).type, 'panorama');
});
test('comparison / diagram / ambient', () => {
  assert.equal(extractBrief({ narration: '对比 A 与 B。' }).type, 'comparison');
  assert.equal(extractBrief({ narration: '依次经过三个步骤。' }).type, 'diagram');
  assert.equal(extractBrief({ narration: '欢迎观看。' }).type, 'ambient');
});
test('view mirror', () => {
  assert.equal(extractBrief({ narration: '镜像视角，右室在左。' }).view, 'mirror');
});

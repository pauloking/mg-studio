'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const vr = require('../lib/visual-review');
const { makePng } = require('./helpers/png');

function mkScene(dir, id, layout, extra) {
  fs.mkdirSync(path.join(dir, 'scenes'), { recursive: true });
  const sc = Object.assign({ id, beat: id, layout, elements: [] }, extra || {});
  fs.writeFileSync(path.join(dir, 'scenes', id + '.json'), JSON.stringify(sc));
  return sc;
}

test('needsReview：解剖/器械布局或显式标记需目检', () => {
  assert.equal(vr.needsReview({ layout: 'three3d' }), true);
  assert.equal(vr.needsReview({ layout: 'title-card' }), false);
  assert.equal(vr.needsReview({ layout: 'points', elements: [{ props: { visualReview: true } }] }), true);
});

test('未批准的解剖示意 → B VISUAL_REVIEW_REQUIRED', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-'));
  const sc = mkScene(dir, 'lead', 'three3d');
  const f = vr.checkVisualReview({ scenes: [sc], dir });
  assert.equal(f.length, 1);
  assert.equal(f[0].code, 'VISUAL_REVIEW_REQUIRED');
});

test('approve 写入批准记录后 check 通过；参考图缺失 → B', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-'));
  mkScene(dir, 'lead', 'three3d');
  const ref = path.join(dir, 'ref.png'); fs.writeFileSync(ref, makePng(96, 96));
  vr.approve({ dir, sceneId: 'lead', reference: 'ref.png', reviewer: '专家' });
  const sc = JSON.parse(fs.readFileSync(path.join(dir, 'scenes', 'lead.json')));
  assert.equal(vr.checkVisualReview({ scenes: [sc], dir }).length, 0);
  // 参考图删除 → B
  fs.rmSync(ref);
  const f2 = vr.checkVisualReview({ scenes: [sc], dir });
  assert.equal(f2[0].code, 'VISUAL_REVIEW_REF_MISSING');
});

test('非解剖场景不触发视觉门', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-'));
  const sc = mkScene(dir, 'hook', 'title-card');
  assert.equal(vr.checkVisualReview({ scenes: [sc], dir }).length, 0);
});

test('参考图为占位图 → approve 拒绝；手写批准记录也过不了 check', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-'));
  mkScene(dir, 'lead', 'three3d');
  const ref = path.join(dir, 'ref.png'); fs.writeFileSync(ref, makePng(1, 1));
  assert.throws(() => vr.approve({ dir, sceneId: 'lead', reference: 'ref.png', reviewer: '专家' }), /占位/);
  const sc = JSON.parse(fs.readFileSync(path.join(dir, 'scenes', 'lead.json'), 'utf8'));
  sc.visualReview = { reference: 'ref.png', reviewer: '专家', approved: true };
  fs.writeFileSync(path.join(dir, 'scenes', 'lead.json'), JSON.stringify(sc));
  const f = vr.checkVisualReview({ scenes: [sc], dir });
  assert.equal(f[0].code, 'VISUAL_REVIEW_REF_PLACEHOLDER');
});

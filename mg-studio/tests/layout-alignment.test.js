'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const points = require('../lib/components/points');
const stat = require('../lib/components/stat');
const titleCard = require('../lib/components/title-card');

test('points：单卡片与双卡片自动居中对齐（防左偏）', () => {
  // 1 card
  const sc1 = {
    id: 'p1',
    elements: [
      { id: 'c0', type: 'card', props: { title: 'T0', desc: 'D0' } }
    ]
  };
  const b1 = points.boxes(sc1);
  assert.equal(b1[0].x, 700, '单卡片应居中 (1920-520)/2 = 700');
  assert.equal(b1[0].x + b1[0].w / 2, 960, '单卡片中心应为 960');

  // 2 cards
  const sc2 = {
    id: 'p2',
    elements: [
      { id: 'c0', type: 'card', props: { title: 'T0', desc: 'D0' } },
      { id: 'c1', type: 'card', props: { title: 'T1', desc: 'D1' } }
    ]
  };
  const b2 = points.boxes(sc2);
  assert.equal(b2[0].x, 415, '双卡片卡0左边距 (1920-(1040+50))/2 = 415');
  assert.equal(b2[1].x, 985, '双卡片卡1 x = 415 + 570 = 985');
  assert.equal(1920 - (b2[1].x + b2[1].w), 415, '双卡片右边距应对称 415');
  assert.equal((b2[0].x + b2[1].x + b2[1].w) / 2, 960, '双卡片整体中心应为 960');

  // 3 cards (向后兼容)
  const sc3 = {
    id: 'p3',
    elements: [
      { id: 'c0', type: 'card', props: { title: 'T0', desc: 'D0' } },
      { id: 'c1', type: 'card', props: { title: 'T1', desc: 'D1' } },
      { id: 'c2', type: 'card', props: { title: 'T2', desc: 'D2' } }
    ]
  };
  const b3 = points.boxes(sc3);
  assert.equal(b3[0].x, 130);
  assert.equal(b3[1].x, 700);
  assert.equal(b3[2].x, 1270);
  assert.equal(1920 - (b3[2].x + b3[2].w), 130);

  // 验证生成的 CSS 具有 min-height
  const css = points.css();
  assert.ok(css.includes('min-height:260px'), 'points CSS 应包含 min-height:260px 保证卡片底对齐');
});

test('stat：默认宽度与单/多指标对称居中（防数字偏左）', () => {
  const sc1 = {
    id: 's1',
    elements: [
      { id: 'm0', type: 'stat', props: { value: 80, unit: 'ms', label: '时限' } }
    ]
  };
  const b1 = stat.boxes(sc1);
  assert.equal(b1[0].w, 400);
  assert.equal(b1[0].x, 760, '单指标默认 x = (1920-400)/2 = 760');
  assert.equal(b1[0].x + b1[0].w / 2, 960, '单指标中心点应为 960');

  // 验证 CSS 中设置了明确宽度与文字居中
  const css = stat.css();
  assert.ok(css.includes('width:400px'), 'stat CSS 应包含 width:400px 防止内容收缩失中');
  assert.ok(css.includes('text-align:center'), 'stat CSS 应包含 text-align:center');

  // 双指标
  const sc2 = {
    id: 's2',
    elements: [
      { id: 'm0', type: 'stat', props: { value: 80 } },
      { id: 'm1', type: 'stat', props: { value: 120 } }
    ]
  };
  const b2 = stat.boxes(sc2);
  assert.equal(b2[0].x, 520);
  assert.equal(b2[1].x, 1000);
  assert.equal((b2[0].x + b2[1].x + b2[1].w) / 2, 960, '双指标整体中心点应为 960');
});

test('title-card：装饰条 transform-origin 设为 center center（防生长动画单侧偏心）', () => {
  const css = titleCard.css();
  assert.ok(css.includes('transform-origin:center center'), 'tc-bar 变换原点须为 center center 确保对称生长');
  assert.ok(css.includes('text-align:center'), 'title 与 tag 须 text-align:center');
});

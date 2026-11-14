'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildStoryboard, countUnverified, formatStoryboardMd, formatStoryboardText, sceneLabels } = require('../lib/preview');

function mkProject() {
  return {
    story: { meta: { title: '测试片', audience: 'professional' } },
    scenes: [
      { id: 'a', layout: 'waveform', narration: '旁白A', beat: { role: 'mechanism', facts: [ { text: 'f1', source: 'S1', verified: true } ] },
        elements: [ { props: { label: 'V1 · X' } }, { props: { title: '', desc: '说明' } } ] },
      { id: 'b', layout: 'points', narration: '旁白B', beat: { role: 'demo', facts: [ { claim: 'c2', source: '', verified: false } ] },
        elements: [ { props: { title: '卡1' } } ] },
      { id: 'c', layout: 'title-card', narration: '旁白C', beat: { role: 'cta', facts: [] }, elements: [] }
    ]
  };
}

test('buildStoryboard：逐场顺序/标签/facts/unverified 正确', () => {
  const sb = buildStoryboard(mkProject());
  assert.equal(sb.length, 3);
  assert.deepEqual(sb.map(b => b.id), ['a', 'b', 'c']);
  assert.deepEqual(sb.map(b => b.order), [1, 2, 3]);
  assert.equal(sb[0].role, 'mechanism');
  assert.equal(sb[0].narration, '旁白A');
  assert.deepEqual(sb[0].labels, ['V1 · X', '说明'], '应收集非空可见文本（跳过空 title）');
  assert.equal(sb[0].facts[0].text, 'f1');
  assert.equal(sb[0].facts[0].verified, true);
  assert.equal(sb[0].unverified.length, 0);
  // claim 字段也应被读取
  assert.equal(sb[1].facts[0].text, 'c2');
  assert.equal(sb[1].facts[0].verified, false);
  assert.equal(sb[1].unverified.length, 1);
  assert.equal(sb[2].facts.length, 0);
});

test('countUnverified：累计未核实 fact 数', () => {
  assert.equal(countUnverified(buildStoryboard(mkProject())), 1);
  assert.equal(countUnverified([]), 0);
});

test('facts 缺 verified 布尔时按未核实处理（validateStory 会拦，但预览需稳健）', () => {
  const p = { story: { meta: {} }, scenes: [ { id: 'x', narration: 'n', beat: { role: 'evidence', facts: [ { text: 'noflag' } ] }, elements: [] } ] };
  const sb = buildStoryboard(p);
  assert.equal(sb[0].unverified.length, 1);
  assert.equal(countUnverified(sb), 1);
});

test('formatStoryboardMd：含标题/受众/旁白/标签/核实标记', () => {
  const md = formatStoryboardMd(buildStoryboard(mkProject()), { title: '测试片', audience: 'professional' });
  assert.ok(md.includes('测试片'));
  assert.ok(md.includes('professional'));
  assert.ok(md.includes('旁白A'));
  assert.ok(md.includes('V1 · X'));
  assert.ok(md.includes('[已核实]'));
  assert.ok(md.includes('[未核实]'));
  assert.ok(md.includes('未核实 facts：**1**'));
});

test('formatStoryboardText：含场景 id 与旁白', () => {
  const tx = formatStoryboardText(buildStoryboard(mkProject()), { title: '测试片' });
  assert.ok(tx.includes('[a]'));
  assert.ok(tx.includes('旁白A'));
  assert.ok(tx.includes('[b]'));
});

test('sceneLabels：仅收集非空字符串可见文本', () => {
  assert.deepEqual(sceneLabels({ elements: [ { props: { label: 'L' } }, { props: { title: '' } }, { props: { x: 1 } } ] }), ['L']);
  assert.deepEqual(sceneLabels({}), []);
});

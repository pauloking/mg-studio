const { test } = require('node:test');
const assert = require('node:assert');
const { withPage } = require('./helpers/browser');
const { prepWork, syntheticTimeline } = require('./helpers/work');

// 位置+alpha 敏感哈希：入场/旋入完成后（lt>=5）画面仍须有持续动效（光晕呼吸/扫光/脉冲），
// 否则两帧哈希相等 = 呆板静止图。
function canvasHash(page, id, j) {
  return page.evaluate(({ id, j }) => {
    window.__frame(j);
    const c = document.querySelector('#s-' + id + ' canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0, n = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] > 40) { n++; h = (h * 1000003 + (i >>> 2) * 31 + d[i]) >>> 0; }
    }
    return { h, n, err: window.__err };
  }, { id, j });
}

test('schematic anatomy：入场完成后仍有持续动效（lt5 vs lt6.5 哈希不同）', { timeout: 120000 }, async () => {
  const work = prepWork('schematic-motion', 'mini-schematic');
  syntheticTimeline(work, [{ id: 'lead', sec: 8, audio: 6 }, { id: 'flow', sec: 8, audio: 6 }]);
  await withPage(work, async (page) => {
    const a = await canvasHash(page, 'lead', 150);
    const b = await canvasHash(page, 'lead', 195);
    assert.equal(a.err, null, '运行时错误: ' + a.err);
    assert.equal(b.err, null, '运行时错误: ' + b.err);
    assert.ok(a.n > 2000 && b.n > 2000, '画面应非空');
    assert.notEqual(a.h, b.h, 'anatomy 入场后应持续动效（哈希不同）');
  }, 'scene=lead');
});

test('schematic diagram：节点完成后连接线仍有脉冲动效', { timeout: 120000 }, async () => {
  const work = prepWork('schematic-motion-flow', 'mini-schematic');
  syntheticTimeline(work, [{ id: 'lead', sec: 8, audio: 6 }, { id: 'flow', sec: 8, audio: 6 }]);
  await withPage(work, async (page) => {
    const a = await canvasHash(page, 'flow', 150);
    const b = await canvasHash(page, 'flow', 195);
    assert.equal(a.err, null, '运行时错误: ' + a.err);
    assert.equal(b.err, null, '运行时错误: ' + b.err);
    assert.ok(a.n > 2000 && b.n > 2000, '画面应非空');
    assert.notEqual(a.h, b.h, 'diagram 应持续动效（哈希不同）');
  }, 'scene=flow');
});

test('schematic：入场 stagger（lt0.5 vs lt1.5 哈希不同）', { timeout: 120000 }, async () => {
  const work = prepWork('schematic-motion-enter', 'mini-schematic');
  syntheticTimeline(work, [{ id: 'lead', sec: 8, audio: 6 }, { id: 'flow', sec: 8, audio: 6 }]);
  await withPage(work, async (page) => {
    const a = await canvasHash(page, 'lead', 15);
    const b = await canvasHash(page, 'lead', 45);
    assert.equal(a.err, null);
    assert.notEqual(a.h, b.h, '入场应有 stagger 变化');
  }, 'scene=lead');
});

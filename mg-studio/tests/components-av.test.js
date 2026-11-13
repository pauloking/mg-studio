const { test } = require('node:test');
const assert = require('node:assert');
const { withPage, frame } = require('./helpers/browser');
const { prepWork, syntheticTimeline } = require('./helpers/work');

test('waveform：扫描揭示确定性（0 帧空、中段有波形）', { timeout: 90000 }, async () => {
  const work = prepWork('comp-wave', 'mini-av');
  syntheticTimeline(work, [{ id: 'wave', sec: 4, audio: 3 }, { id: 'stat', sec: 5, audio: 3 }]);
  await withPage(work, async (page) => {
    const pixels = j => page.evaluate(j => { window.__frame(j);
      const c = document.querySelector('#s-wave canvas'); const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n; }, j);
    assert.equal(await pixels(3), 0, 'lt=0.1 揭示进度 0，画布应空');
    assert.ok(await pixels(30) > 1000, 'lt=1.0 应已绘出波形');
    assert.equal(await page.evaluate(() => window.__err), null);
  });
});

test('stat：数字滚动 0 → 35.2', { timeout: 90000 }, async () => {
  const work = prepWork('comp-stat', 'mini-av');
  syntheticTimeline(work, [{ id: 'wave', sec: 4, audio: 3 }, { id: 'stat', sec: 5, audio: 3 }]);
  await withPage(work, async (page) => {
    const num = j => page.evaluate(j => { window.__frame(j);
      return document.querySelector('#s-stat .st-num').textContent; }, j);
    assert.equal(await num(120 + 15), '0.0', 'lt=0.5 起点应为 0.0');
    const mid = parseFloat(await num(120 + 38)); // lt≈1.27 滚动中
    assert.ok(mid > 0 && mid < 35.2, '中段应在 (0, 35.2)，实际 ' + mid);
    assert.equal(await num(120 + 60), '35.2', 'lt=2.0 应到终值');
    assert.equal(await page.evaluate(() => window.__err), null);
  });
});
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { withPage, frame } = require('./helpers/browser');
const { prepWork, syntheticTimeline, ROOT } = require('./helpers/work');

test('title-card：入场进度、结束后 transform 归零、单场景模式', { timeout: 90000 }, async () => {
  const work = prepWork('comp-hook');
  syntheticTimeline(work, [{ id: 'hook', sec: 4, audio: 3 }, { id: 'takeaway', sec: 5, audio: 2.5 }]);
  await withPage(work, async (page) => {
    assert.equal(await page.evaluate(() => window.__N), 270);
    assert.equal(await frame(page, 0), null);
    const at = j => page.evaluate(j => { window.__frame(j);
      const t = document.querySelector('#s-hook .tc-title');
      const b = document.querySelector('#s-hook .tc-bar');
      return { op: getComputedStyle(t).opacity, tf: t.style.transform, barSx: b.style.transform }; }, j);
    assert.equal((await at(5)).op, '0', 'lt=0.167 在 enter.at=0.4 之前应隐藏');
    const done = await at(60); // lt=2.0，全部入场完成
    assert.equal(done.op, '1');
    assert.equal(done.tf, 'none', '入场结束 transform 必须归零（坑①）');
    assert.equal(done.barSx, 'none', 'grow 结束 scaleX 归零');
    const tail = await page.evaluate(() => { window.__frame(119); return getComputedStyle(document.querySelector('#s-hook')).opacity; });
    assert.ok(parseFloat(tail) < 1, '场景尾部应淡出');
    assert.equal(await page.evaluate(() => window.__err), null);
  });
  await withPage(work, async (page) => {
    assert.equal(await page.evaluate(() => window.__N), 120, '单场景模式 __N 应为场景帧数');
    assert.equal(await frame(page, 60), null);
  }, 'scene=hook');
});

test('points：stagger 入场顺序', { timeout: 90000 }, async () => {
  const work = prepWork('comp-points');
  syntheticTimeline(work, [{ id: 'hook', sec: 4, audio: 3 }, { id: 'takeaway', sec: 5, audio: 2.5 }]);
  await withPage(work, async (page) => {
    const ops = j => page.evaluate(j => { window.__frame(j);
      return [...document.querySelectorAll('#s-takeaway .pt-card')].map(c => getComputedStyle(c).opacity); }, j);
    const early = await ops(120 + 15); // lt=0.5：c0 刚起步、c1 未开始
    assert.equal(parseFloat(early[0]), 0);
    assert.equal(parseFloat(early[1]), 0);
    const mid = await ops(120 + 33); // lt=1.1：c0 完成、c1 进行中
    assert.equal(parseFloat(mid[0]), 1);
    assert.ok(parseFloat(mid[1]) > 0 && parseFloat(mid[1]) < 1);
    const late = await ops(120 + 60); // lt=2.0：全部完成
    assert.deepEqual(late.map(parseFloat), [1, 1]);
    assert.equal(await page.evaluate(() => window.__err), null);
  });
});

test('emphasis narration:r 用旁白时长 audioDur 计时（Task5 errata 端到端）', { timeout: 90000 }, async () => {
  const work = prepWork('comp-emphasis');
  // 给 hook 标题加 narration:0.5 强调；audio=2 与场景长度 sec=4 区分，二者不可混淆
  const sp = path.join(work, 'scenes', 'hook.json');
  const sc = JSON.parse(fs.readFileSync(sp, 'utf8'));
  sc.elements[0].emphasis = [{ preset: 'highlight', cue: 'narration:0.5', dur: 0.4 }];
  fs.writeFileSync(sp, JSON.stringify(sc));
  execFileSync('node', [path.join(ROOT, 'scripts', 'compile.js')], { cwd: work, stdio: 'pipe' });
  syntheticTimeline(work, [{ id: 'hook', sec: 4, audio: 2 }, { id: 'takeaway', sec: 5, audio: 2.5 }]);
  await withPage(work, async (page) => {
    const filt = j => page.evaluate(j => { window.__frame(j);
      return document.querySelector('#s-hook .tc-title').style.filter; }, j);
    // ct = (audioStart 0.7 - start 0) + 0.5 * audioDur 2 = 1.7；highlight 峰值 lt = 1.7 + 0.4/2 = 1.9 → frame 57
    assert.equal(await filt(57), 'brightness(1.35)', 'narration:0.5 峰值应落在旁白窗口（audioDur=2），lt=1.9');
    // 若误用场景长度 4 → ct=2.7、峰值 lt=2.9(frame 87)；正确代码此处强调已结束应回 none
    assert.equal(await filt(87), 'none', 'lt=2.9 强调应已结束（误用场景长度会在此误峰值）');
    assert.equal(await page.evaluate(() => window.__err), null);
  });
});
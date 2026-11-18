'use strict';
/* measure.js — 用真实 DOM 量每个元素的实际包围盒（Playwright + 本机 Chrome）。
 *
 * 为什么需要：组件里的 boxes() 是硬编码估算（卡片高度随手数变化），
 * 估算盒会让 SUBTITLE_ZONE / SCREEN_BOUNDS 给出虚假通过。
 * 这里在编译产物（scene.html + timeline.json）就绪后，逐场景激活并用
 * window.__rects() 读真实 getBoundingClientRect，覆盖估算盒。
 *
 * 设计纪律：环境不可用（无 Playwright / 无 Chrome）时返回 null，
 * 调用方回退到估算盒并**明确告警**，绝不静默假装测过。
 *
 * 环境变量：PW_PATH 指向 playwright 安装路径；PW_CHANNEL 指定浏览器通道
 * （默认 chrome；设为空串则用 playwright 自带 chromium）。
 */
const fs = require('fs'), path = require('path'), http = require('http');

function loadPW() {
  if (process.env.PW_PATH) return require(process.env.PW_PATH);
  try { return require('playwright'); } catch (e) {}
  try { return require('playwright-core'); } catch (e) {}
  try {
    const root = require('child_process').execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return require(path.join(root, 'playwright'));
  } catch (e) {}
  for (const p of ['/opt/homebrew/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright', '/usr/lib/node_modules/playwright']) {
    try { return require(p); } catch (e) {}
  }
  throw new Error('找不到 playwright：请 `npm i -g playwright` 或设置 PW_PATH');
}
function launchOptions() {
  const opts = { args: ['--force-color-profile=srgb', '--hide-scrollbars'] };
  const channel = process.env.PW_CHANNEL === undefined ? 'chrome' : process.env.PW_CHANNEL;
  if (channel) opts.channel = channel;
  return opts;
}
function serve(root) {
  const ROOT = path.resolve(root);
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/scene.html';
    const f = path.resolve(ROOT, '.' + p);
    if (f !== ROOT && !f.startsWith(ROOT + path.sep)) { res.statusCode = 404; return res.end('nf'); }
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('nf'); }
    res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
    res.end(fs.readFileSync(f));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}
// cue → 场景内秒。与运行时 cueLt 同一换算：lt: 直读；narration:r 用
// audioStart + r*audioDur（timeline.json 的 dur 字段即旁白音频时长）。
function cueToLt(cue, scene, fps) {
  if (!cue) return 0;
  if (cue.startsWith('lt:')) return parseFloat(cue.slice(3));
  const r = parseFloat(cue.slice(10));
  const audioDur = scene.dur != null ? scene.dur : (scene.end - scene.start) / fps;
  const audioStart = scene.audioStart != null ? scene.audioStart : scene.start / fps;
  return audioStart - scene.start / fps + r * audioDur;
}
// 取一个"元素静止"的帧来量布局盒：须避开所有运动窗口——
// enter 结束后、且不早于任何 emphasis 结束（pulse/scale 会临时放大盒，
// 量到的是变形盒）；有 exit 时还要早于 exit 开始（sink 会下移盒）。
// 若 emphasis 一直播到 exit（无静止窗口），退到 exit 开始前（保底：宁可量到
// 尾部残影，也要尽量选运动最少的帧）；完全没有动画时取 60% 处。
// elements 来自编译后的场景（timeline 里的 scene 不含 elements）。
function measureFrame(scene, fps, elements) {
  const els = elements || scene.elements || [];
  const sceneSec = (scene.end - scene.start) / fps;
  let motionEnd = 0, exitStart = Infinity;
  for (const el of els) {
    if (el.enter) motionEnd = Math.max(motionEnd, el.enter.at + el.enter.dur);
    for (const c of el.emphasis || []) motionEnd = Math.max(motionEnd, cueToLt(c.cue, scene, fps) + (c.dur || 0));
    if (el.exit) exitStart = Math.min(exitStart, sceneSec - el.exit.dur);
  }
  let t = motionEnd > 0 ? motionEnd + 0.2 : sceneSec * 0.6;
  if (Number.isFinite(exitStart)) t = Math.min(t, Math.max(0, exitStart - 0.1));
  const frames = scene.end - scene.start;
  return Math.max(0, Math.min(Math.round(t * fps), frames - 1));
}

/** @returns {Promise<null|{sceneId: {elId: {x,y,w,h}}}>} 环境不可用返回 null */
async function measureBoxes({ dir, timeline, scenes }) {
  let PW;
  try { PW = loadPW(); } catch (e) { return null; }
  const { server, port } = await serve(dir);
  let browser;
  try {
    browser = await PW.chromium.launch(launchOptions());
  } catch (e) {
    server.close();
    return null; // 无 Chrome：调用方回退估算盒并告警
  }
  const byId = {};
  for (const sc of scenes || []) byId[sc.id] = sc.elements;
  const out = {};
  try {
    const page = await browser.newPage({ viewport: { width: timeline.width || 1920, height: timeline.height || 1080 }, deviceScaleFactor: 1 });
    for (const sc of timeline.scenes) {
      await page.goto(`http://127.0.0.1:${port}/scene.html?scene=${encodeURIComponent(sc.id)}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__ready === true || window.__err, { timeout: 30000 });
      const err = await page.evaluate(() => window.__err);
      if (err) throw new Error('scene.html 初始化失败: ' + err);
      const j = measureFrame(sc, timeline.fps, byId[sc.id]);
      const rects = await page.evaluate(({ id, j: frame }) => { window.__frame(frame); return window.__rects(); }, { id: sc.id, j });
      if (rects && rects[sc.id]) out[sc.id] = rects[sc.id];
    }
    return out;
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
}

module.exports = { measureBoxes, measureFrame, cueToLt, loadPW, launchOptions };

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
// 取"所有入场动画都结束"之后的一帧：此时 transform 已归零，量到的是真实布局盒。
// elements 来自编译后的场景（timeline 里的 scene 不含 elements），缺省退化到 60% 处采样。
function measureFrame(scene, fps, elements) {
  const els = elements || scene.elements || [];
  let end = 0;
  for (const el of els) if (el.enter) end = Math.max(end, el.enter.at + el.enter.dur);
  const frames = scene.end - scene.start;
  const j = end > 0 ? Math.round((end + 0.2) * fps) : Math.round(frames * 0.6);
  return Math.max(0, Math.min(j, frames - 1));
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

module.exports = { measureBoxes, measureFrame, loadPW, launchOptions };

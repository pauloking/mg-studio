#!/usr/bin/env node
/* render.js — Playwright + headless Chrome 逐帧确定性截图
 * 用法:
 *   node render.js              # 全量渲染 timeline.totalFrames 帧 -> ./frames/f_%04d.png
 *   node render.js smoke        # 每场景抽代表帧 -> ./smoke/（先目检再全量）
 *   node render.js range A B    # 只重渲 [A,B) 帧（局部修复后用）
 * 依赖: 全局 playwright（PW_PATH 可覆盖）、本机 Chrome、./scene.html、./timeline.json
 * 约定: scene.html 暴露 window.__ready / window.__N / window.__frame(i) / window.__err，
 *       动画只由帧号驱动，不读墙钟（保证逐帧确定、可重跑、可单帧调试）。
 * 重要: 换配音/改时间轴后必须先清空 ./frames 再全量渲染，避免残留旧帧混入。
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { pickSmokeFrames } = require('../lib/scene-map');
// 可移植地加载 playwright：PW_PATH > 本地 require > 全局 npm root > 常见路径
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
  throw new Error('找不到 playwright：请 `npm i -g playwright` 或设置 PW_PATH 指向其安装路径');
}
const PW = loadPW();

const ROOT = process.cwd();
const MODE = process.argv[2];
const SMOKE = MODE === 'smoke';
const RANGE = MODE === 'range' ? [parseInt(process.argv[3]), parseInt(process.argv[4])] : null;
const OUT = path.join(ROOT, SMOKE ? 'smoke' : 'frames');
// 默认用临时端口（0 = 由内核分配），避免并行/残留进程抢占固定端口导致 EADDRINUSE；
// 需要固定端口时设 RENDER_PORT。
const REQ_PORT = process.env.RENDER_PORT ? parseInt(process.env.RENDER_PORT, 10) : 0;
// 浏览器通道：默认本机 Chrome；PW_CHANNEL='' 用 playwright 自带 chromium（CI 用）
const CHANNEL = process.env.PW_CHANNEL === undefined ? 'chrome' : process.env.PW_CHANNEL;
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const ROOT_RESOLVED = path.resolve(ROOT);
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/scene.html';
  const f = path.resolve(ROOT_RESOLVED, '.' + p);
  if ((f !== ROOT_RESOLVED && !f.startsWith(ROOT_RESOLVED + path.sep)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('nf'); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
  res.end(fs.readFileSync(f));
});

(async () => {
  const PORT = await new Promise(r => server.listen(REQ_PORT, '127.0.0.1', () => r(server.address().port)));
  const launch = { args: ['--force-color-profile=srgb', '--disable-frame-rate-limit', '--hide-scrollbars'] };
  if (CHANNEL) launch.channel = CHANNEL;
  const browser = await PW.chromium.launch(launch);
  const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline.json')));
  const page = await browser.newPage({ viewport: { width: tl.width, height: tl.height }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${PORT}/scene.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true || window.__err, { timeout: 30000 });
  const initErr = await page.evaluate(() => window.__err);
  if (initErr) { console.error('INIT ERROR:', initErr); process.exit(1); }
  const n = await page.evaluate(() => window.__N);

  let list, smokeMap = null;
  if (RANGE) list = Array.from({ length: RANGE[1] - RANGE[0] }, (_, i) => RANGE[0] + i);
  else if (SMOKE) {
    let picks = {};
    try { picks = JSON.parse(fs.readFileSync(path.join(ROOT, 'script.json'))).smokePicks || {}; } catch (e) {}
    smokeMap = pickSmokeFrames(tl, picks);
    list = smokeMap.map(x => x.frame);
  } else list = Array.from({ length: n }, (_, i) => i);

  console.log('frames to render:', list.length, SMOKE ? '(smoke)' : RANGE ? '(range)' : `(total ${n})`);
  const t0 = Date.now();
  for (let j = 0; j < list.length; j++) {
    const i = list[j];
    await page.evaluate(f => window.__frame(f), i);
    await page.screenshot({ path: path.join(OUT, `f_${String(i).padStart(4, '0')}.png`) });
    if (!SMOKE && j % 60 === 0) console.log('  frame', i, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  const err = await page.evaluate(() => window.__err);
  console.log('runtime error:', err || 'none');
  if (SMOKE && smokeMap) {
    const mp = path.join(OUT, '_scene_map.json');
    fs.writeFileSync(mp, JSON.stringify(smokeMap, null, 2));
    console.log('scene map ->', path.relative(ROOT, mp));
  }
  await browser.close(); server.close();
  console.log('done in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  if (err) process.exit(1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
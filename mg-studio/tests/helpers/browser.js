'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
function loadPW() {
  if (process.env.PW_PATH) return require(process.env.PW_PATH);
  try { return require('playwright'); } catch (e) {}
  const root = require('child_process').execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  return require(path.join(root, 'playwright'));
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
async function withPage(dir, fn, query = '') {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/scene.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('nf'); }
    res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await loadPW().chromium.launch({ channel: 'chrome', args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/scene.html${query ? '?' + query : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true || window.__err, { timeout: 30000 });
    const err = await page.evaluate(() => window.__err);
    if (err) throw new Error('INIT: ' + err);
    return await fn(page);
  } finally { await browser.close(); server.close(); }
}
async function frame(page, j) { return page.evaluate(j => { window.__frame(j); return window.__err; }, j); }
module.exports = { withPage, frame, loadPW };
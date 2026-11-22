#!/usr/bin/env node
'use strict';
/* three-panorama/render_frames.js — bundled 参数化 3D 全景「喂帧」工程（Topic-Visual P3）。
 * 遵守 mg-studio three3d 喂帧契约：--out --frames --fps --width --height [--tokens] [--params]
 * → 写出 f_0000.png..f_{N-1}.png。确定性：画面只由帧号驱动（t=i/fps），不读墙钟。
 * 内容为通用 stylized 术野/全景示意（双腔+间隔+导线+螺旋），非真实解剖；须 visual-review 人工门。
 * Three.js r149 UMD 已 vendoring 于 vendor/three.min.js（MIT），离线内联、无 CDN 依赖。 */
const fs = require('fs'), path = require('path');
function loadPW() {
  try { return require('playwright-core'); } catch (e) {}
  try { return require('playwright'); } catch (e) {}
  const root = require('child_process').execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  return require(path.join(root, 'playwright'));
}
const a = process.argv.slice(2);
function arg(k, d) { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; }
const out = arg('--out');
const N = parseInt(arg('--frames', '0'), 10);
const fps = parseInt(arg('--fps', '30'), 10);
const W = parseInt(arg('--width', '1920'), 10);
const H = parseInt(arg('--height', '1080'), 10);
if (!out || !(N > 0)) { console.error('用法: render_frames.js --out DIR --frames N [--fps --width --height --tokens --params]'); process.exit(2); }
let params = { structures: [], view: null };
try { params = Object.assign(params, JSON.parse(fs.readFileSync(arg('--params', '/nonexistent'), 'utf8'))); } catch (e) {}
let tokens = {};
try { tokens = JSON.parse(fs.readFileSync(arg('--tokens', '/nonexistent'), 'utf8')); } catch (e) {}
const colors = (tokens && tokens.colors) || {};
const threeSrc = fs.readFileSync(path.join(__dirname, 'vendor', 'three.min.js'), 'utf8');

const SCENE = `
const P = window.__PARAMS, C = window.__COLORS, W = window.__W, H = window.__H, FPS = window.__FPS;
THREE.ColorManagement.legacyMode = false;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.outputEncoding = THREE.sRGBEncoding;
document.body.style.margin = '0'; document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.bg || '#070b16');
scene.fog = new THREE.Fog(C.bg || '#070b16', 12, 26);
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
camera.position.set(0, 1.6, 10.5); camera.lookAt(0, 0, 0);
const mirror = P.view === 'mirror';
const rvX = mirror ? -2.3 : 2.3, lvX = mirror ? 2.3 : -2.3;
const group = new THREE.Group(); scene.add(group);
const rv = new THREE.Mesh(new THREE.SphereGeometry(1.35, 48, 48),
  new THREE.MeshStandardMaterial({ color: C.accent2 || '#00c2ff', transparent: true, opacity: 0.5, roughness: 0.4 }));
rv.scale.set(0.95, 1.3, 0.85); rv.position.set(rvX, -0.1, 0); rv.rotation.z = mirror ? -0.18 : 0.18; group.add(rv);
const lv = new THREE.Mesh(new THREE.SphereGeometry(1.35, 48, 48),
  new THREE.MeshStandardMaterial({ color: C.accent || '#6a5cff', transparent: true, opacity: 0.55, roughness: 0.4 }));
lv.scale.set(1.05, 1.4, 0.95); lv.position.set(lvX, -0.15, 0); lv.rotation.z = mirror ? 0.18 : -0.18; group.add(lv);
const septum = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.0, 1.4),
  new THREE.MeshStandardMaterial({ color: '#9a7b5f', roughness: 0.7, transparent: true, opacity: 0.88 }));
septum.rotation.y = 0.12; group.add(septum);
const endo = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.2, 1.5),
  new THREE.MeshStandardMaterial({ color: C.accent2 || '#00c2ff', emissive: C.accent2 || '#00c2ff', emissiveIntensity: 0.3 }));
endo.position.x = mirror ? 0.5 : -0.5; group.add(endo);
const tipX = mirror ? -0.2 : 0.2;
const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(rvX * 1.7, 0.3, 1.4), new THREE.Vector3(rvX * 1.1, 0.5, 0.9),
  new THREE.Vector3(rvX * 0.5, 0.2, 0.4), new THREE.Vector3(tipX, 0, 0)]);
const leadGeo = new THREE.TubeGeometry(curve, 64, 0.12, 12, false);
const leadIndexCount = leadGeo.index.count;
const lead = new THREE.Mesh(leadGeo, new THREE.MeshStandardMaterial({ color: '#f4f7ff', metalness: 0.6, roughness: 0.3 }));
group.add(lead);
const coilPts = []; for (let k = 0; k <= 60; k++) { const u = k / 60; coilPts.push(new THREE.Vector3(tipX + u * 0.5 * (mirror ? 1 : -1), Math.sin(u * Math.PI * 6) * 0.16, Math.cos(u * Math.PI * 6) * 0.16)); }
const helix = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 120, 0.045, 8, false),
  new THREE.MeshStandardMaterial({ color: C.accent2 || '#00c2ff', metalness: 0.5, roughness: 0.35, emissive: C.accent2 || '#00c2ff', emissiveIntensity: 0.5 }));
group.add(helix);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(2, 3, 4); scene.add(dir);
const pt = new THREE.PointLight(C.accent || '#6a5cff', 0.6, 30); pt.position.set(0, 2, 5); scene.add(pt);
const clamp01 = v => Math.max(0, Math.min(1, v));
window.__frame = function (i) { try {
  const t = i / FPS;
  const prog = clamp01((t - 1) / 3);
  lead.geometry.setDrawRange(0, Math.floor(leadIndexCount * prog));
  helix.visible = prog > 0.1; helix.scale.setScalar(Math.max(0.001, prog));
  group.rotation.y = t * 0.1;
  endo.material.emissiveIntensity = 0.3 + 0.2 * Math.sin(t * 2.2);
  renderer.render(scene, camera);
  if (renderer.getContext().isContextLost()) throw new Error('WebGL context lost');
  window.__err = null;
} catch (e) { window.__err = String(e && e.stack || e); } };
window.__ready = true;
`;

(async () => {
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}</style></head>
<body><script>${threeSrc}</script>
<script>window.__PARAMS=${JSON.stringify(params)};window.__COLORS=${JSON.stringify(colors)};window.__W=${W};window.__H=${H};window.__FPS=${fps};window.__ready=false;window.__err=null;</script>
<script>${SCENE}</script></body></html>`;
  const browser = await loadPW().chromium.launch({ channel: process.env.PW_CHANNEL === undefined ? 'chrome' : process.env.PW_CHANNEL, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true || window.__err, { timeout: 30000 });
    const err0 = await page.evaluate(() => window.__err);
    if (err0) throw new Error('INIT: ' + err0);
    if (process.env.MG_THREE_DEBUG) {
      const dbg = await page.evaluate(() => ({
        ready: window.__ready, err: window.__err, three: typeof THREE,
        bodyChildren: document.body.children.length,
        canvases: [...document.querySelectorAll('canvas')].map(c => ({ w: c.width, h: c.height })),
        htmlLen: document.documentElement.outerHTML.length
      }));
      fs.writeFileSync(path.join(out, '_debug.json'), JSON.stringify(dbg, null, 2));
      const dataUrl = await page.evaluate(() => { window.__frame(0); const c = document.querySelector('canvas'); return c ? c.toDataURL('image/png') : null; });
      if (dataUrl) fs.writeFileSync(path.join(out, '_canvas.dataurl'), Buffer.from(dataUrl.split(',')[1], 'base64'));
      const px = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (!gl) return { gl: false };
        const read = (x, y) => { const p = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return [...p]; };
        return { gl: true, lost: gl.isContextLost(), center: read(c.width / 2 | 0, c.height / 2 | 0), corner: read(4, 4), mid: read(c.width / 2 | 0, c.height * 0.4 | 0) };
      });
      fs.writeFileSync(path.join(out, '_pixels.json'), JSON.stringify(px));
    }
    for (let i = 0; i < N; i++) {
      // 用 canvas.toDataURL 取帧：headless 下 page.screenshot 抓不到 WebGL 合成层（实测空白），
      // preserveDrawingBuffer:true 保证 toDataURL 读到真实像素，且只由帧号驱动（确定性）。
      const dataUrl = await page.evaluate(j => { window.__frame(j); if (window.__err) return { err: window.__err }; const c = document.querySelector('canvas'); return { data: c.toDataURL('image/png') }; }, i);
      if (dataUrl.err) throw new Error('FRAME ' + i + ': ' + dataUrl.err);
      fs.writeFileSync(path.join(out, `f_${String(i).padStart(4, '0')}.png`), Buffer.from(dataUrl.data.split(',')[1], 'base64'));
    }
    console.log('three-panorama rendered', N, 'frames');
  } finally { await browser.close(); }
})().catch(e => { console.error(String(e && e.message || e)); process.exit(1); });

#!/usr/bin/env node
'use strict';
/* three-panorama/render_frames.js — 示例/草稿级「Three.js 喂帧」工程（仅供专家替换/契约示例）。
 * 注意：自动 panorama 已改走干净 2D 分区示意（schematic-gen）；本 primitive/stylized 3D 落在
 * "既不准确也不示意"的恐怖谷，不可直接当交付。准确路线=专家参考影像或专业建模外部工程。
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
renderer.localClippingEnabled = true;
document.body.style.margin = '0'; document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const BG = C.bg || '#070b16';
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 14, 30);
const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
camera.position.set(2.2, 1.0, 7.2); camera.lookAt(0, -0.1, 0);
const mirror = P.view === 'mirror';
const side = mirror ? -1 : 1; // 右室 x 符号（镜像右室在左）
const group = new THREE.Group(); scene.add(group);
// 剖切面：去掉前壁(z>0.55)露出腔室与间隔
const cut = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.55);
const tissue = new THREE.MeshPhysicalMaterial({ color: '#8d3f3f', roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.5, clippingPlanes: [cut] });
const cavity = new THREE.MeshStandardMaterial({ color: '#3a1414', roughness: 0.9, side: THREE.BackSide });
function blob(geo, mat, x, y, z, sx, sy, sz, rz) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); if (rz) m.rotation.z = rz; group.add(m); return m;
}
const sph = new THREE.SphereGeometry(1, 48, 48);
// 心室+心房+心尖连成一个心肌整体（非浮球）
blob(sph, tissue, side * 1.05, -0.25, 0.15, 1.15, 1.35, 0.95, side * 0.15);
blob(sph, tissue, -side * 0.95, -0.35, -0.15, 1.3, 1.5, 1.0, -side * 0.15);
blob(sph, tissue, side * 0.85, 1.0, -0.25, 0.62, 0.6, 0.6);
blob(sph, tissue, -side * 0.8, 1.1, -0.35, 0.68, 0.65, 0.65);
// 腔室内壁（剖切后可见空心）
blob(sph, cavity, side * 1.05, -0.25, 0.15, 0.98, 1.16, 0.8);
blob(sph, cavity, -side * 0.95, -0.35, -0.15, 1.1, 1.28, 0.85);
// 室间隔（心肌整体内的厚壁，不伸出体外）+ 左室内膜缘
const septum = blob(new THREE.BoxGeometry(0.5, 2.0, 0.9), new THREE.MeshPhysicalMaterial({ color: '#c98d7a', roughness: 0.6 }), 0, -0.3, 0, 1, 1, 1, 0);
septum.rotation.y = 0.15;
const endo = blob(new THREE.BoxGeometry(0.07, 1.8, 0.85), new THREE.MeshStandardMaterial({ color: C.accent2 || '#00c2ff', emissive: C.accent2 || '#00c2ff', emissiveIntensity: 0.35 }), -side * 0.3, -0.3, 0);
endo.rotation.y = 0.15;
// 导线自右室游离壁旋入间隔 + 同轴螺旋尖
const tipX = side * 0.15;
const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(side * 2.5, 0.2, 1.1), new THREE.Vector3(side * 1.7, 0.4, 0.8),
  new THREE.Vector3(side * 0.9, 0.1, 0.4), new THREE.Vector3(tipX, -0.1, 0.1)]);
const leadGeo = new THREE.TubeGeometry(curve, 64, 0.11, 12, false);
const leadIndexCount = leadGeo.index.count;
const lead = new THREE.Mesh(leadGeo, new THREE.MeshStandardMaterial({ color: '#f4f7ff', metalness: 0.6, roughness: 0.3 }));
group.add(lead);
const coilPts = []; for (let k = 0; k <= 60; k++) { const u = k / 60; coilPts.push(new THREE.Vector3(tipX - side * u * 0.45, -0.1 + Math.sin(u * Math.PI * 6) * 0.15, 0.5 + Math.cos(u * Math.PI * 6) * 0.15)); }
const helix = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 120, 0.04, 8, false),
  new THREE.MeshStandardMaterial({ color: C.accent2 || '#00c2ff', metalness: 0.5, roughness: 0.35, emissive: C.accent2 || '#00c2ff', emissiveIntensity: 0.5 }));
group.add(helix);
// 标注（sprite + 引线），镜像感知
function label(text, ax, ay, az, lx, ly, lz) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d'); g.font = '700 64px "PingFang SC","Noto Sans SC",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#eef2ff'; g.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.0, 0.5, 1); sp.position.set(lx, ly, lz); sp.renderOrder = 10; group.add(sp);
  const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, ay, az), new THREE.Vector3(lx, ly - 0.25, lz)]),
    new THREE.LineBasicMaterial({ color: '#eef2ff', transparent: true, opacity: 0.45 }));
  ln.renderOrder = 9; group.add(ln);
}
label('右室', side * 1.05, 0.4, 0.6, side * 2.3, 1.55, 1.2);
label('左室', -side * 0.95, 0.4, 0.4, -side * 2.3, 1.55, 1.2);
label('室间隔', 0, 0.7, 0.3, 0, 1.95, 1.0);
label('导线+螺旋', side * 1.5, 0.2, 0.6, side * 2.1, -1.6, 1.2);
// 布光：半球+主光+轮廓光+补光
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a1a1a, 0.55));
const key = new THREE.DirectionalLight(0xfff9f0, 1.1); key.position.set(3, 4, 5); scene.add(key);
const rim = new THREE.PointLight(0x66aaff, 0.9, 40); rim.position.set(-4, 2, -4); scene.add(rim);
const fill = new THREE.DirectionalLight(0x8899ff, 0.3); fill.position.set(-3, 1, 3); scene.add(fill);
// 背景柔光
const gv = document.createElement('canvas'); gv.width = gv.height = 256;
const gg = gv.getContext('2d'); const rg = gg.createRadialGradient(128, 128, 0, 128, 128, 128);
rg.addColorStop(0, 'rgba(90,80,200,0.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
gg.fillStyle = rg; gg.fillRect(0, 0, 256, 256);
const gtex = new THREE.CanvasTexture(gv);
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, depthTest: false, transparent: true }));
glow.scale.set(16, 16, 1); glow.position.set(0, 0, -6); scene.add(glow);
const clamp01 = v => Math.max(0, Math.min(1, v));
window.__frame = function (i) { try {
  const t = i / FPS;
  const prog = clamp01((t - 1) / 3);
  lead.geometry.setDrawRange(0, Math.floor(leadIndexCount * prog));
  helix.visible = prog > 0.1; helix.scale.setScalar(Math.max(0.001, prog));
  group.rotation.y = t * 0.05;
  endo.material.emissiveIntensity = 0.35 + 0.2 * Math.sin(t * 2.2);
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

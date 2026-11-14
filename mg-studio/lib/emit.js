'use strict';
// emitSceneHtml — 发射自包含 scene.html（契约与 scene.template.html 一致 + 单场景模式）
const HELPERS = `
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, p) => a + (b - a) * p;
const eo = p => 1 - Math.pow(1 - clamp01(p), 3);
const eio = p => { p = clamp01(p); return p < .5 ? 4*p*p*p : 1 - Math.pow(-2*p+2, 3)/2; };
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const srand = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function H(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const op = (e, v) => e.style.opacity = v;
`;
// drawBG 与 upSubtitle 取自 scene.template.html（确定性背景 + 字幕钳制渲染），保持视觉延续
const DRAW_BG = `
const bg = document.getElementById('bg').getContext('2d');
const P = []; for (let i = 0; i < 80; i++) P.push({ x: srand(i)*1920, y: srand(i+500)*1080, r: 1+srand(i+900)*2.4, s: 12+srand(i+1300)*26, ph: srand(i+1700)*6.28 });
function drawBG(t) {
  const g = bg.createLinearGradient(0,0,1920,1080);
  g.addColorStop(0,'#080c1a'); g.addColorStop(.5,'#0a1024'); g.addColorStop(1,'#070a16');
  bg.fillStyle = g; bg.fillRect(0,0,1920,1080);
  bg.strokeStyle = 'rgba(110,130,220,0.05)'; bg.lineWidth = 1; bg.beginPath();
  for (let x=0;x<=1920;x+=80){bg.moveTo(x,0);bg.lineTo(x,1080);}
  for (let y=0;y<=1080;y+=80){bg.moveTo(0,y);bg.lineTo(1920,y);}
  bg.stroke();
  const orbs = [
    { x:480+Math.sin(t*.13)*150, y:320+Math.cos(t*.1)*80, r:520, c:'rgba(96,80,220,0.14)' },
    { x:1450+Math.cos(t*.11)*170, y:700+Math.sin(t*.14)*90, r:560, c:'rgba(0,140,220,0.12)' }
  ];
  for (const o of orbs){const rg=bg.createRadialGradient(o.x,o.y,0,o.x,o.y,o.r);rg.addColorStop(0,o.c);rg.addColorStop(1,'rgba(0,0,0,0)');bg.fillStyle=rg;bg.fillRect(o.x-o.r,o.y-o.r,o.r*2,o.r*2);}
  for (const p of P){const y=(p.y-t*p.s)%1080;const yy=y<0?y+1080:y;const x=p.x+Math.sin(t*.5+p.ph)*16;bg.fillStyle='rgba(150,170,255,'+(.1+.09*Math.sin(t+p.ph))+')';bg.beginPath();bg.arc(x,yy,p.r,0,6.29);bg.fill();}
}
`;
const SUBTITLE = `
let lastSub = '';
function upSubtitle(t) { let cur = null;
  for (const sc of TL.scenes) for (const cu of sc.subs) if (t >= cu.from && t < cu.to) cur = cur || cu;
  if (!cur) { op(subtitleEl, 0); lastSub = ''; return; }
  if (cur.text !== lastSub) { subtitleEl.textContent = cur.text; lastSub = cur.text; }
  op(subtitleEl, Math.min(seg(t-cur.from,0,.25), seg(cur.to-t,0,.25))); }
`;
const BOOTSTRAP = `
const scenesEl = document.getElementById('scenes');
const subtitleEl = document.getElementById('subtitle');
const S = {};
let TL = null;
let OFF = 0;
function fadeScene(r, lt, dur) { op(r, Math.min(seg(lt,0,.45), seg(dur-lt,0,.45))); }
window.__ready = false; window.__err = null;
window.__frame = function (j) { try {
  const i = j + OFF;
  const t = i / TL.fps; drawBG(t);
  let active = -1;
  for (let k = 0; k < TL.scenes.length; k++) { const sc = TL.scenes[k]; if (i >= sc.start && i < sc.end) active = k; }
  for (let k = 0; k < UPS.length; k++) { const el = scenesEl.children[k];
    if (k === active) { el.style.display = 'block'; UPS[k]((i - TL.scenes[k].start) / TL.fps, t); }
    else { el.style.display = 'none'; op(el, 0); } }
  upSubtitle(t);
} catch (e) { window.__err = String(e && e.stack || e); } };
// 真实布局盒：供 lint_scene 用 DOM 实测（隐藏场景 display:none，须先 __frame 激活）
window.__rects = function () { const out = {};
  for (const sid in S) { out[sid] = {}; for (const x of S[sid].els) { const r = x.e.getBoundingClientRect();
    out[sid][x.key] = { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; } }
  return out; };
const __only = new URLSearchParams(location.search).get('scene');
fetch('timeline.json').then(r => r.json()).then(tl => { TL = tl;
  tl.scenes.forEach(sc => { sc.audioDur = sc.dur; sc.dur = (sc.end - sc.start) / tl.fps; });
  buildScenes();
  if (__only) { const sc = TL.scenes.find(s => s.id === __only);
    if (!sc) { window.__err = 'unknown scene: ' + __only; return; }
    OFF = sc.start; window.__N = sc.end - sc.start;
  } else { window.__N = tl.totalFrames; }
  window.__frame(0); window.__ready = true;
}).catch(e => { window.__err = String(e); });
`;

function emitSceneHtml({ tokens, scenes, components, preRuntime }) {
  const used = [...new Set(scenes.map(s => s.layout))];
  // 双保险：ir.js 已白名单校验，这里落地前再剥白名单外字符（font.family 防 </style> 越狱、色键名防 CSS 变量名打断）
const escFontFamily = String(tokens.font.family).replace(/[^\w"',\- ]/g, '');
const vars = Object.entries(tokens.colors).map(([k, v]) => `--${String(k).replace(/[^\w-]/g, '')}:${v};`).join('');
  const css = used.map(n => components[n].css(tokens)).join('\n');
  const runtime = used.map(n => components[n].runtime ? components[n].runtime(tokens) : '').join('\n');
  const specs = {};
  for (const sc of scenes) { specs[sc.id] = {}; for (const el of sc.elements) specs[sc.id][el.id] = el; }
  const builds = scenes.map(sc => components[sc.layout].build(sc)).join('\n');
  const updates = scenes.map((sc, k) => {
    const extra = components[sc.layout].extraUpdate ? components[sc.layout].extraUpdate(sc) : '';
    return `function up_${sc.id}(lt, t) {
  const s = S['${sc.id}'], sc = TL.scenes[${k}], dur = sc.dur;
  fadeScene(s.r, lt, dur);
  for (const el of s.els) upEl(el.e, SPECS['${sc.id}'][el.key], lt, dur, sc);
  ${extra}
}`;
  }).join('\n');
  const ups = scenes.map(sc => `up_${sc.id}`).join(', ');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>mg-studio compiled</title>
<link rel="icon" href="data:,">
<style>
:root{${vars}}
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:1920px; height:1080px; overflow:hidden; background:var(--bg);
  font-family:${escFontFamily}; -webkit-font-smoothing:antialiased; }
#bg { position:absolute; inset:0; }
.vignette { position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(2,4,10,.55) 100%); }
.scene { position:absolute; inset:0; opacity:0; }
#subtitle { position:absolute; left:50%; bottom:${tokens.subtitle.bottom}px; transform:translateX(-50%);
  max-width:${tokens.subtitle.maxW}px; padding:18px 46px; border-radius:16px; z-index:60;
  background:rgba(8,12,26,.72); border:1px solid rgba(120,140,220,.18); backdrop-filter:blur(6px);
  color:#f2f5ff; font-size:${tokens.subtitle.fontSize}px; font-weight:500; letter-spacing:1px; text-align:center; white-space:nowrap; opacity:0; }
${css}
</style>
</head>
<body>
<canvas id="bg" width="1920" height="1080"></canvas>
<div class="vignette"></div>
<div id="scenes"></div>
<div id="subtitle"></div>
<script>
'use strict';
${HELPERS}
${DRAW_BG}
${preRuntime}
${runtime}
const SPECS = ${JSON.stringify(specs).replace(/</g, '\\u003c')};
${BOOTSTRAP.replace('function fadeScene', '/* buildScenes 由组件生成 */\nfunction buildScenes() {\n' + builds + '\n}\n' + updates + '\nconst UPS = [' + ups + '];\nfunction fadeScene')}
${SUBTITLE}
</script>
</body>
</html>`;
}
module.exports = { emitSceneHtml };
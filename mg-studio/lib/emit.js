'use strict';
// emitSceneHtml — 发射自包含 scene.html（契约与 scene.template.html 一致 + 单场景模式）
const { lum } = require('./color');

const HELPERS = `
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, p) => a + (b - a) * p;
const eo = p => 1 - Math.pow(1 - clamp01(p), 3);
const eio = p => { p = clamp01(p); return p < .5 ? 4*p*p*p : 1 - Math.pow(-2*p+2, 3)/2; };
const overshoot = p => { const s = 1.70158; p = clamp01(p) - 1; return p * p * ((s + 1) * p + s) + 1; };
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

function getDrawBg(bgType, tokens) {
  const type = bgType || (tokens && tokens.bgType) || 'grid-tech';
  if (type === 'clean-light') {
    return `
const bg = document.getElementById('bg').getContext('2d');
function drawBG(t) {
  const g = bg.createLinearGradient(0,0,1920,1080);
  g.addColorStop(0,'#f8fafc'); g.addColorStop(1,'#eef2f6');
  bg.fillStyle = g; bg.fillRect(0,0,1920,1080);
  bg.fillStyle = 'rgba(148,163,184,0.25)';
  for (let x=40;x<=1920;x+=60) {
    for (let y=40;y<=1080;y+=60) {
      bg.fillRect(x,y,2,2);
    }
  }
  const orbs = [
    { x:380+Math.sin(t*.08)*100, y:260+Math.cos(t*.07)*60, r:580, c:'rgba(3,105,161,0.06)' },
    { x:1500+Math.cos(t*.09)*120, y:760+Math.sin(t*.08)*70, r:620, c:'rgba(15,118,110,0.05)' }
  ];
  for (const o of orbs){const rg=bg.createRadialGradient(o.x,o.y,0,o.x,o.y,o.r);rg.addColorStop(0,o.c);rg.addColorStop(1,'rgba(255,255,255,0)');bg.fillStyle=rg;bg.fillRect(o.x-o.r,o.y-o.r,o.r*2,o.r*2);}
}
`;
  }
  if (type === 'warm-editorial') {
    return `
const bg = document.getElementById('bg').getContext('2d');
function drawBG(t) {
  const g = bg.createLinearGradient(0,0,1920,1080);
  g.addColorStop(0,'#faf6ef'); g.addColorStop(.5,'#f7f2e8'); g.addColorStop(1,'#f3ece0');
  bg.fillStyle = g; bg.fillRect(0,0,1920,1080);
  bg.strokeStyle = 'rgba(180,160,130,0.08)'; bg.lineWidth = 1; bg.beginPath();
  for (let x=0;x<=1920;x+=120){bg.moveTo(x,0);bg.lineTo(x,1080);}
  for (let y=0;y<=1080;y+=120){bg.moveTo(0,y);bg.lineTo(1920,y);}
  bg.stroke();
  bg.strokeStyle = 'rgba(194,65,12,0.12)'; bg.lineWidth = 1;
  bg.strokeRect(48,48,1824,984);
  const orbs = [
    { x:960+Math.sin(t*.06)*80, y:300+Math.cos(t*.05)*50, r:680, c:'rgba(194,65,12,0.05)' },
    { x:400+Math.cos(t*.07)*90, y:800+Math.sin(t*.06)*60, r:550, c:'rgba(180,83,9,0.04)' }
  ];
  for (const o of orbs){const rg=bg.createRadialGradient(o.x,o.y,0,o.x,o.y,o.r);rg.addColorStop(0,o.c);rg.addColorStop(1,'rgba(255,255,255,0)');bg.fillStyle=rg;bg.fillRect(o.x-o.r,o.y-o.r,o.r*2,o.r*2);}
}
`;
  }
  if (type === 'swiss-modern') {
    return `
const bg = document.getElementById('bg').getContext('2d');
function drawBG(t) {
  bg.fillStyle = '#f4f4f5'; bg.fillRect(0,0,1920,1080);
  bg.strokeStyle = 'rgba(24,24,27,0.14)'; bg.lineWidth = 2;
  bg.strokeRect(36,36,1848,1008);
  bg.strokeStyle = 'rgba(24,24,27,0.25)'; bg.lineWidth = 1.5; bg.beginPath();
  const marks = [[36,36],[1884,36],[36,1044],[1884,1044],[960,36],[960,1044]];
  for (const [mx,my] of marks) {
    bg.moveTo(mx-12,my); bg.lineTo(mx+12,my);
    bg.moveTo(mx,my-12); bg.lineTo(mx,my+12);
  }
  bg.stroke();
}
`;
  }
  if (type === 'solid') {
    const bgColor = (tokens && tokens.colors && tokens.colors.bg) || '#070b16';
    return `
const bg = document.getElementById('bg').getContext('2d');
function drawBG(t) {
  bg.fillStyle = '${bgColor}';
  bg.fillRect(0,0,1920,1080);
}
`;
  }
  return DRAW_BG;
}

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

function emitSceneHtml({ tokens, scenes, components, preRuntime, disclaimer }) {
  const used = [...new Set(scenes.map(s => s.layout))];
  // 双保险：ir.js 已白名单校验，这里落地前再剥白名单外字符（font.family 防 </style> 越狱、色键名防 CSS 变量名打断）
  const escFontFamily = String(tokens.font.family).replace(/[^\w"',\- ]/g, '');
  const varsArr = Object.entries(tokens.colors).map(([k, v]) => `--${String(k).replace(/[^\w-]/g, '')}:${v};`);
  if (tokens.card) {
    if (tokens.card.radius != null) varsArr.push(`--card-radius:${tokens.card.radius}px;`);
    if (tokens.card.borderWidth != null) varsArr.push(`--card-border-width:${tokens.card.borderWidth}px;`);
    if (tokens.card.shadow) varsArr.push(`--card-shadow:${String(tokens.card.shadow).replace(/[^\w\s,.()#%\/-]/g, '')};`);
  }
  if (tokens.titleBar) {
    varsArr.push(`--title-bar:${tokens.titleBar};`);
  }
  const vars = varsArr.join('');
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

  const isLight = tokens.colors && tokens.colors.bg && lum(tokens.colors.bg) > 0.45;
  const vignetteBg = isLight
    ? 'background:radial-gradient(ellipse at 50% 45%, transparent 70%, rgba(148,163,184,.15) 100%);'
    : 'background:radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(2,4,10,.55) 100%);';
  const subBg = (tokens.subtitle && tokens.subtitle.bg) || 'rgba(8,12,26,.72)';
  const subBorder = (tokens.subtitle && tokens.subtitle.border) || 'rgba(120,140,220,.18)';
  const subColor = (tokens.subtitle && tokens.subtitle.color) || '#f2f5ff';
  const disclaimerColor = isLight ? 'rgba(71,85,105,.75)' : 'rgba(200,212,240,.66)';
  const drawBgCode = getDrawBg(tokens.bgType, tokens);

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
  ${vignetteBg} }
.scene { position:absolute; inset:0; opacity:0; }
#subtitle { position:absolute; left:50%; bottom:${tokens.subtitle.bottom}px; transform:translateX(-50%);
  max-width:${tokens.subtitle.maxW}px; padding:18px 46px; border-radius:16px; z-index:60;
  background:${subBg}; border:1px solid ${subBorder}; backdrop-filter:blur(6px);
  color:${subColor}; font-size:${tokens.subtitle.fontSize}px; font-weight:500; letter-spacing:1px; text-align:center; white-space:nowrap; opacity:0; }
#disclaimer { position:absolute; left:50%; bottom:12px; transform:translateX(-50%); z-index:61; max-width:1840px;
  color:${disclaimerColor}; font-size:20px; font-weight:500; letter-spacing:.5px; text-align:center; white-space:nowrap; }
${css}
</style>
</head>
<body>
<canvas id="bg" width="1920" height="1080"></canvas>
<div class="vignette"></div>
<div id="scenes"></div>
<div id="subtitle"></div>
${disclaimer ? '<div id="disclaimer">' + String(disclaimer).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</div>' : ''}
<script>
'use strict';
${HELPERS}
${drawBgCode}
${preRuntime}
${runtime}
const SPECS = ${JSON.stringify(specs).replace(/</g, '\\u003c')};
${BOOTSTRAP.replace('function fadeScene', '/* buildScenes 由组件生成 */\nfunction buildScenes() {\n' + builds + '\n}\n' + updates + '\nconst UPS = [' + ups + '];\nfunction fadeScene')}
${SUBTITLE}
</script>
</body>
</html>`;
}
module.exports = { emitSceneHtml, getDrawBg };
'use strict';
const { escHtml } = require('../escape');
const { icons, getIcon, validateLocalImage, validateLocalVideo } = require('../director-assets');

const ACTIONS = ['reveal', 'slide', 'punch', 'draw', 'drift', 'turn', 'grow', 'hold'];
const KINDS = ['text', 'icon', 'image', 'video', 'line', 'ring', 'panel'];
const TRANSITIONS = ['cut', 'wipe', 'push', 'fade'];
const COLORS = ['ink', 'accent', 'accent2', 'muted'];
const inRange = (x, min, max) => Number.isFinite(x) && x >= min && x <= max;
const rect = layer => ({
  x: Math.round(layer.x * 19.2), y: Math.round(layer.y * 10.8),
  w: Math.round(layer.w * 19.2), h: Math.round(layer.h * 10.8)
});

function validateLayer(props) {
  if (!props || !KINDS.includes(props.kind) || !ACTIONS.includes(props.action) || !COLORS.includes(props.color)) return false;
  if (!inRange(props.x, 3, 91) || !inRange(props.y, 3, 80) || !inRange(props.w, 3, 94 - props.x)
      || !inRange(props.h, 1, 84 - props.y) || !inRange(props.at, 0, 0.9) || !inRange(props.span, 0.04, 0.9)) return false;
  if (props.kind === 'text') return typeof props.content === 'string' && props.content.length > 0 && props.content.length <= 100
    && inRange(props.size, 32, 140) && ['left', 'center'].includes(props.align);
  if (props.kind === 'icon') return Object.hasOwn(icons, props.asset);
  if (props.kind === 'image') return validateLocalImage(props.media);
  if (props.kind === 'video') return validateLocalVideo(props.media);
  return true;
}

function updateDirected(state, time, duration) {
  const sc = state.r;
  const t = Math.max(0, Math.min(1, time / duration));
  const enter = eo(seg(time, 0, 0.42));
  const leave = eo(seg(time, duration - 0.28, duration));
  const pending = [];
  sc.style.opacity = state.transition === 'fade' ? enter * (1 - leave) : 1;
  sc.style.clipPath = state.transition === 'wipe' ? 'inset(0 ' + 100 * (1 - enter) + '% 0 0)' : 'none';
  sc.style.transform = state.transition === 'push' ? 'translateX(' + ((1 - enter) * 192 - leave * 72) + 'px)' : 'none';
  for (const { e, props } of state.els) {
    const raw = seg(t, props.at, props.at + props.span);
    const p = eo(raw);
    let transform = 'none';
    let clip = 'none';
    if (props.action === 'reveal' || props.action === 'draw') clip = 'inset(0 ' + (100 - 100 * p) + '% 0 0)';
    if (props.action === 'slide') transform = 'translate(' + (p - 1) * 145 + 'px,' + (1 - p) * 24 + 'px)';
    if (props.action === 'punch') transform = 'scale(' + (0.68 + p * 0.32 + Math.sin(Math.PI * raw) * 0.23) + ')';
    if (props.action === 'grow') transform = 'scale(' + (0.55 + 0.55 * p) + ')';
    if (props.action === 'drift') transform = 'translate(' + p * 98 + 'px,' + (-38 * p) + 'px) scale(' + (1 + .12 * p) + ')';
    if (props.action === 'turn') transform = 'rotate(' + (1 - p) * -28 + 'deg) scale(' + (0.8 + .2 * p) + ')';
    const strokes = state.strokes.get(e);
    if (strokes) {
      for (const [stroke, length] of strokes) stroke.style.strokeDashoffset = length * (1 - p);
      clip = 'none';
    }
    e.style.transform = transform;
    e.style.clipPath = clip;
    e.style.opacity = t < props.at ? 0 : Math.min(1, raw * 5 + (props.action === 'hold' ? 1 : 0));
    if (props.kind === 'video' && t >= props.at) {
      const video = e.firstElementChild;
      const offset = Math.max(0, Math.min(video.duration - .04, time - props.at * duration));
      if (Number.isFinite(offset) && (Math.abs(video.currentTime - offset) > .014 || video.seeking)) {
        const ready = new Promise(resolve => {
          const done = () => { clearTimeout(timeout); video.removeEventListener('seeked', done); resolve(); };
          const timeout = setTimeout(done, 1000);
          video.addEventListener('seeked', done, { once: true });
        });
        if (Math.abs(video.currentTime - offset) > .014) video.currentTime = offset;
        pending.push(ready);
      }
    }
  }
  if (pending.length) return Promise.all(pending);
}

function markup(props) {
  if (props.kind === 'text') return escHtml(props.content);
  if (props.kind === 'icon') return getIcon(props.asset);
  if (props.kind === 'image') return '<img alt="" src="' + escHtml(props.media.data) + '">';
  if (props.kind === 'video') return '<video preload="auto" muted playsinline src="' + escHtml(props.media.data) + '"></video>';
  return '';
}

module.exports = {
  name: 'directed',
  css: () => `
.dir-layer { position:absolute; display:flex; align-items:center; justify-content:center; transform-origin:center; }
.dir-layer.dir-text { line-height:1.12; font-weight:720; overflow-wrap:anywhere; text-wrap:balance; }
.dir-layer.dir-text.dir-left { justify-content:flex-start; text-align:left; }
.dir-layer.dir-text.dir-center { text-align:center; }
.dir-layer svg { width:100%; height:100%; stroke-width:1.35; overflow:visible; }
.dir-layer img, .dir-layer video { width:100%; height:100%; object-fit:contain; }
.dir-layer.dir-line { background:currentColor; border-radius:50px; }
.dir-layer.dir-panel { border:2px solid currentColor; border-radius:36px; background:color-mix(in srgb,currentColor 10%,transparent); }
.dir-layer.dir-ring { border:6px solid currentColor; border-radius:50%; }
`,
  check: el => el.type === 'layer' && validateLayer(el.props) ? [] : ['镜头图层的内容、位置或动作无效'],
  runtime: () => updateDirected.toString(),
  build: sc => {
    const content = sc.elements.map(el => {
      const p = el.props;
      const { x, y, w, h } = rect(p);
      return `<div class="dir-layer dir-${p.kind} dir-${p.align === 'left' ? 'left' : 'center'}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;color:var(--${p.color});font-size:${p.kind === 'text' ? p.size : 48}px">${markup(p)}</div>`;
    }).join('');
    return `{ const r=H('div','scene',${JSON.stringify(content).replace(/</g, '\\u003c')}); r.id='s-${sc.id}'; scenesEl.append(r);
      const specs=SPECS['${sc.id}'];
      const els=[...r.children].map((e,i)=>{const key=Object.keys(specs)[i];return {key,e,props:specs[key].props};});
      const strokes=new Map();
      for (const {e,props} of els) if (props.kind==='icon' && props.action==='draw') {
        strokes.set(e,[...e.querySelectorAll('path,circle,line,polyline,rect,ellipse,polygon')].map(node=>{
          const length=node.getTotalLength();node.style.strokeDasharray=length;return [node,length];
        }));
      }
      S['${sc.id}']={r,els,strokes,transition:${JSON.stringify(TRANSITIONS.includes(sc.transition) ? sc.transition : 'cut')}}; }`;
  },
  extraUpdate: () => 'return updateDirected(s, lt, dur);',
  boxes: sc => sc.elements.map(el => ({
    id: el.id, ...rect(el.props),
    blocks: el.props.kind === 'text' ? [{ text: el.props.content, colorKey: el.props.color }] : []
  }))
};

module.exports.ACTIONS = ACTIONS;
module.exports.KINDS = KINDS;
module.exports.TRANSITIONS = TRANSITIONS;
module.exports.validateLayer = validateLayer;

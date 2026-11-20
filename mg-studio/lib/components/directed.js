'use strict';
const { escHtml } = require('../escape');
const { icons, getIcon, validateLocalImage, validateLocalVideo } = require('../director-assets');
const { isStoredMedia } = require('../project-assets');

const ACTIONS = ['reveal', 'slide', 'punch', 'draw', 'drift', 'turn', 'grow', 'hold'];
const KINDS = ['text', 'icon', 'image', 'video', 'line', 'ring', 'panel', 'chart'];
const TRANSITIONS = ['cut', 'wipe', 'push', 'fade', 'match'];
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
  if (props.object != null && (typeof props.object !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/i.test(props.object))) return false;
  if (props.track != null && (!Array.isArray(props.track) || props.track.length < 2 || props.track.length > 12 ||
      props.track.some((p, i) => !p || !inRange(p.t, 0, 1) || (i > 0 && p.t <= props.track[i - 1].t)
        || !inRange(p.x, 3, 94 - props.w) || !inRange(p.y, 3, 84 - props.h)
        || !inRange(p.scale ?? 1, .3, 2.2) || !inRange(p.rotation ?? 0, -180, 180)))) return false;
  if (props.kind === 'text') return typeof props.content === 'string' && props.content.length > 0 && props.content.length <= 100
    && inRange(props.size, 32, 140) && ['left', 'center'].includes(props.align);
  if (props.kind === 'icon') return Object.hasOwn(icons, props.asset);
  if (props.kind === 'image') return (isStoredMedia(props.media) && props.media.kind === 'image') || validateLocalImage(props.media);
  if (props.kind === 'video') return (isStoredMedia(props.media) && props.media.kind === 'video') || validateLocalVideo(props.media);
  if (props.kind === 'chart') return Array.isArray(props.series) && props.series.length >= 2 && props.series.length <= 6 &&
    props.series.every(item => item && typeof item.label === 'string' && item.label.trim().length > 0 &&
      item.label.length <= 12 && inRange(item.value, 0, 1e9));
  return true;
}

function layerPose(props, t) {
  const points = props.track;
  if (!points) return { x: props.x, y: props.y, w: props.w, h: props.h, scale: 1, rotation: 0 };
  const upper = points.findIndex(point => point.t >= t);
  const from = upper < 0 ? points.at(-1) : points[Math.max(0, upper - 1)];
  const to = upper < 0 ? from : points[upper];
  const p = from === to ? 0 : seg(t, from.t, to.t);
  const lerp = (a, b) => a + (b - a) * p;
  return { x: lerp(from.x, to.x), y: lerp(from.y, to.y), w: props.w, h: props.h,
    scale: lerp(from.scale ?? 1, to.scale ?? 1), rotation: lerp(from.rotation ?? 0, to.rotation ?? 0) };
}

function updateDirected(state, time, duration, previous, globalTime) {
  const sc = state.r;
  const t = Math.max(0, Math.min(1, time / duration));
  if (state.stage) updateWorld(W[state.stage.id], state.stage, t, globalTime);
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
    const from = state.transition === 'match' && props.object
      ? previous?.els.find(layer => layer.props?.object === props.object && layer.props.kind === props.kind &&
        layer.props.asset === props.asset && (layer.props.media?.file || layer.props.media?.data) === (props.media?.file || props.media?.data))
      : null;
    if (props.track || from) {
      const pose = layerPose(props, t);
      if (from) {
        const origin = layerPose(from.props, previous.endPhase);
        const mix = eo(seg(time, 0, .56));
        for (const key of ['x', 'y', 'w', 'h', 'scale', 'rotation']) pose[key] = origin[key] + (pose[key] - origin[key]) * mix;
      }
      e.style.left = pose.x * 19.2 + 'px';
      e.style.top = pose.y * 10.8 + 'px';
      e.style.width = pose.w * 19.2 + 'px';
      e.style.height = pose.h * 10.8 + 'px';
      transform = 'rotate(' + pose.rotation + 'deg) scale(' + pose.scale + ')';
    }
    const strokes = state.strokes.get(e);
    if (strokes) {
      for (const [stroke, length] of strokes) stroke.style.strokeDashoffset = length * (1 - p);
      clip = 'none';
    }
    e.style.transform = transform;
    e.style.clipPath = clip;
    e.style.opacity = from ? 1 : t < props.at ? 0 : Math.min(1, raw * 5 + (props.action === 'hold' ? 1 : 0));
    if (from) e.style.clipPath = 'none';
    if (props.kind === 'chart') {
      e.querySelectorAll('.dir-column i').forEach((bar, i) => {
        bar.style.transform = 'scaleY(' + eo(seg(raw, i * .12, Math.min(1, i * .12 + .4))) + ')';
      });
    }
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
  if (props.kind === 'image') return '<img alt="" src="' + escHtml(props.media.file || props.media.data) + '">';
  if (props.kind === 'video') return '<video preload="auto" muted playsinline src="' + escHtml(props.media.file || props.media.data) + '"></video>';
  if (props.kind === 'chart') {
    const max = Math.max(1, ...props.series.map(item => item.value));
    return props.series.map(item => '<div class="dir-column"><strong>' + escHtml(item.value) +
      '</strong><div><i style="height:' + item.value / max * 100 + '%"></i></div><span>' + escHtml(item.label) + '</span></div>').join('');
  }
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
.dir-layer.dir-chart { align-items:stretch; gap:30px; color:var(--ink); }
.dir-column { flex:1; display:grid; grid-template-rows:auto 1fr auto; gap:10px; text-align:center; font-size:34px; }
.dir-column > div { position:relative; min-height:0; border-bottom:2px solid var(--muted); }
.dir-column i { position:absolute; left:15%; right:15%; bottom:0; background:var(--accent); transform-origin:bottom; border-radius:14px 14px 0 0; }
.dir-column:nth-child(even) i { background:var(--accent2); }
`,
  check: el => el.type === 'layer' && validateLayer(el.props) ? [] : ['镜头图层的内容、位置或动作无效'],
  runtime: () => layerPose.toString() + '\n' + updateDirected.toString(),
  build: sc => {
    const { segment, stage } = sc;
    const content = sc.elements.map(el => {
      const p = el.props;
      const { x, y, w, h } = rect(p);
      const object = p.object ? ' data-object="' + escHtml(p.object) + '"' : '';
      return `<div class="dir-layer dir-${p.kind} dir-${p.align === 'left' ? 'left' : 'center'}"${object} style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;color:var(--${p.color});font-size:${p.kind === 'text' ? p.size : 48}px">${markup(p)}</div>`;
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
      S['${sc.id}']={r,els,strokes,endPhase:${segment ? (segment.from + segment.frames) / segment.total : 1},transition:${JSON.stringify(TRANSITIONS.includes(sc.transition) ? sc.transition : 'cut')},stage:${JSON.stringify(stage || null).replace(/</g, '\\u003c')}}; }`;
  },
  extraUpdate: sc => sc.segment
    ? `return updateDirected(s, (${sc.segment.from} + lt / dur * ${sc.segment.frames}) / TL.fps, ${sc.segment.total} / TL.fps, previous, t);`
    : 'return updateDirected(s, lt, dur, previous, t);',
  boxes: sc => sc.elements.map(el => ({
    id: el.id, ...rect(el.props),
    blocks: el.props.kind === 'text' ? [{ text: el.props.content, colorKey: el.props.color }] : []
  }))
};

module.exports.ACTIONS = ACTIONS;
module.exports.KINDS = KINDS;
module.exports.TRANSITIONS = TRANSITIONS;
module.exports.validateLayer = validateLayer;

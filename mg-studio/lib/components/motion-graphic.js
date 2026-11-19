'use strict';
const { escHtml } = require('../escape');

const KINDS = ['opening', 'chain', 'comparison', 'metric', 'statement', 'recap'];

// Browser function only uses the frame being rendered. Seeking backwards and
// rendering a single frame through the CLI produce the same composition.
function animateMotionGraphic(state, localTime, duration) {
  const { art, copy, canvas, ctx, props, labels, metric, fragments, colors } = state;
  const { accent, accent2, ink } = colors;
  const width = canvas.width, height = canvas.height;
  const x = width / 2, y = height / 2;
  const focus = props.mode === 'focus';
  const cut = Math.min(0.65, duration * 0.18);
  const intro = eo(seg(localTime, 0.1, cut));
  const leaving = eo(seg(localTime, duration - 0.30, duration));
  const progress = seg(localTime, cut, Math.max(cut + 0.1, duration * 0.84));
  const drift = (1 - intro) * (focus ? 78 : 42) - leaving * 32;
  copy.style.clipPath = focus
    ? 'inset(0 0 ' + ((1 - intro) * 100) + '% 0)'
    : 'inset(0 ' + ((1 - intro) * 100) + '% 0 0)';
  copy.style.transform = focus ? 'translateY(' + drift + 'px)' : 'translateX(' + -drift + 'px)';
  art.style.opacity = intro * (1 - leaving);
  art.style.transform = focus ? 'scale(' + (0.95 + intro * 0.05 - leaving * 0.02) + ')'
    : 'translateX(' + ((1 - intro) * 62 - leaving * 22) + 'px)';
  fragments.forEach((fragment, i) => {
    const amount = eo(seg(progress, i / fragments.length, (i + 0.42) / fragments.length));
    fragment.style.backgroundSize = (100 * amount) + '% 3px';
  });
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  function line(ax, ay, bx, by, color, weight, opacity) {
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  function arc(cx, cy, radius, from, to, color, weight, opacity) {
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, from, to);
    ctx.stroke();
  }
  function dot(cx, cy, radius, color, opacity) {
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  function halo(cx, cy, radius, color, opacity) {
    const extent = Math.min(radius, cx, cy, width - cx, height - cy);
    if (extent <= 0 || opacity <= 0) return;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, extent);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    ctx.globalAlpha = opacity;
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - extent, cy - extent, extent * 2, extent * 2);
  }

  if (props.kind === 'chain') {
    const startX = focus ? width * 0.10 : 98;
    const endX = focus ? width * 0.90 : startX;
    const startY = focus ? height * 0.41 : height * 0.15;
    const endY = focus ? startY : height * 0.85;
    const traced = seg(localTime, cut, duration * 0.66);
    const headX = startX + (endX - startX) * traced, headY = startY + (endY - startY) * traced;
    halo(headX + (focus ? 0 : 90), headY, focus ? 190 : 235, accent, 0.22);
    line(startX, startY, endX, endY, ink, 5, 0.18);
    line(startX, startY, headX, headY, accent, 9, 0.95);
    labels.forEach((label, i) => {
      const at = i / (labels.length - 1);
      const positionX = startX + (endX - startX) * at;
      const positionY = startY + (endY - startY) * at;
      const reached = localTime - (cut + at * (duration * 0.66 - cut));
      const appear = eo(seg(reached, 0, 0.42));
      dot(positionX, positionY, 14, ink, 0.28);
      dot(positionX, positionY, 17 * appear, accent2, appear);
      arc(positionX, positionY, 26, 0, Math.PI * 2, accent, 2, appear * 0.45);
      const ripple = seg(reached, 0, 1.18);
      arc(positionX, positionY, 23 + ripple * 36, 0, Math.PI * 2, accent2, 3, appear * (1 - ripple));
      label.style.opacity = appear;
      label.style.transform = focus ? 'translate(-50%,' + ((1 - appear) * 24) + 'px)'
        : 'translate(' + ((1 - appear) * 24) + 'px,-50%)';
    });
    if (traced > 0 && traced < 1) {
      dot(headX, headY, 10, accent2, 1);
    }
  } else if (props.kind === 'comparison') {
    labels.forEach((label, i) => {
      const left = focus ? width * (0.12 + i * 0.43) : 76;
      const right = left + (focus ? width * 0.32 : width - 152);
      const center = height * (focus ? 0.42 : 0.29 + i * 0.52);
      const amount = eo(seg(localTime, cut + i * duration * 0.17, cut + i * duration * 0.17 + 0.82));
      const color = i ? accent2 : accent;
      halo(left + (right - left) * amount, center, 158, color, 0.20 * amount);
      line(left, center, right, center, ink, 2, 0.20);
      line(left, center, left + (right - left) * amount, center, color, 7, 0.91);
      dot(left + (right - left) * amount, center, 9, color, amount);
      label.style.opacity = amount;
      label.style.transform = 'translateY(' + ((1 - amount) * 28) + 'px)';
    });
  } else if (props.kind === 'metric') {
    const reveal = eo(seg(localTime, cut * 0.66, duration * 0.32));
    metric.style.clipPath = 'inset(' + (100 * (1 - reveal)) + '% 0 0 0)';
    metric.style.transform = 'translateY(' + ((1 - reveal) * 40) + 'px)';
    const baseAngle = -Math.PI / 2;
    const radius = focus ? 168 : 242;
    const sweep = 2 * Math.PI * (0.12 + 0.80 * progress);
    halo(x, y, radius * 1.17, accent, 0.21);
    arc(x, y, radius - 24, 0, Math.PI * 2, accent, 2, 0.32);
    arc(x, y, radius, 0, Math.PI * 2, ink, 3, 0.20);
    arc(x, y, radius, baseAngle, baseAngle + sweep, accent, 10, 0.83);
    for (let i = 0; i < 40; i++) {
      const angle = i * Math.PI / 20;
      const length = i % 5 === 0 ? 20 : 8;
      line(x + Math.cos(angle) * (radius + 12), y + Math.sin(angle) * (radius + 12),
           x + Math.cos(angle) * (radius + 12 + length), y + Math.sin(angle) * (radius + 12 + length), ink, 2, 0.33);
    }
    dot(x + Math.cos(baseAngle + sweep) * radius, y + Math.sin(baseAngle + sweep) * radius, 11, accent2, 1);
    if (focus) {
      line(x - 650, y, x - radius - 51, y, accent, 2, 0.4);
      line(x + radius + 51, y, x + 650, y, accent, 2, 0.4);
    }
  } else {
    // Editorial marks for text and recaps, with a separate opening motif.
    const opening = props.kind === 'opening';
    const recap = props.kind === 'recap';
    const span = Math.min(x * 0.77, focus ? 546 : 295);
    const rise = (1 - eo(progress)) * 61;
    if (opening) {
      const radius = Math.min(x, y) * 0.81;
      const angle = localTime * (focus ? 0.62 : 0.38);
      halo(x, y, radius * 1.23, accent, 0.24);
      arc(x, y, radius, 0, Math.PI * 2, ink, 2, 0.21);
      arc(x, y, radius * 0.77, 0, Math.PI * 2, accent, 2, 0.34);
      arc(x, y, radius, angle, angle + Math.PI * (0.45 + progress), accent, 8, 0.9);
      arc(x, y, radius * 0.77, -angle, -angle + Math.PI * 0.72, accent2, 4, 0.74);
      dot(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 10, accent2, 1);
      line(x - span, y, x + span, y, ink, 2, 0.24);
      line(x, y - radius, x, y + radius, ink, 2, 0.24);
    } else {
      const height = recap ? 71 : (focus ? 118 : 153);
      const shift = focus ? span * progress : 65 * progress;
      halo(x - span + 2 * span * progress, y, focus ? 225 : 175, accent, 0.15);
      for (const side of [-1, 1]) {
        const edge = x + side * span;
        const level = y + side * rise;
        line(edge, level - height, edge, level + height, ink, 3, 0.32);
        line(edge, level - height, edge - side * (40 + shift * 0.35), level - height, accent, 8, 0.86);
        line(edge, level + height, edge - side * (40 + shift * 0.35), level + height, accent2, 8, 0.76);
      }
      line(x - span + 38, y, x - span + 38 + (2 * span - 76) * progress, y, accent, 4, 0.78);
      dot(x - span + 38 + (2 * span - 76) * progress, y, recap ? 13 : 9, accent2, 1);
    }
  }
  ctx.globalAlpha = 1;
}

module.exports = {
  name: 'motion-graphic',
  css: () => `
.mg-composition { position:absolute; inset:0; }
.mg-copy { position:absolute; left:142px; top:116px; width:800px; height:715px; display:flex;
  flex-direction:column; justify-content:center; gap:32px; color:var(--ink); overflow-wrap:anywhere; }
.mg-copy h1 { font-size:108px; line-height:1.08; font-weight:750; letter-spacing:.025em; }
.mg-copy p { font-size:58px; line-height:1.34; font-weight:630; }
.mg-copy h1, .mg-copy p { text-wrap:balance; }
.mg-chain .mg-copy:has(h1) p { color:var(--muted); font-size:42px; font-weight:560; }
.mg-composition:not(.mg-opening) .mg-copy h1 { font-size:72px; }
.mg-fragment { background:linear-gradient(var(--accent2),var(--accent2)) no-repeat left bottom / 0 3px; }
.mg-opening .mg-copy p { color:var(--muted); font-size:43px; }
.mg-opening .mg-copy h1 { width:100%; }
.mg-art { position:absolute; left:969px; top:141px; width:800px; height:640px; }
.mg-art canvas { position:absolute; inset:0; }
.mg-node { position:absolute; left:157px; max-width:590px; font-size:48px; font-weight:690;
  line-height:1.16; color:var(--ink); opacity:0; }
.mg-metric-value { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  flex-direction:column; color:var(--ink); text-align:center; line-height:1; }
.mg-metric-value strong { font-size:172px; font-weight:750; font-variant-numeric:tabular-nums; }
.mg-metric-value small { font-size:42px; color:var(--muted); margin-top:18px; }
.mg-focus .mg-copy { left:155px; top:94px; width:1610px; height:275px; text-align:center; gap:12px; }
.mg-focus .mg-copy h1 { font-size:96px; }
.mg-focus .mg-copy p { font-size:54px; }
.mg-focus.mg-composition:not(.mg-opening) .mg-copy h1 { font-size:64px; }
.mg-focus.mg-opening .mg-copy p { font-size:41px; }
.mg-focus .mg-art { left:160px; top:402px; width:1600px; height:420px; }
.mg-focus .mg-node { width:286px; top:54%; max-width:none; font-size:40px; text-align:center; }
.mg-comparison .mg-node { width:650px; left:76px; font-size:46px; }
.mg-focus.mg-comparison .mg-node { width:32%; top:53%; text-align:left; }
.mg-focus .mg-metric-value strong { font-size:142px; }
.mg-focus .mg-metric-value small { font-size:35px; }
.mg-metric-value.mg-long-number strong { font-size:104px; }
.mg-composition.mg-compact .mg-copy h1 { font-size:76px; }
`,
  check: ({ type, props }) => {
    const { mode, kind, nodes, number, unit, title, desc } = props;
    return type === 'graphic' && ['flow', 'focus'].includes(mode) && KINDS.includes(kind)
      && typeof title === 'string' && typeof desc === 'string' && typeof number === 'string' && typeof unit === 'string'
      && Array.isArray(nodes) && nodes.length <= 4 && nodes.every(n => typeof n === 'string')
      && (kind !== 'chain' || nodes.length >= 2) && (kind !== 'comparison' || nodes.length === 2)
      ? [] : ['motion-graphic 构图参数无效'];
  },
  build: scene => {
    const { id, elements: [{ props }] } = scene;
    const focus = props.mode === 'focus';
    const nodeLabels = props.nodes.map((node, i) => {
      const at = i / (props.nodes.length - 1);
      const position = props.kind === 'comparison'
        ? (focus ? 'left:' + (12 + 43 * i) + '%' : 'top:' + (35 + 52 * i) + '%')
        : (focus ? 'left:' + (10 + 80 * at) + '%' : 'top:' + (15 + 70 * at) + '%');
      return '<div class="mg-node" style="' + position + '">' + escHtml(node) + '</div>';
    }).join('');
    const metric = props.kind === 'metric'
      ? '<div class="mg-metric-value' + (props.number.length > 3 ? ' mg-long-number' : '') + '"><strong>' +
        escHtml(props.number) + '</strong><small>' + escHtml(props.unit) + '</small></div>' : '';
    const fragments = props.desc.split(/(?<=[，；。])/).filter(Boolean);
    const paragraph = props.kind === 'statement' && fragments.length > 1
      ? fragments.map(fragment => '<span class="mg-fragment">' + escHtml(fragment) + '</span>').join('')
      : escHtml(props.desc);
    const copy = (props.title ? '<h1>' + escHtml(props.title) + '</h1>' : '') + (props.desc ? '<p>' + paragraph + '</p>' : '');
    const content = '<section class="mg-composition mg-' + props.mode + ' mg-' + props.kind +
      (props.title.length > 19 ? ' mg-compact' : '') + '"><div class="mg-copy">' + copy + '</div><div class="mg-art">' +
      '<canvas width="' + (focus ? 1600 : 800) + '" height="' + (focus ? 420 : 640) + '"></canvas>' +
      nodeLabels + metric + '</div></section>';
    return `{ const r = H('div','scene',${JSON.stringify(content).replace(/</g, '\\u003c')}); r.id = 's-${id}';
      const copy = r.querySelector('.mg-copy'), art = r.querySelector('.mg-art'), canvas = art.querySelector('canvas');
      const palette = getComputedStyle(document.documentElement);
      const colors = Object.fromEntries(['ink', 'accent', 'accent2'].map(key => [key, palette.getPropertyValue('--' + key).trim()]));
      S['${id}'] = { r, els: [{key:'graphic', e:copy}], copy, art, canvas, ctx:canvas.getContext('2d'), colors,
        props:SPECS['${id}'].graphic.props, labels:[...art.querySelectorAll('.mg-node')], metric:art.querySelector('.mg-metric-value'),
        fragments:[...copy.querySelectorAll('.mg-fragment')] };
      scenesEl.append(r); }`;
  },
  runtime: () => animateMotionGraphic.toString(),
  extraUpdate: () => 'animateMotionGraphic(s, lt, dur);',
  boxes: ({ elements: [{ props }] }) => [{
    id: 'graphic', x: 142, y: 116, w: 800, h: 715,
    blocks: [props.title, props.desc].filter(Boolean).map(text => ({ text, colorKey: 'ink' }))
  }]
};

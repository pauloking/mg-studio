'use strict';
const ENTER_PRESETS = ['rise', 'fade', 'scale', 'popLeft', 'grow'];
const EMPHASIS_PRESETS = ['pulse', 'highlight'];
const EXIT_PRESETS = ['fadeOut', 'sink'];
const EASINGS = ['ease', 'spring', 'overshoot', 'easeInOut'];
const PRESET_DEFAULT_DUR = { rise: .6, fade: .5, scale: .6, popLeft: .6, grow: .7, pulse: .5, highlight: .6, fadeOut: .4, sink: .4 };

const PRE_RUNTIME = `
const _clamp01 = v => Math.max(0, Math.min(1, v));
const _overshoot = p => { const s = 1.70158; p = _clamp01(p) - 1; return p * p * ((s + 1) * p + s) + 1; };
const PRE = {
  rise: p => ({ op: p, ty: (1 - p) * 48 }),
  fade: p => ({ op: p }),
  scale: p => ({ op: p, sc: 0.9 + 0.1 * p }),
  popLeft: p => ({ op: p, tx: (1 - p) * -40 }),
  grow: p => ({ op: p, sx: p }),
  pulse: p => ({ sc: 1 + 0.06 * Math.sin(p * Math.PI) }),
  highlight: p => ({ br: 1 + 0.35 * Math.sin(p * Math.PI) }),
  fadeOut: p => ({ op: 1 - p }),
  sink: p => ({ op: 1 - p, ty: p * 30 })
};
globalThis.PRE = PRE;
function chan(...cs) {
  const r = { op: 1, tx: 0, ty: 0, sc: 1, sx: 1, br: 1 };
  for (const c of cs) {
    if (c.op != null) r.op *= c.op;
    if (c.tx) r.tx += c.tx; if (c.ty) r.ty += c.ty;
    if (c.sc != null) r.sc *= c.sc; if (c.sx != null) r.sx *= c.sx;
    if (c.br != null) r.br *= c.br;
  }
  return r;
}
function put(e, c) {
  e.style.opacity = Math.max(0, Math.min(1, c.op));
  const moved = c.tx || c.ty || c.sc !== 1 || c.sx !== 1;
  e.style.transform = moved ? 'translate(' + c.tx + 'px,' + c.ty + 'px) scale(' + (c.sc * c.sx) + ',' + c.sc + ')' : 'none';
  e.style.filter = c.br !== 1 ? 'brightness(' + c.br + ')' : 'none';
}
function cueLt(c, sc) {
  if (c.startsWith('lt:')) return parseFloat(c.slice(3));
  const r = parseFloat(c.slice(10));
  const ad = sc.audioDur != null ? sc.audioDur : sc.dur;
  return Math.round(((sc.audioStart - sc.start / TL.fps) + r * ad) * 1e9) / 1e9;
}
function upEl(e, sp, lt, dur, sc) {
  const easing = sp.enter?.easing;
  const easeFn = easing === 'spring' || easing === 'overshoot'
    ? (typeof overshoot === 'function' ? overshoot : _overshoot)
    : easing === 'easeInOut' ? p => p * p * (3 - 2 * p) : eo;
  const en = sp.enter ? PRE[sp.enter.preset](easeFn(seg(lt, sp.enter.at, sp.enter.at + sp.enter.dur))) : {};
  const ex = sp.exit ? PRE[sp.exit.preset](seg(lt, dur - sp.exit.dur, dur)) : {};
  let em = {};
  for (const c of sp.emphasis || []) { const ct = cueLt(c.cue, sc); em = chan(em, PRE[c.preset](seg(lt, ct, ct + c.dur))); }
  put(e, chan(en, em, ex));
  if (sp.type === 'stat' && e.__num) {
    const at = sp.enter ? sp.enter.at : 0, d = sp.enter ? sp.enter.dur : 1;
    e.__num.textContent = (sp.props.value * eo(seg(lt, at, at + d))).toFixed(sp.props.decimals || 0);
  }
}
`;
module.exports = { ENTER_PRESETS, EMPHASIS_PRESETS, EXIT_PRESETS, EASINGS, PRESET_DEFAULT_DUR, PRE_RUNTIME };

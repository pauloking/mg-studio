'use strict';
function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lum(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
function estDur(sc) { return Math.max(sc.minSec || 0, (sc.narration || '').length / 4.5 + 1.1); }

function lintMotion({ scenes, tokens, components }) {
  const out = [];
  for (const sc of scenes) {
    const comp = components[sc.layout];
    const boxes = comp.boxes(sc);
    const dur = estDur(sc);
    for (const b of boxes) {
      const bottom = b.y + b.h;
      if (bottom > 940) out.push({ level: 'B', code: 'SUBTITLE_ZONE', scene: sc.id, el: b.id, msg: `盒底 ${bottom} > 940（字幕区）` });
      else if (bottom > 900) out.push({ level: 'W', code: 'NEAR_SUBTITLE', scene: sc.id, el: b.id, msg: `盒底 ${bottom} > 900，接近字幕区` });
      if (b.text) {
        const el = sc.elements.find(e => e.id === b.id);
        const at = el && el.enter ? el.enter.at : 0;
        const ex = el && el.exit ? el.exit.dur : 0;
        const dwell = dur - at - ex;
        const need = Math.max(b.text.length * 0.28, 1.2);
        if (dwell < need) out.push({ level: 'B', code: 'TEXT_DWELL', scene: sc.id, el: b.id, msg: `停留 ${dwell.toFixed(2)}s < 需要 ${need.toFixed(2)}s（${b.text.length} 字）` });
        const fg = tokens.colors[b.colorKey || 'ink'];
        const cr = contrastRatio(fg, tokens.colors.bg);
        if (cr < 4.5) out.push({ level: 'B', code: 'CONTRAST', scene: sc.id, el: b.id, msg: `对比度 ${cr.toFixed(2)} < 4.5（${b.colorKey || 'ink'} on bg）` });
      }
    }
    const movers = sc.elements.filter(e => e.enter);
    let peak = 0;
    for (let t = 0; t < dur; t += 0.1) {
      const c = movers.filter(e => t >= e.enter.at && t <= e.enter.at + e.enter.dur).length;
      if (c > peak) peak = c;
    }
    if (peak > 6) out.push({ level: 'W', code: 'DENSITY', scene: sc.id, msg: `同屏运动峰值 ${peak} > 6` });
  }
  return out;
}
module.exports = { lintMotion, contrastRatio, estDur };

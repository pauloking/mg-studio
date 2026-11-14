'use strict';
const { contrastRatio } = require('./color');

// 朗读/阅读语速：4.5 字/秒（设计文档 §7 的初始值）。可用 lintMotion({charsPerSec}) 覆盖。
const CHARS_PER_SEC = 4.5;
// 编译期无音频时的场景时长估算；有 timeline 时一律用实测时长覆盖。
function estDur(sc) { return Math.max(sc.minSec || 0, (sc.narration || '').length / CHARS_PER_SEC + 1.1); }

// 组件盒的文本块：新格式 {blocks:[{text,colorKey,bg}]}，兼容旧格式 {text,colorKey}
function blocksOf(box) {
  if (Array.isArray(box.blocks)) return box.blocks.filter(b => b && typeof b.text === 'string' && b.text.length);
  return box.text ? [{ text: box.text, colorKey: box.colorKey }] : [];
}

/**
 * 动效 lint。
 * @param measured  {sceneId: {elId: {x,y,w,h}}}  真实 DOM 测得的盒（缺省用组件估算盒）
 * @param durations {sceneId: seconds}            实测场景时长（缺省用 estDur 估算）
 */
function lintMotion({ scenes, tokens, components, measured, durations, charsPerSec = CHARS_PER_SEC }) {
  const out = [];
  for (const sc of scenes) {
    const comp = components[sc.layout];
    const estBoxes = comp.boxes(sc, tokens);
    const dur = (durations && Number.isFinite(durations[sc.id])) ? durations[sc.id] : estDur(sc);
    const m = measured && measured[sc.id];
    for (const est of estBoxes) {
      const hit = m && m[est.id];
      const b = hit ? Object.assign({}, est, { x: hit.x, y: hit.y, w: hit.w, h: hit.h, measured: true }) : est;
      const where = b.measured ? '实测' : '估算';
      const bottom = b.y + b.h;
      if (b.x < 0 || b.y < 0 || b.x + b.w > 1920 || b.y + b.h > 1080)
        out.push({ level: 'B', code: 'SCREEN_BOUNDS', scene: sc.id, el: b.id, msg: `${where}盒 (${b.x},${b.y},${b.w},${b.h}) 超出 1920×1080 画布` });
      if (bottom > 940) out.push({ level: 'B', code: 'SUBTITLE_ZONE', scene: sc.id, el: b.id, msg: `${where}盒底 ${bottom} > 940（字幕区）` });
      else if (bottom > 900) out.push({ level: 'W', code: 'NEAR_SUBTITLE', scene: sc.id, el: b.id, msg: `${where}盒底 ${bottom} > 900，接近字幕区` });

      const el = sc.elements.find(e => e.id === b.id);
      const at = el && el.enter ? el.enter.at : 0;
      const ex = el && el.exit ? el.exit.dur : 0;
      const dwell = dur - at - ex;
      // 每个文本块独立计停留时长（标题与正文不合并），语速按 charsPerSec
      for (const blk of blocksOf(b)) {
        const need = Math.max(blk.text.length / charsPerSec, 1.2);
        if (dwell < need)
          out.push({ level: 'B', code: 'TEXT_DWELL', scene: sc.id, el: b.id, msg: `「${blk.text.slice(0, 10)}${blk.text.length > 10 ? '…' : ''}」停留 ${dwell.toFixed(2)}s < 需要 ${need.toFixed(2)}s（${blk.text.length} 字 @${charsPerSec} 字/秒）` });
        const fgKey = blk.colorKey || 'ink';
        const fg = tokens.colors[fgKey];
        const bg = blk.bg || tokens.colors.bg;
        const cr = contrastRatio(fg, bg);
        if (cr < 4.5) out.push({ level: 'B', code: 'CONTRAST', scene: sc.id, el: b.id, msg: `对比度 ${cr.toFixed(2)} < 4.5（${fgKey} ${fg} on ${bg}）` });
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
module.exports = { lintMotion, contrastRatio, estDur, blocksOf, CHARS_PER_SEC };

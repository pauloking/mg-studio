'use strict';
const J = JSON.stringify;
/* schematic 组件（Topic-Visual P2）：按 visualBrief 参数化绘制 2D 示意，帧号驱动、确定性。
 * 视觉语言与 motion-graphic 同源：光晕/弧/涟漪/描迹/连续旋转 + stagger 入场 + 持续环境动效。
 * type=anatomy: 圆角三腔剖面（view=mirror 右室在左）+ 有径导线旋入 + 螺旋尖 + 夺获脉冲；
 * type=diagram: 编号卡片流程 + 描迹箭头 + 连接脉冲；type=comparison: 双栏 + 旋转 VS 环。 */
function drawSchematic(ctx, w, h, lt, t, dur, props, colors) {
  const C = colors || { ink: '#e8ecf6', accent: '#4f8cff', accent2: '#39d0c3', muted: '#8a94b8' };
  const rgba = (hex, a) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 'rgba(232,236,246,' + a + ')';
    const n = parseInt(m[1], 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  const FONT = '"PingFang SC","Noto Sans SC",system-ui,sans-serif';
  const fs = h * 0.075;
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.textBaseline = 'middle';
  function rr(x, y, ww, hh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  }
  function halo(cx, cy, radius, color, opacity) {
    const extent = Math.min(radius, cx, cy, w - cx, h - cy);
    if (extent <= 0 || opacity <= 0) return;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, extent);
    g.addColorStop(0, color); g.addColorStop(1, 'transparent');
    ctx.globalAlpha = opacity; ctx.fillStyle = g;
    ctx.fillRect(cx - extent, cy - extent, extent * 2, extent * 2);
  }
  function dot(cx, cy, r, color, opacity) {
    ctx.globalAlpha = opacity; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  function arc(cx, cy, r, from, to, color, weight, opacity) {
    ctx.globalAlpha = opacity; ctx.strokeStyle = color; ctx.lineWidth = weight;
    ctx.beginPath(); ctx.arc(cx, cy, r, from, to); ctx.stroke();
  }
  function line(ax, ay, bx, by, color, weight, opacity) {
    ctx.globalAlpha = opacity; ctx.strokeStyle = color; ctx.lineWidth = weight;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  const structures = props.structures || [];
  const has = s => structures.includes(s);
  const type = props.type;

  if (type === 'anatomy') {
    const mirror = props.view === 'mirror';
    const L = has('左室') ? '左室' : (has('左房') ? '左房' : '左心');
    const R = has('右室') ? '右室' : (has('右房') ? '右房' : '右心');
    const SEPTUM = '#9a7b5f';
    const regions = mirror
      ? [[R, C.accent2, '右心腔'], ['室间隔', SEPTUM, '肌性间隔'], [L, C.accent, '左心腔']]
      : [[L, C.accent, '左心腔'], ['室间隔', SEPTUM, '肌性间隔'], [R, C.accent2, '右心腔']];
    const gap = w * 0.018, pw = (w - 2 * gap) / 3, ph = h * 0.78, py = h * 0.10;
    // 环境：间隔后光晕呼吸 + 横向扫光
    halo(w / 2 + Math.sin(t * 0.45) * w * 0.012, py + ph * 0.5, h * 0.55, rgba(C.accent2, 1), 0.10 + 0.04 * Math.sin(t * 1.1));
    const sweepX = ((t * 0.10) % 1.3 - 0.15) * w;
    const sg = ctx.createLinearGradient(sweepX, 0, sweepX + w * 0.12, 0);
    sg.addColorStop(0, 'transparent'); sg.addColorStop(0.5, rgba('#ffffff', 0.05)); sg.addColorStop(1, 'transparent');
    ctx.globalAlpha = 1; ctx.fillStyle = sg; ctx.fillRect(sweepX, py, w * 0.12, ph);
    regions.forEach((r, i) => {
      const a = eo(seg(lt, 0.15 + i * 0.20, 0.80 + i * 0.20));
      if (a <= 0) return;
      const x = i * (pw + gap), dy = (1 - a) * 46;
      ctx.save(); ctx.translate(0, dy); ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, py, 0, py + ph);
      g.addColorStop(0, rgba(r[1], 0.30)); g.addColorStop(1, rgba(r[1], 0.08));
      rr(x, py, pw, ph, 26); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = rgba(C.ink, 0.16); ctx.lineWidth = 1.5; ctx.stroke();
      if (i === 1) {
        // 间隔肌纤维纹理
        ctx.save(); rr(x, py, pw, ph, 26); ctx.clip();
        ctx.strokeStyle = rgba(C.ink, 0.06); ctx.lineWidth = 2;
        for (let fx = x - ph; fx < x + pw; fx += 22) {
          ctx.beginPath(); ctx.moveTo(fx, py + ph); ctx.lineTo(fx + ph * 0.35, py); ctx.stroke();
        }
        ctx.restore();
        // 左室内膜缘（镜像在右缘）
        const ex = mirror ? x + pw : x;
        line(ex, py + 14, ex, py + ph - 14, C.accent2, 4, 0.55 * a);
      }
      ctx.fillStyle = rgba(C.muted, 0.85); ctx.font = '600 ' + (fs * 0.42) + 'px ' + FONT; ctx.textAlign = 'left';
      ctx.fillText('0' + (i + 1), x + 26, py + 34);
      ctx.fillStyle = rgba(C.ink, 0.96); ctx.font = '700 ' + fs + 'px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText(r[0], x + pw / 2, py + ph * 0.20);
      ctx.fillStyle = rgba(C.muted, 0.8); ctx.font = '500 ' + (fs * 0.42) + 'px ' + FONT;
      ctx.fillText(r[2], x + pw / 2, py + ph * 0.30);
      ctx.restore();
    });
    if (has('导线') || has('电极')) {
      const septumLeft = pw + gap, septumRight = 2 * (pw + gap);
      const entryX = mirror ? w * 0.03 : w * 0.97;
      const entryEdge = mirror ? septumLeft : septumRight;
      const dir = mirror ? 1 : -1;
      const cy = py + ph * 0.55, travel = pw * 0.5;
      const prog = eo(seg(lt, 1.1, 4.0));
      const tipX = entryEdge + dir * travel * prog;
      const g = ctx.createLinearGradient(entryX, 0, tipX || entryX + 1, 0);
      g.addColorStop(0, rgba(C.ink, 0.85)); g.addColorStop(1, '#f4f7ff');
      ctx.globalAlpha = 0.95; ctx.strokeStyle = g; ctx.lineWidth = h * 0.045;
      ctx.beginPath(); ctx.moveTo(entryX, cy);
      ctx.bezierCurveTo(entryX + (tipX - entryX) * 0.35, cy - h * 0.10, entryX + (tipX - entryX) * 0.75, cy - h * 0.06, tipX, cy);
      ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = h * 0.012;
      ctx.beginPath(); ctx.moveTo(entryX, cy - h * 0.012);
      ctx.bezierCurveTo(entryX + (tipX - entryX) * 0.35, cy - h * 0.112, entryX + (tipX - entryX) * 0.75, cy - h * 0.072, tipX, cy - h * 0.012);
      ctx.stroke();
      // 螺旋尖（同轴线圈）
      if (prog > 0.15) for (let k = 0; k < 3; k++) {
        arc(tipX + dir * k * h * 0.016, cy, h * 0.030 - k * h * 0.006, -0.6 * Math.PI, 0.6 * Math.PI, C.accent2, h * 0.012, 0.9 * prog);
      }
      const arrive = eo(seg(lt, 4.0, 4.6));
      halo(tipX, cy, h * 0.16, rgba(C.accent2, 1), arrive * (0.22 + 0.06 * Math.sin(t * 2.2)));
      const ripple = seg(lt, 4.0, 5.2);
      if (ripple > 0 && ripple < 1) arc(tipX, cy, h * 0.05 + ripple * h * 0.14, 0, Math.PI * 2, C.accent2, 3, (1 - ripple) * 0.5);
      // 深度刻度 + 指示点
      const ty = py + ph + h * 0.05;
      for (let k = 0; k <= 5; k++) line(septumLeft + (septumRight - septumLeft) * k / 5, ty, septumLeft + (septumRight - septumLeft) * k / 5, ty + h * 0.02, C.ink, 2, 0.25);
      dot(entryEdge + dir * travel * prog, ty + h * 0.01, h * 0.012, C.accent2, 0.85);
    }
  } else if (type === 'comparison') {
    const labels = (props.labels || structures).slice(0, 2);
    const cw = w * 0.40, ch = h * 0.52, cy = h * 0.24;
    labels.forEach((label, i) => {
      const a = eo(seg(lt, 0.2 + i * 0.25, 0.9 + i * 0.25));
      if (a <= 0) return;
      const color = i ? C.accent2 : C.accent;
      const x = (i ? w * 0.55 : w * 0.05) + (1 - a) * (i ? 70 : -70);
      const y = cy + Math.sin(t * 0.7 + i * 1.3) * 5;
      halo(x + cw / 2, y + ch / 2, h * 0.4, rgba(color, 1), 0.12 * a);
      ctx.save(); ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, y, 0, y + ch);
      g.addColorStop(0, rgba(color, 0.26)); g.addColorStop(1, rgba(color, 0.08));
      rr(x, y, cw, ch, 26); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = rgba(C.ink, 0.14); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = color; rr(x, y, cw * a, 6, 3); ctx.fill();
      ctx.fillStyle = rgba(C.muted, 0.85); ctx.font = '600 ' + (fs * 0.42) + 'px ' + FONT; ctx.textAlign = 'left';
      ctx.fillText(i ? 'B' : 'A', x + 26, y + 36);
      ctx.fillStyle = rgba(C.ink, 0.96); ctx.font = '700 ' + fs + 'px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText(label, x + cw / 2, y + ch * 0.5);
      ctx.restore();
    });
    const cx = w * 0.5, cyy = cy + ch * 0.5, angle = t * 0.5;
    arc(cx, cyy, h * 0.09, angle, angle + Math.PI * 0.7, C.accent, 4, 0.8);
    arc(cx, cyy, h * 0.09, -angle, -angle + Math.PI * 0.7, C.accent2, 4, 0.8);
    ctx.globalAlpha = 0.7; ctx.fillStyle = C.ink; ctx.font = '700 ' + (fs * 0.5) + 'px ' + FONT; ctx.textAlign = 'center';
    ctx.fillText('VS', cx, cyy);
  } else {
    const nodes = (props.labels || structures).slice(0, 4);
    const n = Math.max(nodes.length, 1);
    const gap = w * 0.035, cw = (w - (n - 1) * gap) / n, ch = h * 0.46, cy = h * 0.27;
    const active = Math.min(n - 1, Math.floor(seg(lt, 0.5, Math.max(0.6, dur * 0.8)) * n));
    halo(w / 2 + Math.sin(t * 0.4) * w * 0.02, cy + ch / 2, h * 0.5, rgba(C.accent, 1), 0.08 + 0.03 * Math.sin(t * 1.2));
    nodes.forEach((label, i) => {
      const x = i * (cw + gap);
      const cx = x + cw / 2;
      if (i === active) halo(cx, cy + ch / 2, h * 0.34, rgba(C.accent, 1), 0.14 + 0.04 * Math.sin(t * 1.4));
      const a = eo(seg(lt, 0.2 + i * 0.30, 0.85 + i * 0.30));
      if (a <= 0) return;
      const rise = (1 - a) * 40, scale = 0.94 + 0.06 * a;
      ctx.save();
      ctx.translate(cx, cy + ch / 2 + rise); ctx.scale(scale, scale); ctx.translate(-cx, -(cy + ch / 2));
      ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, cy, 0, cy + ch);
      g.addColorStop(0, rgba(C.accent, 0.24)); g.addColorStop(1, rgba(C.accent, 0.07));
      rr(x, cy, cw, ch, 22); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = rgba(C.ink, 0.14); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = i === active ? C.accent2 : C.accent; rr(x, cy, cw * a, 6, 3); ctx.fill();
      ctx.fillStyle = rgba(C.muted, 0.85); ctx.font = '600 ' + (fs * 0.40) + 'px ' + FONT; ctx.textAlign = 'left';
      ctx.fillText('0' + (i + 1), x + 24, cy + 34);
      ctx.fillStyle = rgba(C.ink, 0.96); ctx.font = '700 ' + (fs * 0.62) + 'px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText(label, cx, cy + ch * 0.55);
      const under = eo(seg(lt, 0.6 + i * 0.30, 1.2 + i * 0.30));
      ctx.fillStyle = C.accent2; ctx.globalAlpha = a * 0.8;
      rr(cx - cw * 0.25 * under, cy + ch * 0.72, cw * 0.5 * under, 4, 2); ctx.fill();
      ctx.restore();
      if (i < n - 1) {
        const x1 = x + cw, x2 = x + cw + gap, y = cy + ch * 0.5;
        line(x1, y, x2, y, C.ink, 3, 0.18);
        const traced = eo(seg(lt, 0.55 + i * 0.30, 1.15 + i * 0.30));
        line(x1, y, x1 + (x2 - x1) * traced, y, C.accent, 5, 0.9);
        if (traced >= 0.99) {
          line(x2, y, x2 - h * 0.025, y - h * 0.02, C.accent, 5, 0.9);
          line(x2, y, x2 - h * 0.025, y + h * 0.02, C.accent, 5, 0.9);
          const u = ((t * 0.28) + i * 0.37) % 1;
          dot(x1 + (x2 - x1) * u, y, h * 0.012, C.accent2, 0.45);
        }
      }
    });
  }
  ctx.globalAlpha = 1;
}
const SCHEMATIC_RUNTIME = drawSchematic.toString();

module.exports = {
  name: 'schematic',
  css: () => '.schematic-canvas { position:absolute; }',
  runtime: () => SCHEMATIC_RUNTIME,
  build: (sc) => {
    const lines = [`{ const r = H('div','scene'); r.id = 's-${sc.id}';`, '  const els = [];'];
    sc.elements.forEach((el, i) => {
      if (el.type !== 'schematic') throw new Error('schematic 不支持元素类型: ' + el.type);
      const p = el.props, v = `e${i}`;
      lines.push(`  const ${v} = H('canvas','schematic-canvas'); ${v}.width=${J(Number(p.w))}; ${v}.height=${J(Number(p.h))}; ${v}.style.left=${J(p.x + 'px')}; ${v}.style.top=${J(p.y + 'px')}; r.append(${v}); els.push({key:${J(el.id)},e:${v}});`);
    });
    lines.push(`  const palette = getComputedStyle(document.documentElement);`);
    lines.push(`  const colors = Object.fromEntries(['ink','accent','accent2','muted'].map(k => [k, palette.getPropertyValue('--' + k).trim()]));`);
    lines.push(`  S['${sc.id}'] = { r, els, colors }; scenesEl.append(r); }`);
    return lines.join('\n');
  },
  extraUpdate: (sc) => sc.elements.filter(e => e.type === 'schematic').map(el =>
    `{ const el = s.els.find(x => x.key === ${J(el.id)}); const sp = SPECS['${sc.id}'][${J(el.id)}];
  drawSchematic(el.e.getContext('2d'), el.e.width, el.e.height, lt, t, dur, sp.props, s.colors); }`).join('\n'),
  boxes: (sc) => sc.elements.map(el => ({ id: el.id, x: el.props.x, y: el.props.y, w: el.props.w, h: el.props.h })),
  check: (el) => {
    const errs = [];
    if (el.type !== 'schematic') { errs.push(`schematic 不支持元素类型: ${el.type}`); return errs; }
    for (const k of ['x', 'y', 'w', 'h']) if (el.props[k] == null) errs.push(`schematic ${el.id} props.${k} 必填`);
    if (!Array.isArray(el.props.structures)) errs.push(`schematic ${el.id} props.structures 须为数组`);
    if (!['anatomy', 'diagram', 'comparison'].includes(el.props.type)) errs.push(`schematic ${el.id} props.type 须为 anatomy/diagram/comparison`);
    if (el.props.view != null && !['mirror', 'cross'].includes(el.props.view)) errs.push(`schematic ${el.id} props.view 须为 mirror/cross`);
    if (el.props.labels != null && (!Array.isArray(el.props.labels) || el.props.labels.some(t => typeof t !== 'string'))) errs.push(`schematic ${el.id} props.labels 须为字符串数组`);
    return errs;
  }
};

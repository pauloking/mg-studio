'use strict';
const J = JSON.stringify;
/* schematic 组件（Topic-Visual P2）：按 visualBrief 参数化绘制 2D 示意，帧号驱动、确定性。
 * type=anatomy: 横剖面三腔带（view=mirror 时右室在左），含导线/电极时画旋入导线；
 * type=diagram: 节点流程；type=comparison: 双栏。通用、非视频专属。 */
function drawSchematic(ctx, w, h, lt, props) {
  ctx.clearRect(0, 0, w, h);
  const p = eo(seg(lt, 0.2, 1.2));
  ctx.save(); ctx.globalAlpha = p;
  const structures = props.structures || []; const view = props.view; const type = props.type;
  const fs = Math.max(16, Math.round(h * 0.07));
  ctx.font = '600 ' + fs + 'px sans-serif'; ctx.textBaseline = 'middle';
  const has = s => structures.includes(s);
  if (type === 'anatomy') {
    const mirror = view === 'mirror';
    const L = has('左室') ? '左室' : (has('左房') ? '左房' : '左心');
    const R = has('右室') ? '右室' : (has('右房') ? '右房' : '右心');
    const regions = mirror ? [[R, 'rgba(60,120,110,0.25)'], ['室间隔', 'rgba(150,110,80,0.35)'], [L, 'rgba(60,90,150,0.25)']]
      : [[L, 'rgba(60,90,150,0.25)'], ['室间隔', 'rgba(150,110,80,0.35)'], [R, 'rgba(60,120,110,0.25)']];
    const bw = w / 3;
    regions.forEach((r, i) => {
      ctx.fillStyle = r[1]; ctx.fillRect(i * bw, h * 0.15, bw * p, h * 0.7);
      ctx.fillStyle = 'rgba(220,230,250,0.95)'; ctx.textAlign = 'center'; ctx.fillText(r[0], i * bw + bw / 2, h * 0.22);
    });
    if (has('导线') || has('电极')) {
      const prog = eo(seg(lt, 1, 4)); const cy = h * 0.5;
      const tipX = mirror ? (w * 0.34 + w * 0.28 * prog) : (w * 0.66 - w * 0.28 * prog);
      ctx.strokeStyle = '#e8ecf6'; ctx.lineWidth = Math.max(6, h * 0.04); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(mirror ? w * 0.05 : w * 0.95, cy); ctx.lineTo(tipX, cy); ctx.stroke();
    }
  } else if (type === 'comparison') {
    const labels = (props.labels || structures).slice(0, 2);
    labels.forEach((t, i) => {
      const x = i === 0 ? w * 0.05 : w * 0.55;
      ctx.fillStyle = i === 0 ? 'rgba(60,90,150,0.3)' : 'rgba(60,120,110,0.3)';
      ctx.fillRect(x, h * 0.2, w * 0.4 * p, h * 0.6);
      ctx.fillStyle = 'rgba(220,230,250,0.95)'; ctx.textAlign = 'center'; ctx.fillText(t, x + w * 0.2, h * 0.3);
    });
  } else {
    const nodes = (props.labels || structures).slice(0, 4);
    const n = Math.max(nodes.length, 1); const bw = w / n;
    nodes.forEach((t, i) => {
      const on = eo(seg(lt, 0.3 + i * 0.4, 0.9 + i * 0.4));
      ctx.fillStyle = 'rgba(60,90,150,' + (0.25 + 0.3 * on) + ')';
      ctx.fillRect(i * bw + bw * 0.08, h * 0.35, bw * 0.84 * on, h * 0.3);
      ctx.fillStyle = 'rgba(220,230,250,0.95)'; ctx.textAlign = 'center'; ctx.fillText(t, i * bw + bw / 2, h * 0.5);
      if (i < n - 1) { ctx.strokeStyle = 'rgba(220,230,250,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(i * bw + bw * 0.92, h * 0.5); ctx.lineTo((i + 1) * bw + bw * 0.08, h * 0.5); ctx.stroke(); }
    });
  }
  ctx.restore();
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
    lines.push(`  S['${sc.id}'] = { r, els }; scenesEl.append(r); }`);
    return lines.join('\n');
  },
  extraUpdate: (sc) => sc.elements.filter(e => e.type === 'schematic').map(el =>
    `{ const el = s.els.find(x => x.key === ${J(el.id)}); const sp = SPECS['${sc.id}'][${J(el.id)}];
  drawSchematic(el.e.getContext('2d'), el.e.width, el.e.height, lt, sp.props); }`).join('\n'),
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

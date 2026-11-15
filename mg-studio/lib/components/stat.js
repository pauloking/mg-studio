'use strict';
const J = JSON.stringify;
const { escHtml } = require('../escape');

const STAT_W = 400, STAT_H = 280;

module.exports = {
  name: 'stat',
  css: () => `
.st-wrap { position:absolute; width:${STAT_W}px; display:flex; flex-direction:column; align-items:center; text-align:center; }
.st-row { display:flex; align-items:baseline; justify-content:center; gap:16px; }
.st-num { font-size:160px; font-weight:700; color:var(--accent2); font-variant-numeric:tabular-nums; }
.st-unit { font-size:48px; color:var(--muted); }
.st-label { font-size:40px; color:var(--muted); margin-top:18px; letter-spacing:2px; text-align:center; }`,
  check: (el) => {
    const errs = [];
    if (el.type !== 'stat') { errs.push(`stat 不支持元素类型: ${el.type}`); return errs; }
    if (!Number.isFinite(el.props.value)) errs.push(`stat ${el.id} value 须为有限数: ${JSON.stringify(el.props.value)}`);
    if (el.props.decimals != null && (!Number.isInteger(el.props.decimals) || el.props.decimals < 0 || el.props.decimals > 20)) errs.push(`stat ${el.id} decimals 须为 0..20 整数: ${el.props.decimals}`);
    // x/y 的数值校验由 lib/props.js 的通用数值键规则统一负责
    for (const k of ['unit', 'label']) if (el.props[k] != null && typeof el.props[k] !== 'string') errs.push(`stat ${el.id} props.${k} 须为字符串`);
    return errs;
  },
  build: (sc) => {
    const lines = [`{ const r = H('div','scene'); r.id = 's-${sc.id}';`, `  const els = [];`];
    const n = sc.elements.length;
    const gap = 80;
    const totalW = n * STAT_W + (n - 1) * gap;
    const startX = Math.round((1920 - totalW) / 2);
    sc.elements.forEach((el, i) => {
      if (el.type !== 'stat') throw new Error('stat 不支持元素类型: ' + el.type);
      const p = el.props, v = `e${i}`;
      const x = p.x != null ? p.x : startX + i * (STAT_W + gap);
      const y = p.y != null ? p.y : 400;
      lines.push(`  const ${v} = H('div','st-wrap'); ${v}.style.left=${J(x + 'px')}; ${v}.style.top=${J(y + 'px')};
  const row${i} = H('div','st-row'); const num${i} = H('span','st-num','0'); const unit${i} = H('span','st-unit',${J(escHtml(p.unit || ''))});
  row${i}.append(num${i}, unit${i}); const lab${i} = H('div','st-label',${J(escHtml(p.label || ''))});
  ${v}.append(row${i}, lab${i}); ${v}.__num = num${i}; r.append(${v}); els.push({key:${J(el.id)},e:${v}});`);
    });
    lines.push(`  S['${sc.id}'] = { r, els }; scenesEl.append(r); }`);
    return lines.join('\n');
  },
  boxes: (sc) => {
    const n = sc.elements.length;
    const gap = 80;
    const totalW = n * STAT_W + (n - 1) * gap;
    const startX = Math.round((1920 - totalW) / 2);
    return sc.elements.map((el, i) => {
      const p = el.props;
      const num = (Number.isFinite(p.value) ? p.value.toFixed(p.decimals || 0) : '0') + (p.unit || '');
      return {
        id: el.id,
        x: p.x != null ? p.x : startX + i * (STAT_W + gap),
        y: p.y != null ? p.y : 400,
        w: STAT_W, h: STAT_H,
        // 数字用 accent2（160px 大字，最醒目）、单位与标签用 muted —— 与 CSS 实际渲染色一致
        blocks: [
          { text: num, colorKey: 'accent2' },
          p.label ? { text: String(p.label), colorKey: 'muted' } : null
        ].filter(Boolean)
      };
    });
  }
};

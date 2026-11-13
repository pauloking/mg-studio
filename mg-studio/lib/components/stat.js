'use strict';
const J = JSON.stringify;
module.exports = {
  name: 'stat',
  css: () => `
.st-wrap { position:absolute; display:flex; flex-direction:column; align-items:center; }
.st-row { display:flex; align-items:baseline; gap:16px; }
.st-num { font-size:160px; font-weight:700; color:var(--accent2); font-variant-numeric:tabular-nums; }
.st-unit { font-size:48px; color:var(--muted); }
.st-label { font-size:40px; color:var(--muted); margin-top:18px; letter-spacing:2px; }`,
  build: (sc) => {
    const lines = [`{ const r = H('div','scene'); r.id = 's-${sc.id}';`, `  const els = [];`];
    sc.elements.forEach((el, i) => {
      if (el.type !== 'stat') throw new Error('stat 不支持元素类型: ' + el.type);
      const p = el.props, v = `e${i}`, x = p.x != null ? p.x : 760, y = p.y != null ? p.y : 400;
      lines.push(`  const ${v} = H('div','st-wrap'); ${v}.style.left='${x}px'; ${v}.style.top='${y}px';
  const row${i} = H('div','st-row'); const num${i} = H('span','st-num','0'); const unit${i} = H('span','st-unit',${J(p.unit || '')});
  row${i}.append(num${i}, unit${i}); const lab${i} = H('div','st-label',${J(p.label || '')});
  ${v}.append(row${i}, lab${i}); ${v}.__num = num${i}; r.append(${v}); els.push({key:${J(el.id)},e:${v}});`);
    });
    lines.push(`  S['${sc.id}'] = { r, els }; scenesEl.append(r); }`);
    return lines.join('\n');
  },
  boxes: (sc) => sc.elements.map(el => ({
    id: el.id, x: el.props.x != null ? el.props.x : 760, y: el.props.y != null ? el.props.y : 400,
    w: 400, h: 280, text: (el.props.label || ''), colorKey: 'accent2'
  }))
};
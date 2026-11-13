'use strict';
const J = JSON.stringify;
const { escHtml } = require('../escape');
module.exports = {
  name: 'title-card',
  css: () => `
.tc-wrap { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.tc-title { font-size:150px; font-weight:700; color:var(--ink); letter-spacing:8px; }
.tc-bar { width:420px; height:6px; border-radius:3px; margin-top:34px;
  background:linear-gradient(90deg,var(--accent),var(--accent2)); transform-origin:left center; }
.tc-tag { font-size:50px; color:var(--muted); margin-top:32px; letter-spacing:5px; }`,
  build: (sc) => {
    const lines = [`{ const r = H('div','scene'); r.id = 's-${sc.id}';`, `  const wrap = H('div','tc-wrap'); r.append(wrap);`, `  const els = [];`];
    sc.elements.forEach((el, i) => {
      const v = `e${i}`;
      if (el.type === 'text' && el.props.role === 'title')
        lines.push(`  const ${v} = H('h1','tc-title',${J(escHtml(el.props.content))}); wrap.append(${v}); els.push({key:${J(el.id)},e:${v}});`);
      else if (el.type === 'text')
        lines.push(`  const ${v} = H('div','tc-tag',${J(escHtml(el.props.content))}); wrap.append(${v}); els.push({key:${J(el.id)},e:${v}});`);
      else if (el.type === 'bar')
        lines.push(`  const ${v} = H('div','tc-bar'); wrap.append(${v}); els.push({key:${J(el.id)},e:${v}});`);
      else throw new Error('title-card 不支持元素类型: ' + el.type);
    });
    lines.push(`  S['${sc.id}'] = { r, els }; scenesEl.append(r); }`);
    return lines.join('\n');
  },
  boxes: (sc) => sc.elements.map(el => {
    if (el.type === 'bar') return { id: el.id, x: 750, y: 560, w: 420, h: 6 };
    if (el.props.role === 'title') return { id: el.id, x: 260, y: 330, w: 1400, h: 200, text: el.props.content, colorKey: 'ink' };
    return { id: el.id, x: 460, y: 630, w: 1000, h: 80, text: el.props.content, colorKey: 'muted' };
  })
};
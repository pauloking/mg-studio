'use strict';
const J = JSON.stringify;
const { escHtml } = require('../escape');
module.exports = {
  name: 'title-card',
  css: () => `
.tc-wrap { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.tc-title { font-size:150px; font-weight:700; color:var(--ink); letter-spacing:8px; text-align:center; }
.tc-bar { width:420px; height:6px; border-radius:3px; margin-top:34px;
  background:var(--title-bar, linear-gradient(90deg,var(--accent),var(--accent2))); transform-origin:center center; }
.tc-tag { font-size:50px; color:var(--muted); margin-top:32px; letter-spacing:5px; text-align:center; }`,
  check: (el) => {
    const errs = [];
    if (el.type === 'bar') return errs;
    if (el.type !== 'text') { errs.push(`title-card 不支持元素类型: ${el.type}`); return errs; }
    if (typeof el.props.content !== 'string') errs.push(`title-card ${el.id} content 须为字符串`);
    if (el.props.role != null && !['title', 'subtitle'].includes(el.props.role)) errs.push(`title-card ${el.id} role 须为 title/subtitle: ${el.props.role}`);
    return errs;
  },
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
  // 估算盒（编译期无浏览器时的回退）；真实盒由 lint_scene 用 DOM 实测覆盖
  boxes: (sc) => sc.elements.map(el => {
    if (el.type === 'bar') return { id: el.id, x: 750, y: 560, w: 420, h: 6 };
    const isTitle = el.props.role === 'title';
    return {
      id: el.id,
      x: isTitle ? 260 : 460, y: isTitle ? 330 : 630,
      w: isTitle ? 1400 : 1000, h: isTitle ? 200 : 80,
      blocks: [{ text: el.props.content || '', colorKey: isTitle ? 'ink' : 'muted' }]
    };
  })
};

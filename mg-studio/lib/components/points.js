'use strict';
const J = JSON.stringify;
module.exports = {
  name: 'points',
  css: () => `
.pt-card { position:absolute; width:520px; padding:46px 44px; border-radius:26px;
  background:rgba(18,25,52,.94); border:1px solid rgba(120,140,220,.3); box-shadow:0 24px 60px rgba(0,0,0,.45); }
.pt-card h3 { font-size:46px; font-weight:700; color:var(--ink); letter-spacing:2px; }
.pt-card p { font-size:30px; color:var(--muted); margin-top:18px; line-height:1.5; }`,
  build: (sc) => {
    const lines = [`{ const r = H('div','scene'); r.id = 's-${sc.id}';`, `  const els = [];`];
    sc.elements.forEach((el, i) => {
      if (el.type !== 'card') throw new Error('points 不支持元素类型: ' + el.type);
      const x = el.props.x != null ? el.props.x : 130 + i * 570;
      const y = el.props.y != null ? el.props.y : 420;
      const v = `e${i}`;
      const html = '<h3>' + el.props.title + '</h3><p>' + el.props.desc + '</p>';
      lines.push(`  const ${v} = H('div','pt-card',${J(html)}); ${v}.style.left='${x}px'; ${v}.style.top='${y}px'; r.append(${v}); els.push({key:${J(el.id)},e:${v}});`);
    });
    lines.push(`  S['${sc.id}'] = { r, els }; scenesEl.append(r); }`);
    return lines.join('\n');
  },
  boxes: (sc) => sc.elements.map((el, i) => ({
    id: el.id, x: el.props.x != null ? el.props.x : 130 + i * 570, y: el.props.y != null ? el.props.y : 420,
    w: 520, h: 260, text: (el.props.title || '') + (el.props.desc || ''), colorKey: 'ink'
  }))
};
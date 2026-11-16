'use strict';
const J = JSON.stringify;
const { escHtml } = require('../escape');
const { blendHex } = require('../color');

const CARD_W = 520, CARD_H = 260;          // 估算盒（真实高度随文案行数变化，由 lint_scene 实测覆盖）
const CARD_BG = { hex: '#121934', alpha: .94 }; // 与 .pt-card 的 background 保持一致

module.exports = {
  name: 'points',
  css: () => `
.pt-card { position:absolute; width:${CARD_W}px; min-height:${CARD_H}px; padding:46px 44px; border-radius:var(--card-radius, 26px);
  background:var(--surface, rgba(18,25,52,.94)); border:var(--card-border-width, 1px) solid var(--border, rgba(120,140,220,.3)); box-shadow:var(--card-shadow, 0 24px 60px rgba(0,0,0,.45)); }
.pt-card h3 { font-size:46px; font-weight:700; color:var(--ink); letter-spacing:2px; }
.pt-card p { font-size:30px; color:var(--muted); margin-top:18px; line-height:1.5; }`,
  check: (el) => {
    const errs = [];
    if (el.type !== 'card') { errs.push(`points 不支持元素类型: ${el.type}`); return errs; }
    if (typeof el.props.title !== 'string') errs.push(`points ${el.id} title 须为字符串`);
    if (typeof el.props.desc !== 'string') errs.push(`points ${el.id} desc 须为字符串`);
    // x/y 的数值校验由 lib/props.js 的通用数值键规则统一负责（避免重复诊断）
    return errs;
  },
  build: (sc) => {
    const lines = [`{ const r = H('div','scene'); r.id = 's-${sc.id}';`, `  const els = [];`];
    const n = sc.elements.length;
    const gap = 50;
    const totalW = n * CARD_W + (n - 1) * gap;
    const startX = Math.round((1920 - totalW) / 2);
    sc.elements.forEach((el, i) => {
      if (el.type !== 'card') throw new Error('points 不支持元素类型: ' + el.type);
      const x = el.props.x != null ? el.props.x : startX + i * (CARD_W + gap);
      const y = el.props.y != null ? el.props.y : 420;
      const v = `e${i}`;
      const html = '<h3>' + escHtml(el.props.title) + '</h3><p>' + escHtml(el.props.desc) + '</p>';
      // 坐标一律以 JSON 字面量落地（数字 + 'px'），不做字符串插值
      lines.push(`  const ${v} = H('div','pt-card',${J(html)}); ${v}.style.left=${J(x + 'px')}; ${v}.style.top=${J(y + 'px')}; r.append(${v}); els.push({key:${J(el.id)},e:${v}});`);
    });
    lines.push(`  S['${sc.id}'] = { r, els }; scenesEl.append(r); }`);
    return lines.join('\n');
  },
  boxes: (sc, tokens) => {
    const cardBgHex = (tokens && tokens.colors && tokens.colors.surface) || CARD_BG.hex;
    const cardBg = blendHex(cardBgHex, CARD_BG.alpha, (tokens && tokens.colors && tokens.colors.bg) || '#070b16');
    const n = sc.elements.length;
    const gap = 50;
    const totalW = n * CARD_W + (n - 1) * gap;
    const startX = Math.round((1920 - totalW) / 2);
    return sc.elements.map((el, i) => ({
      id: el.id,
      x: el.props.x != null ? el.props.x : startX + i * (CARD_W + gap),
      y: el.props.y != null ? el.props.y : 420,
      w: CARD_W, h: CARD_H,
      blocks: [
        { text: el.props.title || '', colorKey: 'ink', bg: cardBg },
        { text: el.props.desc || '', colorKey: 'muted', bg: cardBg }
      ]
    }));
  }
};

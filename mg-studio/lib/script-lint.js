'use strict';
const { checkSubs } = require('./subs');
const CONNECTIVES = ['所以', '但是', '那么', '接下来', '因此', '而', '于是', '不过', '因为', '首先', '其次', '最后'];
const EXPLAIN = ['就是', '也就是', '一种', '俗称', '指的是', '即', '等于'];
const DEFAULT_CPS = 4.5;

function sentences(text) { return String(text || '').split(/[。！？!?；;\n]/).map(s => s.trim()).filter(Boolean); }

function termUnexplained(text, terms) {
  const out = [];
  for (const term of terms || []) {
    const i = String(text || '').indexOf(term);
    if (i < 0) continue;
    const after = String(text).slice(i + term.length, i + term.length + 20);
    const explained = after.includes('（') || after.includes('(') || EXPLAIN.some(m => after.includes(m));
    if (!explained) out.push(term);
  }
  return out;
}

/** L2 脚本 lint：朗读时长模型/预算/口语/字幕一致性。 */
function lintScript({ story, charsPerSec = DEFAULT_CPS, durationTarget = null, terms = [], subsByBeat = {} }) {
  const out = [];
  const beats = (story && story.beats) || [];
  if (!beats.length) return out;

  let total = 0; const per = [];
  for (const b of beats) { const s = (b.narration || '').length / charsPerSec + 1.1; total += s; per.push({ id: b.id, s }); }
  if (Number.isFinite(durationTarget) && durationTarget > 0) {
    const dev = (total - durationTarget) / durationTarget;
    if (Math.abs(dev) > 0.10) {
      const worst = per.slice().sort((a, b) => b.s - a.s).slice(0, 3).map(x => `${x.id} ${x.s.toFixed(1)}s`).join('、');
      out.push({ level: 'W', code: 'SCRIPT_BUDGET', scene: '', msg: `全片预估 ${total.toFixed(1)}s vs 目标 ${durationTarget}s（偏差 ${(dev * 100).toFixed(0)}%），最长: ${worst}` });
    }
  }

  for (const b of beats) {
    const narr = b.narration || '';
    for (const s of sentences(narr)) if (s.length > 30)
      out.push({ level: 'W', code: 'SCRIPT_LONG_SENTENCE', scene: b.id, msg: `单句 ${s.length} 字 > 30（${s.slice(0, 12)}…）` });
    const tu = termUnexplained(narr, terms);
    if (tu.length) out.push({ level: 'W', code: 'SCRIPT_TERM_UNEXPLAINED', scene: b.id, msg: `术语首现未通俗解释: ${tu.slice(0, 3).join('、')}` });
    const head = narr.slice(0, 12);
    if (!CONNECTIVES.some(c => head.includes(c)))
      out.push({ level: 'W', code: 'SCRIPT_NO_BRIDGE', scene: b.id, msg: 'beat 开头 12 字无衔接词（逻辑桥可能缺失）' });

    const ov = subsByBeat[b.id];
    if (Array.isArray(ov)) {
      const c = checkSubs(ov, narr);
      if (!c.ok) out.push({ level: 'B', code: 'SCRIPT_SUBS_MISMATCH', scene: b.id, msg: c.detail });
    }
    // 自动切句由 subs.splitSubs 保证 ≤18（末尾标点并入最多 19，见 tests/subs.test.js 固化契约）；
    // 此处不再重复以 B 拦截，避免与既有 splitSubs 契约自相矛盾。
  }
  return out;
}
module.exports = { lintScript, sentences, termUnexplained, DEFAULT_CPS };

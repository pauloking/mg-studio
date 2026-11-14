'use strict';
const { loadTemplate } = require('./narratives');
const DEFAULT_CPS = 4.5;
function estSec(text, cps) { return (String(text || '').length) / (cps || DEFAULT_CPS) + 1.1; }

/** L1 叙事 lint。template 缺省按 story.meta.template 加载。 */
function lintStory({ story, template, charsPerSec = DEFAULT_CPS }) {
  const out = [];
  const t = template || loadTemplate((story && story.meta && story.meta.template) || 'free');
  const beats = (story && story.beats) || [];
  if (!beats.length) return out;
  const roles = beats.map(b => b.role);

  if (t.firstRole && roles[0] !== t.firstRole)
    out.push({ level: 'B', code: 'NARR_HOOK_FIRST', scene: beats[0].id, msg: `首 beat role 应为 ${t.firstRole}，实际 ${roles[0]}` });

  for (const r of (t.requiredRoles || [])) if (!roles.includes(r))
    out.push({ level: 'B', code: 'NARR_MISSING_ROLE', scene: '', msg: `模板 ${t.id} 缺少必需 role: ${r}` });

  if ((t.lastRoles || []).length && !t.lastRoles.includes(roles[roles.length - 1]))
    out.push({ level: 'B', code: 'NARR_END_ROLE', scene: beats[beats.length - 1].id, msg: `末 beat role 应为 ${t.lastRoles.join('/')}，实际 ${roles[roles.length - 1]}` });

  const wantsConflict = (t.requiredRoles || []).concat(t.recommendRoles || []).includes('conflict');
  if (wantsConflict && !roles.includes('conflict'))
    out.push({ level: 'W', code: 'NARR_NO_CONFLICT', scene: '', msg: `模板 ${t.id} 建议有 conflict（常见误解/转折）beat，未检出` });

  const em = beats.map(b => b.emotion).filter(Number.isFinite);
  if (em.length >= 2 && (Math.max(...em) - Math.min(...em)) < 2)
    out.push({ level: 'W', code: 'NARR_FLAT_EMOTION', scene: '', msg: `emotion 极差 ${Math.max(...em) - Math.min(...em)} < 2（情绪平铺）` });

  for (const b of beats) {
    const s = estSec(b.narration, charsPerSec);
    if (s > 15) out.push({ level: 'W', code: 'NARR_LONG_BEAT', scene: b.id, msg: `beat 预估 ${s.toFixed(1)}s > 15s（建议拆分）` });
  }
  return out;
}
module.exports = { lintStory, estSec, DEFAULT_CPS };

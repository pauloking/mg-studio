'use strict';
const fs = require('fs'), path = require('path');

const ROLES = ['hook', 'context', 'conflict', 'mechanism', 'evidence', 'demo', 'takeaway', 'cta', 'objective', 'prerequisite', 'steps', 'summary', 'selfcheck'];
const AUDIENCES = ['patient', 'professional', 'general'];
const TEMPLATES = ['science', 'product', 'teaching', 'free'];
const ID_RE = /^[a-z][a-z0-9_]*$/i;
const RESERVED_IDS = new Set([
  'constructor', 'prototype', '__proto__', 'tostring', 'valueof',
  'hasownproperty', 'isprototypeof', 'propertyisenumerable', 'tolocalestring'
]);

function isSafeId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return false;
  return !RESERVED_IDS.has(id.toLowerCase());
}
const HEX_RE = /^#[0-9a-f]{6}$/i;
// font.family 直接进 scene.html 的 <style>，只允许 CSS 字体族的安全字符集：
// 字母数字、引号、逗号、空格、连字符；</style>、{}、;、<、>、url() 一律拒绝。
const FONT_RE = /^[\w"',\- ]+$/;
// 色键名直接进 CSS 变量名 --<k>:<v>，与 font.family 同类注入面：字母数字与连字符。
const COLOR_KEY_RE = /^[a-zA-Z][a-zA-Z0-9-]*$/;
const CUE_RE = /^(narration|lt):\d+(\.\d+)?$/;

function validateStory(story) {
  const errors = [];
  if (!story || story.schema !== 2) errors.push('story.schema 必须为 2');
  const m = story && story.meta || {};
  if (!m.title || typeof m.title !== 'string') errors.push('meta.title 缺失');
  if (!AUDIENCES.includes(m.audience)) errors.push('meta.audience 非法: ' + m.audience);
  if (!TEMPLATES.includes(m.template)) errors.push('meta.template 非法: ' + m.template);
  if (!(typeof m.durationTarget === 'number' && m.durationTarget > 0)) errors.push('meta.durationTarget 必须为正数');
  const beats = Array.isArray(story && story.beats) ? story.beats : [];
  if (!Array.isArray(story && story.beats) || beats.length === 0) errors.push('beats 不能为空');
  const seen = new Set();
  for (const b of beats) {
    if (!b || typeof b !== 'object') { errors.push('beat 须为对象'); continue; }
    if (!b.id || !isSafeId(b.id)) errors.push('beat.id 非法: ' + b.id);
    if (seen.has(b.id)) errors.push('beat.id 重复: ' + b.id);
    seen.add(b.id);
    if (!ROLES.includes(b.role)) errors.push(`beat ${b.id} role 非法: ${b.role}`);
    if (!Number.isInteger(b.emotion) || b.emotion < 1 || b.emotion > 5) errors.push(`beat ${b.id} emotion 须为 1..5`);
    if (typeof b.intent !== 'string') errors.push(`beat ${b.id} intent 须为字符串`);
    if (!b.narration || typeof b.narration !== 'string') errors.push(`beat ${b.id} narration 缺失`);
    if (!Array.isArray(b.facts)) errors.push(`beat ${b.id} facts 须为数组`);
    else for (const f of b.facts) if (typeof f.verified !== 'boolean') errors.push(`beat ${b.id} fact.verified 须为布尔`);
  }
  return { ok: errors.length === 0, errors };
}

function validateScene(sc, beatIds, layoutNames) {
  const errors = [];
  if (!sc || typeof sc !== 'object') return { ok: false, errors: ['scene 须为对象'] };
  if (!isSafeId(sc.id || '')) errors.push('scene.id 非法: ' + sc.id);
  if (!beatIds.includes(sc.beat)) errors.push(`scene ${sc.id} 引用不存在的 beat: ${sc.beat}`);
  if (sc.id !== sc.beat) errors.push(`M1 要求 scene.id === beat（${sc.id} vs ${sc.beat}）`);
  if (!layoutNames.includes(sc.layout)) errors.push(`scene ${sc.id} layout 未知: ${sc.layout}`);
  if (!(typeof sc.minSec === 'number' && sc.minSec >= 0)) errors.push(`scene ${sc.id} minSec 须 >= 0`);
  const els = sc.elements || [];
  if (!Array.isArray(els) || els.length === 0) errors.push(`scene ${sc.id} elements 不能为空`);
  const seen = new Set();
  for (const el of els) {
    if (!el.id || !isSafeId(el.id) || seen.has(el.id)) errors.push(`scene ${sc.id} element.id 缺失/重复/非法: ${el.id}`);
    seen.add(el.id);
    if (typeof el.type !== 'string') errors.push(`scene ${sc.id} element ${el.id} 缺 type`);
    if (typeof el.props !== 'object' || el.props == null) errors.push(`scene ${sc.id} element ${el.id} props 须为对象`);
    for (const c of el.emphasis || []) if (!CUE_RE.test(c.cue || '')) errors.push(`scene ${sc.id} element ${el.id} cue 非法: ${c.cue}`);
  }
  for (const c of sc.cues || []) {
    if (!CUE_RE.test(c.at || '')) errors.push(`scene ${sc.id} cue.at 非法: ${c.at}`);
    if (!seen.has(c.target)) errors.push(`scene ${sc.id} cue.target 不存在: ${c.target}`);
  }
  if (sc.subsOverride != null && !Array.isArray(sc.subsOverride)) errors.push(`scene ${sc.id} subsOverride 须为数组或 null`);
  if (Array.isArray(sc.subsOverride)) {
    // 自动切句的 ≤18 字约束是可读性门（subs.js 注释），覆盖时同一约束必须成立，否则覆盖绕过该门
    for (const line of sc.subsOverride)
      if (typeof line !== 'string' || !line.trim()) errors.push(`scene ${sc.id} subsOverride 行须为非空字符串`);
      else if (line.length > 18) errors.push(`scene ${sc.id} subsOverride 单行 ${line.length} 字 > 18（与自动切句约束一致）`);
  }
  return { ok: errors.length === 0, errors };
}

const REQUIRED_COLORS = ['bg', 'ink', 'accent', 'accent2', 'muted'];
function validateTokens(tk) {
  const errors = [];
  if (!tk || typeof tk.colors !== 'object' || tk.colors == null) return { ok: false, errors: ['tokens.colors 缺失'] };
  for (const k of REQUIRED_COLORS) if (!HEX_RE.test(tk.colors[k] || '')) errors.push('colors.' + k + ' 须为 #rrggbb');
  for (const [k, v] of Object.entries(tk.colors)) if (!REQUIRED_COLORS.includes(k) && !HEX_RE.test(v)) errors.push('colors.' + k + ' 非法: ' + v);
  if (!tk.font || typeof tk.font.family !== 'string' || !tk.font.family.trim()) errors.push('font.family 须为非空字符串');
  else if (!FONT_RE.test(tk.font.family)) errors.push('font.family 含非法字符（只允许字母数字、引号、逗号、空格、连字符）: ' + JSON.stringify(tk.font.family.slice(0, 40)));
  for (const k of Object.keys(tk.colors)) if (!COLOR_KEY_RE.test(k)) errors.push('colors 键名非法（只允许字母数字与连字符，且以字母开头）: ' + JSON.stringify(k));
  if (!tk.subtitle || typeof tk.subtitle.bottom !== 'number') errors.push('subtitle.bottom 须为数字');
  else if (tk.subtitle.bottom !== 64) errors.push('subtitle.bottom 须为 64（M1 渲染核冻结字幕区，lint 940/900）');
  if (!tk.subtitle || !Number.isFinite(tk.subtitle.fontSize) || tk.subtitle.fontSize <= 0) errors.push('subtitle.fontSize 须为正数');
  if (!tk.subtitle || !Number.isFinite(tk.subtitle.maxW) || tk.subtitle.maxW <= 0) errors.push('subtitle.maxW 须为正数');
  return { ok: errors.length === 0, errors };
}

function deepMerge(base, over) {
  const out = Object.assign({}, base);
  for (const k of Object.keys(over && typeof over === 'object' ? over : {})) {
    const ov = over[k], bv = base[k];
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object' && !Array.isArray(bv)) out[k] = deepMerge(bv, ov);
    else out[k] = ov;
  }
  return out;
}

function loadProject(dir, layoutNames) {
  const storyPath = path.join(dir, 'story.json');
  if (!fs.existsSync(storyPath)) {
    const scriptPath = path.join(dir, 'script.json');
    if (fs.existsSync(scriptPath)) return { mode: 'v1', script: JSON.parse(fs.readFileSync(scriptPath, 'utf8')) };
    throw new Error('项目缺少 story.json 或 script.json: ' + dir);
  }
  const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
  const tkPath = path.join(dir, 'tokens.json');
  const defTokens = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'templates', 'tokens.default.json'), 'utf8'));
  const tokens = fs.existsSync(tkPath) ? deepMerge(defTokens, JSON.parse(fs.readFileSync(tkPath, 'utf8'))) : defTokens;
  const beats = Array.isArray(story && story.beats) ? story.beats : [];
  const beatIds = beats.map(b => b && b.id);
  const scenes = [];
  const errors = [...validateStory(story).errors, ...validateTokens(tokens).errors];
  for (const b of beats) {
    if (!b || typeof b !== 'object') continue;
    const sp = path.join(dir, 'scenes', b.id + '.json');
    if (!fs.existsSync(sp)) { errors.push('缺少场景文件: scenes/' + b.id + '.json'); continue; }
    const sc = JSON.parse(fs.readFileSync(sp, 'utf8'));
    errors.push(...validateScene(sc, beatIds, layoutNames).errors);
    if (!sc || sc.id !== b.id) { errors.push('场景文件 scenes/' + b.id + '.json 的 id 与 beat 不匹配: ' + (sc && sc.id)); continue; }
    scenes.push(Object.assign({}, sc, { narration: b.narration, beat: { role: b.role, emotion: b.emotion, intent: b.intent, facts: b.facts } }));
  }
  if (errors.length) { const e = new Error('IR 校验失败:\n' + errors.join('\n')); e.irErrors = errors; throw e; }
  return { mode: 'v2', story, tokens, scenes };
}

module.exports = { ROLES, AUDIENCES, TEMPLATES, validateStory, validateScene, validateTokens, loadProject };
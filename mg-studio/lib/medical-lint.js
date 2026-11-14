'use strict';
/* medical-lint.js — 医学安全门（设计文档 §6 lint_story / §10 / §11 M4 的可机器化子集）
 *
 * 定位：纯函数、无浏览器、无副作用。给 compile.js（编译期门）与 lint_scene.js
 * （编译后门）共用，输出与 motion-lint 同构的 { level, code, scene, el, msg }。
 *   level 'B' = 阻断（禁止写产物 / 禁止渲染）；'W' = 警告（打印但不阻断）。
 *
 * 规则（与 docs/superpowers/specs/2026-11-13-mg-studio-design.md 对齐）：
 *   MED_FACT_UNVERIFIED  患者向项目存在 verified:false 的 fact            B（§6 / §10）
 *   MED_DISCLAIMER       患者向项目 outro 缺免责声明                      B（§10）
 *   MED_ABSOLUTE         旁白/可见文本命中绝对化疗效/危险医嘱词表          B（§10）
 *   MED_TERM_DENSITY     患者向术语密度过高、疑似未用通俗语言              W（§7 / §10）
 *
 * 设计取舍：
 *   - 医学准确性本身（claim 对不对）只能人工核实，本门只保证"未核实的不放行、
 *     免责声明在场、语言不绝对化"，不做任何医学判断。
 *   - 绝对化词表为启发式，宁可误报（B 级）也不漏放：面向患者内容的代价不对称。
 *   - professional / general 受众不启用患者向门（设计文档明确只对 patient 强制）。
 *   - 免责声明本轮**只检查不注入**：设计文档 §10 的"编译期注入 + 渲染期 DOM 检查可见"
 *     会改变画面输出并牵动字幕/TTS 时长/像素回归，属 M4 产品决策。本轮在诊断里给出
 *     作者可直接粘贴的文本，保证零回归风险的同时把"无声明即出片"这个洞堵上。
 */
const DISCLAIMER = '本视频为健康科普，不构成诊疗建议';
const OUTRO_ROLES = ['takeaway', 'cta', 'summary', 'selfcheck'];

// 绝对化疗效 / 危险医嘱词表。pattern 为字面正则源（.source），便于序列化与测试。
// 分组只用于给出可读的命中原因，不改变判定。
const ABSOLUTE_PATTERNS = [
  { re: /根治|彻底治愈|永不复发|完全康复|包治|药到病除/, kind: '治愈承诺' },
  { re: /百分百|100%|百分之百|绝对安全|零风险|无任何副作用|万无一失/, kind: '绝对化保证' },
  { re: /最好|最佳|最安全|最有效|首选|唯一(?:有效|选择|方案)|第一(?:名|品牌)/, kind: '绝对化最优' },
  { re: /无需(?:服药|就医|复查|手术)|立即停药|停止服用(?:所有|全部)|自行决定(?:治疗|用药)/, kind: '危险医嘱' },
  { re: /(?:保证|承诺)(?:治愈|疗效|康复)|疗效确切/, kind: '疗效承诺' }
];

// 患者向通俗语言启发式：单句里出现 ≥2 个双字以上专业词、且无通俗解释标记，
// 视为术语密度告警。词表刻意小而保守，只抓最典型的医学书面语。
const MEDICAL_TERMS = [
  '适应证', '禁忌证', '并发症', '预后', '发病率', '死亡率', '生存率', '复发率',
  '经皮', '植入式', '皮下', '除颤', '心律', '心律失常', '心肌', '电极', '阈值',
  '起搏', '传导', '消融', '灌注', '栓塞', '狭窄', '综合征', '综合征',
  '随机对照', '荟萃分析', '队列', '双盲', '安慰剂', '统计学', '显著性'
];
const EXPLAIN_MARKERS = ['就是', '也就是', '一种', '俗称', '指的是', '即', '（', '('];

const TEXT_KEYS = ['title', 'desc', 'label', 'unit', 'content', 'text'];

// 收集一个场景里"会显示在画面上"的作者文本（与 props.js 的 TEXT_KEYS 对齐）。
function visibleTexts(scene) {
  const out = [];
  for (const el of (scene.elements || [])) {
    const p = el.props || {};
    for (const k of TEXT_KEYS) if (typeof p[k] === 'string' && p[k].trim()) out.push({ el: el.id, text: p[k] });
  }
  return out;
}

// 收集一个 beat 的旁白 + 该 beat 场景里的可见文本。
function beatTexts(beat, scene) {
  const arr = [];
  if (typeof beat.narration === 'string' && beat.narration.trim()) arr.push({ el: 'narration', text: beat.narration });
  if (scene) for (const v of visibleTexts(scene)) arr.push(v);
  return arr;
}

function findAbsolute(text) {
  for (const { re, kind } of ABSOLUTE_PATTERNS) {
    const m = re.exec(text);
    if (m) return { kind, hit: m[0] };
  }
  return null;
}

function termHits(text) {
  return MEDICAL_TERMS.filter(t => text.includes(t));
}

function hasExplain(text) {
  return EXPLAIN_MARKERS.some(m => text.includes(m));
}

/* lintMedical({ story, scenes }) → 诊断数组
 *   story: 已通过 validateStory 的 story.json 对象（读 meta.audience / beats / facts）
 *   scenes: loadProject 产出的 scenes（带 narration 与 beat 合并信息）；可为 null
 *           （编译期门在 IR 校验失败时仍能跑，但拿不到场景文本）
 */
function lintMedical({ story, scenes = [] }) {
  const out = [];
  const meta = (story && story.meta) || {};
  const audience = meta.audience;
  const beats = Array.isArray(story && story.beats) ? story.beats : [];
  const byId = new Map((scenes || []).map(s => [s.id, s]));

  // ── G3-A：患者向存在未核实 fact ────────────────────────────────
  if (audience === 'patient') {
    for (const b of beats) {
      if (!b || !Array.isArray(b.facts)) continue;
      for (const f of b.facts) {
        if (f && f.verified === false) {
          out.push({ level: 'B', code: 'MED_FACT_UNVERIFIED', scene: b.id, el: '',
            msg: `患者向项目含未核实医学事实「${String((f && f.claim) || '').slice(0, 24)}」（verified:false），按 §6/§10 阻断渲染；请核实后置 true 或移除该 claim` });
        }
      }
    }
  }

  // ── G3-B：患者向 outro 必须含免责声明 ─────────────────────────
  if (audience === 'patient') {
    const outros = beats.filter(b => b && OUTRO_ROLES.includes(b.role));
    const hasDisclaimer = outros.some(b => {
      const t = beatTexts(b, byId.get(b.id));
      return t.some(x => x.text.includes(DISCLAIMER));
    });
    if (!hasDisclaimer) {
      out.push({ level: 'B', code: 'MED_DISCLAIMER', scene: '', el: '',
        msg: `患者向项目 outro（${OUTRO_ROLES.join('/')}）须含免责声明「${DISCLAIMER}」；请把该句加入末个 outro 的 narration 与场景可见文本（本轮只检查不注入，避免改动画面输出；渲染期 DOM 检查见 M4）` });
    }
  }

  // ── M4-ABS：绝对化疗效 / 危险医嘱词表（B 级，所有受众）─────────
  for (const b of beats) {
    if (!b) continue;
    for (const t of beatTexts(b, byId.get(b.id))) {
      const hit = findAbsolute(t.text);
      if (hit) {
        out.push({ level: 'B', code: 'MED_ABSOLUTE', scene: b.id, el: t.el,
          msg: `命中${hit.kind}词「${hit.hit}」：医学结论须保守，必要时提示"由医生评估"（§10）` });
      }
    }
  }

  // ── M4-TERM：患者向术语密度（W 级，联动通俗语言 lint）──────────
  if (audience === 'patient') {
    for (const b of beats) {
      if (!b || typeof b.narration !== 'string') continue;
      const hits = termHits(b.narration);
      if (hits.length >= 2 && !hasExplain(b.narration)) {
        out.push({ level: 'W', code: 'MED_TERM_DENSITY', scene: b.id, el: 'narration',
          msg: `患者向旁白含 ${hits.length} 个医学术语（${hits.slice(0, 4).join('、')}）且未检出通俗解释标记；建议用"就是/也就是/一种"或括号补解释（§7/§10）` });
      }
    }
  }

  return out;
}

module.exports = {
  lintMedical,
  DISCLAIMER, OUTRO_ROLES, ABSOLUTE_PATTERNS, MEDICAL_TERMS, EXPLAIN_MARKERS,
  visibleTexts, beatTexts, findAbsolute, termHits, hasExplain
};

'use strict';
/* preview.js — 配音/渲染前的人审预览（纯函数，无 IO、无浏览器，便于单测）
 *
 * 定位：从 ir.loadProject 产出的 project 构建逐场分镜，供 scripts/preview_script.js 打印。
 * 目的：把旁白 + 画面标签 + facts 在 TTS/渲染前摊开给作者/专家看，堵住
 *       "旁白没核实就配音、渲染、然后发现错再全流程回卷" 的洞（issue #5 / #9）。
 *
 * 医学准确性本身只能人工判断，本模块不判断 claim 对错；它只负责：
 *   - 把每条 fact 的 text/source/verified 摊开；
 *   - 汇总未核实 fact 数量，交给调用方决定是否阻断（见 preview_script.js）。
 */

// 与 components 的可见文本键对齐（title-card/points/stat/waveform 的 label 等）
const TEXT_KEYS = ['title', 'desc', 'label', 'unit', 'content', 'text'];

function sceneLabels(scene) {
  const out = [];
  for (const el of (scene && scene.elements) || []) {
    const p = el.props || {};
    for (const k of TEXT_KEYS) if (typeof p[k] === 'string' && p[k].trim()) out.push(p[k]);
  }
  return out;
}

function factText(f) {
  if (!f || typeof f !== 'object') return '';
  return String(f.text || f.claim || '');
}

/**
 * buildStoryboard(project) → [{ order, id, role, layout, narration, labels, facts, unverified }]
 *   project 来自 ir.loadProject（含 scenes[]，每个 scene 带 narration + beat:{role,facts}）。
 */
function buildStoryboard(project) {
  const scenes = (project && project.scenes) || [];
  return scenes.map((sc, i) => {
    const beat = sc.beat || {};
    const facts = Array.isArray(beat.facts) ? beat.facts : [];
    const toFact = f => ({ text: factText(f), source: (f && f.source) || '', verified: !!(f && f.verified) });
    // validateStory 强制 fact.verified 为布尔，故 verified !== true 等价于 verified === false
    const unverified = facts.filter(f => !(f && f.verified === true)).map(toFact);
    return {
      order: i + 1,
      id: sc.id,
      role: beat.role || '',
      layout: sc.layout || '',
      narration: sc.narration || '',
      labels: sceneLabels(sc),
      facts: facts.map(toFact),
      unverified
    };
  });
}

function countUnverified(storyboard) {
  return (storyboard || []).reduce((n, b) => n + b.unverified.length, 0);
}

function header(meta) {
  const title = (meta && meta.title) || '分镜预览';
  const audience = (meta && meta.audience) || '';
  return { title, audience };
}

/** formatStoryboardMd(storyboard, meta) → Markdown，便于发给专家逐条审核 */
function formatStoryboardMd(storyboard, meta) {
  const { title, audience } = header(meta);
  const lines = [`# ${title} · 分镜逐句预览`];
  if (audience) lines.push('', `受众：${audience}`);
  lines.push('', `场景数：**${storyboard.length}**　未核实 facts：**${countUnverified(storyboard)}**`, '');
  for (const b of storyboard) {
    lines.push(`## ${b.order}. ${b.id}（${b.role}）`);
    lines.push(`- 旁白：${b.narration || '（空）'}`);
    if (b.labels.length) lines.push(`- 画面标签：${b.labels.join(' / ')}`);
    if (b.facts.length) {
      lines.push('- 依据：');
      for (const f of b.facts) lines.push(`  - [${f.verified ? '已核实' : '未核实'}] ${f.text}${f.source ? '（' + f.source + '）' : ''}`);
    } else {
      lines.push('- 依据：（无）');
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** formatStoryboardText(storyboard, meta) → 终端纯文本 */
function formatStoryboardText(storyboard, meta) {
  const { title, audience } = header(meta);
  const lines = [`${title} · 分镜逐句预览${audience ? '（受众：' + audience + '）' : ''}`];
  lines.push(`场景数 ${storyboard.length}　未核实 facts ${countUnverified(storyboard)}`);
  lines.push(''.padEnd(60, '─'));
  for (const b of storyboard) {
    lines.push(`${b.order}. [${b.id}] ${b.role} · ${b.layout}`);
    lines.push(`   旁白：${b.narration || '（空）'}`);
    if (b.labels.length) lines.push(`   标签：${b.labels.join(' / ')}`);
    if (b.facts.length) {
      lines.push('   依据：');
      for (const f of b.facts) lines.push(`     ${f.verified ? '✓' : '✗'} ${f.text}${f.source ? '（' + f.source + '）' : ''}`);
    }
  }
  return lines.join('\n');
}

module.exports = { buildStoryboard, countUnverified, formatStoryboardMd, formatStoryboardText, sceneLabels, TEXT_KEYS };

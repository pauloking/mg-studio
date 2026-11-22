#!/usr/bin/env node
'use strict';
/* lint_story.js — G0 脚本门（叙事 + 脚本 + 医学三层合成，§9.1）
 * 用法: node lint_story.js [项目目录]
 * 产物: <项目>/reports/story-lint.md；退出码 0 通过 / 1 有 B 级 / 2 加载失败
 */
const fs = require('fs'), path = require('path');
const ir = require('../lib/ir');
const { LAYOUT_NAMES } = require('../lib/components');
const { loadTemplate } = require('../lib/narratives');
const { lintStory } = require('../lib/story-lint');
const { lintScript } = require('../lib/script-lint');
const { lintMedical } = require('../lib/medical-lint');
const cal = require('../lib/calibrate');

function loadTerms() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'medical', 'terms.json'), 'utf8')); }
  catch (e) { return []; }
}

require('../lib/cli-help').help('用法: node lint_story.js [项目目录]\nG0 故事/脚本门：结构/长句/术语/字幕；生成 reports/story-lint.md；B 阻断退出1。');

function main() {
  const args = process.argv.slice(2);
  const positional = args.filter(a => !a.startsWith('--'));
  const dir = positional.length ? path.resolve(positional[0]) : process.cwd();
  let project;
  try { project = ir.loadProject(dir, LAYOUT_NAMES); }
  catch (e) { console.error(e.message); return 2; }
  if (project.mode === 'v1') { console.log('v1 直通：跳过 G0 脚本门'); return 0; }

  const story = project.story, meta = story.meta || {};
  const template = loadTemplate(meta.template || 'free');
  const key = cal.keyOf(story.tts && story.tts.backend, story.tts && story.tts.voice);
  const cps = cal.charPerSecFor(dir, key, 4.5);
  const subsByBeat = {};
  for (const sc of project.scenes) if (Array.isArray(sc.subsOverride)) subsByBeat[sc.id] = sc.subsOverride;

  const diag = [].concat(
    lintStory({ story, template, charsPerSec: cps }),
    lintScript({ story, charsPerSec: cps, durationTarget: meta.durationTarget, terms: loadTerms(), subsByBeat }),
    lintMedical({ story, scenes: project.scenes })
  );

  const B = diag.filter(d => d.level === 'B'), W = diag.filter(d => d.level === 'W');
  const lines = ['# G0 脚本门报告', '', `项目：${meta.title || dir}（template=${meta.template}，charsPerSec=${cps}）`, `阻断 ${B.length} · 警告 ${W.length}`, ''];
  for (const d of B) lines.push(`- [B] ${d.code} ${d.scene || ''} ${d.msg}`);
  for (const d of W) lines.push(`- [W] ${d.code} ${d.scene || ''} ${d.msg}`);
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'reports', 'story-lint.md'), lines.join('\n') + '\n');

  for (const d of B) console.error(`[B] ${d.code} ${d.scene || ''} ${d.msg}`);
  for (const d of W) console.log(`[W] ${d.code} ${d.scene || ''} ${d.msg}`);
  console.log(`\nG0 ${B.length ? 'BLOCKED' : 'OK'}（B=${B.length} W=${W.length}）→ reports/story-lint.md`);
  return B.length ? 1 : 0;
}
if (require.main === module) process.exit(main());
module.exports = { main };

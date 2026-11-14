#!/usr/bin/env node
'use strict';
/* lint_scene.js — 编译后门：用真实 DOM 盒 + 实测时长跑同一套动效 lint
 *
 * 为什么不在 compile.js 里做：编译期既没有真实音频时长，也没有浏览器可量盒。
 * 本门排在 build_timeline.js 之后（timeline.json 就绪），因此：
 *   - 包围盒 = getBoundingClientRect 实测（不再是 points h=260 这类估算）
 *   - 场景时长 = 实测（不再是 字数/4.5 估算）
 *
 * 用法:
 *   node lint_scene.js [项目目录] [--no-measure]
 * 环境变量:
 *   MG_MEASURE=0   跳过 DOM 实测，回退到组件估算盒（会明确告警）
 *   PW_PATH / PW_CHANNEL  见 lib/measure.js
 * 退出码: 0 通过（含 v1 直通）；1 有 B 级阻断或运行失败
 */
const fs = require('fs'), path = require('path');
const ir = require('../lib/ir');
const { COMPONENTS, LAYOUT_NAMES } = require('../lib/components');
const { normalizeScene } = require('../lib/compile');
const { lintMotion } = require('../lib/motion-lint');
const { lintMedical } = require('../lib/medical-lint');
const { measureBoxes } = require('../lib/measure');

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter(a => !a.startsWith('--'));
  const noMeasure = args.includes('--no-measure') || process.env.MG_MEASURE === '0';
  const dir = positional.length ? path.resolve(positional[0]) : process.cwd();

  let project;
  try { project = ir.loadProject(dir, LAYOUT_NAMES); }
  catch (e) { console.error(e.message); return 1; }
  if (project.mode === 'v1') { console.log('v1 passthrough: 跳过编译后门'); return 0; }

  const scenes = project.scenes.map(sc => normalizeScene(sc, COMPONENTS));

  const tlPath = path.join(dir, 'timeline.json');
  const timeline = fs.existsSync(tlPath) ? JSON.parse(fs.readFileSync(tlPath, 'utf8')) : null;
  const durations = {};
  if (timeline) for (const sc of timeline.scenes) durations[sc.id] = (sc.end - sc.start) / (timeline.fps || 30);

  let measured = null;
  if (timeline && !noMeasure) {
    measured = await measureBoxes({ dir, timeline, scenes });
    if (!measured) console.warn('[W] 实测盒不可用（缺 Playwright / Chrome，或 MG_MEASURE=0）：回退到组件估算盒，几何类检查强度下降');
  } else if (!timeline) {
    console.warn('[W] 无 timeline.json：场景时长用估算、不做实测盒（先跑 build_timeline.js）');
  } else {
    console.warn('[W] 已按 MG_MEASURE=0 跳过实测盒：几何类检查强度下降');
  }

  const lint = lintMotion({ scenes, tokens: project.tokens, components: COMPONENTS, measured, durations })
    // 编译后门同样跑医学门：与编译期一致，避免"编译过了但 lint_scene 漏掉"或反之。
    .concat(lintMedical({ story: project.story, scenes: project.scenes }));
  for (const l of lint) console.log(`[${l.level}] ${l.code} ${l.scene || ''}/${l.el || ''}: ${l.msg}`);
  const blocking = lint.filter(l => l.level === 'B');
  const geo = measured ? '实测盒' : '估算盒';
  if (blocking.length) { console.error(`lint_scene BLOCKED: ${blocking.length} 个 B 级（${geo}）`); return 1; }
  console.log(`lint_scene OK（${geo}，${timeline ? '实测时长' : '估算时长'}）`);
  return 0;
}

if (require.main === module) {
  main().then(code => process.exit(code)).catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
}
module.exports = { main };

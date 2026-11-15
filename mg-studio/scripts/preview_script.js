#!/usr/bin/env node
'use strict';
/* preview_script.js — 配音/渲染前的人审预览门（issue #5 / #9）
 *
 * 在 compile 之后、tts 之前运行，把逐场分镜（旁白 / 画面标签 / facts）摊开给作者
 * 或领域专家逐句核对；若存在未核实 fact 且未显式 --yes，则以退出码 2 阻断后续。
 *
 * 用法:
 *   node preview_script.js [项目目录]          # 打印分镜；有未核实 fact 则退出码 2
 *   node preview_script.js [项目目录] --md     # 输出 Markdown（发给专家审核）
 *   node preview_script.js [项目目录] --yes    # 跳过未核实阻断（已知并接受）
 *
 * 推荐工作流（在 make.sh 之前人工把关）:
 *   node scripts/preview_script.js && node scripts/tts.js --backend bailian && ...
 *
 * 退出码: 0 通过；2 存在未核实 fact 需确认；1 加载失败
 */
const path = require('path');
const ir = require('../lib/ir');
const { LAYOUT_NAMES } = require('../lib/components');
const { buildStoryboard, countUnverified, formatStoryboardMd, formatStoryboardText } = require('../lib/preview');

function main() {
  const args = process.argv.slice(2);
  const positional = args.filter(a => !a.startsWith('--'));
  const md = args.includes('--md');
  const yes = args.includes('--yes');
  const dir = positional.length ? path.resolve(positional[0]) : process.cwd();

  let project;
  try { project = ir.loadProject(dir, LAYOUT_NAMES); }
  catch (e) { console.error(e.message); return 1; }
  if (project.mode === 'v1') { console.log('v1 直通：无需分镜预览'); return 0; }

  const meta = (project.story && project.story.meta) || {};
  const sb = buildStoryboard(project);
  console.log(md ? formatStoryboardMd(sb, meta) : formatStoryboardText(sb, meta));

  const n = countUnverified(sb);
  if (n > 0 && !yes) {
    console.error(`\n[!] 存在 ${n} 条未核实 facts：请逐条核实，确认无误后加 --yes 重跑（或把对应 fact.verified 置 true）。`);
    return 2;
  }
  if (n > 0) console.log(`\n[!] 仍有 ${n} 条未核实 facts（已用 --yes 跳过）。`);
  else console.log('\n[✓] 无未核实 facts，可进入配音。');
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { main };

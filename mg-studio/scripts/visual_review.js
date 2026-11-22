#!/usr/bin/env node
'use strict';
/* visual_review.js — 医学视觉正确性人工门 CLI
 * 用法:
 *   node visual_review.js check [项目目录]                 # 检查解剖/器械示意是否已获专家目检批准（B 阻断）
 *   node visual_review.js approve <sceneId> --reference <图> --reviewer <姓名> [项目目录]
 */
const path = require('path');
const ir = require('../lib/ir');
const { LAYOUT_NAMES } = require('../lib/components');
const vr = require('../lib/visual-review');

function parse(argv) {
  const pos = [], fl = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reference' || a === '--reviewer' || a === '--dir') fl[a.slice(2)] = argv[++i];
    else if (!a.startsWith('--')) pos.push(a);
  }
  return { pos, fl };
}

require('../lib/cli-help').help('用法: node visual_review.js check [项目目录]\n      node visual_review.js approve <sceneId> --reference <图> --reviewer <姓名> [项目目录]\n解剖/器械示意须专家目检+参考图批准才渲染。');

function main() {
  const { pos, fl } = parse(process.argv.slice(2));
  const cmd = pos[0] || 'check';
  const dir = fl.dir || (cmd === 'approve' ? pos[2] : pos[1]) || process.cwd();
  if (cmd === 'approve') {
    const sceneId = pos[1];
    if (!sceneId || !fl.reference || !fl.reviewer) { console.error('用法: approve <sceneId> --reference <图> --reviewer <姓名>'); return 2; }
    const rec = vr.approve({ dir: path.resolve(dir), sceneId, reference: fl.reference, reviewer: fl.reviewer });
    console.log(`已记录视觉批准: ${sceneId} by ${rec.reviewer}（参考图 ${rec.reference}）`);
    return 0;
  }
  let project;
  try { project = ir.loadProject(path.resolve(dir), LAYOUT_NAMES); } catch (e) { console.error(e.message); return 2; }
  if (project.mode === 'v1') { console.log('v1 直通：跳过视觉门'); return 0; }
  const findings = vr.checkVisualReview({ scenes: project.scenes, dir: path.resolve(dir) });
  for (const f of findings) console.error(`[${f.level}] ${f.code} ${f.scene}: ${f.msg}`);
  console.log(findings.length ? `视觉门 BLOCKED（${findings.length} 项待专家目检）` : '视觉门 OK（解剖/器械示意均已获批准，或无此类场景）');
  return findings.length ? 1 : 0;
}
if (require.main === module) process.exit(main());
module.exports = { main, parse };

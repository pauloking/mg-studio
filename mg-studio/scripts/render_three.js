#!/usr/bin/env node
'use strict';
require('../lib/cli-help').help('用法: node render_three.js [项目目录]\n为 timeline 中 three3d 段调用外部工程确定性喂帧渲染。');
/* render_three.js — 为 timeline 中的 three3d 段调用外部喂帧工程渲染到 frames/<id>/（§10）
 * 用法: node render_three.js [项目目录]
 * 在 render.js --all 之前运行；render --all 会跳过 three3d 段避免覆盖。
 */
const fs = require('fs'), path = require('path');
const { renderThreeScene, resolveProject } = require('../lib/three3d');

function main() {
  const pos = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const dir = pos.length ? path.resolve(pos[0]) : process.cwd();
  const tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  let script = { scenes: [] }; try { script = JSON.parse(fs.readFileSync(path.join(dir, 'script.json'), 'utf8')); } catch (e) {}
  const byId = {}; for (const sc of script.scenes || []) byId[sc.id] = sc;
  const tokensPath = fs.existsSync(path.join(dir, 'tokens.json')) ? path.join(dir, 'tokens.json') : undefined;
  let ok = true, did = 0;
  for (const sc of tl.scenes) {
    const s = byId[sc.id]; if (!s || s.layout !== 'three3d') continue;
    const el = (s.elements || []).find(e => e.type === 'three3d') || {};
    const tp = el.props && el.props.threeProject;
    if (!tp) { console.error('three3d 段缺 threeProject:', sc.id); ok = false; continue; }
    const tpDir = resolveProject(tp, dir);
    const r = renderThreeScene({ threeProjectDir: tpDir, outDir: path.join(dir, 'frames', sc.id), frameCount: sc.end - sc.start, fps: tl.fps, width: tl.width, height: tl.height, tokensPath, params: el.props && el.props.params });
    console.log(r.ok ? `  three3d ${sc.id} ${r.count} 帧` : `  three3d FAIL ${sc.id}: ${r.err}`);
    if (!r.ok) ok = false; did++;
  }
  console.log(`render_three 完成：${did} 个 3D 段${ok ? '' : '（有失败）'}`);
  return ok ? 0 : 1;
}
if (require.main === module) process.exit(main());
module.exports = { main };

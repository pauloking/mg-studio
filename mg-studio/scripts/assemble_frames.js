#!/usr/bin/env node
'use strict';
require('../lib/cli-help').help('用法: node assemble_frames.js [项目目录]\n按时间轴硬链接拼接各场景帧 → frames/all/f_%04d.png。');
/* assemble_frames.js — 按 timeline 顺序把各 scene 帧硬链接拼到 frames/all/f_%04d.png
 * 用法: node assemble_frames.js [项目目录]
 */
const fs = require('fs'), path = require('path');
function assemble({ dir, timeline }) {
  const all = path.join(dir, 'frames', 'all');
  fs.rmSync(all, { recursive: true, force: true }); fs.mkdirSync(all, { recursive: true });
  let g = 0; const missing = [];
  for (const sc of timeline.scenes) {
    const sd = path.join(dir, 'frames', sc.id);
    const n = sc.end - sc.start;
    for (let k = 0; k < n; k++) {
      const src = path.join(sd, `f_${String(k).padStart(4, '0')}.png`);
      if (!fs.existsSync(src)) { missing.push(`${sc.id}/${k}`); continue; }
      const dst = path.join(all, `f_${String(g).padStart(4, '0')}.png`);
      try { fs.linkSync(src, dst); } catch (e) { fs.copyFileSync(src, dst); }
      g++;
    }
  }
  return { count: g, missing };
}
if (require.main === module) {
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const r = assemble({ dir, timeline: tl });
  console.log('assemble:', r.count, '帧', r.missing.length ? `| 缺 ${r.missing.length} 帧` : '');
  if (r.missing.length) { console.error('缺失样例:', r.missing.slice(0, 5).join(', ')); process.exit(1); }
}
module.exports = { assemble };

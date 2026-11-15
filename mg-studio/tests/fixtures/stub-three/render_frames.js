#!/usr/bin/env node
'use strict';
/* stub-three/render_frames.js — 自包含「Three.js 喂帧」桩工程（仅测试用）
 * 遵守 mg-studio three3d 喂帧契约：按 --frames N 写出 f_0000.png..f_{N-1}.png（确定性）。
 * 真实 Three.js 工程按其自身渲染器实现同一契约即可被 lib/three3d.js 接入。
 */
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2);
function arg(k, d) { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; }
const out = arg('--out');
const N = parseInt(arg('--frames', '0'), 10);
if (!out || !(N > 0)) { console.error('用法: render_frames.js --out DIR --frames N'); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (let i = 0; i < N; i++) {
  // 确定性：内容只由帧号决定（真实工程会渲染真实像素；此处写可辨识的桩字节）
  fs.writeFileSync(path.join(out, `f_${String(i).padStart(4, '0')}.png`), Buffer.from('STUBFRAME:' + i));
}
console.log('stub-three rendered', N, 'frames');

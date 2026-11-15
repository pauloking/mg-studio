#!/usr/bin/env node
'use strict';
/* contact_sheet.js — G1 关键帧拼图（§9.1）：每 scene 取代表帧拼网格 → reports/contact-sheet.png
 * 用法: node contact_sheet.js [项目目录] [--cols N]
 * 依赖 python3 + PIL；缺则返回 null（W 跳过，不阻断）。
 */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

// 取每 scene 的首帧（f_0000.png）作代表；montage 成 cols 列网格
const PY = `
import sys, os, json
from PIL import Image
dirp, outp, cols, scenes = sys.argv[1], sys.argv[2], int(sys.argv[3]), json.loads(sys.argv[4])
files = []
for sid in scenes:
    p = os.path.join(dirp, 'frames', sid, 'f_0000.png')
    if os.path.exists(p): files.append(p)
if not files:
    sys.exit(3)
imgs = [Image.open(f).convert('RGB') for f in files]
tw, th = imgs[0].size
rows = (len(imgs) + cols - 1) // cols
sheet = Image.new('RGB', (tw * cols, th * rows), (20, 24, 40))
for i, im in enumerate(imgs):
    if im.size != (tw, th): im = im.resize((tw, th))
    sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
os.makedirs(os.path.dirname(outp), exist_ok=True)
sheet.save(outp)
print('ok', len(files))
`;

function build({ dir, timeline, out, cols = 4 }) {
  const scenes = ((timeline && timeline.scenes) || []).map(s => s.id);
  try {
    execFileSync('python3', ['-c', PY, dir, out, String(cols), JSON.stringify(scenes)], { stdio: ['ignore', 'pipe', 'pipe'] });
    return fs.existsSync(out) ? out : null;
  } catch (e) { return null; }
}

if (require.main === module) {
  const args = process.argv.slice(2); const pos = args.filter(a => !a.startsWith('--'));
  const ci = args.indexOf('--cols'); const cols = ci >= 0 ? parseInt(args[ci + 1], 10) : 4;
  const dir = pos.length ? path.resolve(pos[0]) : process.cwd();
  const tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const out = path.join(dir, 'reports', 'contact-sheet.png');
  const r = build({ dir, timeline: tl, out, cols });
  console.log(r ? 'contact sheet -> ' + path.relative(dir, r) : '[W] contact sheet 跳过（缺 PIL 或无可拼帧）');
}
module.exports = { build };

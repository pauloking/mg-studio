'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const cs = require('../scripts/contact_sheet');

function havePIL() { try { execFileSync('python3', ['-c', 'import PIL']); return true; } catch (e) { return false; } }

test('contact sheet：从 per-scene 帧拼出 PNG（缺 PIL 则跳过）', () => {
  if (!havePIL()) { console.log('skip: 无 PIL'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-'));
  for (const id of ['a', 'b']) fs.mkdirSync(path.join(dir, 'frames', id), { recursive: true });
  // 用 PIL 生成合法首帧
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
d=sys.argv[1]
Image.new('RGB',(8,8),(200,40,40)).save(d+'/frames/a/f_0000.png')
Image.new('RGB',(8,8),(40,200,40)).save(d+'/frames/b/f_0000.png')
`, dir]);
  const tl = { fps: 30, scenes: [{ id: 'a', start: 0, end: 3 }, { id: 'b', start: 3, end: 6 }] };
  const out = cs.build({ dir, timeline: tl, out: path.join(dir, 'reports', 'contact-sheet.png') });
  assert.ok(out && fs.existsSync(out), '应生成 contact-sheet.png');
});

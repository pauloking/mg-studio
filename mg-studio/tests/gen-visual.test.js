'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function proj(beats) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-gv-'));
  fs.writeFileSync(path.join(dir, 'story.json'), JSON.stringify({ schema: 2, meta: { title: 't', audience: 'professional', template: 'science', durationTarget: 60 }, beats }));
  return dir;
}
function run(dir, args = []) {
  try { return { code: 0, out: execFileSync('node', [path.join(ROOT, 'scripts', 'gen_visual.js'), dir, ...args], { encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}
const pan = { id: 'field', role: 'context', emotion: 3, intent: '术野全景', narration: '术野全景可见心脏与导线。', facts: [] };
const dia = { id: 'flow', role: 'mechanism', emotion: 3, intent: '流程', narration: '流程分为评估、准备、复核三个阶段。', facts: [] };
const amb = { id: 'open', role: 'hook', emotion: 4, intent: '开场', narration: '欢迎观看本视频。', facts: [] };

test('gen_visual：免费路径生成 panorama→2D示意、diagram→2D', () => {
  const dir = proj([pan, dia]);
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'scenes', 'field.json'), 'utf8')).layout, 'schematic');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'scenes', 'flow.json'), 'utf8')).layout, 'schematic');
});
test('gen_visual：ambient 未授权 exit2 且不写场景不调百炼', () => {
  const dir = proj([amb]);
  const r = run(dir);
  assert.equal(r.code, 2);
  assert.ok(/Credits|--yes/.test(r.out));
  assert.equal(fs.existsSync(path.join(dir, 'scenes', 'open.json')), false);
  assert.equal(fs.existsSync(path.join(dir, 'assets', 'index.json')), false);
});
test('gen_visual：已有场景默认不覆盖', () => {
  const dir = proj([dia]);
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.writeFileSync(path.join(dir, 'scenes', 'flow.json'), JSON.stringify({ marker: true }));
  run(dir);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'scenes', 'flow.json'), 'utf8')), { marker: true });
});

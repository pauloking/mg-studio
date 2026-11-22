const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function work(name) {
  const w = path.join(ROOT, 'tests', 'work', name);
  fs.rmSync(w, { recursive: true, force: true }); fs.mkdirSync(w, { recursive: true });
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'mini-panorama'), w, { recursive: true });
  return w;
}
function make(w) { return execFileSync('bash', [path.join(ROOT, 'scripts', 'make.sh'), ROOT, 'local', 'test'], { cwd: w, encoding: 'utf8' }); }

test('mini-panorama：内置 3D 全景经 make.sh 端到端出片（已批准人工门）', { timeout: 400000 }, () => {
  const w = work('e2e-panorama');
  const out = make(w);
  assert.ok(out.includes('compile OK'));
  assert.ok(out.includes('timeline OK'));
  const tl = JSON.parse(fs.readFileSync(path.join(w, 'timeline.json'), 'utf8'));
  const sc = tl.scenes.find(s => s.id === 'field');
  const frames3d = fs.readdirSync(path.join(w, 'frames', 'field')).filter(f => f.endsWith('.png'));
  assert.equal(frames3d.length, sc.end - sc.start, '3D 喂帧数应等于时间轴场景帧数');
  assert.ok(fs.existsSync(path.join(w, 'out', 'test.mp4')));
});

test('mini-panorama：撤销批准后人工门阻断 3D 出片', { timeout: 200000 }, () => {
  const w = work('e2e-panorama-gate');
  const sp = path.join(w, 'scenes', 'field.json');
  const sc = JSON.parse(fs.readFileSync(sp, 'utf8'));
  delete sc.visualReview;
  fs.writeFileSync(sp, JSON.stringify(sc, null, 2));
  let err = null;
  try { make(w); } catch (e) { err = e; }
  assert.ok(err, '未批准应阻断');
  assert.ok((String(err.stdout || '') + String(err.stderr || '')).includes('VISUAL_REVIEW_REQUIRED'));
});

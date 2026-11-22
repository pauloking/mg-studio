const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function workDir(name) {
  const work = path.join(ROOT, 'tests', 'work', name);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'mini-schematic'), work, { recursive: true });
  return work;
}
function make(work) {
  return execFileSync('bash', [path.join(ROOT, 'scripts', 'make.sh'), ROOT, 'local', 'test'], { cwd: work, encoding: 'utf8' });
}

test('mini-schematic：参数化 2D 示意经 make.sh 端到端出片（已批准人工门）', { timeout: 240000 }, () => {
  const work = workDir('e2e-schematic');
  const out = make(work);
  assert.ok(out.includes('compile OK'));
  assert.ok(out.includes('timeline OK'));
  assert.ok(out.includes('QA OK'));
  const tl = JSON.parse(fs.readFileSync(path.join(work, 'timeline.json'), 'utf8'));
  const frames = fs.readdirSync(path.join(work, 'frames', 'all')).filter(f => f.endsWith('.png'));
  assert.equal(frames.length, tl.totalFrames);
  assert.ok(fs.existsSync(path.join(work, 'out', 'test.mp4')));
});

test('mini-schematic：撤销批准后人工门阻断出片', { timeout: 240000 }, () => {
  const work = workDir('e2e-schematic-gate');
  const sp = path.join(work, 'scenes', 'lead.json');
  const sc = JSON.parse(fs.readFileSync(sp, 'utf8'));
  delete sc.visualReview;
  fs.writeFileSync(sp, JSON.stringify(sc, null, 2));
  let err = null;
  try { make(work); } catch (e) { err = e; }
  assert.ok(err, '未批准应阻断');
  assert.ok(String(err.stdout || '') + String(err.stderr || '') .includes('VISUAL_REVIEW_REQUIRED'), '应报 VISUAL_REVIEW_REQUIRED');
});

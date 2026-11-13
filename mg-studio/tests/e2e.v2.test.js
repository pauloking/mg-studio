const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function runE2E(fixture, workName) {
  const work = path.join(ROOT, 'tests', 'work', workName);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', fixture), work, { recursive: true });
  const out = execFileSync('bash', [path.join(ROOT, 'scripts', 'make.sh'), ROOT, 'local', 'test'], { cwd: work, encoding: 'utf8' });
  assert.ok(out.includes('compile OK'), '应触发编译步骤');
  assert.ok(out.includes('timeline OK'));
  assert.ok(out.includes('runtime error: none'));
  const script = JSON.parse(fs.readFileSync(path.join(work, 'script.json'), 'utf8'));
  assert.equal(script.schema, 2);
  const tl = JSON.parse(fs.readFileSync(path.join(work, 'timeline.json'), 'utf8'));
  const frames = fs.readdirSync(path.join(work, 'frames')).filter(f => f.endsWith('.png'));
  assert.equal(frames.length, tl.totalFrames, '帧数应等于时间轴总帧数');
  const mp4 = path.join(work, 'out', 'test.mp4');
  assert.ok(fs.existsSync(mp4));
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString().trim());
  assert.ok(Math.abs(dur - tl.totalFrames / tl.fps) < 0.15, '成片时长应匹配时间轴: ' + dur);
}

test('mini-v2 声明式 fixture 经 make.sh 端到端出片', { timeout: 240000 }, () => runE2E('mini-v2', 'e2e-v2'));
test('mini-av 声明式 fixture（waveform/stat）经 make.sh 端到端出片', { timeout: 240000 }, () => runE2E('mini-av', 'e2e-av'));

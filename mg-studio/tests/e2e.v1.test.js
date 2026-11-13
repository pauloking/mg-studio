const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

test('v1 fixture 经复制渲染核端到端出片', { timeout: 180000 }, () => {
  const work = path.join(ROOT, 'tests', 'work', 'e2e-v1');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'mini-v1'), work, { recursive: true });
  const out = execFileSync('bash', [path.join(ROOT, 'scripts', 'make.sh'), ROOT, 'local', 'test'], { cwd: work, encoding: 'utf8' });
  assert.ok(out.includes('timeline OK'), 'timeline 应校验通过');
  assert.ok(out.includes('runtime error: none'), '渲染应无运行时错误');
  const mp4 = path.join(work, 'out', 'test.mp4');
  assert.ok(fs.existsSync(mp4), '成片应存在');
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString().trim());
  assert.ok(dur > 2, '时长应 > 2s，实际 ' + dur);
});
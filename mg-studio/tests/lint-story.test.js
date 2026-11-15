'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'scripts', 'lint_story.js');

function mkProject(dir, { template = 'science', beats } = {}) {
  fs.mkdirSync(path.join(dir, 'scenes'), { recursive: true });
  const b = beats || [
    { id: 'h', role: 'hook', emotion: 4, intent: 'x', narration: '因为要讲清楚。', facts: [] },
    { id: 'm', role: 'mechanism', emotion: 3, intent: 'x', narration: '所以机理如此。', facts: [] },
    { id: 'e', role: 'evidence', emotion: 3, intent: 'x', narration: '因此有证据。', facts: [] },
    { id: 't', role: 'takeaway', emotion: 4, intent: 'x', narration: '最后记住要点。', facts: [] }
  ];
  fs.writeFileSync(path.join(dir, 'story.json'), JSON.stringify({ schema: 2, meta: { title: 't', audience: 'professional', template, durationTarget: 20 }, beats: b }, null, 2));
  for (const x of b) fs.writeFileSync(path.join(dir, 'scenes', x.id + '.json'), JSON.stringify({ id: x.id, beat: x.id, minSec: 3, layout: 'title-card', elements: [ { id: 'c0', type: 'text', props: { role: 'title', content: x.id } } ], cues: [], subsOverride: null, custom: null }, null, 2));
  return dir;
}
function run(args) {
  try { return { code: 0, out: execFileSync('node', [CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString() }; }
  catch (e) { return { code: e.status, out: (e.stdout || '').toString() + (e.stderr || '').toString() }; }
}

test('合规项目 → 退出 0，报告含 beat', () => {
  const dir = mkProject(fs.mkdtempSync(path.join(os.tmpdir(), 'g0-')));
  const r = run([dir]);
  assert.equal(r.code, 0, r.out);
  const rep = path.join(dir, 'reports', 'story-lint.md');
  assert.ok(fs.existsSync(rep), '应写 reports/story-lint.md');
  assert.ok(fs.readFileSync(rep, 'utf8').includes('G0'), '报告应含 G0 概览');
});

test('缺必需 role → 退出 1，报告含 NARR_MISSING_ROLE', () => {
  const dir = mkProject(fs.mkdtempSync(path.join(os.tmpdir(), 'g0-')), { beats: [
    { id: 'h', role: 'hook', emotion: 4, intent: 'x', narration: '因为开场。', facts: [] },
    { id: 't', role: 'takeaway', emotion: 4, intent: 'x', narration: '最后收尾。', facts: [] }
  ] });
  const r = run([dir]);
  assert.equal(r.code, 1, r.out);
  const md = fs.readFileSync(path.join(dir, 'reports', 'story-lint.md'), 'utf8');
  assert.ok(md.includes('NARR_MISSING_ROLE'), md);
});

test('v1 直通（只有 script.json）→ 退出 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g0-'));
  fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify({ fps: 30, width: 1920, height: 1080, scenes: [] }));
  assert.equal(run([dir]).code, 0);
});

test('完整 science 脚本（多 beat）走 G0 → exit 0 + 报告可读 + 校准回读', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g0-full-'));
  mkProject(dir, { beats: [
    { id: 'h', role: 'hook', emotion: 4, intent: 'x', narration: '因为很多人看不懂这类波形。', facts: [] },
    { id: 'ctx', role: 'context', emotion: 3, intent: 'x', narration: '所以我们先建立背景。', facts: [] },
    { id: 'm1', role: 'mechanism', emotion: 3, intent: 'x', narration: '那么第一个机制是它。', facts: [] },
    { id: 'm2', role: 'mechanism', emotion: 3, intent: 'x', narration: '因此第二个机制如此。', facts: [] },
    { id: 'ev', role: 'evidence', emotion: 3, intent: 'x', narration: '于是有证据支持。', facts: [] },
    { id: 't', role: 'takeaway', emotion: 4, intent: 'x', narration: '最后记住要点。', facts: [] },
    { id: 'cta', role: 'cta', emotion: 2, intent: 'x', narration: '那么谢谢观看。', facts: [] }
  ] });
  // 预置校准：验证 G0 回读 calibration.json（回写→回读闭环）
  fs.writeFileSync(path.join(dir, 'calibration.json'), JSON.stringify({ 'local:Tingting': { charsPerSec: 5, samples: 1 } }));
  const r = run([dir]);
  assert.equal(r.code, 0, r.out);
  const md = fs.readFileSync(path.join(dir, 'reports', 'story-lint.md'), 'utf8');
  assert.ok(md.includes('G0'), '报告应含 G0 概览');
  assert.ok(/阻断 0/.test(md), '完整脚本应 B=0');
  assert.ok(/charsPerSec=5/.test(md), '应回读 calibration 的 charsPerSec=5');
});



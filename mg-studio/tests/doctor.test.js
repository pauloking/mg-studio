'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const doctor = require('../scripts/doctor');

test('doctor: checkNode 返回 Node 版本与布尔值', () => {
  const r = doctor.checkNode();
  assert.equal(r.name, 'Node.js');
  assert.equal(r.required, true);
  assert.equal(typeof r.ok, 'boolean');
  assert.ok(r.version.startsWith('v'));
});

test('doctor: checkFFmpeg 与 checkFFprobe 返回结构化字段', () => {
  const ffmpeg = doctor.checkFFmpeg();
  assert.equal(ffmpeg.name, 'ffmpeg');
  assert.equal(ffmpeg.required, true);
  assert.equal(typeof ffmpeg.ok, 'boolean');

  const ffprobe = doctor.checkFFprobe();
  assert.equal(ffprobe.name, 'ffprobe');
  assert.equal(ffprobe.required, true);
  assert.equal(typeof ffprobe.ok, 'boolean');
});

test('doctor: checkBrowser 检测浏览器可用性', () => {
  const b = doctor.checkBrowser();
  assert.ok(b.name.includes('浏览器'));
  assert.equal(b.required, true);
  assert.equal(typeof b.ok, 'boolean');
});

test('doctor: checkTTS 检测配音后端', () => {
  const tts = doctor.checkTTS();
  assert.equal(tts.name, 'TTS 配音后端');
  assert.equal(tts.required, true);
  assert.equal(typeof tts.ok, 'boolean');
});

test('doctor: checkPython 为可选依赖', () => {
  const py = doctor.checkPython();
  assert.equal(py.required, false);
  assert.equal(typeof py.ok, 'boolean');
});

test('doctor: runDiagnostics 汇总全部检查项', () => {
  const diag = doctor.runDiagnostics();
  assert.equal(typeof diag.ok, 'boolean');
  assert.ok(Array.isArray(diag.checks));
  assert.ok(diag.checks.length >= 5);
  const names = diag.checks.map(c => c.name);
  assert.ok(names.some(n => n.includes('Node')));
  assert.ok(names.some(n => n.includes('ffmpeg')));
  assert.ok(names.some(n => n.includes('ffprobe')));
});

test('doctor CLI: --json 输出有效 JSON 且退出码正确', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'doctor.js');
  const res = spawnSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
  assert.ok(res.stdout, '应有 stdout 输出');
  const parsed = JSON.parse(res.stdout);
  assert.equal(typeof parsed.ok, 'boolean');
  assert.ok(Array.isArray(parsed.checks));
  assert.equal(res.status, parsed.ok ? 0 : 1, '退出码应与整体就绪状态一致');
});

test('doctor CLI: --quiet 静默模式不输出冗余内容', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'doctor.js');
  const res = spawnSync('node', [scriptPath, '--quiet'], { encoding: 'utf8' });
  assert.equal(res.stdout.trim(), '', '静默模式 stdout 应为空');
  const diag = doctor.runDiagnostics();
  assert.equal(res.status, diag.ok ? 0 : 1, '退出码应与整体就绪状态一致');
});

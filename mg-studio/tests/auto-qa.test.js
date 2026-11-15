'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const qa = require('../scripts/auto_qa');

test('parseMeanVolume 取 mean_volume', () => {
  const s = '[Parsed_volumedetect_0 @ 0x1] mean_volume: -22.9 dB\nmax_volume: -1.2 dB';
  assert.equal(qa.parseMeanVolume(s), -22.9);
  assert.equal(qa.parseMeanVolume('no match'), null);
});

test('帧数不符 → B QA_FRAME_COUNT', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  fs.mkdirSync(path.join(dir, 'frames', 'all'), { recursive: true });
  for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(dir, 'frames', 'all', `f_${String(i).padStart(4, '0')}.png`), 'x');
  const tl = { fps: 30, totalFrames: 5, scenes: [{ id: 'a', start: 0, end: 5, dur: 0.1, audioStart: 0.1, subs: [] }] };
  const r = qa.runQA({ dir, timeline: tl, story: { meta: { audience: 'professional' }, beats: [] }, videoPath: null, skipMedia: true });
  assert.ok(r.diagnostics.some(d => d.level === 'B' && d.code === 'QA_FRAME_COUNT'));
});

test('runtimeError 非空 → B QA_RUNTIME', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  fs.mkdirSync(path.join(dir, 'frames', 'all'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'frames', 'render-status.json'), JSON.stringify({ runtimeError: 'boom' }));
  const tl = { fps: 30, totalFrames: 0, scenes: [] };
  const r = qa.runQA({ dir, timeline: tl, story: { meta: { audience: 'professional' }, beats: [] }, videoPath: null, skipMedia: true });
  assert.ok(r.diagnostics.some(d => d.level === 'B' && d.code === 'QA_RUNTIME'));
});

test('患者向 scene.html 缺 #disclaimer → B QA_DISCLAIMER', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  fs.mkdirSync(path.join(dir, 'frames', 'all'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scene.html'), '<html></html>');
  const tl = { fps: 30, totalFrames: 0, scenes: [] };
  const r = qa.runQA({ dir, timeline: tl, story: { meta: { audience: 'patient' }, beats: [] }, videoPath: null, skipMedia: true });
  assert.ok(r.diagnostics.some(d => d.level === 'B' && d.code === 'QA_DISCLAIMER'));
});
test('帧数一致 + 无 runtime → 无 B', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  fs.mkdirSync(path.join(dir, 'frames', 'all'), { recursive: true });
  for (let i = 0; i < 4; i++) fs.writeFileSync(path.join(dir, 'frames', 'all', `f_${String(i).padStart(4, '0')}.png`), 'x');
  const tl = { fps: 30, totalFrames: 4, scenes: [] };
  const r = qa.runQA({ dir, timeline: tl, story: { meta: { audience: 'professional' }, beats: [] }, videoPath: null, skipMedia: true });
  assert.equal(r.blocking.length, 0, JSON.stringify(r.diagnostics));
});

'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
function prepWork(name, fixture = 'mini-v2') {
  const work = path.join(ROOT, 'tests', 'work', name);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', fixture), work, { recursive: true });
  execFileSync('node', [path.join(ROOT, 'scripts', 'compile.js')], { cwd: work, stdio: 'pipe' });
  return work;
}
function syntheticTimeline(work, scenes) {
  const tl = { fps: 30, width: 1920, height: 1080, totalFrames: 0, scenes: [] };
  let cur = 0;
  for (const s of scenes) {
    const frames = Math.round(s.sec * 30);
    tl.scenes.push({ id: s.id, start: cur, end: cur + frames, audioStart: cur / 30 + 0.7, dur: s.audio || 3,
      subs: [{ text: s.sub || '字幕', from: cur / 30 + 0.7, to: cur / 30 + 0.7 + (s.audio || 3) }] });
    cur += frames;
  }
  tl.totalFrames = cur;
  fs.writeFileSync(path.join(work, 'timeline.json'), JSON.stringify(tl));
  return tl;
}
module.exports = { prepWork, syntheticTimeline, ROOT };
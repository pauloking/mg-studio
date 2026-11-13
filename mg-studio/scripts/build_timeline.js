#!/usr/bin/env node
/* build_timeline.js — 由配音实际时长反推帧级时间轴（确定性、可复现）
 * 输入: ./script.json + ./vo/<id>.wav
 * 输出: ./timeline.json
 * 用法: node build_timeline.js
 *
 * script.json 结构:
 * { fps, width, height,
 *   options?: { pad, leadIn, introLeadIn, introMinSec, outroMinSec },
 *   scenes: [ { id, minSec, narration, subs:[...], leadIn? } ] }
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'script.json'), 'utf8'));
const FPS = s.fps || 30;
const opt = Object.assign({ pad: 1.1, leadIn: 0.45, introLeadIn: 0.7, introMinSec: 6.5, outroMinSec: 8.5 }, s.options || {});

function durOf(file) {
  return parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`).toString().trim());
}

let cursor = 0;
const scenes = s.scenes.map((sc, idx) => {
  const wav = path.join(ROOT, 'vo', sc.id + '.wav');
  if (!fs.existsSync(wav)) { console.error('缺少配音文件:', wav, '（先运行 tts.js）'); process.exit(1); }
  const dur = durOf(wav);
  const isIntro = idx === 0, isOutro = idx === s.scenes.length - 1;
  const leadIn = sc.leadIn != null ? sc.leadIn : (isIntro ? opt.introLeadIn : opt.leadIn);
  const minSec = isIntro ? Math.max(sc.minSec || 0, opt.introMinSec)
    : isOutro ? Math.max(sc.minSec || 0, opt.outroMinSec)
    : (sc.minSec || 0);
  const sceneSec = Math.max(minSec, dur + opt.pad);
  const frames = Math.round(sceneSec * FPS);
  const start = cursor, end = cursor + frames; cursor = end;
  const audioStart = start / FPS + leadIn;
  const sceneEndSec = end / FPS;
  // 字幕窗口钳制到场景边界，避免换场残留
  const winFrom = audioStart, winTo = Math.min(audioStart + dur + 0.5, sceneEndSec - 0.05);
  const span = Math.max(winTo - winFrom, 0.1);
  const subs = (sc.subs && sc.subs.length ? sc.subs : [sc.narration]).map((text, k, arr) => ({
    text,
    from: winFrom + span * k / arr.length,
    to: winFrom + span * (k + 1) / arr.length
  }));
  return { id: sc.id, start, end, audioStart: +audioStart.toFixed(3), dur: +dur.toFixed(2), subs };
});

const tl = { fps: FPS, width: s.width || 1920, height: s.height || 1080, totalFrames: cursor, scenes };
fs.writeFileSync(path.join(ROOT, 'timeline.json'), JSON.stringify(tl, null, 1));

// 校验：场景首尾相接、旁白/字幕不越界
let ok = true, prev = 0;
for (const sc of tl.scenes) {
  if (sc.start !== prev) { ok = false; console.error('场景间隙:', sc.id); }
  prev = sc.end;
  if (sc.audioStart + sc.dur > sc.end / FPS + 0.01) { ok = false; console.error('旁白越界:', sc.id); }
  for (const cu of sc.subs) if (cu.from < sc.start / FPS - 0.01 || cu.to > sc.end / FPS + 0.001) { ok = false; console.error('字幕越界:', sc.id); }
}
console.log(ok ? 'timeline OK' : 'timeline ISSUES（见上）', '| 总长', (cursor / FPS).toFixed(2) + 's,', cursor, '帧');
scenes.forEach(sc => console.log(' ', sc.id, (sc.start / FPS).toFixed(2) + '–' + (sc.end / FPS).toFixed(2), 'audio@' + sc.audioStart));
process.exit(ok ? 0 : 1);
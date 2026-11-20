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
const { execFileSync } = require('child_process');
const { SAMPLE_RATE, validFrameTiming, preservedVoice, placeSubtitles } = require('../lib/shot-segment');

const ROOT = process.cwd();
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'script.json'), 'utf8'));
const FPS = s.fps || 30;
const opt = Object.assign({ pad: 1.1, leadIn: 0.45, introLeadIn: 0.7, introMinSec: 6.5, outroMinSec: 8.5 }, s.options || {});

// 参数数组调用，不拼 shell（scene.id 直通这里的路径也不再是注入面）
function durOf(file) {
  return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}

const fit = Number.isFinite(opt.fitDuration) && opt.fitDuration > 0;
function frameTiming(shot, dur) {
  const segment = shot.segment;
  if (segment && shot.minSec === segment.durationFrames / FPS && preservedVoice(ROOT, shot)) return segment;
  const pinned = opt.fitDuration === opt.framePlan?.target ? opt.framePlan?.shots?.[shot.id] : null;
  if (validFrameTiming(pinned) && pinned.narration === shot.narration && pinned.minSec === shot.minSec &&
      pinned.dur === +dur.toFixed(2) && pinned.leadSamples / SAMPLE_RATE + dur <= pinned.durationFrames / FPS + 0.001) return pinned;
  return null;
}
const timing = s.scenes.map((sc, idx) => {
  const wav = path.join(ROOT, 'vo', sc.id + '.wav');
  if (!fs.existsSync(wav)) { console.error('缺少配音文件:', wav, '（先运行 tts.js）'); process.exit(1); }
  const dur = durOf(wav);
  const fixed = frameTiming(sc, dur);
  if (fixed) {
    const leadIn = fixed.leadSamples / SAMPLE_RATE;
    return { leadIn, dur, fixed, floor: fixed.durationFrames, frames: fixed.durationFrames };
  }
  const isIntro = idx === 0, isOutro = idx === s.scenes.length - 1;
  const leadIn = sc.leadIn != null ? sc.leadIn : (isIntro ? opt.introLeadIn : opt.leadIn);
  const minSec = isIntro ? Math.max(sc.minSec || 0, opt.introMinSec)
    : isOutro ? Math.max(sc.minSec || 0, opt.outroMinSec)
    : (sc.minSec || 0);
  const planned = Math.round(Math.max(minSec, dur + opt.pad) * FPS);
  const floor = Math.ceil((leadIn + dur + 0.15) * FPS);
  return { leadIn, dur, floor, frames: fit ? Math.max(planned, floor) : planned };
});
const reservedFrames = timing.reduce((sum, shot) => sum + shot.floor, 0);
const speechFrames = timing.reduce((sum, shot) => sum + Math.min(shot.frames, Math.ceil((shot.leadIn + shot.dur + .15) * FPS)), 0);
const naturalFrames = timing.reduce((sum, shot) => sum + shot.frames, 0);
const targetFrames = Math.round(opt.fitDuration * FPS);
if (fit && targetFrames < naturalFrames && reservedFrames < naturalFrames) {
  const slack = Math.max(0, targetFrames - reservedFrames);
  let used = 0, scaled = 0;
  for (const shot of timing) {
    used += shot.frames - shot.floor;
    const cumulative = Math.round(used * slack / (naturalFrames - reservedFrames));
    shot.frames = shot.floor + cumulative - scaled;
    scaled = cumulative;
  }
}
let cursor = 0;
const scenes = s.scenes.map((sc, idx) => {
  const { frames, dur, leadIn, fixed } = timing[idx];
  const start = cursor, end = cursor + frames; cursor = end;
  const audioStart = start / FPS + leadIn;
  if (fixed) return { id: sc.id, start, end, audioStart, dur: +dur.toFixed(2),
    subs: placeSubtitles(fixed.subs, start / FPS) };
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
if (fit) tl.fit = { target: opt.fitDuration, actual: cursor / FPS, speechFloor: speechFrames / FPS };
fs.writeFileSync(path.join(ROOT, 'timeline.json'), JSON.stringify(tl, null, 1));

// 语速校准回写（§7）：用实测音频时长反推 charsPerSec，按 backend+voice 分键持久化，供 lintScript 自校准。
try {
  const cal = require('../lib/calibrate');
  const ttsCfg = s.tts || {};
  const pairs = scenes.map((sc, i) => ({ chars: (s.scenes[i].narration || '').length, dur: sc.dur }));
  const cps = cal.charsPerSecFromPairs(pairs);
  if (cps) cal.writeCalibrationSample(ROOT, cal.keyOf(ttsCfg.backend, ttsCfg.voice), cps);
} catch (e) { /* 校准是增强项，失败不阻断时间轴 */ }

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

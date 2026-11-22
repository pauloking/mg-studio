#!/usr/bin/env node
/* assemble_audio.js — 旁白按时间轴精确落位 + 程序化原创 BGM（无版权风险）
 * 输入: ./timeline.json + ./vo/<id>.wav（44100 单声道 16bit）
 * 输出: ./vo/narration.wav（旁白轨）+ ./vo/bgm.wav（背景垫，可用 BGM=0 关闭）
 * 用法: node assemble_audio.js
 * 混音建议: ffmpeg ... [2:a]volume=0.25[bg];[1:a][bg]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.98[a]
 */
const fs = require('fs');
const path = require('path');
const { narrationRevisionFile } = require('../lib/voice-settings');
const tl = require(path.join(process.cwd(), 'timeline.json'));
const SR = 44100;
const totalSec = tl.totalFrames / tl.fps;
const N = Math.ceil(totalSec * SR);

function readWav(file) {
  const buf = fs.readFileSync(file);
  let off = 12;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') {
      const samples = new Float32Array(size / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(off + 8 + i * 2) / 32768;
      return samples;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('no data chunk: ' + file);
}
function writeWav(file, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

const vo = new Float32Array(N);
for (const sc of tl.scenes) {
  const samples = readWav(path.join(process.cwd(), 'vo', sc.id + '.wav'));
  const start = Math.round(sc.audioStart * SR);
  for (let i = 0; i < samples.length && start + i < N; i++) vo[start + i] += samples[i] * 0.95;
}
writeWav(path.join(process.cwd(), 'vo', 'narration.wav'), vo);
const revisionFile = narrationRevisionFile(process.cwd());
if (tl.voiceRevision) fs.writeFileSync(revisionFile, tl.voiceRevision);
else fs.rmSync(revisionFile, { force: true });
console.log('narration.wav', totalSec.toFixed(2) + 's');

if (process.env.BGM === '0') { console.log('BGM 已跳过 (BGM=0)'); return; }

const bgm = new Float32Array(N);
const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 261.63, 329.63], [196, 246.94, 293.66]];
const chordDur = totalSec / 8;
for (let c = 0; c < 8; c++) {
  const freqs = chords[c % 4], t0 = c * chordDur;
  for (const f of freqs) for (const [mult, det, g] of [[1, 0, 0.055], [1, 1.003, 0.03], [2, 0, 0.012]]) {
    const w = 2 * Math.PI * f * mult * det;
    const i0 = Math.floor(t0 * SR), i1 = Math.min(N, Math.floor((t0 + chordDur + 1.2) * SR));
    for (let i = i0; i < i1; i++) {
      const t = i / SR - t0;
      const env = Math.min(1, t / 1.6) * Math.min(1, Math.max(0, (chordDur + 1.2 - t) / 1.6));
      const trem = 1 + 0.12 * Math.sin(2 * Math.PI * 0.15 * t + f);
      bgm[i] += g * env * trem * Math.sin(w * (i / SR));
    }
  }
}
const penta = [440, 523.25, 587.33, 659.25, 783.99];
const seq = [0, 2, 4, 3, 1, 3, 2, 0, 4, 2, 3, 1];
for (let k = 0; k * 1.85 < totalSec - 1; k++) {
  const f = penta[seq[k % seq.length]], t0 = k * 1.85 + 0.9;
  const i0 = Math.floor(t0 * SR), i1 = Math.min(N, Math.floor((t0 + 1.6) * SR));
  const w = 2 * Math.PI * f;
  for (let i = i0; i < i1; i++) { const t = i / SR - t0; bgm[i] += 0.045 * Math.exp(-t * 2.6) * Math.sin(w * t) * Math.min(1, t / 0.02); }
}
const fade = Math.floor(2 * SR);
for (let i = 0; i < fade; i++) { bgm[i] *= i / fade; bgm[N - 1 - i] *= i / fade; }
writeWav(path.join(process.cwd(), 'vo', 'bgm.wav'), bgm);
console.log('bgm.wav', totalSec.toFixed(2) + 's');

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FPS = 30;
const SAMPLE_RATE = 44100;
const SAMPLES_PER_FRAME = SAMPLE_RATE / FPS;

function validFrameTiming(timing) {
  if (!timing || typeof timing !== 'object') return false;
  const { durationFrames, leadSamples, narration, subs } = timing;
  return Number.isSafeInteger(durationFrames) && durationFrames > 0 && durationFrames <= 18000 &&
    Number.isSafeInteger(leadSamples) && leadSamples >= 0 && leadSamples < durationFrames * SAMPLES_PER_FRAME &&
    typeof narration === 'string' && narration.trim().length > 0 &&
    Array.isArray(subs) && subs.length > 0 && subs.every(cue =>
      cue && typeof cue.text === 'string' && cue.text.trim() && cue.text.length <= 18 &&
      Number.isFinite(cue.from) && Number.isFinite(cue.to) && cue.from >= 0 && cue.to > cue.from && cue.to <= durationFrames / FPS + 1e-8 &&
      (cue.fadeFrom == null || Number.isFinite(cue.fadeFrom)) && (cue.fadeTo == null || Number.isFinite(cue.fadeTo)));
}

function validSegment(segment) {
  if (!validFrameTiming(segment)) return false;
  const { from, frames, total, take } = segment;
  return [from, frames, total].every(Number.isFinite) &&
    from >= 0 && frames > 0 && from + frames <= total + 1e-8 && total <= 18000 &&
    typeof take === 'string' && /^[a-f0-9]{32}$/.test(take);
}

function takePath(dir, take) {
  if (typeof take !== 'string' || !/^[a-f0-9]{32}$/.test(take)) throw new Error('无效的拆镜旁白编号。');
  return path.join(dir, 'takes', take + '.wav');
}

function preservedVoice(dir, scene) {
  const clip = scene.segment;
  if (!validSegment(clip) || clip.narration !== scene.narration) return null;
  const file = takePath(dir, clip.take);
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile() ||
      !fs.realpathSync(file).startsWith(fs.realpathSync(dir) + path.sep)) {
    throw new Error('缺少拆镜时保存的旁白：' + scene.id);
  }
  return file;
}

function wavSamples(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('配音文件不是 WAV。');
  }
  let formatOK = false;
  for (let start = 12; start <= buf.length - 8;) {
    const type = buf.toString('ascii', start, start + 4);
    const size = buf.readUInt32LE(start + 4);
    const offset = start + 8;
    if (offset + size > buf.length) break;
    if (type === 'fmt ' && size >= 16) {
      formatOK = buf.readUInt16LE(offset) === 1 && buf.readUInt16LE(offset + 2) === 1 &&
        buf.readUInt32LE(offset + 4) === SAMPLE_RATE && buf.readUInt16LE(offset + 14) === 16;
    }
    if (type === 'data' && formatOK && size % 2 === 0) return buf.subarray(offset, offset + size);
    start = offset + size + (size % 2);
  }
  throw new Error('拆镜需要 44.1 kHz 单声道 PCM 配音，请先重新配音。');
}

function pcmWav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function placeSubtitles(subs, offset) {
  return subs.map(cue => ({ text: cue.text, from: offset + cue.from, to: offset + cue.to,
    ...(cue.fadeFrom != null ? { fadeFrom: offset + cue.fadeFrom } : {}),
    ...(cue.fadeTo != null ? { fadeTo: offset + cue.fadeTo } : {}) }));
}

module.exports = { FPS, SAMPLE_RATE, SAMPLES_PER_FRAME, validSegment, validFrameTiming, takePath, preservedVoice, wavSamples, pcmWav, placeSubtitles };

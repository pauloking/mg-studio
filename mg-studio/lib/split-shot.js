'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { compileProject } = require('./compile');
const { checkSubs } = require('./subs');
const { pendingShots, updateReview } = require('./director-review');
const { projectFilePath, sceneFilePath } = require('./project-files');
const { atomicWrite, readShot } = require('./save-shot');
const { FPS, SAMPLE_RATE, SAMPLES_PER_FRAME, wavSamples, pcmWav, takePath, preservedVoice, placeSubtitles } = require('./shot-segment');
const { hasCurrentNarration } = require('./voice-settings');

function unavailable(message) {
  return Object.assign(new Error(message), { statusCode: 422 });
}

function relativeTiming(shot, start = shot.start, end = shot.end, subs = shot.subs) {
  return {
    durationFrames: end - start,
    leadSamples: Math.max(0, Math.round(shot.audioStart * SAMPLE_RATE) - start * SAMPLES_PER_FRAME),
    subs: subs.map(cue => {
      const from = Math.max(start / FPS, cue.from);
      const to = Math.min(end / FPS, cue.to);
      const fadeFrom = cue.fadeFrom ?? cue.from;
      const fadeTo = cue.fadeTo ?? cue.to;
      const offset = start / FPS;
      return { text: cue.text, from: from - offset, to: to - offset,
        ...(fadeFrom !== from ? { fadeFrom: fadeFrom - offset } : {}),
        ...(fadeTo !== to ? { fadeTo: fadeTo - offset } : {}) };
    })
  };
}

function signature({ scene, beat }) {
  return createHash('sha256').update(JSON.stringify([scene, beat])).digest('hex');
}

function commitSplit(dir, changes) {
  const previous = new Map();
  try {
    for (const [file, contents] of changes) {
      previous.set(file, fs.existsSync(file) ? fs.readFileSync(file) : null);
      if (contents === null) fs.rmSync(file, { force: true });
      else atomicWrite(file, contents);
    }
    const result = compileProject(dir);
    if (result.errors.length) throw unavailable(result.errors.join('；'));
  } catch (error) {
    for (const [file, before] of previous) {
      if (before) atomicWrite(file, before);
      else fs.rmSync(file, { force: true });
    }
    throw error;
  }
}

function splitShot(dir, current, frame) {
  const { story, index, scene, beat, storyPath, scenePath } = current;
  const timelinePath = projectFilePath(dir, 'timeline.json');
  const audioDir = path.join(dir, 'vo');
  const voiceRevision = story.meta.tts?.revision;
  if (!fs.existsSync(timelinePath) || !hasCurrentNarration(dir, voiceRevision)) {
    throw unavailable('请先给当前工程配音，拆镜会保留现有旁白和字幕。');
  }
  if (!fs.lstatSync(audioDir).isDirectory()) throw unavailable('工程配音目录无效。');
  const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  const shot = timeline.scenes?.[index];
  if (!shot || timeline.fps !== FPS || timeline.scenes.length !== story.beats.length ||
      timeline.scenes.some((part, i) => part.id !== story.beats[i].id) || !Number.isSafeInteger(frame) ||
      frame <= shot.start || frame >= shot.end) {
    throw unavailable('请把播放头放到要拆分的镜头内。');
  }
  if (!checkSubs(shot.subs.map(cue => cue.text), beat.narration).ok) {
    throw unavailable('当前旁白尚未更新，请重新配音后再拆分。');
  }
  const voiceFile = path.join(audioDir, scene.id + '.wav');
  const pcm = wavSamples(fs.readFileSync(voiceFile));
  const audioStart = Math.round(shot.audioStart * SAMPLE_RATE);
  const candidates = shot.subs.slice(1).map((cue, i) => ({
    frame: Math.round((shot.subs[i].to + cue.from) / 2 * FPS), cueIndex: i + 1
  })).filter(point => {
    const sample = point.frame * SAMPLES_PER_FRAME - audioStart;
    return point.frame - shot.start >= 18 && shot.end - point.frame >= 18 && sample > 0 && sample < pcm.length / 2;
  });
  candidates.sort((a, b) => Math.abs(a.frame - frame) - Math.abs(b.frame - frame));
  if (!candidates.length) throw unavailable('这一镜没有可用的字幕分界。两段需各有一句字幕和至少 0.6 秒画面。');

  const cut = candidates[0];
  const nextId = 'shot_' + randomUUID().replaceAll('-', '').slice(0, 16);
  const midpoint = (cut.frame * SAMPLES_PER_FRAME - audioStart) * 2;
  const sourceFrom = scene.segment?.from || 0;
  const sourceFrames = scene.segment?.frames || shot.end - shot.start;
  const phase = frameAt => sourceFrom + (frameAt - shot.start) * sourceFrames / (shot.end - shot.start);
  const makePart = (start, end, subs, bytes, id) => {
    const narration = subs.map(cue => cue.text).join('').trim();
    const timing = relativeTiming(shot, start, end, subs);
    const segment = { ...timing, from: phase(start), frames: phase(end) - phase(start),
      total: scene.segment?.total || shot.end - shot.start,
      take: randomUUID().replaceAll('-', ''), narration, voiceRevision };
    return { beat: { ...beat, id, narration }, scene: { ...scene, id, beat: id, minSec: (end - start) / FPS,
      segment, subsOverride: subs.map(cue => cue.text) },
      timeline: { ...shot, id, start, end, audioStart: (start * SAMPLES_PER_FRAME + timing.leadSamples) / SAMPLE_RATE,
        dur: +(bytes.length / 2 / SAMPLE_RATE).toFixed(2),
        subs: placeSubtitles(timing.subs, start / FPS) },
      wav: pcmWav(bytes) };
  };
  const left = makePart(shot.start, cut.frame, shot.subs.slice(0, cut.cueIndex), pcm.subarray(0, midpoint), scene.id);
  const right = makePart(cut.frame, shot.end, shot.subs.slice(cut.cueIndex), pcm.subarray(midpoint), nextId);
  right.beat.intent += '（续）';
  // Keep the conclusion role and disclaimer on the final part of the original shot.
  if (['takeaway', 'summary', 'cta'].includes(beat.role)) left.beat.role = 'mechanism';

  const compiled = JSON.parse(fs.readFileSync(projectFilePath(dir, 'script.json'), 'utf8'));
  const pending = pendingShots(story);
  story.beats.splice(index, 1, left.beat, right.beat);
  updateReview(story, [...pending, scene.id, nextId]);
  // Rebuilding unchanged speech for export must retain the same neighboring timings as the workbench.
  story.meta.director.framePlan = {
    target: compiled.options?.fitDuration,
    voiceRevision,
    shots: Object.fromEntries(timeline.scenes.filter(part => part.id !== scene.id).map(part => {
      const input = compiled.scenes.find(item => item.id === part.id);
      return [part.id, { ...relativeTiming(part), narration: input.narration, minSec: input.minSec, dur: part.dur }];
    }))
  };
  timeline.scenes.splice(index, 1, left.timeline, right.timeline);
  const takeDir = path.join(dir, 'takes');
  fs.mkdirSync(takeDir, { recursive: true });
  if (!fs.lstatSync(takeDir).isDirectory()) throw unavailable('工程旁白目录无效。');
  const changes = [
    [scenePath, JSON.stringify(left.scene, null, 2)],
    [sceneFilePath(dir, nextId), JSON.stringify(right.scene, null, 2)],
    [storyPath, JSON.stringify(story, null, 2)],
    [takePath(dir, left.scene.segment.take), left.wav],
    [takePath(dir, right.scene.segment.take), right.wav],
    [voiceFile, left.wav],
    [path.join(audioDir, nextId + '.wav'), right.wav],
    [timelinePath, JSON.stringify(timeline, null, 1)]
  ];
  const historyPath = projectFilePath(dir, 'director-undo.json');
  const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : {};
  history[scene.id] = { scene, beat, split: {
    rightId: nextId, leftSignature: signature(left), rightSignature: signature(right),
    timing: relativeTiming(shot), dur: shot.dur, neededReview: pending.includes(scene.id)
  } };
  history[nextId] = { splitParent: scene.id };
  changes.push([historyPath, JSON.stringify(history)]);
  const voiceManifest = path.join(audioDir, 'voices.json');
  if (fs.existsSync(voiceManifest)) {
    const signatures = JSON.parse(fs.readFileSync(voiceManifest, 'utf8'));
    delete signatures[scene.id];
    changes.push([voiceManifest, JSON.stringify(signatures)]);
  }
  commitSplit(dir, changes);
  return { id: nextId, frame: cut.frame };
}

function undoSplit(dir, leftId, history, historyPath) {
  const original = history[leftId];
  if (!original?.split) throw unavailable('找不到可撤销的拆镜。');
  const { rightId, leftSignature, rightSignature, timing, dur, neededReview } = original.split;
  const left = readShot(dir, leftId);
  const story = left.story;
  const right = story.beats[left.index + 1]?.id === rightId ? readShot(dir, rightId) : null;
  if (!right || signature(left) !== leftSignature || signature(right) !== rightSignature ||
      story.meta.director.locked?.some(id => id === leftId || id === rightId)) {
    throw unavailable('两段有修改、已锁定或不再相邻，无法撤销这次拆镜。');
  }
  const timelinePath = projectFilePath(dir, 'timeline.json');
  const timeline = fs.existsSync(timelinePath) ? JSON.parse(fs.readFileSync(timelinePath, 'utf8')) : null;
  const first = timeline?.scenes[left.index];
  const second = timeline?.scenes[left.index + 1];
  const start = first?.id === leftId ? first.start : 0;
  const revision = story.meta.tts?.revision;
  const revoice = left.scene.segment.voiceRevision !== revision;
  let audio = null;
  if (!revoice) {
    if (first?.id !== leftId || second?.id !== rightId || second.end - first.start !== timing.durationFrames) {
      throw unavailable('当前时间轴与拆分后的镜头不一致。');
    }
    const merge = [left, right].map(part =>
      preservedVoice(dir, { ...part.scene, narration: part.beat.narration }, revision));
    audio = pcmWav(Buffer.concat(merge.map(file => wavSamples(fs.readFileSync(file)))));
    timeline.scenes.splice(left.index, 2, { id: leftId, start, end: second.end, dur,
      audioStart: (start * SAMPLES_PER_FRAME + timing.leadSamples) / SAMPLE_RATE,
      subs: placeSubtitles(timing.subs, start / FPS) });
  }
  const pending = pendingShots(story).filter(id => id !== leftId && id !== rightId);
  story.beats.splice(left.index, 2, original.beat);
  updateReview(story, neededReview ? [...pending, leftId] : pending);
  const plan = story.meta.director.framePlan?.shots;
  if (plan) {
    delete plan[rightId];
    if (revoice) delete plan[leftId];
    else plan[leftId] = { ...timing, narration: original.beat.narration, minSec: original.scene.minSec, dur };
  }
  delete history[leftId];
  delete history[rightId];
  commitSplit(dir, [
    [left.scenePath, JSON.stringify(original.scene, null, 2)],
    [right.scenePath, null],
    [left.storyPath, JSON.stringify(story, null, 2)],
    [timelinePath, revoice ? null : JSON.stringify(timeline, null, 1)],
    ...(revoice ? [[path.join(dir, 'vo', 'narration.wav'), null]] : []),
    [path.join(dir, 'vo', leftId + '.wav'), audio],
    [path.join(dir, 'vo', rightId + '.wav'), null],
    [historyPath, JSON.stringify(history)],
    ...[left, right].map(part => [takePath(dir, part.scene.segment.take), null])
  ]);
  return { id: leftId, frame: start, revoice };
}

module.exports = { splitShot, undoSplit };

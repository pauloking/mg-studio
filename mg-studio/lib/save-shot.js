'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { compileProject } = require('./compile');
const { projectFilePath, sceneFilePath, validateSceneUpdate } = require('./project-files');
const { validateStory } = require('./ir');
const { pendingShots, contentSignature, updateReview } = require('./director-review');

function atomicWrite(filename, text) {
  const temporary = path.join(path.dirname(filename), '.' + randomUUID() + '.tmp');
  try {
    fs.writeFileSync(temporary, text, { flag: 'wx' });
    fs.renameSync(temporary, filename);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function readShot(dir, id) {
  const storyPath = projectFilePath(dir, 'story.json');
  const scenePath = sceneFilePath(dir, id);
  const storyRaw = fs.readFileSync(storyPath, 'utf8');
  const story = JSON.parse(storyRaw);
  const index = story.beats.findIndex(beat => beat.id === id);
  if (index < 0) throw Object.assign(new Error('找不到指定镜头。'), { statusCode: 400 });
  const sceneRaw = fs.readFileSync(scenePath, 'utf8');
  const scene = JSON.parse(sceneRaw);
  return { storyPath, scenePath, storyRaw, sceneRaw, story, scene, index, beat: story.beats[index] };
}

function saveShot(dir, current, scene, beat, { sharedRoute } = {}) {
  const { story, index, storyPath, scenePath, storyRaw, sceneRaw } = current;
  if (scene.id !== current.scene.id || beat.id !== current.beat.id) throw new Error('镜头编号有误。');
  const narrationChanged = current.beat.narration !== beat.narration;
  const timingChanged = scene.minSec !== current.scene.minSec;
  if (narrationChanged) delete scene.subsOverride;
  const nextStory = { ...story, beats: story.beats.map((value, i) => i === index ? beat : value) };
  const affected = [];
  if (sharedRoute !== undefined) {
    const stage = scene.stage?.id;
    const stages = story.meta.director?.sharedStages || {};
    if (!Object.hasOwn(stages, stage)) throw Object.assign(new Error('找不到要编辑的共享水路。'), { statusCode: 422 });
    if (JSON.stringify(stages[stage].route) !== JSON.stringify(sharedRoute)) {
      for (const item of story.beats) {
        if (readShot(dir, item.id).scene.stage?.id !== stage) continue;
        if (story.meta.director.locked?.includes(item.id)) {
          throw Object.assign(new Error('共享水路影响已锁定的镜头，请解锁后再改水路。'), { statusCode: 409 });
        }
        affected.push(item.id);
      }
      nextStory.meta = { ...story.meta, director: { ...story.meta.director,
        sharedStages: { ...stages, [stage]: { ...stages[stage], route: sharedRoute } } } };
    }
  }
  if (nextStory.meta.director && nextStory.meta.audience === 'patient') {
    nextStory.meta = { ...nextStory.meta, director: { ...nextStory.meta.director } };
    const pending = [...pendingShots(story), ...affected];
    if (contentSignature(scene, beat) !== contentSignature(current.scene, current.beat)) pending.push(beat.id);
    updateReview(nextStory, pending);
  }
  validateSceneUpdate(scene, nextStory);
  const validation = validateStory(nextStory);
  if (!validation.ok) throw Object.assign(new Error(validation.errors.join('；')), { statusCode: 422 });
  try {
    atomicWrite(scenePath, JSON.stringify(scene, null, 2));
    atomicWrite(storyPath, JSON.stringify(nextStory, null, 2));
    const result = compileProject(dir);
    if (result.errors?.length) throw Object.assign(new Error(result.errors.join('；')), { statusCode: 422 });
    if (narrationChanged || timingChanged) fs.rmSync(path.join(dir, 'vo', 'narration.wav'), { force: true });
    return { narrationChanged, timingChanged, pendingReview: nextStory.meta.director?.pendingReview, compile: result };
  } catch (error) {
    atomicWrite(scenePath, sceneRaw);
    atomicWrite(storyPath, storyRaw);
    compileProject(dir);
    throw error;
  }
}

module.exports = { atomicWrite, readShot, saveShot };

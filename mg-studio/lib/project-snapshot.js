'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compileProject } = require('./compile');
const { copyAssets } = require('./project-assets');
const { projectFilePath, sceneFilePath } = require('./project-files');
const { takePath } = require('./shot-segment');

function copyFiles(dir, staging, files) {
  for (const file of files) {
    const source = path.join(dir, file);
    if (!fs.existsSync(source) || !fs.lstatSync(source).isFile() ||
        !fs.realpathSync(source).startsWith(fs.realpathSync(dir) + path.sep)) continue;
    const dest = path.join(staging, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
  }
}

function projectSnapshot(dir, alternate) {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-studio-snapshot-'));
  try {
    const storyFile = projectFilePath(dir, 'story.json');
    const story = JSON.parse(fs.readFileSync(storyFile, 'utf8'));
    if (alternate) {
      const i = story.beats.findIndex(beat => beat.id === alternate.beat.id);
      if (i < 0) throw new Error('找不到预览镜头。');
      story.beats[i] = alternate.beat;
    }
    fs.writeFileSync(path.join(staging, 'story.json'), JSON.stringify(story, null, 2));
    fs.mkdirSync(path.join(staging, 'scenes'));
    const takes = new Set();
    for (const beat of story.beats) {
      const sceneFile = path.join(staging, 'scenes', beat.id + '.json');
      const source = sceneFilePath(dir, beat.id);
      const contents = alternate?.scene.id === beat.id ? JSON.stringify(alternate.scene) : fs.readFileSync(source, 'utf8');
      fs.writeFileSync(sceneFile, contents);
      const take = JSON.parse(contents).segment?.take;
      if (take) takes.add(path.relative(dir, takePath(dir, take)));
    }
    copyFiles(dir, staging, ['tokens.json', 'vo/bgm.wav', 'vo/voices.json', ...takes, ...story.beats.map(beat => 'vo/' + beat.id + '.wav')]);
    copyAssets(dir, staging);
    return staging;
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function previewSnapshot(dir, alternate, sameTiming) {
  const staging = projectSnapshot(dir, alternate);
  try {
    const result = compileProject(staging);
    if (result.errors.length) throw Object.assign(new Error(result.errors.join('；')), { statusCode: 422 });
    if (sameTiming) copyFiles(dir, staging, ['timeline.json', 'vo/narration.wav']);
    return staging;
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { projectSnapshot, previewSnapshot };

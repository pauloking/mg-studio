'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createFromBrief } = require('../lib/director');
const { writeAndCompileGeneratedProject } = require('../lib/ai-generator');
const { projectSnapshot } = require('../lib/project-snapshot');
const { createStudioServer } = require('../scripts/studio');
const { SAMPLE_RATE, pcmWav, wavSamples } = require('../lib/shot-segment');
const studioFetch = require('./helpers/studio-fetch');

test('playhead split preserves source PCM and after export rebuild, and can be undone from the second part', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-split-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'project');
  const definition = await createFromBrief({ sample: 'journey' });
  assert.ok(writeAndCompileGeneratedProject(dir, definition).ok);
  fs.mkdirSync(path.join(dir, 'vo'));
  const voice = Buffer.alloc(5 * SAMPLE_RATE * 2);
  for (let i = 0; i < voice.length / 2; i++) voice.writeInt16LE(i % 97 - 48, i * 2);
  for (const { id } of definition.scenes) fs.writeFileSync(path.join(dir, 'vo', id + '.wav'), pcmWav(voice));
  const runner = (name, cwd = dir, ...args) => execFileSync(process.execPath, [path.join(__dirname, '../scripts', name), ...args], { cwd });
  runner('build_timeline.js');
  runner('assemble_audio.js');
  const voiceTrack = fs.readFileSync(path.join(dir, 'vo/narration.wav'));
  const tl = () => JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json')));
  const before = tl();
  const original = before.scenes[2];
  const studio = createStudioServer({ projectDir: dir, port: 0 });
  const { port } = await studio.start();
  t.after(() => studio.close());
  const send = async body => (await studioFetch(studio)('http://127.0.0.1:' + port + '/api/director/shot', {
    method: 'POST', body: JSON.stringify(body)
  })).json();
  assert.equal((await send({ id: original.id, action: 'split', frame: original.start - 1 })).ok, false);
  const split = await send({ id: original.id, action: 'split', frame: original.start + 75 });
  assert.ok(split.ok, split.error);
  const after = tl();
  assert.equal(after.totalFrames, before.totalFrames);
  assert.deepEqual(after.scenes.slice(4), before.scenes.slice(3));
  const read = id => wavSamples(fs.readFileSync(path.join(dir, 'vo', id + '.wav')));
  assert.deepEqual(Buffer.concat([read(original.id), read(split.id)]), voice);

  const snapshot = projectSnapshot(dir);
  t.after(() => fs.rmSync(snapshot, { recursive: true, force: true }));
  runner('compile.js', snapshot);
  runner('tts.js', snapshot, '--only', original.id + ',' + split.id, '--reuse');
  runner('build_timeline.js', snapshot);
  runner('assemble_audio.js', snapshot);
  assert.deepEqual(fs.readFileSync(path.join(snapshot, 'vo/narration.wav')), voiceTrack);
  const built = JSON.parse(fs.readFileSync(path.join(snapshot, 'timeline.json')));
  assert.deepEqual(built.scenes.map(shot => [shot.id, shot.start, shot.end]), after.scenes.map(shot => [shot.id, shot.start, shot.end]));
  const undone = await send({ id: split.id, action: 'undo' });
  assert.ok(undone.splitUndo, undone.error);
  assert.deepEqual(read(original.id), voice);
  assert.deepEqual(tl().scenes.map(shot => [shot.id, shot.start, shot.end]), before.scenes.map(shot => [shot.id, shot.start, shot.end]));
  assert.equal(fs.existsSync(path.join(dir, 'scenes', split.id + '.json')), false);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { compileProject } = require('../lib/compile');
const fc = require('../lib/fcache');
const { syntheticTimeline } = require('./helpers/work');

test('render cache: resolved story styles, disclaimer and timeline changes invalidate actual rendered frames', { timeout: 60000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-cache-'));
  fs.cpSync(path.join(__dirname, 'fixtures', 'mini-style-medical'), dir, { recursive: true });
  const storyFile = path.join(dir, 'story.json');
  const story = JSON.parse(fs.readFileSync(storyFile));
  const render = () => execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'render.js'), '--all'], {
    cwd: dir, encoding: 'utf8', timeout: 15000, env: process.env
  });
  const compile = () => {
    fs.writeFileSync(storyFile, JSON.stringify(story));
    const r = compileProject(dir); assert.deepEqual(r.errors, []);
  };
  try {
    assert.equal(fs.existsSync(path.join(dir, 'tokens.json')), false);
    compile();
    syntheticTimeline(dir, [{ id: 'hook', sec: 1 / 30 }, { id: 'takeaway', sec: 1 / 30 }]);
    assert.match(render(), /rendered 2 skipped 0/);
    assert.match(render(), /rendered 0 skipped 2/);
    const old = fc.loadIndex(dir).hook.visualHash;
    const oldFrame = fs.readFileSync(path.join(dir, 'frames/hook/f_0000.png'));
    story.meta.style = 'warm-editorial'; compile();
    assert.match(render(), /rendered 2 skipped 0/);
    assert.notEqual(fc.loadIndex(dir).hook.visualHash, old);
    assert.notDeepEqual(fs.readFileSync(path.join(dir, 'frames/hook/f_0000.png')), oldFrame);
    const styleHash = fc.loadIndex(dir).hook.visualHash;
    story.meta.audience = 'patient'; story.beats[1].narration += '本视频为健康科普，不构成诊疗建议。'; compile();
    assert.match(render(), /rendered 2 skipped 0/);
    assert.notEqual(fc.loadIndex(dir).hook.visualHash, styleHash, 'unchanged hook must gain disclaimer');
    const timeline = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json')));
    timeline.scenes[0].subs[0].text = '更换字幕但不改帧数';
    fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline));
    assert.match(render(), /rendered 1 skipped 1/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

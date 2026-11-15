'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const B = (cwd, args) => execFileSync('node', args, { cwd, env: Object.assign({}, process.env, { NODE_PATH: '/opt/homebrew/lib/node_modules' }), encoding: 'utf8' });

function prep() {
  const work = path.join(ROOT, 'tests', 'work', 'incr');
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'mini-v2'), work, { recursive: true });
  B(work, [path.join(ROOT, 'scripts', 'compile.js')]);
  B(work, [path.join(ROOT, 'scripts', 'tts.js'), '--backend', 'local']);
  B(work, [path.join(ROOT, 'scripts', 'build_timeline.js')]);
  return work;
}

test('render --all：产出 frames/<id>/ + cache/index.json + render-status', { timeout: 240000 }, () => {
  const work = prep();
  B(work, [path.join(ROOT, 'scripts', 'render.js'), '--all']);
  const tl = JSON.parse(fs.readFileSync(path.join(work, 'timeline.json'), 'utf8'));
  for (const sc of tl.scenes) {
    const d = path.join(work, 'frames', sc.id);
    assert.ok(fs.existsSync(d), 'scene 目录应存在 ' + sc.id);
    assert.equal(fs.readdirSync(d).filter(f => f.endsWith('.png')).length, sc.end - sc.start);
  }
  assert.ok(fs.existsSync(path.join(work, 'frames', 'cache', 'index.json')));
  assert.ok(fs.existsSync(path.join(work, 'frames', 'render-status.json')));
});

test('增量：换配音后仅重渲时长变化的 scene', { timeout: 300000 }, () => {
  const work = prep();
  B(work, [path.join(ROOT, 'scripts', 'render.js'), '--all']);
  const idx1 = JSON.parse(fs.readFileSync(path.join(work, 'frames', 'cache', 'index.json'), 'utf8'));
  // 改最后一个 beat 的旁白 → 音量/时长变化 → 仅该 scene 帧数变
  const story = JSON.parse(fs.readFileSync(path.join(work, 'story.json'), 'utf8'));
  const target = story.beats[story.beats.length - 1].id;
  story.beats[story.beats.length - 1].narration += '（加长一句以使时长变化）';
  fs.writeFileSync(path.join(work, 'story.json'), JSON.stringify(story, null, 2));
  B(work, [path.join(ROOT, 'scripts', 'compile.js')]);
  // 全量重配：本地 say 对同文确定性 → 未改 scene 的 wav 帧数不变 → 命中缓存；仅目标 scene 帧数变 → 重渲
  B(work, [path.join(ROOT, 'scripts', 'tts.js'), '--backend', 'local']);
  B(work, [path.join(ROOT, 'scripts', 'build_timeline.js')]);
  const out = B(work, [path.join(ROOT, 'scripts', 'render.js'), '--all']);
  const idx2 = JSON.parse(fs.readFileSync(path.join(work, 'frames', 'cache', 'index.json'), 'utf8'));
  let rerendered = 0;
  for (const id of Object.keys(idx2)) if (!idx1[id] || idx1[id].frameCount !== idx2[id].frameCount || idx1[id].visualHash !== idx2[id].visualHash) rerendered++;
  assert.ok(rerendered >= 1, '目标 scene 应重渲');
  assert.ok(out.includes('skip'), '其余 scene 应命中缓存被跳过');
});

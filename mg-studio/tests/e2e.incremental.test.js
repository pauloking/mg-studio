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

'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { COMPONENTS } = require('../lib/components');
const ROOT = path.join(__dirname, '..');
const STUB = path.join(ROOT, 'tests', 'fixtures', 'stub-three');

test('three3d 已注册组件，check 校验 threeProject', () => {
  assert.ok(COMPONENTS['three3d'], '应注册 three3d 组件');
  assert.equal(COMPONENTS['three3d'].check({ type: 'three3d', props: { threeProject: 'x' } }).length, 0);
  assert.ok(COMPONENTS['three3d'].check({ type: 'three3d', props: {} }).length > 0);
  assert.deepEqual(COMPONENTS['three3d'].boxes({ elements: [] }), []);
});

test('render_three：按 timeline 用 stub 工程为 3D 段产出 frames/<id>/', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't3p-'));
  fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify({ scenes: [
    { id: 'd3', layout: 'three3d', elements: [ { id: '3d', type: 'three3d', props: { threeProject: STUB } } ] } ] }));
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ fps: 30, width: 1920, height: 1080, totalFrames: 9,
    scenes: [ { id: 'd3', start: 0, end: 9 } ] }));
  execFileSync('node', [path.join(ROOT, 'scripts', 'render_three.js'), dir], { stdio: 'pipe' });
  const d = path.join(dir, 'frames', 'd3');
  assert.ok(fs.existsSync(d), '应有 frames/d3/');
  assert.equal(fs.readdirSync(d).filter(f => f.endsWith('.png')).length, 9);
});

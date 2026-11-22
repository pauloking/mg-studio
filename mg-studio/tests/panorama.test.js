'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { generatePanoramaScene } = require('../lib/panorama-gen');
const { resolveProject, checkContract } = require('../lib/three3d');
const { fallbackScene } = require('../lib/topic-visual');
const vr = require('../lib/visual-review');

const panBeat = { id: 'field', role: 'context', emotion: 3, intent: '术野全景', narration: '术野全景可见心脏与导线，镜像视角。', facts: [] };

test('generatePanoramaScene：panorama → three3d builtin 工程+params', () => {
  const sc = generatePanoramaScene({ beat: panBeat });
  assert.equal(sc.layout, 'three3d');
  assert.equal(sc.id, 'field');
  const p = sc.elements[0].props;
  assert.equal(p.threeProject, 'builtin:three-panorama');
  assert.equal(p.params.view, 'mirror');
  assert.ok(p.params.structures.includes('心脏'));
  assert.deepEqual(sc.visualBrief, require('../lib/visual-intent').extractBrief(panBeat));
});
test('generatePanoramaScene：非 panorama 返回 null', () => {
  assert.equal(generatePanoramaScene({ beat: { id: 'a', narration: '室间隔剖面。' } }), null);
});
test('generatePanoramaScene：确定性', () => {
  assert.deepEqual(generatePanoramaScene({ beat: panBeat }), generatePanoramaScene({ beat: panBeat }));
});
test('resolveProject：builtin 指向内置模板且满足喂帧契约', () => {
  const dir = resolveProject('builtin:three-panorama');
  assert.ok(fs.existsSync(dir), '内置模板应存在');
  assert.deepEqual(checkContract(dir), []);
});
test('resolveProject：相对路径按 baseDir 解析', () => {
  assert.equal(resolveProject('sub/proj', '/tmp/base'), path.resolve('/tmp/base', 'sub/proj'));
});
test('fallbackScene：panorama 仅图标时优先 3D 生成', () => {
  const sc = fallbackScene({ beat: panBeat, dir: os.tmpdir() });
  assert.ok(sc, 'panorama 应生成 3D 而非摆图标');
  assert.equal(sc.layout, 'three3d');
});
test('visual-review：panorama three3d 需人工门', () => {
  assert.equal(vr.needsReview(generatePanoramaScene({ beat: panBeat })), true);
});

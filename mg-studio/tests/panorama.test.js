'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { generatePanoramaScene } = require('../lib/panorama-gen');
const { resolveProject, checkContract } = require('../lib/three3d');
const { fallbackScene } = require('../lib/topic-visual');
const vr = require('../lib/visual-review');

const panBeat = { id: 'field', role: 'context', emotion: 3, intent: '术野全景', narration: '术野全景可见心脏与导线，镜像视角。', facts: [] };

test('generatePanoramaScene：panorama → 干净2D分区示意（非primitive3D）', () => {
  const sc = generatePanoramaScene({ beat: panBeat });
  assert.equal(sc.layout, 'schematic');
  assert.equal(sc.id, 'field');
  const p = sc.elements[0].props;
  assert.equal(p.type, 'anatomy');
  assert.equal(p.view, 'mirror');
  assert.ok(p.structures.includes('心脏'));
  assert.deepEqual(sc.visualBrief, require('../lib/visual-intent').extractBrief(panBeat));
});
test('generatePanoramaScene：非 panorama 返回 null', () => {
  assert.equal(generatePanoramaScene({ beat: { id: 'a', narration: '室间隔剖面。' } }), null);
});
test('generatePanoramaScene：匹配原创插画→directed 组合全景（图片设计+全景设计）', () => {
  const b = { id: 'city', narration: '海绵城市全景：建筑、道路、绿地三类源头协同。', intent: '城市全景' };
  const sc = generatePanoramaScene({ beat: b });
  assert.equal(sc.layout, 'directed');
  const icons = sc.elements.filter(e => e.props.kind === 'icon').map(e => e.props.asset);
  assert.deepEqual(icons, ['rain-roof', 'rain-street', 'rain-soil']);
  assert.ok(sc.elements.some(e => e.props.kind === 'text' && e.props.content === '建筑屋顶'));
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
test('fallbackScene：panorama 仅图标时优先2D示意生成', () => {
  const sc = fallbackScene({ beat: panBeat, dir: os.tmpdir() });
  assert.ok(sc, 'panorama 应生成2D示意而非摆图标');
  assert.equal(sc.layout, 'schematic');
});
test('visual-review：panorama 示意仍需人工门', () => {
  assert.equal(vr.needsReview(generatePanoramaScene({ beat: panBeat })), true);
});

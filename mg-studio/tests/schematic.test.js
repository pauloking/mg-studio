'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { COMPONENTS, LAYOUT_NAMES } = require('../lib/components');
const { generateSchematicScene } = require('../lib/schematic-gen');
const { fallbackScene } = require('../lib/topic-visual');
const { compileProject } = require('../lib/compile');
const vr = require('../lib/visual-review');

const beat = { id: 'lead', role: 'mechanism', emotion: 3, intent: '导线进心肌', narration: '电极从右室侧旋入室间隔，镜像视角，右室在左。', facts: [] };

test('schematic 组件已注册', () => {
  assert.ok(COMPONENTS.schematic, '应注册 schematic 组件');
  assert.ok(LAYOUT_NAMES.includes('schematic'));
});

test('schematic check：必填与枚举', () => {
  const ok = { id: 'g', type: 'schematic', props: { x: 0, y: 0, w: 100, h: 100, structures: ['左室'], type: 'anatomy', view: 'mirror' } };
  assert.deepEqual(COMPONENTS.schematic.check(ok), []);
  assert.ok(COMPONENTS.schematic.check({ id: 'g', type: 'schematic', props: { x: 0, y: 0, w: 100, h: 100 } }).length > 0);
  assert.ok(COMPONENTS.schematic.check({ ...ok, props: { ...ok.props, structures: '左室' } }).length > 0);
  assert.ok(COMPONENTS.schematic.check({ ...ok, props: { ...ok.props, view: 'top' } }).length > 0);
});

test('schematic build/boxes', () => {
  const sc = generateSchematicScene({ beat });
  assert.ok(COMPONENTS.schematic.build(sc).includes('canvas'));
  const p = sc.elements[0].props;
  assert.deepEqual(COMPONENTS.schematic.boxes(sc), [{ id: sc.elements[0].id, x: p.x, y: p.y, w: p.w, h: p.h }]);
});

test('compile：schematic 场景编译通过且注入 runtime', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-sch-'));
  fs.writeFileSync(path.join(dir, 'story.json'), JSON.stringify({
    schema: 2, meta: { title: 't', audience: 'professional', template: 'science', durationTarget: 60 }, beats: [beat]
  }));
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.writeFileSync(path.join(dir, 'scenes', 'lead.json'), JSON.stringify(generateSchematicScene({ beat })));
  const r = compileProject(dir);
  assert.deepEqual(r.errors, []);
  assert.ok(fs.readFileSync(path.join(dir, 'scene.html'), 'utf8').includes('drawSchematic'));
});

test('visual-review：生成的 anatomy schematic 需人工门', () => {
  const sc = generateSchematicScene({ beat });
  assert.equal(vr.needsReview(sc), true);
  assert.equal(vr.checkVisualReview({ scenes: [sc], dir: os.tmpdir() })[0].code, 'VISUAL_REVIEW_REQUIRED');
});

test('visual-review：diagram schematic 不需人工门', () => {
  const sc = generateSchematicScene({ beat: { id: 'f', narration: '流程分为评估、准备、复核三个阶段。' }, labels: ['评估', '准备', '复核'] });
  assert.equal(vr.needsReview(sc), false);
});

test('topic-visual：无素材时 anatomy 回落到参数化 schematic', () => {
  const sc = fallbackScene({ beat, dir: os.tmpdir() });
  assert.ok(sc, '应生成回落场景');
  assert.equal(sc.layout, 'schematic');
});

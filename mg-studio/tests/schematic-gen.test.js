'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { generateSchematicScene } = require('../lib/schematic-gen');
const { extractBrief } = require('../lib/visual-intent');
const ir = require('../lib/ir');
const { LAYOUT_NAMES } = require('../lib/components');

const beat = { id: 'lead', role: 'mechanism', emotion: 3, intent: '导线进心肌', narration: '电极从右室侧旋入室间隔，镜像视角，右室在左。', facts: [] };

test('generateSchematicScene：anatomy+mirror 参数化场景', () => {
  const sc = generateSchematicScene({ beat });
  assert.equal(sc.layout, 'schematic');
  assert.equal(sc.id, 'lead');
  assert.equal(sc.beat, 'lead');
  const el = sc.elements[0];
  assert.equal(el.type, 'schematic');
  assert.equal(el.props.type, 'anatomy');
  assert.equal(el.props.view, 'mirror');
  for (const s of ['室间隔', '右室', '电极']) assert.ok(el.props.structures.includes(s), 'structures 应含 ' + s);
  assert.deepEqual(sc.visualBrief, extractBrief(beat));
});

test('generateSchematicScene：确定性（同输入同输出）', () => {
  assert.deepEqual(generateSchematicScene({ beat }), generateSchematicScene({ beat }));
});

test('generateSchematicScene：几何在字幕安全区（y+h<=900）', () => {
  const p = generateSchematicScene({ beat }).elements[0].props;
  assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= 1920 && p.y + p.h <= 900, JSON.stringify(p));
});

test('generateSchematicScene：IR 校验通过', () => {
  const r = ir.validateScene(generateSchematicScene({ beat }), ['lead'], LAYOUT_NAMES);
  assert.deepEqual(r.errors, []);
});

test('generateSchematicScene：diagram 用 labels', () => {
  const b = { id: 'flow', narration: '流程分为评估、准备、复核三个阶段。', intent: '流程' };
  const sc = generateSchematicScene({ beat: b, labels: ['评估', '准备', '复核'] });
  assert.equal(sc.elements[0].props.type, 'diagram');
  assert.deepEqual(sc.elements[0].props.labels, ['评估', '准备', '复核']);
});

test('generateSchematicScene：panorama/ambient 返回 null（P3 范畴）', () => {
  assert.equal(generateSchematicScene({ beat: { id: 'p', narration: '术野全景。' } }), null);
  assert.equal(generateSchematicScene({ beat: { id: 'a', narration: '欢迎观看。' } }), null);
});

test('generateSchematicScene：diagram 无 labels 时从旁白自动提取节点', () => {
  const b = { id: 'd', narration: '判读依次经过 V6 确认夺获、V1 区分类型、腔内电图核实三个步骤。', intent: '判读流程' };
  const sc = generateSchematicScene({ beat: b });
  assert.deepEqual(sc.elements[0].props.labels, ['V6 确认夺获', 'V1 区分类型', '腔内电图核实']);
});
test('generateSchematicScene：comparison 无 labels 时自动提取对比项', () => {
  const b = { id: 'c', narration: '对比选择性与非选择性夺获。', intent: '对比' };
  const sc = generateSchematicScene({ beat: b });
  assert.deepEqual(sc.elements[0].props.labels, ['选择性', '非选择性夺获']);
});

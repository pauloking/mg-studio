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

// P3 Task1：diagram/comparison 图标≠图解，应优先生成；真实图片素材仍优先于生成。
const diagramBeat = { id: 'flow', role: 'mechanism', emotion: 3, intent: '流程', narration: '流程分为评估、准备、复核三个阶段。', facts: [] };
function pngDataUrl() {
  const zlib = require('zlib');
  function crc32(buf) { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } let crc = 0xffffffff; for (const b of buf) crc = t[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
  function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 0;
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 128, 128, 128]))), chunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + png.toString('base64');
}
function dirWithLocalImage(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-asset-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'index.json'), JSON.stringify([
    { id: 'real', kind: 'image', license: 'CC-BY-4.0', source: 'test', tags: [tag, 'diagram', 'comparison'], media: { name: 'real.png', data: pngDataUrl() } }
  ]));
  return dir;
}
test('P3偏好：diagram 仅命中图标时仍生成图解（图标≠图解）', () => {
  const r = require('../lib/topic-visual').resolveVisual({ beat: diagramBeat, dir: os.tmpdir() });
  assert.ok(r.asset && r.asset.kind === 'icon', '前置：应命中图标素材');
  const sc = fallbackScene({ beat: diagramBeat, dir: os.tmpdir(), labels: ['评估', '准备', '复核'] });
  assert.ok(sc, 'diagram 应生成而非摆图标');
  assert.equal(sc.layout, 'schematic');
});
test('P3偏好：diagram 命中真实图片素材时用素材不生成', () => {
  const dir = dirWithLocalImage('流程');
  assert.equal(fallbackScene({ beat: diagramBeat, dir }), null);
});
test('P3偏好：anatomy 素材优先不变（有真实图不生成）', () => {
  const dir = dirWithLocalImage('室间隔');
  const anatomyBeat = { id: 'a', narration: '室间隔剖面。', intent: '室间隔' };
  assert.equal(fallbackScene({ beat: anatomyBeat, dir }), null);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { lintVisualQuality } = require('../lib/visual-quality');

function projWithThree(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vq-'));
  const tp = path.join(dir, 'mythree'); fs.mkdirSync(tp);
  fs.writeFileSync(path.join(tp, 'render_frames.js'), src);
  const sc = { id: 'p', beat: 'p', layout: 'three3d', elements: [{ id: 'g', type: 'three3d', props: { threeProject: tp } }] };
  return { dir, sc };
}
const PLACEHOLDER_SRC = 'const s=new THREE.Scene();const m=new THREE.Mesh(new THREE.SphereGeometry(1,32,32),new THREE.MeshBasicMaterial({color:0x00c2ff}));s.add(m);const b=new THREE.Mesh(new THREE.BoxGeometry(1,3,1),new THREE.MeshBasicMaterial());s.add(b);';
const GOOD_SRC = 'const t=new THREE.MeshPhysicalMaterial({color:0x8d3f3f,clippingPlanes:[cut]});const cv=document.createElement("canvas");const tex=new THREE.CanvasTexture(cv);const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex}));scene.add(new THREE.HemisphereLight(0xbfd4ff,0x2a1a1a,0.5));const key=new THREE.DirectionalLight(0xfff9f0,1.1);const rim=new THREE.PointLight(0x66aaff,0.9);';

test('visual-quality：几何占位3D（浮球+盒、无标注/布光/剖切）→ B', () => {
  const { dir, sc } = projWithThree(PLACEHOLDER_SRC);
  const f = lintVisualQuality({ scenes: [sc], dir });
  assert.ok(f.some(x => x.code === 'PLACEHOLDER_3D' && x.level === 'B'), JSON.stringify(f));
});
test('visual-quality：达基线3D（组织材质+剖切+标注+布光）→ 无 B', () => {
  const { dir, sc } = projWithThree(GOOD_SRC);
  const f = lintVisualQuality({ scenes: [sc], dir });
  assert.equal(f.filter(x => x.level === 'B').length, 0, JSON.stringify(f));
});
test('visual-quality：builtin 全景工程当前须达基线（无 PLACEHOLDER_3D B）', () => {
  const sc = { id: 'p', beat: 'p', layout: 'three3d', elements: [{ id: 'g', type: 'three3d', props: { threeProject: 'builtin:three-panorama' } }] };
  const f = lintVisualQuality({ scenes: [sc], dir: os.tmpdir() });
  assert.equal(f.filter(x => x.code === 'PLACEHOLDER_3D' && x.level === 'B').length, 0, JSON.stringify(f));
});
test('visual-quality：schematic 2D 当前须有渐变/圆角/字阶（无 FLAT_2D B）', () => {
  const sc = { id: 's', beat: 's', layout: 'schematic', elements: [{ id: 'g', type: 'schematic', props: { x: 0, y: 0, w: 100, h: 100, structures: ['左室'], type: 'anatomy' } }] };
  const f = lintVisualQuality({ scenes: [sc], dir: os.tmpdir() });
  assert.equal(f.filter(x => x.code === 'FLAT_2D').length, 0, JSON.stringify(f));
});

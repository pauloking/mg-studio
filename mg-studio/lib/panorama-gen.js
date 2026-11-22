'use strict';
/* panorama-gen.js — Topic-Visual：panorama（全景/术野/视野）= 图片设计+全景设计。
 * 有匹配授权插画（优先 MG Studio 原创图解 rain-*）→ directed 组合全景场景（插画+标注+stagger reveal），
 * 让真实主体意象进入画面；无插画时回落干净 2D 分区示意。
 * 准确解剖路线仍走专家参考影像/外部 3D 工程，不自动产 primitive 3D。 */
const { extractBrief } = require('./visual-intent');
const { generateSchematicScene } = require('./schematic-gen');

const LABELS = { 'rain-roof': '建筑屋顶', 'rain-street': '道路雨水口', 'rain-soil': '绿地剖面', house: '建筑', sprout: '绿地', 'cloud-rain': '降雨', droplet: '下渗', waves: '径流' };

function illustrationPanorama(beat, brief, pick, minSec) {
  const els = [{ id: 'title', type: 'layer', props: { kind: 'text', content: brief.subject, action: 'reveal', color: 'ink', x: 4, y: 5, w: 90, h: 10, at: 0, span: 0.4, size: 64, align: 'left' } }];
  pick.forEach((id, i) => {
    const x = 4 + i * 32, w = i === 2 ? 26 : 28;
    els.push({ id: 'ill' + i, type: 'layer', props: { kind: 'icon', asset: id, action: 'reveal', color: 'accent2', x, y: 20, w, h: 48, at: 0.1 + i * 0.15, span: 0.5 } });
    els.push({ id: 'lab' + i, type: 'layer', props: { kind: 'text', content: LABELS[id] || id, action: 'reveal', color: 'muted', x, y: 72, w, h: 8, at: 0.2 + i * 0.15, span: 0.4, size: 40, align: 'center' } });
  });
  return { id: beat.id, beat: beat.id, layout: 'directed', minSec, visualBrief: brief, elements: els };
}

function generatePanoramaScene({ beat, minSec = 8 }) {
  const brief = extractBrief(beat);
  if (brief.type !== 'panorama') return null;
  const assets = brief.assets || [];
  const illus = assets.filter(id => id.startsWith('rain-'));
  const pick = (illus.length >= 2 ? illus : assets).slice(0, 3);
  if (pick.length >= 2) return illustrationPanorama(beat, brief, pick, minSec);
  return generateSchematicScene({ beat, minSec });
}
module.exports = { generatePanoramaScene, illustrationPanorama };

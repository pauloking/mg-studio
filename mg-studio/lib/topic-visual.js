'use strict';
/* topic-visual.js — 解析视觉简报+素材+人工门标记（Topic-Visual P1）。 */
const { extractBrief } = require('./visual-intent');
const { findAssets } = require('./asset-retrieval');
const { generateSchematicScene } = require('./schematic-gen');
const { generatePanoramaScene } = require('./panorama-gen');
const REVIEW_TYPES = ['anatomy', 'device', 'panorama'];

function resolveVisual({ beat, dir }) {
  const brief = extractBrief(beat);
  const candidates = findAssets({ brief, dir });
  return { brief, asset: candidates[0] || null, candidates, needsReview: REVIEW_TYPES.includes(brief.type) };
}

/** P2/P3：无授权素材时回落生成。
 * diagram/comparison 图标≠图解、panorama 图标≠全景：仅命中图标(kind=icon)时仍优先生成；
 * 真实图片素材(kind!=icon)优先于生成。anatomy/device 素材优先不变。
 * panorama → 内置参数化 3D；anatomy/device/diagram/comparison → 参数化 2D；ambient → P3 text2img。 */
function fallbackScene({ beat, dir, labels }) {
  const r = resolveVisual({ beat, dir });
  const preferGen = ['diagram', 'comparison', 'panorama'].includes(r.brief.type);
  const realAsset = r.asset && r.asset.kind !== 'icon';
  if (r.asset && !(preferGen && !realAsset)) return null;
  if (r.brief.type === 'panorama') return generatePanoramaScene({ beat });
  return generateSchematicScene({ beat, labels });
}
module.exports = { resolveVisual, fallbackScene, REVIEW_TYPES };

'use strict';
/* topic-visual.js — 解析视觉简报+素材+人工门标记（Topic-Visual P1）。 */
const { extractBrief } = require('./visual-intent');
const { findAssets } = require('./asset-retrieval');
const REVIEW_TYPES = ['anatomy', 'device', 'panorama'];

function resolveVisual({ beat, dir }) {
  const brief = extractBrief(beat);
  const candidates = findAssets({ brief, dir });
  return { brief, asset: candidates[0] || null, candidates, needsReview: REVIEW_TYPES.includes(brief.type) };
}
module.exports = { resolveVisual, REVIEW_TYPES };

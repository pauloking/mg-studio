'use strict';
const { createHash } = require('node:crypto');

function pendingShots(story) {
  if (story.meta.audience !== 'patient' || !story.meta.director) return [];
  const meta = story.meta.director;
  return Array.isArray(meta.pendingShots)
    ? story.beats.map(beat => beat.id).filter(id => meta.pendingShots.includes(id))
    : meta.pendingReview ? story.beats.map(beat => beat.id) : [];
}

function contentSignature(scene, beat) {
  const meanings = scene.elements.map(({ props }) => {
    if (props.kind === 'chart') return JSON.stringify(props.series);
    // Illustration changes may affect a medical explanation. Positions,
    // edits to timing and stylistic changes are excluded.
    const media = props.media;
    const source = media?.file || (media?.data && createHash('sha256').update(media.data).digest('hex'));
    return [props.content, props.title, props.desc, props.label, props.asset, source].filter(Boolean).join('\t');
  }).filter(Boolean).sort();
  return JSON.stringify([beat.narration, beat.facts, meanings]);
}

function updateReview(story, ids) {
  if (story.meta.audience !== 'patient' || !story.meta.director) return;
  story.meta.director.pendingShots = [...new Set(ids)];
  story.meta.director.pendingReview = ids.length > 0;
}

module.exports = { pendingShots, contentSignature, updateReview };

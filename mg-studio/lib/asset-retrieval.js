'use strict';
/* asset-retrieval.js — 检索带许可证的真实素材（Topic-Visual P1）。
 * 源A: director-assets 图标库（Lucide/原创，license 明确）；源B: 本地 assets/index.json（须 license+source，image 过 validateLocalImage）。
 * 仅返回有 license 的候选；不下载版权不明素材。 */
const fs = require('fs'), path = require('path');
const { listAssets, validateLocalImage } = require('./director-assets');

function licenseOf(source) {
  if (/Lucide/i.test(source || '')) return 'ISC (Lucide)';
  if (/原创/.test(source || '')) return 'MG Studio 原创';
  return null;
}

function findAssets({ brief, dir }) {
  const out = [];
  const tags = (brief.structures || []).concat([brief.type, brief.subject]);
  for (const a of listAssets()) {
    const lic = licenseOf(a.source); if (!lic) continue;
    let score = tags.filter(t => a.title && a.title.includes(t)).length;
    if (brief.type === 'diagram' && /chart|route|layers|network/.test(a.id)) score += 1;
    if (score > 0) out.push({ id: a.id, kind: 'icon', source: a.source, license: lic, tags: [a.title], score });
  }
  let local = [];
  try { local = JSON.parse(fs.readFileSync(path.join(dir || '.', 'assets', 'index.json'), 'utf8')); } catch (e) {}
  for (const a of (Array.isArray(local) ? local : [])) {
    if (!a || !a.license || !a.source) continue;
    if (a.kind === 'image' && a.media && !validateLocalImage(a.media)) continue;
    const atags = a.tags || [];
    const score = tags.filter(t => atags.includes(t)).length;
    if (score > 0) out.push({ id: a.id, kind: a.kind || 'image', source: a.source, license: a.license, tags: atags, score, media: a.media, path: a.path });
  }
  return out.sort((x, y) => y.score - x.score);
}
module.exports = { findAssets, licenseOf };

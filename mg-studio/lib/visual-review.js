'use strict';
/* visual-review.js — 医学视觉正确性人工门（Audit Blocker 修复）
 *
 * 自动门（结构/对比度/facts 标志）不保证"画面对不对"。解剖/器械示意（septum/three3d，
 * 或显式 props.visualReview=true）必须经【参考图对照 + 专家目检批准】才允许渲染。
 * 批准记录存于 scenes/<id>.json 的 visualReview:{reference,reviewer,approved}。
 */
const fs = require('fs'), path = require('path');
const ANATOMICAL = ['three3d'];

function needsReview(sc) {
  if (!sc) return false;
  if (ANATOMICAL.includes(sc.layout)) return true;
  return (sc.elements || []).some(e => e && e.props && e.props.visualReview === true);
}

/** checkVisualReview({scenes,dir}) → B 级 findings（未批准/缺参考图/参考图不存在） */
function checkVisualReview({ scenes, dir }) {
  const out = [];
  for (const sc of scenes || []) {
    if (!needsReview(sc)) continue;
    const r = sc.visualReview;
    if (!r || r.approved !== true || !r.reviewer || !r.reference) {
      out.push({ level: 'B', code: 'VISUAL_REVIEW_REQUIRED', scene: sc.id,
        msg: `解剖/器械示意需专家目检+参考图对照（自动门不保证视觉正确）。运行: visual_review.js approve ${sc.id} --reference <图> --reviewer <姓名>` });
      continue;
    }
    const ref = path.isAbsolute(r.reference) ? r.reference : path.join(dir || '.', r.reference);
    if (!fs.existsSync(ref)) out.push({ level: 'B', code: 'VISUAL_REVIEW_REF_MISSING', scene: sc.id, msg: `参考图不存在: ${r.reference}` });
  }
  return out;
}

/** approve({dir,sceneId,reference,reviewer}) → 写入 visualReview 批准记录 */
function approve({ dir, sceneId, reference, reviewer }) {
  const p = path.join(dir, 'scenes', sceneId + '.json');
  const sc = JSON.parse(fs.readFileSync(p, 'utf8'));
  sc.visualReview = { reference, reviewer, approved: true, at: new Date().toISOString() };
  fs.writeFileSync(p, JSON.stringify(sc, null, 2));
  return sc.visualReview;
}

module.exports = { needsReview, checkVisualReview, approve, ANATOMICAL };

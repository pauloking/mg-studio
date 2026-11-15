'use strict';
/* scene-map.js — 烟测(smoke)抽帧的「帧→场景」映射（纯函数，render.js 与单测共用）
 *
 * 目的（issue #8）：smoke 抽出的 PNG 只有帧号（f_0851.png），审核者无法快速判断
 * 某帧属于哪个场景。本模块给出 帧号↔场景↔时间 对照表，render.js smoke 落盘为
 * smoke/_scene_map.json，人工核查时可直接定位。
 */

/**
 * pickSmokeFrames(timeline, picks) → [{ frame, scene, time, file }]
 *   timeline: timeline.json（含 fps 与 scenes[{ id, start, end }]）
 *   picks:    script.json.smokePicks = { sceneId: [offsetSec, ...] }；缺省取 min(dur*0.6, 4)s
 * 与 render.js 原抽帧逻辑逐字一致（帧号/取整方式不变），仅额外携带场景标签。
 */
function pickSmokeFrames(timeline, picks) {
  const fps = (timeline && timeline.fps) || 30;
  const map = picks || {};
  const out = [];
  for (const sc of (timeline && timeline.scenes) || []) {
    const lt = map[sc.id] || [Math.min(((sc.end - sc.start) / fps) * 0.6, 4)];
    for (const x of lt) {
      const frame = Math.min(sc.end - 1, sc.start + Math.round(x * fps));
      out.push({
        frame,
        scene: sc.id,
        time: +(frame / fps).toFixed(3),
        file: `f_${String(frame).padStart(4, '0')}.png`
      });
    }
  }
  return out;
}

module.exports = { pickSmokeFrames };

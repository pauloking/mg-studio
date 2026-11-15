'use strict';
/* three3d 组件：3D 插入段（§10）。帧由外部喂帧工程渲染（scripts/render_three.js），
 * scene.html 只留空占位块，render.js --all 跳过该 scene（不覆盖 3D 帧）。 */
module.exports = {
  name: 'three3d',
  css: () => '',
  runtime: () => '',
  // 空占位场景（3D 帧来自外部工程，不在此渲染）
  build: (sc) => `{ const r = H('div','scene'); r.id = 's-${sc.id}'; S['${sc.id}'] = { r, els: [] }; scenesEl.append(r); }`,
  extraUpdate: () => '',
  boxes: () => [], // 3D 段无 2D 布局盒可 lint
  check: (el) => {
    const errs = [];
    if (el.type !== 'three3d') { errs.push(`three3d 不支持元素类型: ${el.type}`); return errs; }
    const p = el.props || {};
    if (!p.threeProject || typeof p.threeProject !== 'string') errs.push('three3d 须 props.threeProject（喂帧工程路径）');
    if (p.frames != null && (!Number.isInteger(p.frames) || p.frames <= 0)) errs.push('three3d props.frames 须为正整数');
    return errs;
  }
};

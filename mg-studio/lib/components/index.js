'use strict';
// Task 5 占位：Task 6/7 替换为真实组件
const stub = (name) => ({
  name,
  css: () => '',
  build: (sc) => `{ const r = H('div','scene'); r.id = 's-${sc.id}'; S['${sc.id}'] = { r, els: [] }; scenesEl.append(r); }`,
  boxes: () => []
});
const COMPONENTS = { 'title-card': stub('title-card'), 'points': stub('points'), 'waveform': stub('waveform'), 'stat': stub('stat') };
const LAYOUT_NAMES = Object.keys(COMPONENTS);
module.exports = { COMPONENTS, LAYOUT_NAMES };
'use strict';
const stub = (name) => ({ name, css: () => '', build: (sc) => `{ const r = H('div','scene'); r.id = 's-${sc.id}'; S['${sc.id}'] = { r, els: [] }; scenesEl.append(r); }`, boxes: () => [] });
const COMPONENTS = {
  'title-card': require('./title-card'),
  'points': require('./points'),
  'waveform': stub('waveform'),
  'stat': stub('stat')
};
const LAYOUT_NAMES = Object.keys(COMPONENTS);
module.exports = { COMPONENTS, LAYOUT_NAMES };
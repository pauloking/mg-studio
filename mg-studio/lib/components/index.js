'use strict';
const COMPONENTS = {
  'title-card': require('./title-card'),
  'points': require('./points'),
  'waveform': require('./waveform'),
  'stat': require('./stat'),
  'three3d': require('./three3d')
};
const LAYOUT_NAMES = Object.keys(COMPONENTS);
module.exports = { COMPONENTS, LAYOUT_NAMES };
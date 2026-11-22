'use strict';
const COMPONENTS = {
  'title-card': require('./title-card'),
  'points': require('./points'),
  'waveform': require('./waveform'),
  'stat': require('./stat'),
  'motion-graphic': require('./motion-graphic'),
  'directed': require('./directed'),
  'three3d': require('./three3d')
};
const LAYOUT_NAMES = Object.keys(COMPONENTS).filter(name => name !== 'motion-graphic');
module.exports = { COMPONENTS, LAYOUT_NAMES };

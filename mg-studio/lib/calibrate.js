'use strict';
const fs = require('fs'), path = require('path');
const FILE = 'calibration.json';
const DEFAULT_VOICE = { local: 'Tingting', bailian: 'longanlingxin' };

function keyOf(backend, voice) {
  const b = backend || 'local';
  return b + ':' + (voice || DEFAULT_VOICE[b] || 'Tingting');
}
function charsPerSecFromPairs(pairs) {
  const chars = (pairs || []).reduce((n, p) => n + (p.chars || 0), 0);
  const dur = (pairs || []).reduce((n, p) => n + (p.dur || 0), 0);
  return dur > 0 ? +(chars / dur).toFixed(3) : null;
}
function readCalibration(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8')); } catch (e) { return {}; }
}
function writeCalibrationSample(dir, key, charsPerSec) {
  const m = readCalibration(dir);
  const prev = m[key] || {};
  m[key] = { charsPerSec, samples: (prev.samples || 0) + 1, updatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, FILE), JSON.stringify(m, null, 2));
  return m;
}
function charPerSecFor(dir, key, fallback = 4.5) {
  const m = readCalibration(dir);
  return (m[key] && Number.isFinite(m[key].charsPerSec)) ? m[key].charsPerSec : fallback;
}
module.exports = { keyOf, charsPerSecFromPairs, readCalibration, writeCalibrationSample, charPerSecFor, FILE };

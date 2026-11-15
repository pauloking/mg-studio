'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const cal = require('../lib/calibrate');

test('keyOf：backend:voice，缺省给合理默认', () => {
  assert.equal(cal.keyOf('bailian', 'longanlingxin'), 'bailian:longanlingxin');
  assert.equal(cal.keyOf('local', null), 'local:Tingting');
  assert.equal(cal.keyOf(null, null), 'local:Tingting');
});

test('charsPerSecFromPairs：总字数/总时长，空返回 null', () => {
  assert.equal(cal.charsPerSecFromPairs([{ chars: 45, dur: 10 }, { chars: 45, dur: 10 }]), 4.5);
  assert.equal(cal.charsPerSecFromPairs([]), null);
});

test('write/read 往返 + samples 累加 + 回退', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-'));
  assert.deepEqual(cal.readCalibration(dir), {});
  cal.writeCalibrationSample(dir, 'local:Tingting', 4.4);
  cal.writeCalibrationSample(dir, 'local:Tingting', 4.6);
  const m = cal.readCalibration(dir);
  assert.equal(m['local:Tingting'].charsPerSec, 4.6);
  assert.equal(m['local:Tingting'].samples, 2);
  assert.equal(cal.charPerSecFor(dir, 'local:Tingting', 4.5), 4.6);
  assert.equal(cal.charPerSecFor(dir, 'bailian:longanlingxin', 4.5), 4.5);
});

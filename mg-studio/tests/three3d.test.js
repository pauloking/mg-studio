'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const three = require('../lib/three3d');

const STUB = path.join(__dirname, 'fixtures', 'stub-three');

test('checkContract：缺目录/缺契约脚本 → 报缺失', () => {
  assert.ok(three.checkContract('/no/such/dir').length > 0);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 't3-'));
  assert.ok(three.checkContract(empty).some(m => m.includes('render_frames')));
  assert.deepEqual(three.checkContract(STUB), []);
});

test('renderThreeScene：调用喂帧契约 → 产出 N 帧且确定性', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't3-'));
  const out1 = path.join(dir, 's1'), out2 = path.join(dir, 's2');
  const r1 = three.renderThreeScene({ threeProjectDir: STUB, outDir: out1, frameCount: 5 });
  assert.ok(r1.ok, JSON.stringify(r1));
  assert.equal(r1.count, 5);
  const files = fs.readdirSync(out1).sort();
  assert.deepEqual(files, ['f_0000.png', 'f_0001.png', 'f_0002.png', 'f_0003.png', 'f_0004.png']);
  // 确定性：同参数两次产出逐字节一致
  const r2 = three.renderThreeScene({ threeProjectDir: STUB, outDir: out2, frameCount: 5 });
  assert.ok(r2.ok);
  for (const f of files) assert.deepEqual(fs.readFileSync(path.join(out1, f)), fs.readFileSync(path.join(out2, f)), f);
});

test('renderThreeScene：契约缺失 → ok=false 并报错', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't3-'));
  const r = three.renderThreeScene({ threeProjectDir: dir, outDir: path.join(dir, 'o'), frameCount: 3 });
  assert.equal(r.ok, false);
  assert.ok(/render_frames/.test(r.err));
});

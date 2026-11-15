'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { getCiTestFiles } = require('../scripts/test_ci');

test('test_ci: 自动发现全部测试且排除 e2e', () => {
  const testsDir = path.join(__dirname);
  const files = getCiTestFiles(testsDir);

  assert.ok(files.length >= 10, '应搜集到全部非 e2e 测试文件');
  assert.ok(files.includes('tests/ir.test.js'));
  assert.ok(files.includes('tests/doctor.test.js'));

  // 必须排除 e2e 测试
  for (const f of files) {
    const base = path.basename(f);
    assert.ok(!base.startsWith('e2e.'), `CI 测试不应包含 e2e 测试: ${f}`);
  }

  // 确保所有文件在磁盘上实际存在
  for (const f of files) {
    const abs = path.join(__dirname, '..', f);
    assert.ok(fs.existsSync(abs), `文件应存在: ${abs}`);
  }
});

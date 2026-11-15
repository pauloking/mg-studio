#!/usr/bin/env node
'use strict';
/* test_ci.js — CI 测试运行器（解决 issue / review R3-4）
 *
 * 自动搜集 tests/ 目录下除 e2e.* 之外的所有 *.test.js 文件，
 * 避免在 package.json 中硬编码测试文件列表导致新增测试被静默漏跑。
 *
 * 用法:
 *   node scripts/test_ci.js
 *   npm run test:ci
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function getCiTestFiles(testsDir) {
  return fs.readdirSync(testsDir)
    .filter(f => f.endsWith('.test.js') && !f.startsWith('e2e.'))
    .sort()
    .map(f => path.join('tests', f));
}

function main() {
  const root = path.join(__dirname, '..');
  const testsDir = path.join(root, 'tests');
  const files = getCiTestFiles(testsDir);

  if (files.length === 0) {
    console.error('未在 tests/ 目录下找到任何非 e2e 测试文件');
    return 1;
  }

  const extraArgs = process.argv.slice(2);
  const args = ['--test', '--test-concurrency=1', ...extraArgs, ...files];

  const res = spawnSync('node', args, {
    cwd: root,
    stdio: 'inherit'
  });

  return res.status ?? (res.error ? 1 : 0);
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { getCiTestFiles, main };

const studioFetch = require('./helpers/studio-fetch');
/**
 * desktop.test.js - MG Studio Desktop Shell 核心功能与生命周期测试
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createStudioServer, resolveProjectDir } = require('../scripts/studio');

test('Desktop: 基础工程结构与脚本入口配置', () => {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.equal(pkg.main, 'desktop/main.js', 'package.json main 入口应指向 desktop/main.js');
  assert.ok(pkg.scripts.desktop, '应包含 npm run desktop 启动脚本');

  assert.ok(fs.existsSync(path.join(__dirname, '..', 'desktop', 'main.js')), 'desktop/main.js 必须存在');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'desktop', 'preload.js')), 'desktop/preload.js 必须存在');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'desktop', 'project-hub.html')), 'desktop/project-hub.html 必须存在');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'desktop', 'project-hub.js')), 'desktop/project-hub.js 必须存在');
});

test('Desktop: studio 本地服务端在桌面模式（动态端口 port: 0）下稳定启动与优雅关闭', async () => {
  const demoDir = path.join(__dirname, 'fixtures', 'mini-style-medical');
  const serverInstance = createStudioServer({ projectDir: demoDir, port: 0 });

  const running = await serverInstance.start();
  const fetch = studioFetch(serverInstance);
  assert.equal(running.host, '127.0.0.1');
  assert.ok(typeof running.port === 'number' && running.port > 0, '应成功分配非 0 随机空闲端口');
  assert.equal(running.projectDir, path.resolve(demoDir));

  // 请求 project 验证连通性
  const res = await fetch(`http://127.0.0.1:${running.port}/api/project`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.project && data.project.story);

  await serverInstance.close();
});

test('Desktop: preload.js 安全隔离规范校验', () => {
  const preloadSrc = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'preload.js'), 'utf8');
  assert.ok(preloadSrc.includes('contextBridge.exposeInMainWorld'), '必须采用 contextBridge 暴露 API');
  assert.ok(preloadSrc.includes('desktopAPI'), '必须暴露 desktopAPI 命名空间');
  assert.ok(preloadSrc.includes('openProjectDialog'), '必须提供 openProjectDialog 原生方法');
  assert.ok(preloadSrc.includes('revealInFinder'), '必须提供 revealInFinder 原生定位方法');
});

test('Desktop: Electron 主进程冒烟启动 (Smoke Test)', (t) => {
  // Linux 无头 CI 环境（无 X11 / $DISPLAY）跳过 GUI 窗口渲染
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    t.skip('Linux 环境未配置 X11 虚拟显示器 ($DISPLAY 为空)，跳过 GUI 冒烟启动');
    return;
  }
  const electronBin = require('electron');
  const { execFileSync } = require('child_process');
  const args = ['.'];
  // CI 环境与 Linux 无特权容器需添加 --no-sandbox
  if (process.env.CI || process.platform === 'linux') {
    args.push('--no-sandbox');
  }
  const out = execFileSync(electronBin, args, {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, { ELECTRON_SMOKE_TEST: '1' }),
    encoding: 'utf8',
    timeout: 10000
  });
  assert.ok(out.includes('[SMOKE TEST]'), '应输出冒烟测试就绪标记');
});

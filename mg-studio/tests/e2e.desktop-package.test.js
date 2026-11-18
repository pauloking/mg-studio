'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright-core');

const executablePath = process.env.MG_PACKAGED_EXE;
test('安装包：打开示例、编译、配音并导出 1080p MP4', { skip: !executablePath && 'set MG_PACKAGED_EXE', timeout: 240000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-packaged-'));
  const documents = path.join(dir, 'Documents');
  fs.mkdirSync(documents);
  let app;
  try {
    const env = { ...process.env };
    delete env.PW_PATH;
    if (process.platform === 'darwin') env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
    app = await _electron.launch({ executablePath, args: [`--user-data-dir=${path.join(dir, 'profile')}`], env });
    assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    await app.evaluate(({ app }, dir) => app.setPath('documents', dir), documents);
    const page = await app.firstWindow();
    await page.locator('#btnOpenDemo').click();
    await page.waitForURL('http://127.0.0.1:*/');
    await page.waitForFunction(() => document.querySelector('#sceneIframe')?.contentWindow?.__ready === true);
    const project = path.join(documents, 'MG Studio Projects', 'mini-style-medical');
    assert.ok(fs.existsSync(path.join(project, 'scene.html')));

    const request = async (route, button) => {
      const [response] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname === route && r.request().method() === 'POST', { timeout: 40000 }),
        page.locator(button).click()
      ]);
      const result = await response.json();
      assert.equal(result.ok, true, JSON.stringify(result));
    };
    await request('/api/compile', '#btnCompile');
    await request('/api/tts', '#btnTts');
    assert.ok(fs.statSync(path.join(project, 'vo', 'hook.wav')).size > 44);
    assert.ok(JSON.parse(fs.readFileSync(path.join(project, 'timeline.json'))).totalFrames > 0);

    await request('/api/export', '#btnExport');
    await page.waitForFunction(() => /圆满完成|异常中断/.test(document.querySelector('#exportLogBox')?.textContent || ''), null, { timeout: 180000 });
    const logs = await page.locator('#exportLogBox').textContent();
    assert.match(logs, /出片流程圆满完成/, logs);
    const filename = path.join(project, 'out', 'output.mp4');
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height:format=duration', '-of', 'json', filename], { encoding: 'utf8' }));
    assert.ok(info.streams.some(s => s.codec_name === 'h264' && s.width === 1920 && s.height === 1080));
    assert.ok(info.streams.some(s => s.codec_name === 'aac'));
    const qa = JSON.parse(fs.readFileSync(path.join(project, 'reports', 'qa.json')));
    assert.equal(qa.blocking.length, 0);
    console.log(`MP4 ${info.format.duration}s | QA B=${qa.blocking.length} W=${qa.warnings.length}`);
    if (process.env.MG_SAMPLE_OUTPUT) fs.copyFileSync(filename, process.env.MG_SAMPLE_OUTPUT);
  } finally {
    if (app) await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('安装包：工作台按钮打开向导并创建独立工程', { skip: !executablePath && 'set MG_PACKAGED_EXE', timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-wizard-'));
  const documents = path.join(dir, 'Documents');
  fs.mkdirSync(documents);
  let app;
  try {
    app = await _electron.launch({ executablePath, args: [`--user-data-dir=${path.join(dir, 'profile')}`] });
    await app.evaluate(({ app }, dir) => app.setPath('documents', dir), documents);
    const page = await app.firstWindow();
    await page.locator('#btnOpenDemo').click();
    await page.waitForURL('http://127.0.0.1:*/');
    await page.locator('.beat-card').nth(1).click();
    const originalUrl = page.url();
    const original = await page.evaluate(() => window.desktopAPI.getCurrentProject());
    const originalStory = fs.readFileSync(path.join(original.path, 'story.json'), 'utf8');

    if (process.platform === 'darwin') {
      const titleBar = await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        return window.getContentBounds().y - window.getBounds().y;
      });
      assert.ok(titleBar > 0, 'toolbar cannot overlap the macOS title bar');
    }
    await page.route('**/api/topics', route => route.abort());
    await page.locator('#btnNewProject').click();
    await page.getByRole('dialog', { name: 'AI 视频策划工坊 (全流程向导)' }).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'wzTopic');
    await page.keyboard.press('Escape');
    await page.locator('#creatorModal').waitFor({ state: 'hidden' });

    // Invoke the action bound to Cmd/Ctrl+N from the current workbench.
    await app.evaluate(({ Menu, BrowserWindow }) => {
      const file = Menu.getApplicationMenu().items.find(item => item.label === '文件');
      const item = file.submenu.items.find(item => item.accelerator === 'CmdOrCtrl+N');
      return item.click(item, BrowserWindow.getAllWindows()[0], {});
    });
    await page.locator('#creatorModal').waitFor({ state: 'visible' });
    assert.equal(page.url(), originalUrl);
    await page.locator('#btnTabPasteText').click();
    await page.locator('#txtDocPaste').fill('# 分镜测试工程\n这份测试记录要求结合原始资料评估适用条件。');
    await page.locator('#btnParseDoc').click();
    await page.locator('#btnApplyParsedDoc').click();
    await page.locator('#btnWzNext').click();
    await page.locator('#wzFactChk_0').check();
    await page.locator('#btnWzNext').click();
    await page.locator('#btnWzCreate').click();
    await page.waitForURL(url => url.protocol === 'http:' && url.href !== originalUrl);
    await page.waitForFunction(() => document.querySelector('#topTitle')?.textContent === '分镜测试工程');
    const created = await page.evaluate(() => window.desktopAPI.getCurrentProject());
    assert.notEqual(created.path, original.path);
    assert.ok(fs.existsSync(path.join(created.path, 'scene.html')));
    assert.equal(fs.readFileSync(path.join(original.path, 'story.json'), 'utf8'), originalStory);
  } finally {
    if (app) await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

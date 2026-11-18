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

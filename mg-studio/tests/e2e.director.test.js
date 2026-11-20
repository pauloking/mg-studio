'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright-core');

const executablePath = process.env.MG_PACKAGED_EXE;
test('安装包：一句话样例带声预览、单镜重做、换素材并导出', {
  skip: !executablePath && 'set MG_PACKAGED_EXE', timeout: 360000
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-director-e2e-'));
  const documents = path.join(root, 'Documents');
  fs.mkdirSync(documents);
  let app;
  try {
    app = await _electron.launch({ executablePath, args: [`--user-data-dir=${path.join(root, 'profile')}`] });
    await app.evaluate(({ app }, dir) => app.setPath('documents', dir), documents);
    assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('#btnNewProject').click();
    await page.getByRole('button', { name: '试做 追踪一滴雨（跨镜样片）' }).click();
    await page.locator('#creatorModal').waitFor({ state: 'hidden', timeout: 60000 });
    await page.waitForFunction(() => {
      const frame = document.querySelector('#sceneIframe').contentWindow;
      return frame.__ready && frame.document.querySelector('.dir-layer svg') && previewVoice.currentTime > 0.35;
    });
    const project = await page.evaluate(() => window.desktopAPI.getCurrentProject());
    const scene = id => path.join(project.path, 'scenes', id + '.json');
    const first = fs.readFileSync(scene('shot_1'), 'utf8');
    const shot2 = fs.readFileSync(scene('shot_2'), 'utf8');
    const wav = path.join(project.path, 'vo', 'shot_1.wav');
    const firstVoice = fs.readFileSync(wav);
    const narration = () => JSON.parse(fs.readFileSync(path.join(project.path, 'story.json'), 'utf8')).beats[1].narration;
    const before = narration();
    const seam = await page.evaluate(() => {
      const frame = document.querySelector('#sceneIframe').contentWindow;
      const { start } = state.timeline.scenes[1];
      const position = (at, id) => {
        frame.__frame(at);
        const drop = frame.document.querySelector(`#s-${id} [data-object="rain_drop"]`);
        return [parseFloat(drop.style.left), parseFloat(drop.style.top)];
      };
      const before = position(start - 1, 'shot_1');
      const after = position(start, 'shot_2');
      const moved = position(start + 32, 'shot_2');
      return [Math.hypot(before[0] - after[0], before[1] - after[1]), Math.hypot(after[0] - moved[0], after[1] - moved[1])];
    });
    assert.ok(seam[0] < 4, 'handoff should be continuous: ' + seam[0]);
    assert.ok(seam[1] > 40, 'drop should take a new path after the cut');
    await page.locator('#shotRangeStart').selectOption('shot_2');
    await page.locator('#shotRangeEnd').selectOption('shot_3');
    await page.locator('#shotRangePlay').click();
    await page.waitForFunction(() => state.isPlaying && state.playEnd === state.timeline.scenes[2].end &&
      state.currentFrame > state.timeline.scenes[1].start);

    await page.locator('.beat-card[data-index="1"]').click();
    await page.locator('#directorRevision').fill('改成左右同屏对照，保留旁白');
    const [draft] = await Promise.all([page.waitForResponse(r => new URL(r.url()).pathname === '/api/director/shot'),
      page.locator('#directorRevise').click()]);
    const candidate = await draft.json();
    assert.ok(candidate.ok, candidate.error);
    await page.locator('#directorDraft').waitFor();
    await page.locator('#directorDraftStatus').getByText(/试听/).waitFor();
    assert.equal(fs.readFileSync(scene('shot_2'), 'utf8'), shot2);
    await page.locator('#directorDraftApply').click();
    await page.locator('#directorShotStatus').getByText('当前镜头已更新。').waitFor();
    assert.equal(narration(), before);
    assert.equal(fs.readFileSync(scene('shot_1'), 'utf8'), first);
    assert.notEqual(fs.readFileSync(scene('shot_2'), 'utf8'), shot2);
    assert.equal(fs.readFileSync(wav).equals(firstVoice), true);
    await page.locator('#directorUndo').click();
    await page.locator('#directorShotStatus').getByText('已恢复上一次编排。').waitFor();
    assert.equal(fs.readFileSync(scene('shot_2'), 'utf8'), shot2);

    await page.locator('#directorAsset').selectOption('cloud-rain');
    await page.locator('#directorReplace').click();
    await page.locator('#directorShotStatus').getByText('当前镜头已更新。').waitFor();
    assert.match(fs.readFileSync(scene('shot_2'), 'utf8'), /"asset": "cloud-rain"/);

    const clip = path.join(root, 'clip.webm');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15',
      '-t', '1.2', '-c:v', 'libvpx-vp9', '-b:v', '240k', clip]);
    const svg = path.join(root, 'decal.svg');
    fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="10"/></svg>');
    await page.locator('#directorUpload').setInputFiles([clip, svg]);
    await page.locator('#directorShotStatus').getByText('已导入 2 个工程素材。').waitFor();
    await page.locator('#directorAsset').selectOption({ label: 'clip.webm' });
    await page.locator('#directorReplace').click();
    await page.locator('#directorShotStatus').getByText('当前镜头已更新。').waitFor();
    await page.waitForFunction(() => {
      const content = document.querySelector('#sceneIframe').contentWindow;
      return content.__ready && content.document.querySelector('#s-shot_2 video')?.readyState >= 1;
    });
    await page.evaluate(async () => {
      const shot = state.timeline.scenes[1];
      const frame = document.querySelector('#sceneIframe').contentWindow;
      await frame.__frame(shot.start + 30);
    });
    assert.ok(await page.evaluate(() => document.querySelector('#sceneIframe').contentDocument.querySelector('#s-shot_2 video').currentTime > .3));
    await page.locator('#directorUndo').click();
    await page.locator('#directorShotStatus').getByText('已恢复上一次编排。').waitFor();

    const revised = '这滴雨沿着路面流向排水口。';
    const [tts] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === '/api/tts', { timeout: 60000 }),
      page.locator('#inpSceneNarration').fill(revised).then(() => page.locator('#btnSaveScene').click())
    ]);
    assert.equal((await tts.json()).ok, true);
    assert.equal(narration(), revised);
    assert.equal(fs.readFileSync(wav).equals(firstVoice), true);
    await page.waitForFunction(() => document.querySelector('#inpSceneNarration')?.value === '这滴雨沿着路面流向排水口。');
    assert.deepEqual(errors, []);

    const [exportRequest] = await Promise.all([page.waitForResponse(r => new URL(r.url()).pathname === '/api/export'),
      page.locator('#btnExport').click()]);
    assert.ok((await exportRequest.json()).ok);
    await page.locator('#btnCloseModal').click();
    await page.locator('#inpSceneNarration').fill('这是一条导出启动后改的旁白。');
    const [edit] = await Promise.all([page.waitForResponse(r => new URL(r.url()).pathname === '/api/scene'),
      page.locator('#btnSaveScene').click()]);
    assert.ok((await edit.json()).ok);
    await page.waitForFunction(() => /圆满完成|异常中断/.test(document.querySelector('#exportLogBox')?.textContent || ''),
      null, { timeout: 300000 });
    const logs = await page.locator('#exportLogBox').textContent();
    assert.match(logs, /圆满完成/, logs);
    assert.match(logs, /复用配音/);
    const movie = path.join(project.path, 'out', 'output.mp4');
    const codecs = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', movie], { encoding: 'utf8' });
    assert.match(codecs, /h264/);
    assert.match(codecs, /aac/);
    if (process.env.MG_DIRECTOR_TEST_OUTPUT) fs.copyFileSync(movie, process.env.MG_DIRECTOR_TEST_OUTPUT);
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

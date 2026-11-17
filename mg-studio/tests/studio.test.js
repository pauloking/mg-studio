'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { createStudioServer, resolveProjectDir, getOrSynthesizeTimeline, collectAllDiagnostics } = require('../scripts/studio');
const { STYLES } = require('../lib/ir');

function getRawStatus(port, reqPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: reqPath }, res => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
}

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');

function copyFixture(name, fixture) {
  const work = path.join(ROOT, 'tests', 'work', name);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(FIX, fixture), work, { recursive: true });
  return work;
}

test('resolveProjectDir 正确解析显式路径与测试样例', () => {
  const custom = path.join(FIX, 'mini-style-medical');
  assert.equal(resolveProjectDir(custom), path.resolve(custom));

  const auto = resolveProjectDir();
  assert.ok(fs.existsSync(auto));
  assert.ok(fs.existsSync(path.join(auto, 'story.json')));
});

test('getOrSynthesizeTimeline 在缺少物理配音时自动生成虚拟时间轴', () => {
  const work = copyFixture('studio-synth-tl', 'mini-style-medical');
  // 确保无 timeline.json
  const tlPath = path.join(work, 'timeline.json');
  if (fs.existsSync(tlPath)) fs.unlinkSync(tlPath);

  const tl = getOrSynthesizeTimeline(work);
  assert.equal(tl.fps, 30);
  assert.equal(tl.synthesized, true);
  assert.ok(tl.totalFrames > 0);
  assert.equal(tl.scenes.length, 2);
  assert.equal(tl.scenes[0].id, 'hook');
  assert.equal(tl.scenes[1].id, 'takeaway');
  assert.ok(tl.scenes[0].start === 0);
  assert.ok(tl.scenes[0].end > 0);
  assert.ok(Array.isArray(tl.scenes[0].subs));
});

test('collectAllDiagnostics 整合三大门禁输出', () => {
  const work = copyFixture('studio-diags', 'mini-style-medical');
  const r = collectAllDiagnostics(work);
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.diagnostics));
  assert.ok(typeof r.blockingCount === 'number');
  assert.ok(typeof r.warningCount === 'number');
});

test('Studio HTTP 服务端生命周期与核心路由集成测试', async () => {
  const work = copyFixture('studio-server-e2e', 'mini-style-medical');
  const port = 3888 + Math.floor(Math.random() * 500);
  const app = createStudioServer({ projectDir: work, port });

  const info = await app.start();
  assert.equal(info.port, port);
  assert.equal(info.host, '127.0.0.1');

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET / (Studio HTML SPA)
    const resHome = await fetch(baseUrl + '/');
    assert.equal(resHome.status, 200);
    assert.ok(resHome.headers.get('content-type').includes('text/html'));
    const homeHtml = await resHome.text();
    assert.ok(homeHtml.includes('MG STUDIO'));
    assert.ok(homeHtml.includes('timelineScrubber'));
    assert.ok(homeHtml.includes('styleSelect'));

    // 2. 静态文件伺服与路径穿越安全拦截 (Security)
    const code1 = await getRawStatus(port, '/../../package.json');
    assert.equal(code1, 403, '跨目录向上探测必须返回 403');
    const code2 = await getRawStatus(port, '/..%2F..%2Fpackage.json');
    assert.equal(code2, 403, '编码的目录穿越探测必须返回 403');

    const res404 = await fetch(baseUrl + '/nonexistent_file_404.wav');
    assert.equal(res404.status, 404);

    // 3. 动态时间轴伺服 GET /timeline.json
    const resTl = await fetch(baseUrl + '/timeline.json');
    assert.equal(resTl.status, 200);
    const tlData = await resTl.json();
    assert.equal(tlData.fps, 30);
    assert.equal(tlData.synthesized, true);

    // 4. REST API: GET /api/project
    const resProj = await fetch(baseUrl + '/api/project');
    assert.equal(resProj.status, 200);
    const projData = await resProj.json();
    assert.equal(projData.ok, true);
    assert.deepEqual(projData.styles, STYLES);
    assert.ok(projData.project);
    assert.equal(projData.project.story.meta.title, '心律科普');

    // 5. REST API: POST /api/compile
    const resComp = await fetch(baseUrl + '/api/compile', { method: 'POST' });
    assert.equal(resComp.status, 200);
    const compData = await resComp.json();
    assert.equal(compData.ok, true);
    assert.equal(compData.compile.mode, 'v2');
    assert.ok(fs.existsSync(path.join(work, 'script.json')));
    assert.ok(fs.existsSync(path.join(work, 'scene.html')));

    // 验证 scene.html 静态伺服
    const resScene = await fetch(baseUrl + '/scene.html');
    assert.equal(resScene.status, 200);
    const sceneHtml = await resScene.text();
    assert.ok(sceneHtml.includes('window.__frame'));

    // 6. REST API: POST /api/style (有效风格切换)
    const resStyle = await fetch(baseUrl + '/api/style', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style: 'warm-editorial' })
    });
    assert.equal(resStyle.status, 200);
    const styleData = await resStyle.json();
    assert.equal(styleData.ok, true);
    assert.equal(styleData.style, 'warm-editorial');
    assert.equal(styleData.tokens.bgType, 'warm-editorial');

    // 验证持久化写回 story.json
    const updatedStory = JSON.parse(fs.readFileSync(path.join(work, 'story.json'), 'utf8'));
    assert.equal(updatedStory.meta.style, 'warm-editorial');

    // 7. REST API: POST /api/style (非法风格应拒绝)
    const resBadStyle = await fetch(baseUrl + '/api/style', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style: 'illegal-style-name' })
    });
    assert.equal(resBadStyle.status, 400);

    // 8. REST API: POST /api/scene (保存分镜配置)
    const scPath = path.join(work, 'scenes', 'hook.json');
    const scObj = JSON.parse(fs.readFileSync(scPath, 'utf8'));
    scObj.elements[0].props.title = '全新脉冲电场消融技术';
    const resSceneSave = await fetch(baseUrl + '/api/scene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene: scObj })
    });
    assert.equal(resSceneSave.status, 200);
    const sceneSaveData = await resSceneSave.json();
    assert.equal(sceneSaveData.ok, true);
    const reloadedSc = JSON.parse(fs.readFileSync(scPath, 'utf8'));
    assert.equal(reloadedSc.elements[0].props.title, '全新脉冲电场消融技术');

    // 9. REST API: POST /api/story (同步医学事实核查勾选)
    updatedStory.beats[0].facts = [{ claim: '定期检查心律', verified: true }];
    const resStorySave = await fetch(baseUrl + '/api/story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story: updatedStory })
    });
    assert.equal(resStorySave.status, 200);
    const storySaveData = await resStorySave.json();
    assert.equal(storySaveData.ok, true);
    const reloadedStory = JSON.parse(fs.readFileSync(path.join(work, 'story.json'), 'utf8'));
    assert.equal(reloadedStory.beats[0].facts[0].verified, true);

    // 10. REST API: GET /api/lint
    const resLint = await fetch(baseUrl + '/api/lint');
    assert.equal(resLint.status, 200);
    const lintData = await resLint.json();
    assert.equal(lintData.ok, true);
    assert.ok(Array.isArray(lintData.diagnostics));

    // 11. REST API: POST /api/export 与 GET /api/task-status
    const resExport = await fetch(baseUrl + '/api/export', { method: 'POST' });
    assert.equal(resExport.status, 200);
    const exportData = await resExport.json();
    assert.equal(exportData.ok, true);
    assert.ok(exportData.taskId);

    // 轮询任务状态
    await new Promise(r => setTimeout(r, 100));
    const resTask = await fetch(baseUrl + `/api/task-status?taskId=${exportData.taskId}`);
    assert.equal(resTask.status, 200);
    const taskData = await resTask.json();
    assert.equal(taskData.id, exportData.taskId);
    assert.ok(['running', 'done', 'error'].includes(taskData.status));
    assert.ok(taskData.log.length > 0);

  } finally {
    await app.close();
  }
});

#!/usr/bin/env node
'use strict';
/* studio.js — mg-studio 本地可视化 Web 工作台服务器
 * 纯 Node.js 原生标准库实现，零额外 npm 运行时依赖。
 * 严格监听 127.0.0.1 本地回环，杜绝路径穿越。
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { projectFilePath, sceneFilePath, validateSceneUpdate } = require('../lib/project-files');
const { execFileSync } = require('child_process');
const { runWorker } = require('../lib/worker');

const ir = require('../lib/ir');
const { LAYOUT_NAMES, COMPONENTS } = require('../lib/components');
const { compileProject, prepareRenderScenes } = require('../lib/compile');
const { MOTION_MODES, canCompose } = require('../lib/motion-plan');
const { lintStory } = require('../lib/story-lint');
const { lintScript } = require('../lib/script-lint');
const { lintMedical } = require('../lib/medical-lint');
const { lintMotion } = require('../lib/motion-lint');
const { loadTemplate } = require('../lib/narratives');
const { splitSubs } = require('../lib/subs');
const { searchLiterature, fetchArticleAbstract, getCuratedTopics } = require('../lib/research');
const { buildStoryboardDefinition, writeAndCompileGeneratedProject } = require('../lib/ai-generator');
const director = require('../lib/director');
const { icons, listAssets, validateLocalImage, validateLocalVideo } = require('../lib/director-assets');
const { atomicWrite, readShot, saveShot } = require('../lib/save-shot');
const { splitShot, undoSplit } = require('../lib/split-shot');
const { catalog, uploadAsset } = require('../lib/project-assets');
const { pendingShots, updateReview } = require('../lib/director-review');
const { projectSnapshot, previewSnapshot } = require('../lib/project-snapshot');
const { extractRawText, analyzeDocumentText } = require('../lib/doc-parser');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const activeProjects = new Set();
const activeExports = new Set();

function resolveProjectDir(target) {
  if (target) return path.resolve(target);
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'story.json'))) return cwd;
  const fixture1 = path.join(cwd, 'tests', 'fixtures', 'mini-style-medical');
  if (fs.existsSync(path.join(fixture1, 'story.json'))) return fixture1;
  const fixture2 = path.join(__dirname, '..', 'tests', 'fixtures', 'mini-style-medical');
  if (fs.existsSync(path.join(fixture2, 'story.json'))) return fixture2;
  return cwd;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large (max 5MB)'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Malformed JSON: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

function getOrSynthesizeTimeline(projectDir) {
  const tlPath = path.join(projectDir, 'timeline.json');
  if (fs.existsSync(tlPath)) {
    try {
      return JSON.parse(fs.readFileSync(tlPath, 'utf8'));
    } catch (e) {
      // ignore, fall back to synthesize
    }
  }

  // 若无物理 timeline.json，根据 story / scenes 自动合成虚拟时间轴
  let project;
  try {
    project = ir.loadProject(projectDir, LAYOUT_NAMES);
  } catch (e) {
    return { fps: 30, totalFrames: 300, scenes: [] };
  }

  const FPS = 30;
  let cursor = 0;
  const scenes = project.scenes.map((sc, idx) => {
    const isIntro = idx === 0;
    const isOutro = idx === project.scenes.length - 1;
    const textLen = (sc.narration || '').length;
    const estimate = project.story.meta.director ? textLen / 5.5 + .58
      : isIntro ? 6.5 : isOutro ? 8.5 : Math.max(4.0, Math.round(textLen / 4.0) + 1.5);
    const estDur = Math.max(sc.minSec || 0, estimate);
    const frames = Math.round(estDur * FPS);
    const start = cursor;
    const end = cursor + frames;
    cursor = end;
    const audioStart = +(start / FPS + 0.45).toFixed(3);
    const sceneEndSec = end / FPS;
    const winFrom = audioStart;
    const winTo = Math.min(audioStart + estDur, sceneEndSec - 0.05);
    const span = Math.max(winTo - winFrom, 0.1);
    const subsArr = (sc.subsOverride && sc.subsOverride.length ? sc.subsOverride : splitSubs(sc.narration || '')).map((text, k, arr) => ({
      text,
      from: winFrom + span * k / arr.length,
      to: winFrom + span * (k + 1) / arr.length
    }));
    return {
      id: sc.id,
      start,
      end,
      dur: +estDur.toFixed(2),
      audioStart,
      subs: subsArr
    };
  });

  return {
    fps: FPS,
    totalFrames: cursor,
    synthesized: true,
    scenes
  };
}

function collectAllDiagnostics(projectDir) {
  try {
    const project = ir.loadProject(projectDir, LAYOUT_NAMES);
    if (project.mode === 'v1') return { ok: true, mode: 'v1', diagnostics: [] };
    const story = project.story;
    const template = loadTemplate((story.meta && story.meta.template) || 'free');
    let terms = [];
    try {
      terms = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'medical', 'terms.json'), 'utf8'));
    } catch (e) {}

    const subsByBeat = {};
    for (const sc of project.scenes) {
      if (Array.isArray(sc.subsOverride)) subsByBeat[sc.id] = sc.subsOverride;
    }

    const storyDiags = lintStory({ story, template, charsPerSec: 4.5 });
    const scriptDiags = lintScript({ story, charsPerSec: 4.5, durationTarget: story.meta && story.meta.durationTarget, terms, subsByBeat });
    const medicalDiags = lintMedical({ story, scenes: project.scenes });
    let motionDiags = [];
    try {
      const normScenes = prepareRenderScenes(project);
      motionDiags = lintMotion({ scenes: normScenes, tokens: project.tokens, components: COMPONENTS });
    } catch (e) {
      motionDiags.push({ level: 'B', code: 'MOTION_NORMALIZE_FAIL', scene: '', msg: e.message });
    }

    const all = [].concat(storyDiags, scriptDiags, medicalDiags, motionDiags);
    return {
      ok: true,
      diagnostics: all,
      blockingCount: all.filter(d => d.level === 'B').length,
      warningCount: all.filter(d => d.level === 'W').length
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
      diagnostics: [{ level: 'B', code: 'LOAD_ERROR', scene: '', msg: e.message }],
      blockingCount: 1,
      warningCount: 0
    };
  }
}

function createStudioServer(options = {}) {
  const tasks = new Map();
  let storyboardPreview;
  let directorConnection;
  let draftAssets;
  let shotDraft;
  function clearShotDraft() {
    if (!shotDraft) return;
    fs.rmSync(shotDraft.root, { recursive: true, force: true });
    shotDraft = undefined;
  }
  function invalidateTimeline(dir) {
    const hadVoice = fs.existsSync(path.join(dir, 'vo', 'narration.wav'));
    fs.rmSync(path.join(dir, 'timeline.json'), { force: true });
    fs.rmSync(path.join(dir, 'vo', 'narration.wav'), { force: true });
    return hadVoice;
  }
  let projectDir = resolveProjectDir(options.projectDir);
  const projectsDir = options.projectsDir || path.join(path.dirname(projectDir), 'mg-projects');
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const host = options.host || '127.0.0.1';
  if (host !== '127.0.0.1') throw new Error('Studio must listen on 127.0.0.1');
  const port = typeof options.port === 'number' ? options.port : 3000;
  const studioHtmlPath = path.join(__dirname, '..', 'lib', 'studio.html');

  const server = http.createServer(async (req, res) => {
    const expectedHost = `127.0.0.1:${server.address().port}`;
    const origin = req.headers.origin;
    if (req.headers.host !== expectedHost ||
        (origin && origin !== `http://${expectedHost}`) ||
        req.headers['sec-fetch-site'] === 'cross-site') {
      sendJson(res, 403, { ok: false, error: 'Untrusted request origin or host' });
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = req.url || '/';
    const qIdx = reqUrl.indexOf('?');
    const rawPathname = qIdx !== -1 ? reqUrl.slice(0, qIdx) : reqUrl;
    const searchParams = new URLSearchParams(qIdx !== -1 ? reqUrl.slice(qIdx + 1) : '');
    const pathname = rawPathname;

    if (pathname.startsWith('/api/') && req.headers['x-studio-token'] !== csrfToken) {
      sendJson(res, 403, { ok: false, error: 'Invalid Studio session token' });
      return;
    }

    // 1. Studio 主页
    if (pathname === '/' || pathname === '/index.html') {
      if (!fs.existsSync(studioHtmlPath)) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Studio UI template not found at ' + studioHtmlPath);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      res.end(fs.readFileSync(studioHtmlPath, 'utf8').replace('__STUDIO_TOKEN__', csrfToken));
      return;
    }

    // 2. REST API 路由
    if (pathname.startsWith('/api/')) {
      try {
        // GET /api/project
        if (pathname === '/api/project' && req.method === 'GET') {
          let projectData = null;
          let loadError = null;
          try {
            projectData = ir.loadProject(projectDir, LAYOUT_NAMES);
            if (projectData.story?.meta.director) updateReview(projectData.story, pendingShots(projectData.story));
          } catch (e) {
            loadError = e.message;
          }

          const hasScript = fs.existsSync(path.join(projectDir, 'script.json'));
          const hasSceneHtml = fs.existsSync(path.join(projectDir, 'scene.html'));
          const hasTimeline = fs.existsSync(path.join(projectDir, 'timeline.json'));

          sendJson(res, 200, {
            ok: !loadError,
            error: loadError,
            projectDir,
            styles: ir.STYLES,
            bgTypes: ir.BG_TYPES,
            hasScript,
            hasSceneHtml,
            hasTimeline,
            hasNarration: fs.existsSync(path.join(projectDir, 'vo', 'narration.wav')),
            motionSceneIds: projectData?.mode === 'v2' ? projectData.scenes.filter(canCompose).map(sc => sc.id) : [],
            project: projectData,
            assets: projectData?.story?.meta.director ? catalog(projectDir) : []
          });
          return;
        }

        // GET /api/topics (精选推荐选题)
        if (pathname === '/api/topics' && req.method === 'GET') {
          sendJson(res, 200, { ok: true, topics: getCuratedTopics() });
          return;
        }

        // POST /api/research (文献书目检索)
        if (pathname === '/api/research' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const { query, maxResults, page } = body;
          const result = await searchLiterature(query, { maxResults, page });
          const status = result.status === 'invalid' ? 400 : result.status === 'unavailable' ? 503 : 200;
          sendJson(res, status, result);
          return;
        }

        if (pathname === '/api/article-abstract' && req.method === 'POST') {
          const { id } = await parseJsonBody(req);
          try {
            const abstract = await fetchArticleAbstract(id);
            sendJson(res, 200, { ok: true, abstract });
          } catch (error) {
            sendJson(res, error.statusCode || 502, {
              ok: false, error: error.statusCode ? error.message : '暂时无法获取摘要。可打开原文并粘贴相关段落。'
            });
          }
          return;
        }

        // POST /api/parse-doc (用户自定义资料上传与知识抽取)
        if (pathname === '/api/parse-doc' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const filename = body.filename || '自定义参考资料.txt';
          let buffer = null;
          if (body.contentBase64) {
            try {
              buffer = Buffer.from(body.contentBase64, 'base64');
            } catch (e) {
              sendJson(res, 400, { ok: false, error: 'Invalid base64 payload' });
              return;
            }
          }
          const textContent = body.textContent || '';
          try {
            const rawText = await extractRawText({ filename, buffer, textContent });
            const analysis = analyzeDocumentText(rawText, filename);
            sendJson(res, 200, { ok: true, ...analysis });
          } catch (err) {
            sendJson(res, 500, { ok: false, error: '资料解析失败: ' + err.message });
          }
          return;
        }

        if (pathname === '/api/director' && req.method === 'GET') {
          sendJson(res, 200, { ok: true, connected: Boolean(directorConnection || director.configuration()),
            samples: Object.entries(director.samples).map(([id, sample]) => ({ id, label: sample.label, brief: sample.brief })),
            assets: listAssets() });
          return;
        }

        if (pathname === '/api/director/config' && req.method === 'POST') {
          const connection = await parseJsonBody(req);
          if (!connection.endpoint || !connection.model) {
            throw Object.assign(new Error('请填写模型地址和模型名称。'), { statusCode: 400 });
          }
          directorConnection = director.configuration(connection);
          sendJson(res, 200, { ok: true });
          return;
        }

        if (pathname === '/api/director/media' && req.method === 'POST') {
          const scope = searchParams.get('scope');
          if (!['draft', 'project'].includes(scope)) throw Object.assign(new Error('请选择素材归属。'), { statusCode: 400 });
          if (scope === 'draft' && !draftAssets) draftAssets = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-studio-assets-'));
          const dir = scope === 'draft' ? draftAssets : fs.realpathSync(projectDir);
          const media = await uploadAsset(req, dir, searchParams.get('name'));
          sendJson(res, 200, { ok: true, media });
          return;
        }

        if (pathname === '/api/director/plan' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          if (body.connection?.endpoint || body.connection?.model) {
            if (!body.connection.endpoint || !body.connection.model) throw Object.assign(new Error('请填写模型地址和模型名称。'), { statusCode: 400 });
            directorConnection = director.configuration(body.connection);
          }
          const files = Array.isArray(body.files) ? body.files.slice(0, 8) : [];
          const available = draftAssets ? catalog(draftAssets) : [];
          const attachments = [...new Set(files)].map(file => available.find(entry => entry.file === file));
          if (attachments.some(entry => !entry)) throw Object.assign(new Error('参考素材已失效，请重新选择。'), { statusCode: 422 });
          const definition = await director.createFromBrief({ ...body, attachments }, directorConnection || director.configuration());
          const id = crypto.randomUUID();
          storyboardPreview = { id, definition, result: null, assetSource: draftAssets, assets: attachments };
          sendJson(res, 200, { ok: true, previewId: id, ...definition });
          return;
        }

        if (pathname === '/api/director/review' && req.method === 'POST') {
          const { id, confirmed } = await parseJsonBody(req);
          const storyPath = projectFilePath(projectDir, 'story.json');
          const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
          if (confirmed !== true || !pendingShots(story).includes(id)) throw Object.assign(new Error('请选择一镜并核对旁白、画面和出处。'), { statusCode: 422 });
          updateReview(story, pendingShots(story).filter(shot => shot !== id));
          atomicWrite(storyPath, JSON.stringify(story, null, 2));
          sendJson(res, 200, { ok: true, pendingShots: pendingShots(story) });
          return;
        }

        if (pathname === '/api/director/shot' && req.method === 'POST') {
          const { id, action, instruction, keepNarration, keepAssets, keepComposition, keepDuration,
            asset, media, stored, layerId, token, frame } = await parseJsonBody(req);
          const dir = fs.realpathSync(projectDir);
          if (action === 'discard') {
            if (shotDraft?.token === token) clearShotDraft();
            sendJson(res, 200, { ok: true });
            return;
          }
          if (activeProjects.has(dir)) throw Object.assign(new Error('请等当前配音或导出结束。'), { statusCode: 409 });
          const current = readShot(dir, id);
          if (!current.story.meta.director || current.scene.layout !== 'directed') {
            throw Object.assign(new Error('该镜头不属于一句话创片工程。'), { statusCode: 422 });
          }
          const locked = new Set(current.story.meta.director.locked || []);
          if (action === 'lock') {
            if (locked.has(id)) locked.delete(id);
            else locked.add(id);
            current.story.meta.director.locked = [...locked];
            atomicWrite(current.storyPath, JSON.stringify(current.story, null, 2));
            sendJson(res, 200, { ok: true, locked: locked.has(id) });
            return;
          }
          if (locked.has(id)) throw Object.assign(new Error('请先解锁当前镜头。'), { statusCode: 409 });
          if (action === 'split') {
            const result = splitShot(dir, current, frame);
            clearShotDraft();
            sendJson(res, 200, { ok: true, ...result });
            return;
          }
          const historyPath = projectFilePath(dir, 'director-undo.json');
          const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : {};
          let next;
          if (action === 'undo') {
            next = history[id];
            if (!next) throw Object.assign(new Error('当前镜头暂无可撤销的修改。'), { statusCode: 409 });
            if (next.split || next.splitParent) {
              const result = undoSplit(dir, next.splitParent || id, history, historyPath);
              clearShotDraft();
              sendJson(res, 200, { ok: true, splitUndo: true, ...result });
              return;
            }
          } else if (action === 'apply') {
            if (!shotDraft || shotDraft.token !== token || shotDraft.dir !== dir || shotDraft.id !== id ||
                current.sceneRaw !== shotDraft.sceneRaw || current.storyRaw !== shotDraft.storyRaw) {
              throw Object.assign(new Error('工程已变化，请重新生成改版预览。'), { statusCode: 409 });
            }
            next = shotDraft.next;
          } else if (action === 'revise' || action === 'preview') {
            if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > 450) {
              throw Object.assign(new Error('请写一条 1 至 450 字的镜头修改要求。'), { statusCode: 422 });
            }
            const neighbors = current.story.beats.slice(Math.max(0, current.index - 1), current.index + 2)
              .filter(beat => beat.id !== id).map(beat => readShot(dir, beat.id).scene);
            next = await director.reviseShot({ project: { story: current.story }, scene: current.scene,
              beat: current.beat, neighbors, instruction, keepNarration, keepAssets, keepComposition, keepDuration }, directorConnection || director.configuration());
            if (dir !== fs.realpathSync(projectDir) || activeProjects.has(dir) ||
                fs.readFileSync(current.storyPath, 'utf8') !== current.storyRaw ||
                fs.readFileSync(current.scenePath, 'utf8') !== current.sceneRaw) {
              throw Object.assign(new Error('工程在生成期间有变化，请在当前镜头重试。'), { statusCode: 409 });
            }
            if (action === 'preview') {
              const sameTiming = next.beat.narration === current.beat.narration && next.scene.minSec === current.scene.minSec;
              const root = previewSnapshot(dir, next, sameTiming);
              let audioError;
              if (!fs.existsSync(path.join(root, 'vo', 'narration.wav'))) {
                const backend = current.story.meta.tts?.backend === 'bailian' ? 'bailian' : 'local';
                const run = (name, args, timeout) => runWorker(path.join(__dirname, name), args,
                  { cwd: root, spawnProcess: options.spawnProcess, timeout });
                try {
                  await run('tts.js', ['--backend', backend, '--reuse'], 300000);
                  await run('build_timeline.js', [], 30000);
                  await run('assemble_audio.js', [], 30000);
                } catch {
                  audioError = '旁白预览生成失败。可先看画面，应用后重新配音。';
                }
              }
              if (dir !== fs.realpathSync(projectDir) || fs.readFileSync(current.storyPath, 'utf8') !== current.storyRaw ||
                  fs.readFileSync(current.scenePath, 'utf8') !== current.sceneRaw) {
                fs.rmSync(root, { recursive: true, force: true });
                throw Object.assign(new Error('工程已变化，请重新生成改版预览。'), { statusCode: 409 });
              }
              clearShotDraft();
              const token = crypto.randomUUID();
              shotDraft = { root, token, dir, id, next, sceneRaw: current.sceneRaw, storyRaw: current.storyRaw };
              const timeline = getOrSynthesizeTimeline(root);
              if (!fs.existsSync(path.join(root, 'timeline.json'))) atomicWrite(path.join(root, 'timeline.json'), JSON.stringify(timeline));
              const range = timeline.scenes.find(shot => shot.id === id);
              const url = '/director-preview/' + token + '/';
              sendJson(res, 200, { ok: true, token, id, url: url + 'scene.html', range, fps: timeline.fps,
                width: timeline.width || 1920, height: timeline.height || 1080,
                narration: next.beat.narration, audioError, audio: fs.existsSync(path.join(root, 'vo', 'narration.wav')) ? url + 'vo/narration.wav' : null });
              return;
            }
          } else if (action === 'asset' || action === 'illustrate') {
            let selectedMedia = stored ? catalog(dir).find(item => item.file === stored) : media;
            if (action === 'illustrate') {
              const brief = typeof instruction === 'string' ? instruction.trim() : '';
              if (!brief || brief.length > 450) throw Object.assign(new Error('请先描述要生成的插图。'), { statusCode: 422 });
              selectedMedia = await director.makeIllustration(directorConnection || director.configuration(), brief);
              if (dir !== fs.realpathSync(projectDir) || activeProjects.has(dir) ||
                  fs.readFileSync(current.storyPath, 'utf8') !== current.storyRaw ||
                  fs.readFileSync(current.scenePath, 'utf8') !== current.sceneRaw) {
                throw Object.assign(new Error('工程在生成期间有变化，请在当前镜头重试。'), { statusCode: 409 });
              }
            }
            const kind = stored ? selectedMedia?.kind : validateLocalImage(selectedMedia) ? 'image' : validateLocalVideo(selectedMedia) ? 'video' : '';
            if (!Object.hasOwn(icons, asset) && !kind) {
              throw Object.assign(new Error('请选择素材库中的图标、图片或短视频。'), { statusCode: 422 });
            }
            const previous = current.scene.elements.find(el =>
              (!layerId || layerId === el.id) && ['icon', 'image', 'video'].includes(el.props.kind));
            if (!previous) throw Object.assign(new Error('本镜头没有可替换的图像图层。'), { statusCode: 422 });
            const { asset: oldAsset, media: oldMedia, ...base } = previous.props;
            const props = kind ? { ...base, kind, media: selectedMedia } : { ...base, kind: 'icon', asset };
            next = { beat: current.beat, scene: { ...current.scene,
              elements: current.scene.elements.map(el => el === previous ? { ...el, props } : el) } };
          } else {
            throw Object.assign(new Error('未知镜头操作。'), { statusCode: 400 });
          }
          const result = saveShot(dir, current, next.scene, next.beat);
          if (action === 'undo') delete history[id];
          else history[id] = { scene: current.scene, beat: current.beat };
          atomicWrite(historyPath, JSON.stringify(history));
          if (action === 'apply') clearShotDraft();
          sendJson(res, 200, { ok: true, narrationChanged: result.narrationChanged, timingChanged: result.timingChanged,
            pendingReview: result.pendingReview });
          return;
        }

        // 保存实际预览定义，导入时使用同一份分镜，重试不会重复写入。
        if (pathname === '/api/preview-project' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const definition = buildStoryboardDefinition(body);
          const facts = definition.story.beats.flatMap(beat => beat.facts);
          if (!facts.length || facts.some(fact => !fact.verified || !(fact.evidence || fact.source || fact.citation?.title))) {
            sendJson(res, 422, { ok: false, error: '请先添加一条有出处的事实，勾选核实后再生成分镜。' });
            return;
          }
          const id = crypto.randomUUID();
          storyboardPreview = { id, definition, result: null };
          sendJson(res, 200, { ok: true, previewId: id, ...definition });
          return;
        }

        if (pathname === '/api/create-project' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const preview = body.previewId ? storyboardPreview : null;
          if (body.previewId && preview?.id !== body.previewId) {
            sendJson(res, 409, { ok: false, error: '这份预览已失效，请返回上一步重新生成。' });
            return;
          }
          if (preview?.result) {
            sendJson(res, 200, preview.result);
            return;
          }
          const definition = preview?.definition || buildStoryboardDefinition(body);
          const targetDir = path.join(projectsDir, 'project-' + crypto.randomUUID());
          const result = writeAndCompileGeneratedProject(targetDir, definition, preview || undefined);
          if (result.ok) {
            clearShotDraft();
            projectDir = targetDir;
            if (preview) preview.result = result;
            options.onProjectCreated?.(targetDir, definition.story.meta);
          }
          sendJson(res, 200, result);
          return;
        }

        // POST /api/beat/add (动态插入新分镜)
        if (pathname === '/api/beat/add' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          if (activeProjects.has(fs.realpathSync(projectDir))) throw Object.assign(new Error('请等当前配音或导出结束。'), { statusCode: 409 });
          const beat = body.beat;
          if (!beat || !beat.id) {
            sendJson(res, 400, { ok: false, error: 'beat with id is required' });
            return;
          }
          const scPath = sceneFilePath(projectDir, beat.id);
          const storyPath = projectFilePath(projectDir, 'story.json');
          if (!fs.existsSync(storyPath)) {
            sendJson(res, 400, { ok: false, error: 'story.json not found' });
            return;
          }
          const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
          story.beats = story.beats || [];
          if (story.beats.some(b => b.id === beat.id)) {
            sendJson(res, 400, { ok: false, error: 'beat id already exists: ' + beat.id });
            return;
          }
          const afterIndex = typeof body.afterIndex === 'number' ? body.afterIndex : story.beats.length - 1;
          const newBeat = {
            id: beat.id,
            role: beat.role || 'mechanism',
            emotion: beat.emotion || 3,
            intent: beat.intent || '新分镜意图',
            narration: beat.narration || '这是一段新加入的分镜旁白。',
            facts: beat.facts || []
          };
          story.beats.splice(Math.max(0, afterIndex + 1), 0, newBeat);
          const storyValidation = ir.validateStory(story);
          if (!storyValidation.ok) throw Object.assign(new Error(storyValidation.errors.join('; ')), { statusCode: 400 });

          // 自动创建对应的 scenes/<id>.json
          const layout = body.layout || 'title-card';
          let defaultElements = [];
          if (layout === 'title-card') {
            defaultElements = [
              { id: 'title', type: 'text', props: { role: 'title', content: beat.narration ? beat.narration.slice(0, 10) : '新分镜标题' }, enter: { preset: 'scale', at: 0.3, dur: 0.8 } },
              { id: 'bar', type: 'bar', props: {}, enter: { preset: 'grow', at: 0.7, dur: 0.6 } }
            ];
          } else if (layout === 'points') {
            defaultElements = [
              { id: 'card0', type: 'card', props: { title: '核心要点', desc: beat.narration || '要点说明' }, enter: { preset: 'popLeft', at: 0.4, dur: 0.8 } }
            ];
          } else if (layout === 'waveform') {
            defaultElements = [
              { id: 'wf', type: 'waveform', props: { x: 260, y: 300, w: 1400, h: 480, color: 'accent', vf: 0, scroll: 0.6 }, enter: { preset: 'fade', at: 0.4, dur: 0.8 } }
            ];
          } else if (layout === 'stat') {
            defaultElements = [
              { id: 's0', type: 'stat', props: { value: 88, unit: '%', label: '临床有效率', decimals: 0 }, enter: { preset: 'scale', at: 0.5, dur: 1.0 } }
            ];
          } else {
            defaultElements = [
              { id: 'title', type: 'text', props: { role: 'title', content: '新场景' }, enter: { preset: 'rise', at: 0.3, dur: 0.6 } }
            ];
          }
          const newScene = {
            id: beat.id,
            beat: beat.id,
            minSec: 4,
            layout,
            elements: body.elements || defaultElements
          };
          validateSceneUpdate(newScene, story);
          fs.mkdirSync(path.dirname(scPath), { recursive: true });
          fs.writeFileSync(scPath, JSON.stringify(newScene, null, 2));
          fs.writeFileSync(storyPath, JSON.stringify(story, null, 2));

          const comp = compileProject(projectDir);
          const retime = story.meta.director ? invalidateTimeline(projectDir) : false;
          const updated = ir.loadProject(projectDir, LAYOUT_NAMES);
          // 结构写入成功即 ok；医学门诊断（如 MED_FACT_UNVERIFIED，源于项目里待核实的 facts）
          // 属于内容级阻断，不该让"插入普通分镜"这个结构操作报失败——compile 诊断透传给前端展示。
          const structuralErrors = (comp.errors || []).filter(e => !e.includes('MED_'));
          sendJson(res, 200, { ok: structuralErrors.length === 0, compile: comp, project: updated, retime });
          return;
        }

        // POST /api/beat/delete (删除分镜)
        if (pathname === '/api/beat/delete' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          if (activeProjects.has(fs.realpathSync(projectDir))) throw Object.assign(new Error('请等当前配音或导出结束。'), { statusCode: 409 });
          const beatId = body.beatId;
          if (!beatId) {
            sendJson(res, 400, { ok: false, error: 'beatId is required' });
            return;
          }
          const storyPath = projectFilePath(projectDir, 'story.json');
          if (!fs.existsSync(storyPath)) {
            sendJson(res, 400, { ok: false, error: 'story.json not found' });
            return;
          }
          const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
          if (!story.beats || story.beats.length <= 1) {
            sendJson(res, 400, { ok: false, error: 'Cannot delete the only remaining beat' });
            return;
          }
          const scPath = sceneFilePath(projectDir, beatId);
          if (!story.beats.some(b => b.id === beatId)) {
            sendJson(res, 400, { ok: false, error: 'Unknown beat ID' });
            return;
          }
          story.beats = story.beats.filter(b => b.id !== beatId);
          fs.writeFileSync(storyPath, JSON.stringify(story, null, 2));

          if (fs.existsSync(scPath)) fs.unlinkSync(scPath);

          const comp = compileProject(projectDir);
          const retime = story.meta.director ? invalidateTimeline(projectDir) : false;
          const updated = ir.loadProject(projectDir, LAYOUT_NAMES);
          // 结构写入成功即 ok；医学门诊断（内容级阻断）透传 compile 字段给前端展示
          const structuralErrors = (comp.errors || []).filter(e => !e.includes('MED_'));
          sendJson(res, 200, { ok: structuralErrors.length === 0, compile: comp, project: updated, retime });
          return;
        }

        // POST /api/beat/reorder (调整分镜排序)
        if (pathname === '/api/beat/reorder' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          if (activeProjects.has(fs.realpathSync(projectDir))) throw Object.assign(new Error('请等当前配音或导出结束。'), { statusCode: 409 });
          const order = body.order;
          if (!Array.isArray(order) || order.length === 0) {
            sendJson(res, 400, { ok: false, error: 'order array of beatIds is required' });
            return;
          }
          const storyPath = projectFilePath(projectDir, 'story.json');
          const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
          const beatMap = new Map((story.beats || []).map(b => [b.id, b]));
          if (order.length !== beatMap.size || new Set(order).size !== beatMap.size || order.some(id => !beatMap.has(id))) {
            sendJson(res, 400, { ok: false, error: 'order must be a permutation of all beat IDs' });
            return;
          }
          const newBeats = [];
          for (const id of order) {
            if (beatMap.has(id)) newBeats.push(beatMap.get(id));
          }
          story.beats = newBeats;
          fs.writeFileSync(storyPath, JSON.stringify(story, null, 2));

          const comp = compileProject(projectDir);
          const retime = story.meta.director ? invalidateTimeline(projectDir) : false;
          const updated = ir.loadProject(projectDir, LAYOUT_NAMES);
          // 结构写入成功即 ok；医学门诊断（内容级阻断）透传 compile 字段给前端展示
          const structuralErrors = (comp.errors || []).filter(e => !e.includes('MED_'));
          sendJson(res, 200, { ok: structuralErrors.length === 0, compile: comp, project: updated, retime });
          return;
        }

        // POST /api/compile
        if (pathname === '/api/compile' && req.method === 'POST') {
          const comp = compileProject(projectDir);
          sendJson(res, 200, {
            ok: (comp.errors || []).filter(e => !e.includes('MED_')).length === 0,
            compile: comp
          });
          return;
        }

        if (pathname === '/api/motion' && req.method === 'POST') {
          const { motion } = await parseJsonBody(req);
          if (!MOTION_MODES.includes(motion)) {
            sendJson(res, 400, { ok: false, error: '请选择有效的动态编排。' });
            return;
          }
          if (activeProjects.has(fs.realpathSync(projectDir))) {
            sendJson(res, 409, { ok: false, error: '请在配音或导出完成后切换动态编排。' });
            return;
          }
          const project = ir.loadProject(projectDir, LAYOUT_NAMES);
          if (project.mode !== 'v2' || !project.scenes.some(canCompose)) {
            sendJson(res, 400, { ok: false, error: '此项目没有可应用编排的标题或单要点分镜。' });
            return;
          }
          const storyPath = projectFilePath(projectDir, 'story.json');
          const staged = path.join(projectDir, '.motion-' + crypto.randomUUID() + '.json');
          project.story.meta.motion = motion;
          fs.writeFileSync(staged, JSON.stringify(project.story, null, 2), { flag: 'wx' });
          try {
            const result = compileProject(projectDir, { motion });
            if (result.errors.length) {
              sendJson(res, 422, { ok: false, error: result.errors[0] });
              return;
            }
            try {
              fs.renameSync(staged, storyPath);
            } catch (error) {
              compileProject(projectDir);
              throw error;
            }
          } finally {
            fs.rmSync(staged, { force: true });
          }
          sendJson(res, 200, { ok: true, motion });
          return;
        }

        // POST /api/style
        if (pathname === '/api/style' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const style = body.style;
          if (!style || !ir.STYLES.includes(style)) {
            sendJson(res, 400, { ok: false, error: `Invalid style: ${style}. Must be one of: ${ir.STYLES.join(', ')}` });
            return;
          }

          const storyPath = projectFilePath(projectDir, 'story.json');
          if (fs.existsSync(storyPath)) {
            const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
            story.meta = story.meta || {};
            story.meta.style = style;
            fs.writeFileSync(storyPath, JSON.stringify(story, null, 2));
          }

          const tokensPath = projectFilePath(projectDir, 'tokens.json');
          if (fs.existsSync(tokensPath)) {
            const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
            if (tokens.style) {
              tokens.style = style;
              fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
            }
          }

          const comp = compileProject(projectDir);
          const updated = ir.loadProject(projectDir, LAYOUT_NAMES);

          sendJson(res, 200, {
            ok: (comp.errors || []).filter(e => !e.includes('MED_')).length === 0,
            style,
            tokens: updated.tokens,
            compile: comp
          });
          return;
        }

        // POST /api/scene
        if (pathname === '/api/scene' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const sc = body.scene;
          if (!sc || !sc.id) {
            sendJson(res, 400, { ok: false, error: 'scene object with id is required' });
            return;
          }

          const dir = fs.realpathSync(projectDir);
          if (activeProjects.has(dir)) throw Object.assign(new Error('请等当前配音或导出结束。'), { statusCode: 409 });
          const current = readShot(dir, sc.id);
          if (current.story.meta.director?.locked?.includes(sc.id)) {
            throw Object.assign(new Error('请先解锁当前镜头。'), { statusCode: 409 });
          }
          const { narration, segment, ...scene } = sc;
          if (current.scene.segment) scene.segment = current.scene.segment;
          const result = saveShot(dir, current, { ...scene, beat: sc.id },
            { ...current.beat, narration: typeof narration === 'string' ? narration.trim() : current.beat.narration },
            { sharedRoute: body.sharedRoute });
          sendJson(res, 200, { ok: true, ...result });
          return;
        }

        // POST /api/story
        if (pathname === '/api/story' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const story = body.story;
          if (!story) {
            sendJson(res, 400, { ok: false, error: 'story object is required' });
            return;
          }

          const validation = ir.validateStory(story);
          if (!validation.ok) throw Object.assign(new Error(validation.errors.join('; ')), { statusCode: 400 });
          const current = JSON.parse(fs.readFileSync(projectFilePath(projectDir, 'story.json'), 'utf8'));
          if (story.beats.length !== current.beats.length || story.beats.some(b => !current.beats.some(c => c.id === b.id))) {
            throw Object.assign(new Error('Use beat endpoints to change the scene list'), { statusCode: 400 });
          }
          if (current.meta.director) {
            story.meta.director = current.meta.director;
            const changed = story.beats.filter(beat => {
              const original = current.beats.find(b => b.id === beat.id);
              return JSON.stringify(beat.facts) !== JSON.stringify(original.facts) || beat.narration !== original.narration;
            });
            updateReview(story, [...pendingShots(current), ...changed.map(beat => beat.id)]);
          }
          const storyPath = projectFilePath(projectDir, 'story.json');
          fs.writeFileSync(storyPath, JSON.stringify(story, null, 2));

          const comp = compileProject(projectDir);
          sendJson(res, 200, {
            ok: (comp.errors || []).filter(e => !e.includes('MED_')).length === 0,
            compile: comp
          });
          return;
        }

        // GET /api/lint
        if (pathname === '/api/lint' && req.method === 'GET') {
          const diagResult = collectAllDiagnostics(projectDir);
          sendJson(res, 200, diagResult);
          return;
        }

        // 创片导出使用固定的工程副本，继续编辑时不会改变正在渲染的内容。
        if ((pathname === '/api/tts' || pathname === '/api/export') && req.method === 'POST') {
          const workDir = fs.realpathSync(projectDir);
          const body = await parseJsonBody(req);
          const storyPath = path.join(workDir, 'story.json');
          const scriptPath = path.join(workDir, 'script.json');
          const story = fs.existsSync(storyPath) ? JSON.parse(fs.readFileSync(storyPath, 'utf8')) : null;
          const backend = body.backend || (story
            ? story.meta?.tts?.backend
            : fs.existsSync(scriptPath) && JSON.parse(fs.readFileSync(scriptPath, 'utf8')).tts?.backend) || 'local';
          if (!['local', 'bailian'].includes(backend)) {
            sendJson(res, 400, { ok: false, error: '未知配音后端' });
            return;
          }
          const isExport = pathname === '/api/export';
          if (isExport && story && pendingShots(story).length) {
            sendJson(res, 422, { ok: false, error: '请先核对医学内容与出处，再正式导出。' });
            return;
          }
          if (activeProjects.has(workDir) || (isExport && activeExports.has(workDir))) {
            sendJson(res, 409, { ok: false, error: '当前工程正在配音或导出' });
            return;
          }
          const snapshot = isExport && story?.meta.director ? projectSnapshot(workDir) : null;
          const busy = snapshot ? activeExports : activeProjects;
          busy.add(workDir);
          function run(name, args, onLog, timeout) {
            return runWorker(path.join(__dirname, name), args, {
              cwd: snapshot || workDir, onLog, spawnProcess: options.spawnProcess, timeout
            });
          }

          if (pathname === '/api/tts') {
            let logs = '';
            const log = chunk => { logs += chunk; };
            try {
              await run('compile.js', [], log, 30000);
              const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
              const ttsArgs = ['--backend', backend, ...(body.retime === true ? ['--reuse'] : [])];
              if (script.scenes.some(sc => sc.id === body.only) &&
                  script.scenes.every(sc => sc.id === body.only || fs.existsSync(path.join(workDir, 'vo', sc.id + '.wav')))) {
                ttsArgs.push('--only', body.only);
              }
              if (body.retime !== true || !script.scenes.every(sc => fs.existsSync(path.join(workDir, 'vo', sc.id + '.wav')))) {
                await run('tts.js', ttsArgs, log, 300000);
              }
              await run('build_timeline.js', [], log, 30000);
              await run('assemble_audio.js', [], log, 30000);
              sendJson(res, 200, { ok: true, code: 0, logs });
            } catch (error) {
              sendJson(res, 200, { ok: false, code: 1, logs: logs + '\n' + error.message });
            } finally {
              activeProjects.delete(workDir);
            }
            return;
          }

          const taskId = 'task_' + crypto.randomUUID();
          const task = { id: taskId, status: 'running', progress: 10, log: 'Starting export pipeline...\n' };
          tasks.set(taskId, task);
          const log = chunk => {
            task.log = (task.log + chunk).slice(-65536);
            if (/==> [1-5]/.test(chunk)) task.progress = Math.min(task.progress + 10, 95);
          };
          run('export.js', [backend, 'output'], log)
            .then(() => {
              if (snapshot) {
                const destination = path.join(workDir, 'out');
                fs.mkdirSync(destination, { recursive: true });
                const exportPath = path.join(destination, 'output.mp4');
                const tempPath = path.join(destination, taskId + '.mp4.tmp');
                try {
                  fs.copyFileSync(path.join(snapshot, 'out', 'output.mp4'), tempPath);
                  fs.renameSync(tempPath, exportPath);
                } finally {
                  fs.rmSync(tempPath, { force: true });
                }
              }
              task.status = 'done';
              task.progress = 100;
            })
            .catch(error => {
              task.status = 'error';
              log('\nExport failed: ' + error.message);
            })
            .finally(() => {
              busy.delete(workDir);
              if (snapshot) fs.rmSync(snapshot, { recursive: true, force: true });
            });
          sendJson(res, 200, { ok: true, taskId });
          return;
        }

        // GET /api/task-status
        if (pathname === '/api/task-status' && req.method === 'GET') {
          const taskId = searchParams.get('taskId');
          if (!taskId || !tasks.has(taskId)) {
            sendJson(res, 404, { ok: false, error: 'Task not found: ' + taskId });
            return;
          }
          sendJson(res, 200, tasks.get(taskId));
          return;
        }

        sendJson(res, 404, { ok: false, error: 'Unknown API endpoint: ' + pathname });
        return;
      } catch (err) {
        sendJson(res, err.statusCode || 500, { ok: false, error: err.message });
        return;
      }
    }

    // 3. 动态时间轴回退：GET /timeline.json
    if (pathname === '/timeline.json' && !fs.existsSync(path.join(projectDir, 'timeline.json'))) {
      const syn = getOrSynthesizeTimeline(projectDir);
      sendJson(res, 200, syn);
      return;
    }

    // 4. 静态文件伺服与安全路径校验（防目录穿越）
    let decodedPath = '';
    try {
      decodedPath = decodeURIComponent(rawPathname);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('400 Bad Request');
      return;
    }

    if (decodedPath.includes('..') || rawPathname.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden: Directory traversal attempt detected.');
      return;
    }

    let staticRoot = projectDir;
    if (decodedPath.startsWith('/director-preview/')) {
      const match = /^\/director-preview\/([a-f0-9-]+)\/(scene\.html|timeline\.json|vo\/narration\.wav|assets\/[a-f0-9]{64}\.(?:png|jpg|webp|svg|mp4|webm))$/.exec(decodedPath);
      if (!match || !shotDraft || match[1] !== shotDraft.token) {
        sendJson(res, 404, { ok: false, error: '改版预览已关闭。' });
        return;
      }
      staticRoot = shotDraft.root;
      decodedPath = '/' + match[2];
    }
    const reqPath = decodedPath.startsWith('/') ? '.' + decodedPath : './' + decodedPath;
    const safePath = path.resolve(staticRoot, reqPath);

    if (safePath !== staticRoot && !safePath.startsWith(staticRoot + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden: Directory traversal attempt detected.');
      return;
    }

    fs.stat(safePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found: ' + pathname);
        return;
      }

      let realRoot, realFile;
      try {
        realRoot = fs.realpathSync(staticRoot);
        realFile = fs.realpathSync(safePath);
      } catch {
        sendJson(res, 404, { ok: false, error: '文件已移除。' });
        return;
      }
      if (!realFile.startsWith(realRoot + path.sep)) {
        sendJson(res, 403, { ok: false, error: 'File is outside the project' });
        return;
      }
      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const headers = {
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Cache-Control': 'no-cache'
      };
      const seekable = contentType.startsWith('audio/') || contentType.startsWith('video/');
      if (seekable) headers['Accept-Ranges'] = 'bytes';
      const range = seekable && /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
      let streamRange;
      if (range) {
        const start = Number(range[1]);
        const end = Math.min(stats.size - 1, range[2] ? Number(range[2]) : stats.size - 1);
        if (!Number.isSafeInteger(start) || start > end) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + stats.size });
          res.end();
          return;
        }
        headers['Content-Length'] = end - start + 1;
        headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
        streamRange = { start, end };
      }
      res.writeHead(streamRange ? 206 : 200, headers);
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(safePath, streamRange).pipe(res);
    });
  });

  return {
    server,
    get projectDir() { return projectDir; },
    csrfToken,
    port,
    host,
    start: () => new Promise((resolve, reject) => {
      server.listen(port, host, () => {
        const actualPort = server.address().port;
        resolve({ host, port: actualPort, projectDir });
      });
      server.on('error', reject);
    }),
    close: () => new Promise((resolve) => {
      server.close(() => {
        clearShotDraft();
        if (draftAssets) fs.rmSync(draftAssets, { recursive: true, force: true });
        resolve();
      });
    })
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let customPort = 3000;
  let customDir = null;
  let autoOpen = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      customPort = parseInt(args[++i], 10);
    } else if (args[i] === '--open') {
      autoOpen = true;
    } else if (!args[i].startsWith('--') && !customDir) {
      customDir = args[i];
    }
  }

  const app = createStudioServer({ projectDir: customDir, port: customPort });
  app.start().then(({ host, port, projectDir }) => {
    const urlStr = `http://${host}:${port}`;
    console.log(`\n======================================================`);
    console.log(`  🎬 mg-studio Web 工作台 (Studio UI) 运行中`);
    console.log(`  🌍 地址: ${urlStr}`);
    console.log(`  📁 项目: ${projectDir}`);
    console.log(`  🔒 安全: 本地回环 127.0.0.1 (零外部依赖)`);
    console.log(`======================================================\n`);

    if (autoOpen) {
      try {
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        execFileSync(cmd, [urlStr]);
      } catch (e) {
        // ignore open error
      }
    }
  }).catch(err => {
    console.error('Studio server failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = { createStudioServer, resolveProjectDir, getOrSynthesizeTimeline, collectAllDiagnostics };

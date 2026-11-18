#!/usr/bin/env node
'use strict';
/* studio.js — mg-studio 本地可视化 Web 工作台服务器
 * 纯 Node.js 原生标准库实现，零额外 npm 运行时依赖。
 * 严格监听 127.0.0.1 本地回环，杜绝路径穿越。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { projectFilePath, sceneFilePath, validateSceneUpdate } = require('../lib/project-files');
const { execFileSync } = require('child_process');
const { runWorker } = require('../lib/worker');

const ir = require('../lib/ir');
const { LAYOUT_NAMES, COMPONENTS } = require('../lib/components');
const { compileProject, normalizeScene } = require('../lib/compile');
const { lintStory } = require('../lib/story-lint');
const { lintScript } = require('../lib/script-lint');
const { lintMedical } = require('../lib/medical-lint');
const { lintMotion } = require('../lib/motion-lint');
const { loadTemplate } = require('../lib/narratives');
const { splitSubs } = require('../lib/subs');
const { searchLiterature, getCuratedTopics } = require('../lib/research');
const { buildStoryboardDefinition, writeAndCompileGeneratedProject } = require('../lib/ai-generator');
const { extractRawText, analyzeDocumentText } = require('../lib/doc-parser');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const activeProjects = new Set();

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
    const estDur = Math.max(sc.minSec || 0, isIntro ? 6.5 : isOutro ? 8.5 : Math.max(4.0, Math.round(textLen / 4.0) + 1.5));
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
      const normScenes = project.scenes.map(sc => normalizeScene(sc, COMPONENTS));
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
            project: projectData
          });
          return;
        }

        // GET /api/topics (精选推荐选题)
        if (pathname === '/api/topics' && req.method === 'GET') {
          sendJson(res, 200, { ok: true, topics: getCuratedTopics() });
          return;
        }

        // POST /api/research (文献检索与事实抽取)
        if (pathname === '/api/research' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const query = body.query || '';
          const maxResults = body.maxResults || 5;
          const result = await searchLiterature(query, { maxResults });
          sendJson(res, 200, result);
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

        // POST /api/create-project (一键创建/重构新项目并编译)
        if (pathname === '/api/create-project' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          // 医学门：verified 只能来自创作者逐条核实（_checked），服务端不再批量置 true。
          // 患者向项目存在 verified:false 的 fact 会被 lintMedical(MED_FACT_UNVERIFIED) B 级阻断。
          if (Array.isArray(body.facts)) {
            body.facts = body.facts.map(f => Object.assign({}, f, { verified: f._checked === true ? true : false }));
          }
          const generated = buildStoryboardDefinition(body);
          const targetDir = path.join(projectsDir, 'project-' + crypto.randomUUID());
          const result = writeAndCompileGeneratedProject(targetDir, generated);
          if (result.ok) projectDir = targetDir;
          sendJson(res, 200, result);
          return;
        }

        // POST /api/beat/add (动态插入新分镜)
        if (pathname === '/api/beat/add' && req.method === 'POST') {
          const body = await parseJsonBody(req);
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
          const updated = ir.loadProject(projectDir, LAYOUT_NAMES);
          // 结构写入成功即 ok；医学门诊断（如 MED_FACT_UNVERIFIED，源于项目里待核实的 facts）
          // 属于内容级阻断，不该让"插入普通分镜"这个结构操作报失败——compile 诊断透传给前端展示。
          const structuralErrors = (comp.errors || []).filter(e => !e.includes('MED_'));
          sendJson(res, 200, { ok: structuralErrors.length === 0, compile: comp, project: updated });
          return;
        }

        // POST /api/beat/delete (删除分镜)
        if (pathname === '/api/beat/delete' && req.method === 'POST') {
          const body = await parseJsonBody(req);
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
          const updated = ir.loadProject(projectDir, LAYOUT_NAMES);
          // 结构写入成功即 ok；医学门诊断（内容级阻断）透传 compile 字段给前端展示
          const structuralErrors = (comp.errors || []).filter(e => !e.includes('MED_'));
          sendJson(res, 200, { ok: structuralErrors.length === 0, compile: comp, project: updated });
          return;
        }

        // POST /api/beat/reorder (调整分镜排序)
        if (pathname === '/api/beat/reorder' && req.method === 'POST') {
          const body = await parseJsonBody(req);
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
          const updated = ir.loadProject(projectDir, LAYOUT_NAMES);
          // 结构写入成功即 ok；医学门诊断（内容级阻断）透传 compile 字段给前端展示
          const structuralErrors = (comp.errors || []).filter(e => !e.includes('MED_'));
          sendJson(res, 200, { ok: structuralErrors.length === 0, compile: comp, project: updated });
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

          const scPath = sceneFilePath(projectDir, sc.id);
          const story = JSON.parse(fs.readFileSync(projectFilePath(projectDir, 'story.json'), 'utf8'));
          validateSceneUpdate(sc, story);
          fs.mkdirSync(path.dirname(scPath), { recursive: true });
          fs.writeFileSync(scPath, JSON.stringify(sc, null, 2));

          const comp = compileProject(projectDir);
          sendJson(res, 200, {
            ok: (comp.errors || []).filter(e => !e.includes('MED_')).length === 0,
            compile: comp
          });
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

        // 配音和出片都会写同一工程的音轨与时间轴。
        if ((pathname === '/api/tts' || pathname === '/api/export') && req.method === 'POST') {
          const workDir = fs.realpathSync(projectDir);
          const body = await parseJsonBody(req);
          const storyPath = path.join(workDir, 'story.json');
          const scriptPath = path.join(workDir, 'script.json');
          const backend = body.backend || (fs.existsSync(storyPath)
            ? JSON.parse(fs.readFileSync(storyPath, 'utf8')).meta?.tts?.backend
            : fs.existsSync(scriptPath) && JSON.parse(fs.readFileSync(scriptPath, 'utf8')).tts?.backend) || 'local';
          if (!['local', 'bailian'].includes(backend)) {
            sendJson(res, 400, { ok: false, error: '未知配音后端' });
            return;
          }
          if (activeProjects.has(workDir)) {
            sendJson(res, 409, { ok: false, error: '当前工程正在配音或导出' });
            return;
          }
          activeProjects.add(workDir);
          function run(name, args, onLog, timeout) {
            return runWorker(path.join(__dirname, name), args, {
              cwd: workDir, onLog, spawnProcess: options.spawnProcess, timeout
            });
          }

          if (pathname === '/api/tts') {
            let logs = '';
            const log = chunk => { logs += chunk; };
            try {
              await run('compile.js', [], log, 30000);
              await run('tts.js', ['--backend', backend], log, 300000);
              await run('build_timeline.js', [], log, 30000);
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
              task.status = 'done';
              task.progress = 100;
            })
            .catch(error => {
              task.status = 'error';
              log('\nExport failed: ' + error.message);
            })
            .finally(() => activeProjects.delete(workDir));
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

    let reqPath = decodedPath.startsWith('/') ? '.' + decodedPath : './' + decodedPath;
    const safePath = path.resolve(projectDir, reqPath);

    if (safePath !== projectDir && !safePath.startsWith(projectDir + path.sep)) {
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

      const realRoot = fs.realpathSync(projectDir);
      const realFile = fs.realpathSync(safePath);
      if (!realFile.startsWith(realRoot + path.sep)) {
        sendJson(res, 403, { ok: false, error: 'File is outside the project' });
        return;
      }
      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(safePath).pipe(res);
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
      server.close(resolve);
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

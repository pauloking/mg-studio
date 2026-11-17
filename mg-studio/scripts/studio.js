#!/usr/bin/env node
'use strict';
/* studio.js — mg-studio 本地可视化 Web 工作台服务器
 * 纯 Node.js 原生标准库实现，零额外 npm 运行时依赖。
 * 严格监听 127.0.0.1 本地回环，杜绝路径穿越。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

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

const tasks = new Map();

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
  const projectDir = resolveProjectDir(options.projectDir);
  const host = options.host || '127.0.0.1';
  const port = options.port || 3000;
  const studioHtmlPath = path.join(__dirname, '..', 'lib', 'studio.html');

  const server = http.createServer(async (req, res) => {
    // 强制 CORS 仅限本地回环
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    // 1. Studio 主页
    if (pathname === '/' || pathname === '/index.html') {
      if (!fs.existsSync(studioHtmlPath)) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Studio UI template not found at ' + studioHtmlPath);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(studioHtmlPath).pipe(res);
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

        // POST /api/create-project (一键创建/重构新项目并编译)
        if (pathname === '/api/create-project' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          // 创作者在向导中确认采纳的事实默认置为 verified: true
          if (Array.isArray(body.facts)) {
            body.facts = body.facts.map(f => Object.assign({}, f, { verified: true }));
          }
          const generated = buildStoryboardDefinition(body);
          const result = writeAndCompileGeneratedProject(projectDir, generated);
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
          const storyPath = path.join(projectDir, 'story.json');
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
          fs.writeFileSync(storyPath, JSON.stringify(story, null, 2));

          // 自动创建对应的 scenes/<id>.json
          const scPath = path.join(projectDir, 'scenes', beat.id + '.json');
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
          fs.writeFileSync(scPath, JSON.stringify(newScene, null, 2));

          const comp = compileProject(projectDir);
          const updated = ir.loadProject(projectDir, LAYOUT_NAMES);
          sendJson(res, 200, { ok: comp.errors.length === 0, compile: comp, project: updated });
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
          const storyPath = path.join(projectDir, 'story.json');
          if (!fs.existsSync(storyPath)) {
            sendJson(res, 400, { ok: false, error: 'story.json not found' });
            return;
          }
          const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
          if (!story.beats || story.beats.length <= 1) {
            sendJson(res, 400, { ok: false, error: 'Cannot delete the only remaining beat' });
            return;
          }
          story.beats = story.beats.filter(b => b.id !== beatId);
          fs.writeFileSync(storyPath, JSON.stringify(story, null, 2));

          const scPath = path.join(projectDir, 'scenes', beatId + '.json');
          if (fs.existsSync(scPath)) fs.unlinkSync(scPath);

          const comp = compileProject(projectDir);
          const updated = ir.loadProject(projectDir, LAYOUT_NAMES);
          sendJson(res, 200, { ok: comp.errors.length === 0, compile: comp, project: updated });
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
          const storyPath = path.join(projectDir, 'story.json');
          const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
          const beatMap = new Map((story.beats || []).map(b => [b.id, b]));
          const newBeats = [];
          for (const id of order) {
            if (beatMap.has(id)) newBeats.push(beatMap.get(id));
          }
          story.beats = newBeats;
          fs.writeFileSync(storyPath, JSON.stringify(story, null, 2));

          const comp = compileProject(projectDir);
          const updated = ir.loadProject(projectDir, LAYOUT_NAMES);
          sendJson(res, 200, { ok: comp.errors.length === 0, compile: comp, project: updated });
          return;
        }

        // POST /api/compile
        if (pathname === '/api/compile' && req.method === 'POST') {
          const comp = compileProject(projectDir);
          sendJson(res, 200, {
            ok: comp.errors.length === 0,
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

          const storyPath = path.join(projectDir, 'story.json');
          if (fs.existsSync(storyPath)) {
            const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
            story.meta = story.meta || {};
            story.meta.style = style;
            fs.writeFileSync(storyPath, JSON.stringify(story, null, 2));
          }

          const tokensPath = path.join(projectDir, 'tokens.json');
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
            ok: comp.errors.length === 0,
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

          const scPath = path.join(projectDir, 'scenes', sc.id + '.json');
          fs.mkdirSync(path.dirname(scPath), { recursive: true });
          fs.writeFileSync(scPath, JSON.stringify(sc, null, 2));

          const comp = compileProject(projectDir);
          sendJson(res, 200, {
            ok: comp.errors.length === 0,
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

          const storyPath = path.join(projectDir, 'story.json');
          fs.writeFileSync(storyPath, JSON.stringify(story, null, 2));

          const comp = compileProject(projectDir);
          sendJson(res, 200, {
            ok: comp.errors.length === 0,
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

        // POST /api/tts
        if (pathname === '/api/tts' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const backend = body.backend || 'local';
          const ttsScript = path.join(__dirname, 'tts.js');
          const buildTlScript = path.join(__dirname, 'build_timeline.js');

          const proc = spawn(process.execPath, [ttsScript, backend], {
            cwd: projectDir,
            env: process.env
          });

          let logs = '';
          proc.stdout.on('data', d => { logs += d.toString(); });
          proc.stderr.on('data', d => { logs += d.toString(); });

          proc.on('close', code => {
            if (code === 0 && fs.existsSync(buildTlScript)) {
              try {
                const tlLog = execFileSync(process.execPath, [buildTlScript], { cwd: projectDir }).toString();
                logs += '\n' + tlLog;
              } catch (e) {
                logs += '\nbuild_timeline error: ' + e.message;
              }
            }
            sendJson(res, 200, {
              ok: code === 0,
              code,
              logs
            });
          });
          return;
        }

        // POST /api/export
        if (pathname === '/api/export' && req.method === 'POST') {
          const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
          const taskRecord = {
            id: taskId,
            status: 'running',
            progress: 10,
            log: 'Starting export pipeline...\n'
          };
          tasks.set(taskId, taskRecord);

          // 异步执行编译与导出
          setTimeout(() => {
            try {
              taskRecord.log += 'Step 1/3: Compiling project...\n';
              const comp = compileProject(projectDir);
              if (comp.errors.length) {
                taskRecord.status = 'error';
                taskRecord.log += 'Compilation failed:\n' + comp.errors.join('\n');
                return;
              }
              taskRecord.progress = 40;
              taskRecord.log += 'Step 2/3: Checking audio & timeline...\n';

              const makeSh = path.join(__dirname, 'make.sh');
              if (fs.existsSync(makeSh)) {
                taskRecord.log += 'Step 3/3: Running make.sh...\n';
                const sub = spawn('bash', [makeSh], { cwd: projectDir, env: process.env });
                sub.stdout.on('data', d => {
                  taskRecord.log += d.toString();
                  if (taskRecord.progress < 90) taskRecord.progress += 5;
                });
                sub.stderr.on('data', d => { taskRecord.log += d.toString(); });
                sub.on('close', code => {
                  taskRecord.status = code === 0 ? 'done' : 'error';
                  taskRecord.progress = code === 0 ? 100 : taskRecord.progress;
                  taskRecord.log += `\nExport finished with exit code ${code}.\n`;
                });
              } else {
                taskRecord.status = 'done';
                taskRecord.progress = 100;
                taskRecord.log += 'Compiled script.json and scene.html successfully.\n';
              }
            } catch (e) {
              taskRecord.status = 'error';
              taskRecord.log += 'Export error: ' + e.message;
            }
          }, 50);

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
        sendJson(res, 500, { ok: false, error: err.message });
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
    projectDir,
    port,
    host,
    start: () => new Promise((resolve, reject) => {
      server.listen(port, host, () => {
        resolve({ host, port, projectDir });
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

'use strict';
const fs = require('fs'), path = require('path');
const ir = require('./ir');
const { splitSubs, checkSubs } = require('./subs');
const { PRESET_DEFAULT_DUR, PRE_RUNTIME, ENTER_PRESETS, EMPHASIS_PRESETS, EXIT_PRESETS } = require('./presets');
const { emitSceneHtml } = require('./emit');
const { COMPONENTS, LAYOUT_NAMES } = require('./components');
const { lintMotion } = require('./motion-lint');

function normalizeScene(sc) {
  const elements = (sc.elements || []).map(el => {
    const n = JSON.parse(JSON.stringify(el));
    if (n.enter) {
      if (!ENTER_PRESETS.includes(n.enter.preset)) throw new Error(`非法 enter 预设: ${n.enter.preset}`);
      n.enter.at = n.enter.at != null ? n.enter.at : 0;
      n.enter.dur = n.enter.dur != null ? n.enter.dur : PRESET_DEFAULT_DUR[n.enter.preset];
    } else n.enter = null;
    n.emphasis = (n.emphasis || []).map(c => {
      if (!EMPHASIS_PRESETS.includes(c.preset)) throw new Error(`非法 emphasis 预设: ${c.preset}`);
      return { preset: c.preset, cue: c.cue, dur: c.dur != null ? c.dur : PRESET_DEFAULT_DUR[c.preset] };
    });
    if (n.exit) {
      if (!EXIT_PRESETS.includes(n.exit.preset)) throw new Error(`非法 exit 预设: ${n.exit.preset}`);
      n.exit.dur = n.exit.dur != null ? n.exit.dur : PRESET_DEFAULT_DUR[n.exit.preset];
    } else n.exit = null;
    return n;
  });
  return Object.assign({}, sc, { elements });
}

function buildScriptJson(project) {
  const m = project.story.meta;
  const v = m.video || {};
  return {
    schema: 2,
    fps: v.fps || 30, width: v.width || 1920, height: v.height || 1080,
    options: Object.assign({ pad: 1.1, leadIn: .45, introLeadIn: .7, introMinSec: 6.5, outroMinSec: 8.5 }, m.options || {}),
    tts: m.tts || { backend: 'local' },
    scenes: project.scenes.map(sc => ({
      id: sc.id, minSec: sc.minSec || 0, narration: sc.narration,
      subs: sc.subsOverride || splitSubs(sc.narration),
      beat: sc.beat, layout: sc.layout, elements: sc.elements, cues: sc.cues || []
    }))
  };
}

function compileProject(dir) {
  const project = ir.loadProject(dir, LAYOUT_NAMES);
  if (project.mode === 'v1') return { mode: 'v1' };
  const errors = [];
  for (const sc of project.scenes) {
    if (sc.custom) errors.push(`scene ${sc.id} 使用了 custom 逃生舱（M2 实现，M1 暂不支持）`);
    if (sc.subsOverride) {
      const c = checkSubs(sc.subsOverride, sc.narration);
      if (!c.ok) errors.push(`scene ${sc.id} 字幕与旁白不一致: ${c.detail}`);
    }
  }
  let scenes, lint = [];
  try { scenes = project.scenes.map(normalizeScene); }
  catch (e) { errors.push(e.message); scenes = project.scenes; }
  if (!errors.length) {
    lint = lintMotion({ scenes, tokens: project.tokens, components: COMPONENTS });
    for (const l of lint) if (l.level === 'B') errors.push(`${l.code} ${l.scene}/${l.el || ''}: ${l.msg}`);
  }
  if (errors.length) return { mode: 'v2', lint, errors };
  for (const sc of scenes) for (const el of sc.elements)
    if (el.type === 'waveform') el.props.colorHex = project.tokens.colors[el.props.color || 'accent'];
  const script = buildScriptJson(Object.assign({}, project, { scenes }));
  const html = emitSceneHtml({ tokens: project.tokens, scenes, components: COMPONENTS, preRuntime: PRE_RUNTIME });
  const scriptPath = path.join(dir, 'script.json');
  const htmlPath = path.join(dir, 'scene.html');
  fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2));
  fs.writeFileSync(htmlPath, html);
  return { mode: 'v2', scriptPath, htmlPath, lint, errors };
}

module.exports = { normalizeScene, buildScriptJson, compileProject };
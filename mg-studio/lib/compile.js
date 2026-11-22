'use strict';
const fs = require('fs'), path = require('path');
const ir = require('./ir');
const { splitSubs, checkSubs } = require('./subs');
const { PRESET_DEFAULT_DUR, PRE_RUNTIME, ENTER_PRESETS, EMPHASIS_PRESETS, EXIT_PRESETS, EASINGS } = require('./presets');
const { emitSceneHtml } = require('./emit');
const { COMPONENTS, LAYOUT_NAMES } = require('./components');
const { lintMotion } = require('./motion-lint');
const { lintMedical, DISCLAIMER } = require('./medical-lint');
const { lintVisualQuality } = require('./visual-quality');
const { checkElementProps } = require('./props');
const { composeScenes } = require('./motion-plan');
const { checkedAssetPath } = require('./project-assets');
const { visualContext } = require('./shared-stage');

require('./cli-help').help('用法: node compile.js [项目目录]\n编译 story.json + scenes/ → script.json + scene.html；B 级 lint 阻断写出。');

function normalizeScene(sc, components = COMPONENTS) {
  const errors = [];
  const elements = (sc.elements || []).map(el => {
    const n = JSON.parse(JSON.stringify(el));
    if (n.enter) {
      if (!ENTER_PRESETS.includes(n.enter.preset)) throw new Error(`非法 enter 预设: ${n.enter.preset}`);
      n.enter.at = n.enter.at != null ? n.enter.at : 0;
      n.enter.dur = n.enter.dur != null ? n.enter.dur : PRESET_DEFAULT_DUR[n.enter.preset];
      if (!Number.isFinite(n.enter.at)) throw new Error(`scene ${sc.id} element ${n.id} enter.at 须为有限数: ${n.enter.at}`);
      if (!Number.isFinite(n.enter.dur) || n.enter.dur <= 0) throw new Error(`scene ${sc.id} element ${n.id} enter.dur 须为正有限数: ${n.enter.dur}`);
      if (n.enter.easing != null && !EASINGS.includes(n.enter.easing)) {
        throw new Error(`scene ${sc.id} element ${n.id} 非法 enter.easing: ${n.enter.easing}`);
      }
    } else n.enter = null;
    n.emphasis = (n.emphasis || []).map(c => {
      if (!EMPHASIS_PRESETS.includes(c.preset)) throw new Error(`非法 emphasis 预设: ${c.preset}`);
      const dur = c.dur != null ? c.dur : PRESET_DEFAULT_DUR[c.preset];
      if (!Number.isFinite(dur) || dur <= 0) throw new Error(`scene ${sc.id} element ${n.id} emphasis.dur 须为正有限数: ${dur}`);
      return { preset: c.preset, cue: c.cue, dur };
    });
    if (n.exit) {
      if (!EXIT_PRESETS.includes(n.exit.preset)) throw new Error(`非法 exit 预设: ${n.exit.preset}`);
      n.exit.dur = n.exit.dur != null ? n.exit.dur : PRESET_DEFAULT_DUR[n.exit.preset];
      if (!Number.isFinite(n.exit.dur) || n.exit.dur <= 0) throw new Error(`scene ${sc.id} element ${n.id} exit.dur 须为正有限数: ${n.exit.dur}`);
    } else n.exit = null;
    // props 校验：数值/文本类型收敛，防止未校验值进入生成的 JS（坐标注入）或被字符串比较静默放行
    errors.push(...checkElementProps(sc.layout, n, components).map(m => `scene ${sc.id} ${m}`));
    return n;
  });
  if (errors.length) throw new Error(errors.join('\n'));
  return Object.assign({}, sc, { elements });
}

function buildScriptJson(project) {
  const m = project.story.meta;
  const v = m.video || {};
  const sharedStages = m.director?.sharedStages;
  return {
    schema: 2,
    renderContext: { tokens: project.tokens, disclaimer: m.audience === 'patient' ? DISCLAIMER : null,
      ...(sharedStages ? { sharedStages: visualContext(sharedStages) } : {}) },
    fps: v.fps || 30, width: v.width || 1920, height: v.height || 1080,
    options: Object.assign({ pad: 1.1, leadIn: .45, introLeadIn: .7, introMinSec: 6.5, outroMinSec: 8.5 },
      m.options || {}, m.director?.framePlan ? { framePlan: m.director.framePlan } : {}),
    tts: m.tts || { backend: 'local' },
    scenes: project.scenes.map(sc => ({
      id: sc.id, minSec: sc.minSec || 0, narration: sc.narration,
      subs: sc.subsOverride || splitSubs(sc.narration),
      beat: sc.beat, layout: sc.layout, elements: sc.elements, cues: sc.cues || [],
      ...(sc.animatic ? { animatic: true } : {}),
      ...(sc.segment ? { segment: sc.segment } : {}),
      ...(sc.stage ? { stage: sc.stage } : {}),
      ...(sc.transition ? { transition: sc.transition } : {})
    }))
  };
}

function prepareRenderScenes(project) {
  const original = project.scenes.map(sc => normalizeScene(sc));
  return composeScenes({ ...project, scenes: original }).map((sc, i) =>
    sc === original[i] ? sc : normalizeScene(sc));
}

function compileProject(dir, settings = {}) {
  const project = ir.loadProject(dir, LAYOUT_NAMES);
  if (project.mode === 'v1') return { mode: 'v1' };
  if (settings.motion != null) project.story.meta.motion = settings.motion;
  const errors = [];
  const vid = project.story.meta.video;
  if (vid && ((vid.fps != null && vid.fps !== 30) || (vid.width != null && vid.width !== 1920) || (vid.height != null && vid.height !== 1080)))
    errors.push('M1 渲染核冻结 30fps/1920×1080，meta.video 不可覆盖（fps/width/height）');
  for (const sc of project.scenes) {
    for (const layer of sc.elements) if (sc.layout === 'directed' && layer.props.media?.file) {
      try { checkedAssetPath(dir, layer.props.media); }
      catch (error) { errors.push(error.message); }
    }
    if (sc.custom) errors.push(`scene ${sc.id} 使用了 custom 逃生舱（M2 实现，M1 暂不支持）`);
    if (sc.subsOverride) {
      const c = checkSubs(sc.subsOverride, sc.narration);
      if (!c.ok) errors.push(`scene ${sc.id} 字幕与旁白不一致: ${c.detail}`);
    }
    for (const el of sc.elements || []) if (el.type === 'waveform') {
      const ck = (el.props && el.props.color) || 'accent';
      if (!(ck in project.tokens.colors)) errors.push(`scene ${sc.id} waveform ${el.id} color 键不存在于 tokens.colors: ${ck}`);
      if (el.props && el.props.annoColor != null && !(el.props.annoColor in project.tokens.colors)) errors.push(`scene ${sc.id} waveform ${el.id} annoColor 键不存在于 tokens.colors: ${el.props.annoColor}`);
    }
  }
  let scenes, lint = [];
  try { scenes = prepareRenderScenes(project); }
  catch (e) { errors.push(e.message); scenes = project.scenes; }
  if (!errors.length) {
    lint = lintMotion({ scenes, tokens: project.tokens, components: COMPONENTS });
    // 医学安全门（§6/§10）：与动效 lint 同批跑，B 级同样阻断写产物。
    // 用 project.scenes（带 beat.facts/narration），而非 normalizeScene 后的纯视觉 scenes。
    lint = lint.concat(lintMedical({ story: project.story, scenes: project.scenes }));
    // 视觉交付基线门：防几何占位/平涂色块被当交付（自动门此前不查画面质量）
    lint = lint.concat(lintVisualQuality({ scenes: project.scenes, dir }));
    for (const sc of project.scenes) if (sc.animatic)
      lint.push({ level: 'W', code: 'ANIMATIC_DRAFT', scene: sc.id, el: '', msg: 'animatic 草稿场景（gen_visual 产物），仅预览；交付前须 bespoke 作者画面替换' });
    for (const l of lint) if (l.level === 'B') errors.push(`${l.code} ${l.scene}/${l.el || ''}: ${l.msg}`);
  }
  if (errors.length) return { mode: 'v2', lint, errors };
  for (const sc of scenes) for (const el of sc.elements)
    if (el.type === 'waveform') {
      el.props.colorHex = project.tokens.colors[el.props.color || 'accent'];
      el.props.annoHex = (el.props.annoColor && project.tokens.colors[el.props.annoColor]) || '#ff5d5d';
    }
  const script = buildScriptJson(Object.assign({}, project, { scenes }));
  const html = emitSceneHtml({ tokens: project.tokens, scenes, components: COMPONENTS, preRuntime: PRE_RUNTIME,
    sharedStages: project.story.meta.director?.sharedStages,
    disclaimer: project.story.meta.audience === 'patient' ? DISCLAIMER : null });
  const scriptPath = path.join(dir, 'script.json');
  const htmlPath = path.join(dir, 'scene.html');
  fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2));
  fs.writeFileSync(htmlPath, html);
  return { mode: 'v2', scriptPath, htmlPath, lint, errors };
}

module.exports = { normalizeScene, prepareRenderScenes, buildScriptJson, compileProject };

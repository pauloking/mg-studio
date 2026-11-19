'use strict';
const fs = require('fs');
const path = require('path');
const ir = require('./ir');
const { compileProject } = require('./compile');
const { DISCLAIMER } = require('./medical-lint');
const { composeScenes } = require('./motion-plan');

function buildStoryboardDefinition({
  topic = '健康科普', audience = 'patient', template = 'science',
  durationTarget = 45, style = 'clean-medical', facts = []
}) {
  const cleanTopic = String(topic || '').trim() || '健康科普';
  const cleanAudience = ir.AUDIENCES.includes(audience) ? audience : 'patient';
  const cleanTemplate = ir.TEMPLATES.includes(template) ? template : 'science';
  const cleanStyle = ir.STYLES.includes(style) ? style : 'clean-medical';
  const cleanDur = Number.isFinite(Number(durationTarget)) && Number(durationTarget) > 0 ? Number(durationTarget) : 45;
  const activeFacts = (Array.isArray(facts) ? facts : []).filter(f => f && (f.claim || f.statement)).map(f => ({
    ...f, claim: String(f.claim || f.statement).trim(), verified: f._checked === true
  })).filter(f => f.claim);

  const structures = {
    science: ['hook', 'mechanism', 'evidence', 'takeaway'],
    product: ['hook', 'demo', 'evidence', 'cta'],
    teaching: ['objective', 'steps', 'summary'],
    free: ['hook', 'evidence', 'takeaway']
  };
  // Build one scene for each actual fact. A shorter outline still fits the topic
  // when there is not enough evidence to fill all the selected template roles.
  const actualTemplate = activeFacts.length < structures[cleanTemplate].length - 2 ? 'free' : cleanTemplate;
  const [first, ...roles] = structures[actualTemplate];
  const last = roles.pop();
  const outro = `最后，以上要点来自选用的资料。${cleanAudience === 'patient' ? DISCLAIMER + '。' : '可查阅出处了解适用范围。'}`;
  const shots = [
    { id: 'hook', role: first, title: '开场', narration: `首先，我们来了解${cleanTopic}。`, screen: cleanTopic, facts: [] },
    ...activeFacts.map((fact, index) => ({
      id: `fact_${index + 1}`, role: roles[index] || 'evidence', title: `要点 ${index + 1}`,
      narration: (index === 0 ? '先看第一个要点。' : '接下来，') + fact.claim,
      screen: fact.claim, facts: [fact]
    })),
    { id: 'takeaway', role: last, title: '小结', narration: outro, screen: '查阅原始资料，核对适用范围。', facts: [] }
  ];
  const minPerScene = Math.max(5, Math.round(cleanDur / shots.length));
  const beats = shots.map((shot, i) => ({
    id: shot.id, role: shot.role, emotion: i === 0 ? 4 : i === shots.length - 1 ? 3 : 2,
    intent: shot.title, narration: shot.narration, facts: shot.facts
  }));
  const scenes = shots.map((shot, i) => ({
    id: shot.id, beat: shot.id, minSec: Math.max(minPerScene, Math.ceil(shot.narration.length / 4.5 + 1.5)),
    layout: i === 0 ? 'title-card' : 'points',
    elements: i === 0 ? [
      { id: 'title', type: 'text', props: { role: 'title', content: shot.screen }, enter: { preset: 'scale', at: 0.3, dur: 0.8 } },
      { id: 'bar', type: 'bar', props: {}, enter: { preset: 'grow', at: 0.7, dur: 0.6 } }
    ] : [{
      id: 'card0', type: 'card', props: { title: shot.title, desc: shot.screen }, enter: { preset: 'rise', at: 0.4, dur: 0.8 }
    }]
  }));
  const story = { schema: 2, meta: { title: cleanTopic, audience: cleanAudience, template: actualTemplate, durationTarget: cleanDur, style: cleanStyle, motion: 'flow' }, beats };
  const motionShots = composeScenes({ story, scenes }).map(scene => {
    const { kind, nodes, number, unit } = scene.elements[0].props;
    return { kind, nodes, number, unit };
  });
  return { story, scenes, motionShots, templateAdjusted: actualTemplate !== cleanTemplate };
}

function writeAndCompileGeneratedProject(targetDir, { story, scenes }) {
  const target = path.resolve(targetDir);
  // Creation never replaces an existing directory, even an empty one or symlink.
  if (fs.existsSync(target) || isSymlink(target)) {
    throw Object.assign(new Error('Project directory already exists'), { statusCode: 409 });
  }
  if (!story.beats.some(b => b.facts.length > 0)) {
    return { ok: false, projectDir: target, story, scenes, compile: { mode: 'v2', errors: ['GEN_FACTS_REQUIRED 请先添加并核实原始资料中的事实'], lint: [] } };
  }
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  const staged = fs.mkdtempSync(path.join(parent, '.mg-studio-'));
  try {
    fs.mkdirSync(path.join(staged, 'scenes'));
    fs.writeFileSync(path.join(staged, 'story.json'), JSON.stringify(story, null, 2));
    for (const sc of scenes) {
      if (!ir.isSafeId(sc.id)) throw new Error('Invalid generated scene ID');
      fs.writeFileSync(path.join(staged, 'scenes', sc.id + '.json'), JSON.stringify(sc, null, 2));
    }
    const comp = compileProject(staged);
    if (comp.errors.length) return { ok: false, projectDir: target, story, scenes, compile: comp };
    // Reserve the destination exclusively. The generated name is private to this
    // request; an existing directory is never a valid replacement target.
    fs.mkdirSync(target);
    try {
      for (const file of fs.readdirSync(staged)) fs.renameSync(path.join(staged, file), path.join(target, file));
    } catch (err) {
      fs.rmSync(target, { recursive: true, force: true });
      throw err;
    }
    return { ok: true, projectDir: target, story, scenes, compile: {
      ...comp, scriptPath: path.join(target, 'script.json'), htmlPath: path.join(target, 'scene.html')
    } };
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
}

function isSymlink(file) {
  try { return fs.lstatSync(file).isSymbolicLink(); }
  catch (err) { if (err.code === 'ENOENT') return false; throw err; }
}

module.exports = { buildStoryboardDefinition, writeAndCompileGeneratedProject };

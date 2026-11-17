'use strict';
const fs = require('fs');
const path = require('path');
const ir = require('./ir');
const { compileProject } = require('./compile');
const { DISCLAIMER } = require('./medical-lint');

function buildStoryboardDefinition({
  topic = '健康科普', audience = 'patient', template = 'science',
  durationTarget = 45, style = 'clean-medical', facts = []
}) {
  const cleanTopic = String(topic || '').trim() || '健康科普';
  const cleanAudience = ir.AUDIENCES.includes(audience) ? audience : 'patient';
  const cleanTemplate = ir.TEMPLATES.includes(template) ? template : 'science';
  const cleanStyle = ir.STYLES.includes(style) ? style : 'clean-medical';
  const cleanDur = Number.isFinite(Number(durationTarget)) && Number(durationTarget) > 0 ? Number(durationTarget) : 45;
  const activeFacts = (Array.isArray(facts) ? facts : []).map(f => ({
    ...f, claim: String(f.claim || f.statement || ''), verified: f._checked === true
  }));
  // Every substantive statement comes from a fact the author can inspect. Never
  // infer a mechanism, treatment effect or statistic from the topic or a DOI.
  const factGroups = [[], activeFacts.slice(0, 1), activeFacts.slice(1, 2), activeFacts.slice(2), []];
  const roles = cleanTemplate === 'teaching'
    ? ['objective', 'prerequisite', 'steps', 'evidence', 'summary']
    : cleanTemplate === 'product'
      ? ['hook', 'context', 'demo', 'evidence', 'cta']
      : ['hook', 'conflict', 'mechanism', 'evidence', 'takeaway'];
  const ids = ['hook', 'conflict', 'mechanism', 'evidence', 'takeaway'];
  const headings = [cleanTopic, '资料要点', '进一步了解', '证据与结论', '回顾与核实'];
  const bridges = ['首先，', '接下来，', '那么，', '因此，', '最后，'];
  const beats = ids.map((id, i) => ({
    id, role: roles[i], emotion: [4, 2, 3, 4, 3][i], intent: headings[i],
    narration: i === 0 ? `首先，我们来了解${cleanTopic}。`
      : i === 4 ? `最后，请结合原始资料理解以上内容。${cleanAudience === 'patient' ? DISCLAIMER + '。' : ''}`
        : factGroups[i].length ? bridges[i] + factGroups[i].map(f => f.claim).join('。')
          : `${bridges[i]}这一部分暂无可用证据，请补充资料后再作判断。`,
    facts: factGroups[i]
  }));
  const scenes = beats.map((b, i) => {
    const claims = b.facts.map(f => f.claim).join('；');
    return {
      id: b.id, beat: b.id,
      minSec: Math.max(5, Math.round(cleanDur / 5), Math.ceil(b.narration.length / 4.5 + 1.5)),
      layout: i === 0 ? 'title-card' : 'points',
      elements: i === 0 ? [
        { id: 'title', type: 'text', props: { role: 'title', content: cleanTopic }, enter: { preset: 'scale', at: 0.3, dur: 0.8 } },
        { id: 'bar', type: 'bar', props: {}, enter: { preset: 'grow', at: 0.7, dur: 0.6 } }
      ] : [{
        id: 'card0', type: 'card', props: {
          title: headings[i],
          desc: claims || (i === 4 ? '请核对原始资料与适用条件。' : '暂无可用证据，请补充资料。')
        }, enter: { preset: 'rise', at: 0.4, dur: 0.8 }
      }]
    };
  });
  return {
    story: { schema: 2, meta: { title: cleanTopic, audience: cleanAudience, template: cleanTemplate, durationTarget: cleanDur, style: cleanStyle }, beats },
    scenes
  };
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

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDemoProject } = require('../desktop/demo-project');
const { buildStoryboardDefinition } = require('../lib/ai-generator');
const { compileProject } = require('../lib/compile');
const { createStudioServer } = require('../scripts/studio');
const studioFetch = require('./helpers/studio-fetch');

test('generated shots illustrate only the supplied steps, comparisons and standalone quantities', () => {
  const facts = [
    '指南区分了发病、诊断和再灌注三个时间节点。',
    '指南讨论的 120 分钟从确诊到再灌注。',
    '试验比较了脉冲电场消融与传统热消融。',
    '完全由原文支持的时间区间为 90–120 分钟。',
    '共纳入 1,200 天的观察记录。'
  ].map(claim => ({ claim, _checked: true, evidence: '示例资料' }));
  const { story, motionShots } = buildStoryboardDefinition({ topic: '动画验证', facts });
  assert.equal(story.meta.motion, 'flow');
  assert.deepEqual(motionShots.map(s => s.kind),
    ['opening', 'chain', 'metric', 'comparison', 'statement', 'statement', 'recap']);
  assert.deepEqual(motionShots[1].nodes, ['发病', '诊断', '再灌注']);
  assert.deepEqual(motionShots[2], { kind: 'metric', number: '120', unit: '分钟', nodes: [] });
  assert.deepEqual(motionShots[3].nodes, ['脉冲电场消融', '传统热消融']);
});

test('existing project can switch choreography without changing authored scenes, citations or timeline', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-motion-mode-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const projectDir = openDemoProject(directory, 'ami');
  const storyPath = path.join(projectDir, 'story.json');
  const story = JSON.parse(fs.readFileSync(storyPath));
  delete story.meta.motion;
  fs.writeFileSync(storyPath, JSON.stringify(story));
  assert.deepEqual(compileProject(projectDir).errors, []);
  const readScript = () => JSON.parse(fs.readFileSync(path.join(projectDir, 'script.json')));
  assert.equal(readScript().scenes[1].layout, 'points');
  const factPath = path.join(projectDir, 'scenes', 'fact_1.json');
  const source = fs.readFileSync(factPath, 'utf8');
  const timelinePath = path.join(projectDir, 'timeline.json');
  fs.writeFileSync(timelinePath, '{"fps":30,"scenes":[]}');
  const app = createStudioServer({ projectDir, port: 0 });
  const { port } = await app.start();
  t.after(() => app.close());
  const setMotion = async motion => {
    const response = await studioFetch(app)(`http://127.0.0.1:${port}/api/motion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motion })
    });
    return { status: response.status, ...(await response.json()) };
  };

  assert.equal((await setMotion('focus')).ok, true);
  assert.equal(readScript().scenes[1].elements[0].props.mode, 'focus');
  assert.equal(readScript().scenes[1].elements[0].props.kind, 'chain');
  assert.equal((await setMotion('rainbow')).status, 400);
  assert.deepEqual(compileProject(projectDir).errors, []);
  assert.equal(readScript().scenes[1].elements[0].props.mode, 'focus');
  assert.deepEqual(JSON.parse(fs.readFileSync(storyPath)).beats, story.beats);
  assert.equal(fs.readFileSync(factPath, 'utf8'), source);
  assert.equal(fs.readFileSync(timelinePath, 'utf8'), '{"fps":30,"scenes":[]}');

  assert.equal((await setMotion('classic')).ok, true);
  assert.equal(readScript().scenes[1].layout, 'points');
});

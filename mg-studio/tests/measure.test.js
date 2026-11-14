const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { measureBoxes } = require('../lib/measure');
const { lintMotion } = require('../lib/motion-lint');
const { COMPONENTS } = require('../lib/components');
const { normalizeScene } = require('../lib/compile');

const ROOT = path.join(__dirname, '..');
const TOKENS_PATH = path.join(ROOT, 'templates', 'tokens.default.json');

// 3 行说明的要点卡：估算盒恒为 h=260，真实高度约 357 —— 这正是 P1-1 的盲区
const LONG_DESC = '适用于心室不同步且射血分数中度下降的患者，需医生评估。补充一句让描述多两行以便观察盒子高度偏差。';

function makeProject(name, y) {
  const work = path.join(ROOT, 'tests', 'work', name);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'scenes'), { recursive: true });
  fs.writeFileSync(path.join(work, 'story.json'), JSON.stringify({
    schema: 2,
    meta: { title: '实测盒夹具', audience: 'general', template: 'science', durationTarget: 20 },
    beats: [{ id: 'a', role: 'hook', emotion: 3, intent: '单卡', narration: '这是一个用于实测盒的测试旁白。', facts: [] }]
  }, null, 2));
  fs.writeFileSync(path.join(work, 'scenes', 'a.json'), JSON.stringify({
    id: 'a', beat: 'a', layout: 'points', minSec: 16,
    elements: [{ id: 'c1', type: 'card', props: { title: '左束支起搏', desc: LONG_DESC, x: 130, y }, enter: { preset: 'rise', at: 0.4, dur: 0.6 } }]
  }, null, 2));
  execFileSync('node', [path.join(ROOT, 'scripts', 'compile.js')], { cwd: work, stdio: 'pipe' });
  // 合成 timeline（真实管线里由 build_timeline.js 产出）：16s = 480 帧
  const tl = { fps: 30, width: 1920, height: 1080, totalFrames: 480,
    scenes: [{ id: 'a', start: 0, end: 480, audioStart: 0.7, dur: 15, subs: [{ text: '旁白', from: 0.7, to: 15 }] }] };
  fs.writeFileSync(path.join(work, 'timeline.json'), JSON.stringify(tl, null, 1));
  return { work, tl };
}

test('measure：真实布局盒与组件估算盒不同（多行卡高 ≈357 而非 260）', { timeout: 180000 }, async (t) => {
  const { work, tl } = makeProject('measure-basic', 420);
  const measured = await measureBoxes({ dir: work, timeline: tl });
  if (!measured) return t.skip('无 Playwright/Chrome，实测盒不可用');
  const box = measured.a['c1'];
  assert.ok(box, '应量到 c1 的盒');
  assert.ok(Math.abs(box.x - 130) < 1 && Math.abs(box.y - 420) < 1, '原点应等于 props 坐标');
  assert.ok(box.h > 300, `多行卡真实高度应 > 300（估算盒为 260），实际 ${box.h}`);
});

test('lint_scene：估算盒放行、实测盒拦截（P1-1 回归）', { timeout: 240000 }, (t) => {
  // y=600 + 3 行说明：估算盒底 860（仅 W），实测盒底 957 > 字幕区 940
  const { work } = makeProject('measure-gate', 600);
  const run = extra => {
    try { return { code: 0, out: execFileSync('node', [path.join(ROOT, 'scripts', 'lint_scene.js'), work, ...extra], { encoding: 'utf8', stdio: 'pipe' }) }; }
    catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
  };

  const est = run(['--no-measure']);
  assert.equal(est.code, 0, '估算盒应放行（仅 W NEAR_SUBTITLE），实际输出:\n' + est.out);
  assert.ok(/估算盒/.test(est.out), '应标注使用估算盒');

  const real = run([]);
  if (/实测盒不可用/.test(real.out)) return t.skip('无 Playwright/Chrome，实测盒不可用');
  assert.equal(real.code, 1, '实测盒应拦住压字幕的卡片，实际输出:\n' + real.out);
  assert.ok(/SUBTITLE_ZONE/.test(real.out), '应报 SUBTITLE_ZONE');
  assert.ok(/实测盒底 \d+ > 940/.test(real.out), '诊断应标明实测盒底，实际:\n' + real.out);
  assert.ok(!fs.existsSync(path.join(work, 'out')), '门不应产出成片');
});

test('measure：取样帧避开 emphasis/exit 运动窗口（pulse 放大不进盒）', { timeout: 180000 }, async (t) => {
  const { measureFrame } = require('../lib/measure');
  // 纯函数层：pulse 播 1~3s、enter 0~0.6s → 取样应在 3.2s 而非 0.8s
  const tlScene = { id: 'hook', start: 0, end: 300, audioStart: 0.7, dur: 8 };
  const els = [{ enter: { at: 0, dur: 0.6 }, emphasis: [{ cue: 'lt:1.0', dur: 2 }], exit: null }];
  assert.equal(measureFrame(tlScene, 30, els), Math.round(3.2 * 30));
  // narration:0.5（audioStart 0.7 + 0.5*8 = 4.7s）+ 2s emphasis → 6.9s 后
  const els2 = [{ enter: { at: 0, dur: 0.6 }, emphasis: [{ cue: 'narration:0.5', dur: 2 }], exit: null }];
  assert.equal(measureFrame(tlScene, 30, els2), Math.round(6.9 * 30));
  // 有 exit（末 0.4s）→ 取样须早于 exit 开始
  const els3 = [{ enter: { at: 0, dur: 0.6 }, emphasis: [], exit: { dur: 0.4 } }];
  assert.ok(measureFrame(tlScene, 30, els3) < 300 - 0.4 * 30, '取样帧应早于 exit 窗口');

  // 浏览器层（无环境则 skip）：pulse 进行中盒 w=542，静止帧应为 520
  const work = path.join(ROOT, 'tests', 'work', 'measure-emph');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'scenes'), { recursive: true });
  fs.writeFileSync(path.join(work, 'story.json'), JSON.stringify({
    schema: 2, meta: { title: 'emph', audience: 'general', template: 'science', durationTarget: 20 },
    beats: [{ id: 'hook', role: 'hook', emotion: 3, intent: 'x', narration: '较长旁白保证场景时间充裕。', facts: [] }]
  }, null, 2));
  fs.writeFileSync(path.join(work, 'scenes', 'hook.json'), JSON.stringify({
    id: 'hook', beat: 'hook', layout: 'points', minSec: 10,
    elements: [{ id: 'c1', type: 'card', props: { title: '强调中的卡', desc: '描述。', x: 130, y: 400 },
      enter: { preset: 'rise', at: 0, dur: 0.6 },
      emphasis: [{ preset: 'pulse', cue: 'lt:1.0', dur: 2 }] }]
  }, null, 2));
  const { execFileSync } = require('child_process');
  execFileSync('node', [path.join(ROOT, 'scripts', 'compile.js')], { cwd: work, stdio: 'pipe' });
  fs.writeFileSync(path.join(work, 'timeline.json'), JSON.stringify({ fps: 30, width: 1920, height: 1080, totalFrames: 300,
    scenes: [{ id: 'hook', start: 0, end: 300, audioStart: 0.7, dur: 8, subs: [] }] }));
  const { measureBoxes } = require('../lib/measure');
  const { normalizeScene } = require('../lib/compile');
  const scenes = [Object.assign(normalizeScene(JSON.parse(fs.readFileSync(path.join(work, 'scenes', 'hook.json'), 'utf8'))), { id: 'hook' })];
  const measured = await measureBoxes({ dir: work, timeline: JSON.parse(fs.readFileSync(path.join(work, 'timeline.json'))), scenes });
  if (!measured) return t.skip('无 Playwright/Chrome，实测盒不可用');
  assert.equal(measured.hook.c1.w, 520, '静止帧盒宽应为布局宽 520，而不是 pulse 放大中的 542');
});

test('lint_scene：实测时长覆盖估算时长（TEXT_DWELL 用真实 timeline）', () => {
  const sc = normalizeScene({
    id: 'a', layout: 'points', minSec: 1,
    elements: [{ id: 'c1', type: 'card', props: { title: '标题', desc: '说明文字' }, enter: null, emphasis: [], exit: null }]
  }, COMPONENTS);
  sc.narration = '短。';
  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
  // 估算：estDur = max(1, 3/4.5+1.1)=1.77 → 说明文字 4 字需 1.2s，勉强通过
  const estOut = lintMotion({ scenes: [sc], tokens, components: COMPONENTS });
  assert.deepEqual(estOut.filter(l => l.level === 'B'), []);
  // 实测时长 0.8s（配了个极快的嗓音）→ 同一条内容应被判停留不足
  const realOut = lintMotion({ scenes: [sc], tokens, components: COMPONENTS, durations: { a: 0.8 } });
  assert.ok(realOut.some(l => l.level === 'B' && l.code === 'TEXT_DWELL'), '实测 0.8s 应判停留不足');
});

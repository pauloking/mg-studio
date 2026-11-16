'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { STYLES, BG_TYPES, validateStory, validateTokens, loadProject, deepMerge } = require('../lib/ir');
const { emitSceneHtml, getDrawBg } = require('../lib/emit');
const { COMPONENTS } = require('../lib/components');
const { PRESET_DEFAULT_DUR, PRE_RUNTIME, ENTER_PRESETS, EMPHASIS_PRESETS, EXIT_PRESETS, EASINGS } = require('../lib/presets');
const { normalizeScene } = require('../lib/compile');
const { contrastRatio } = require('../lib/color');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const STYLES_DIR = path.join(ROOT, 'templates', 'styles');

test('STYLES 与 BG_TYPES 白名单定义完整', () => {
  assert.deepEqual(STYLES, ['deep-tech', 'clean-medical', 'warm-editorial', 'swiss-modern', 'vital-energy', 'cyber-neon', 'ink-zen', 'aurora-glass']);
  assert.deepEqual(BG_TYPES, ['grid-tech', 'clean-light', 'warm-editorial', 'swiss-modern', 'vital-energy', 'cyber-neon', 'ink-zen', 'aurora-glass', 'solid']);
});

test('全部 8 种预设样式 JSON 存在且符合 WCAG AA 对比度 (>= 4.5)', () => {
  assert.equal(STYLES.length, 8);
  for (const s of STYLES) {
    const p = path.join(STYLES_DIR, `${s}.json`);
    assert.ok(fs.existsSync(p), `样式定义文件缺失: ${s}.json`);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(data.style, s);
    assert.ok(data.name);
    assert.ok(BG_TYPES.includes(data.bgType), `未知 bgType: ${data.bgType}`);
    assert.ok(data.colors.bg);
    assert.ok(data.colors.ink);
    assert.ok(data.colors.muted);
    assert.ok(data.colors.accent);
    assert.ok(data.colors.accent2);
    assert.ok(data.colors.surface);

    // WCAG AA 核心对比度门禁校验：
    // 1. 卡片文字对表面
    const inkOnSurface = contrastRatio(data.colors.ink, data.colors.surface);
    assert.ok(inkOnSurface >= 4.5, `${s} ink on surface 对比度不足: ${inkOnSurface.toFixed(2)}`);
    const mutedOnSurface = contrastRatio(data.colors.muted, data.colors.surface);
    assert.ok(mutedOnSurface >= 4.5, `${s} muted on surface 对比度不足: ${mutedOnSurface.toFixed(2)}`);

    // 2. 醒目数值颜色对底色 (stat 数字等使用 accent2)
    const accent2OnBg = contrastRatio(data.colors.accent2, data.colors.bg);
    assert.ok(accent2OnBg >= 4.5, `${s} accent2 on bg 对比度不足: ${accent2OnBg.toFixed(2)}`);

    // 3. 非 legacy 风格的 accent 对底色同样 >= 4.5
    if (s !== 'deep-tech') {
      const accentOnBg = contrastRatio(data.colors.accent, data.colors.bg);
      assert.ok(accentOnBg >= 4.5, `${s} accent on bg 对比度不足: ${accentOnBg.toFixed(2)}`);
    }
  }
});

test('validateStory 校验 meta.style 白名单', () => {
  const baseStory = {
    schema: 2,
    meta: { title: 'Test', audience: 'general', template: 'free', durationTarget: 60, style: 'clean-medical' },
    beats: [{ id: 'b1', role: 'hook', emotion: 3, intent: '吸引', narration: '测试', facts: [] }]
  };
  assert.equal(validateStory(baseStory).ok, true);

  const badStory = JSON.parse(JSON.stringify(baseStory));
  badStory.meta.style = 'cyberpunk-neon';
  const res = validateStory(badStory);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some(e => e.includes('meta.style 未知: cyberpunk-neon')));
});

test('validateTokens 校验 tokens.style 与 tokens.bgType', () => {
  const okTokens = {
    style: 'swiss-modern',
    bgType: 'swiss-modern',
    colors: { bg: '#f4f4f5', ink: '#09090b', muted: '#52525b', accent: '#1d4ed8', accent2: '#be123c' },
    font: { family: 'Helvetica' },
    subtitle: { bottom: 64, fontSize: 40, maxW: 1560 }
  };
  assert.equal(validateTokens(okTokens).ok, true);

  const badTokens = JSON.parse(JSON.stringify(okTokens));
  badTokens.style = 'invalid-style';
  badTokens.bgType = 'invalid-bg';
  const res = validateTokens(badTokens);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some(e => e.includes('tokens.style 未知: invalid-style')));
  assert.ok(res.errors.some(e => e.includes('tokens.bgType 未知: invalid-bg')));
});

test('loadProject 支持三级级联深合并 (default -> style -> user)', () => {
  const work = path.join(ROOT, 'tests', 'work', 'test-style-cascade');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'scenes'), { recursive: true });

  const story = {
    schema: 2,
    meta: { title: 'Cascade Test', audience: 'general', template: 'free', durationTarget: 30, style: 'clean-medical' },
    beats: [{ id: 'hook', role: 'hook', emotion: 3, intent: '测试', narration: '测试旁白', facts: [] }]
  };
  fs.writeFileSync(path.join(work, 'story.json'), JSON.stringify(story));
  fs.writeFileSync(path.join(work, 'scenes', 'hook.json'), JSON.stringify({
    id: 'hook',
    beat: 'hook',
    layout: 'title-card',
    minSec: 2,
    elements: [{ id: 't1', type: 'text', props: { role: 'title', content: '测试' } }]
  }));
  // 用户覆盖特定颜色
  fs.writeFileSync(path.join(work, 'tokens.json'), JSON.stringify({
    colors: { accent: '#0284c7' }
  }));

  const prj = loadProject(work, ['title-card']);
  assert.equal(prj.tokens.style, 'clean-medical');
  assert.equal(prj.tokens.bgType, 'clean-light');
  assert.equal(prj.tokens.colors.bg, '#f8fafc');
  assert.equal(prj.tokens.colors.ink, '#0f172a');
  assert.equal(prj.tokens.colors.accent, '#0284c7', '用户 tokens 覆盖 style accent');
  assert.equal(prj.tokens.card.radius, 20);
  assert.equal(prj.tokens.subtitle.bottom, 64);
});

test('getDrawBg 生成对应背景策略代码', () => {
  const techBg = getDrawBg('grid-tech');
  assert.ok(techBg.includes('bg.lineTo(1920,y)'));

  const lightBg = getDrawBg('clean-light');
  assert.ok(lightBg.includes('fillRect(x,y,2,2)'));
  assert.ok(lightBg.includes('#f8fafc'));

  const warmBg = getDrawBg('warm-editorial');
  assert.ok(warmBg.includes('bg.strokeRect(48,48,1824,984)'));
  assert.ok(warmBg.includes('#faf6ef'));

  const swissBg = getDrawBg('swiss-modern');
  assert.ok(swissBg.includes('bg.strokeRect(36,36,1848,1008)'));
  assert.ok(swissBg.includes('#f4f4f5'));

  const vitalBg = getDrawBg('vital-energy');
  assert.ok(vitalBg.includes('#fffaf5'));
  assert.ok(vitalBg.includes('rgba(234,88,12,0.06)'));

  const cyberBg = getDrawBg('cyber-neon');
  assert.ok(cyberBg.includes('#090614'));
  assert.ok(cyberBg.includes('P_NEON'));

  const zenBg = getDrawBg('ink-zen');
  assert.ok(zenBg.includes('#f8f6f0'));
  assert.ok(zenBg.includes('rgba(153,27,27,0.18)'));

  const auroraBg = getDrawBg('aurora-glass');
  assert.ok(auroraBg.includes('#060918'));
  assert.ok(auroraBg.includes('P_AURORA'));

  const solidBg = getDrawBg('solid', { colors: { bg: '#1a1a2e' } });
  assert.ok(solidBg.includes("bg.fillStyle = '#1a1a2e'"));
});

test('emitSceneHtml 注入 CSS 变量与主题专属材质', () => {
  const tokens = {
    style: 'clean-medical',
    bgType: 'clean-light',
    colors: { bg: '#f8fafc', ink: '#0f172a', muted: '#64748b', accent: '#0369a1', accent2: '#0f766e', surface: '#ffffff', border: '#cbd5e1' },
    font: { family: 'sans-serif' },
    card: { radius: 20, borderWidth: 1, shadow: '0 20px 48px rgba(15,23,42,0.08)' },
    subtitle: { bottom: 64, fontSize: 40, maxW: 1560, color: '#0f172a', bg: 'rgba(255,255,255,0.92)', border: 'rgba(148,163,184,0.3)' }
  };
  const scenes = [{
    id: 's1',
    layout: 'points',
    elements: [{ id: 'c1', type: 'card', props: { title: 'Card 1', desc: 'Desc' } }]
  }];
  const html = emitSceneHtml({
    tokens,
    scenes,
    components: COMPONENTS,
    preRuntime: PRE_RUNTIME,
    disclaimer: '测试免责'
  });

  assert.ok(html.includes('--card-radius:20px;'));
  assert.ok(html.includes('--card-border-width:1px;'));
  assert.ok(html.includes('--card-shadow:0 20px 48px rgba(15,23,42,0.08);'));
  assert.ok(html.includes('background:rgba(255,255,255,0.92)'));
  assert.ok(html.includes('color:#0f172a'));
  assert.ok(html.includes('rgba(71,85,105,.75)'), '浅色模式使用深色 disclaimer');
});

test('normalizeScene 校验 enter.easing 并支持 spring/overshoot', () => {
  const sc = {
    id: 's1',
    layout: 'points',
    elements: [{
      id: 'c1',
      type: 'card',
      props: { title: 'T', desc: 'D' },
      enter: { preset: 'rise', at: 0.2, dur: 0.8, easing: 'spring' }
    }]
  };
  const n = normalizeScene(sc);
  assert.equal(n.elements[0].enter.easing, 'spring');

  const bad = JSON.parse(JSON.stringify(sc));
  bad.elements[0].enter.easing = 'bounce-unknown';
  assert.throws(() => normalizeScene(bad), /enter\.easing/);
});

test('upEl spring 缓动曲线产生弹性超调 (overshoot > 1)', () => {
  const ctx = {
    Math, TL: { fps: 30 },
    eo: p => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3),
    overshoot: p => { const s = 1.70158; p = Math.max(0, Math.min(1, p)) - 1; return p * p * ((s + 1) * p + s) + 1; },
    seg: (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)))
  };
  vm.createContext(ctx);
  vm.runInContext(PRE_RUNTIME, ctx);

  const e = { style: {} };
  const spSpring = {
    type: 'card',
    props: { title: 'T', desc: 'D' },
    enter: { preset: 'scale', at: 0, dur: 1.0, easing: 'spring' }
  };

  // 在进度 80% (t=0.8) 时，overshoot 应该超调大于 1.0
  ctx.upEl(e, spSpring, 0.8, 2.0, { start: 0, audioStart: 0, dur: 2.0 });
  const transform = e.style.transform;
  // scale 应大于 1.0 (例如 scale(1.004, 1.004))
  const match = transform.match(/scale\(([^,]+),/);
  assert.ok(match, 'transform 包含 scale');
  const scaleVal = parseFloat(match[1]);
  assert.ok(scaleVal > 1.0, `Spring 动效在接近收尾时应弹性超调 > 1.0，实测: ${scaleVal}`);
});


test('compileProject 端到端编译 mini-style-medical 产生完整契约与浅色医疗样式', () => {
  const { compileProject } = require('../lib/compile');
  const work = path.join(ROOT, 'tests', 'work', 'compile-medical-style');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(FIX, 'mini-style-medical'), work, { recursive: true });

  const r = compileProject(work);
  assert.equal(r.mode, 'v2');
  assert.deepEqual(r.errors, []);

  const html = fs.readFileSync(path.join(work, 'scene.html'), 'utf8');
  assert.ok(html.includes('--bg:#f8fafc;'), '注入浅色背景变量');
  assert.ok(html.includes('--card-radius:20px;'), '注入医疗卡片圆角');
  assert.ok(html.includes('fillRect(x,y,2,2)'), '注入点阵背景渲染器');
  assert.ok(html.includes('overshoot'), '注入 overshoot 动效函数');
});

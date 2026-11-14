const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const ir = require('../lib/ir');
const FIX = path.join(__dirname, 'fixtures');
const story = () => JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'story.json'), 'utf8'));

test('合法 story 通过校验', () => {
  const r = ir.validateStory(story());
  assert.deepEqual(r.errors, []); assert.ok(r.ok);
});
test('非法 role / 重复 beat id / 缺 narration 报错', () => {
  const s = story(); s.beats[0].role = 'nope';
  assert.ok(!ir.validateStory(s).ok);
  const s2 = story(); s2.beats[1].id = 'hook';
  assert.ok(!ir.validateStory(s2).ok);
  const s3 = story(); s3.beats[0].narration = '';
  assert.ok(!ir.validateStory(s3).ok);
});
test('scene 引用不存在的 beat / 非法 layout 报错', () => {
  const sc = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'scenes', 'hook.json'), 'utf8'));
  assert.ok(ir.validateScene(sc, ['hook', 'takeaway'], ['title-card', 'points']).ok);
  sc.beat = 'ghost';
  assert.ok(!ir.validateScene(sc, ['hook', 'takeaway'], ['title-card', 'points']).ok);
  sc.beat = 'hook'; sc.layout = 'nope';
  assert.ok(!ir.validateScene(sc, ['hook', 'takeaway'], ['title-card', 'points']).ok);
});
test('tokens 非法色值报错', () => {
  const tk = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'tokens.json'), 'utf8'));
  assert.ok(ir.validateTokens(tk).ok);
  tk.colors.bg = 'red';
  assert.ok(!ir.validateTokens(tk).ok);
});
test('loadProject v2：按 beats 顺序合并 narration', () => {
  const p = ir.loadProject(path.join(FIX, 'mini-v2'), ['title-card', 'points', 'waveform', 'stat']);
  assert.equal(p.mode, 'v2');
  assert.deepEqual(p.scenes.map(s => s.id), ['hook', 'takeaway']);
  assert.equal(p.scenes[0].narration, '你好，世界。');
  assert.equal(p.scenes[0].beat.role, 'hook');
});
test('loadProject v1：仅 script.json 时直通', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-v1-'));
  fs.copyFileSync(path.join(FIX, 'mini-v1', 'script.json'), path.join(dir, 'script.json'));
  const p = ir.loadProject(dir, []);
  assert.equal(p.mode, 'v1');
  assert.equal(p.script.scenes[0].id, 'intro');
});
test('loadProject：scene.id 与 beat 不匹配时报错且不合并', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-pair-'));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'story.json'), path.join(dir, 'story.json'));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'tokens.json'), path.join(dir, 'tokens.json'));
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'scenes', 'takeaway.json'), path.join(dir, 'scenes', 'hook.json'));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'scenes', 'takeaway.json'), path.join(dir, 'scenes', 'takeaway.json'));
  assert.throws(() => ir.loadProject(dir, ['title-card', 'points']),
    e => Array.isArray(e.irErrors) && e.irErrors.some(m => /不匹配/.test(m)));
});
test('validateScene(null) 返回 {ok:false} 而非抛 TypeError', () => {
  const r = ir.validateScene(null, ['hook'], ['title-card']);
  assert.ok(!r.ok);
});
test('validateTokens({colors:null}) 返回 {ok:false} 而非抛 TypeError', () => {
  const r = ir.validateTokens({ colors: null });
  assert.ok(!r.ok);
});
test('loadProject：story 缺 beats 时抛带 irErrors 的 Error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-nobeats-'));
  fs.writeFileSync(path.join(dir, 'story.json'), JSON.stringify({ schema: 2, meta: { title: '测试片', audience: 'general', template: 'free', durationTarget: 20 } }));
  assert.throws(() => ir.loadProject(dir, []),
    e => e instanceof Error && Array.isArray(e.irErrors) && e.irErrors.some(m => /beats/.test(m)));
});
test('validateStory：beats 为非数组（5/{}/true）时报错而非抛 TypeError', () => {
  for (const bad of [5, {}, true]) {
    const s = story(); s.beats = bad;
    const r = ir.validateStory(s);
    assert.ok(!r.ok);
    assert.ok(r.errors.some(m => /beats/.test(m)));
  }
});
test('loadProject：story.beats 为 {} 时抛带 irErrors 的 Error 而非 TypeError', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-objbeats-'));
  fs.writeFileSync(path.join(dir, 'story.json'), JSON.stringify({ schema: 2, meta: { title: '测试片', audience: 'general', template: 'free', durationTarget: 20 }, beats: {} }));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'tokens.json'), path.join(dir, 'tokens.json'));
  assert.throws(() => ir.loadProject(dir, []),
    e => e instanceof Error && !(e instanceof TypeError) && Array.isArray(e.irErrors) && e.irErrors.some(m => /beats/.test(m)));
});
test('validateTokens：组件引用的色键 accent2/muted 缺失时报错（而非下游 lint 崩溃）', () => {
  const base = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'tokens.json'), 'utf8'));
  const noAccent2 = JSON.parse(JSON.stringify(base)); delete noAccent2.colors.accent2;
  const r1 = ir.validateTokens(noAccent2);
  assert.ok(!r1.ok);
  assert.ok(r1.errors.some(m => /accent2/.test(m)));
  const noMuted = JSON.parse(JSON.stringify(base)); delete noMuted.colors.muted;
  const r2 = ir.validateTokens(noMuted);
  assert.ok(!r2.ok);
  assert.ok(r2.errors.some(m => /muted/.test(m)));
});
test('validateScene：cue 含多个小数点（narration:1.2.3 / lt:1.2.3）报错', () => {
  const sc = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'scenes', 'hook.json'), 'utf8'));
  sc.elements[0].emphasis = [{ preset: 'highlight', cue: 'narration:1.2.3', dur: 0.4 }];
  const r = ir.validateScene(sc, ['hook', 'takeaway'], ['title-card', 'points']);
  assert.ok(!r.ok); assert.ok(r.errors.some(m => /cue/.test(m)));
  sc.elements[0].emphasis = [{ preset: 'highlight', cue: 'lt:1.2.3', dur: 0.4 }];
  assert.ok(!ir.validateScene(sc, ['hook', 'takeaway'], ['title-card', 'points']).ok);
});
test('validateTokens：font.family 只允许 CSS 字体族安全字符（防 </style> 越狱 / CSS 打断）', () => {
  const bad = (family) => ir.validateTokens({ colors: { bg: '#070b16', ink: '#f5f7ff', accent: '#6a5cff', accent2: '#00c2ff', muted: '#c6cdf5' }, font: { family }, subtitle: { bottom: 64, fontSize: 40, maxW: 1560 } }).errors;
  const ok = bad('"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif');
  assert.deepEqual(ok, [], '常规字体族应通过');
  assert.ok(bad('sans-serif; }</style><script>alert(1)</script>').some(e => /font.family/.test(e)), '</style> 越狱应被拒');
  assert.ok(bad('x; } body { display:none } /*').some(e => /font.family/.test(e)), 'CSS 打断应被拒');
  assert.ok(bad('PingFang; background:url(javascript:alert(1))').some(e => /font.family/.test(e)), 'url() 注入应被拒');
});

test('validateTokens：缺 font/fontSize/maxW 或 bottom≠64 报错', () => {
  const base = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'tokens.json'), 'utf8'));
  const clone = () => JSON.parse(JSON.stringify(base));
  const noFont = clone(); delete noFont.font;
  assert.ok(!ir.validateTokens(noFont).ok); assert.ok(ir.validateTokens(noFont).errors.some(m => /font/.test(m)));
  const noFS = clone(); delete noFS.subtitle.fontSize;
  assert.ok(!ir.validateTokens(noFS).ok); assert.ok(ir.validateTokens(noFS).errors.some(m => /fontSize/.test(m)));
  const noMW = clone(); delete noMW.subtitle.maxW;
  assert.ok(!ir.validateTokens(noMW).ok); assert.ok(ir.validateTokens(noMW).errors.some(m => /maxW/.test(m)));
  const badB = clone(); badB.subtitle.bottom = 200;
  assert.ok(!ir.validateTokens(badB).ok); assert.ok(ir.validateTokens(badB).errors.some(m => /bottom/.test(m)));
});
test('loadProject：部分 tokens.json 深合并默认模板（补全 font/subtitle）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-mergetk-'));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'story.json'), path.join(dir, 'story.json'));
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'scenes', 'hook.json'), path.join(dir, 'scenes', 'hook.json'));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'scenes', 'takeaway.json'), path.join(dir, 'scenes', 'takeaway.json'));
  const full = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'tokens.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ colors: full.colors })); // 无 font/subtitle
  const p = ir.loadProject(dir, ['title-card', 'points', 'waveform', 'stat']);
  assert.ok(p.tokens.font && typeof p.tokens.font.family === 'string' && p.tokens.font.family.length > 0);
  assert.equal(p.tokens.subtitle.bottom, 64);
  assert.equal(p.tokens.subtitle.fontSize, 40);
  assert.equal(p.tokens.subtitle.maxW, 1560);
});
test('validateStory：beats 含 null 元素时报错而非抛 TypeError', () => {
  const s = story(); s.beats = [null];
  const r = ir.validateStory(s);
  assert.ok(!r.ok); assert.ok(r.errors.some(m => /beat/.test(m)));
});
test('loadProject：beats 含 null 时抛带 irErrors 的 Error 而非 TypeError', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-nullbeat-'));
  fs.writeFileSync(path.join(dir, 'story.json'), JSON.stringify({ schema: 2, meta: { title: 't', audience: 'general', template: 'free', durationTarget: 20 }, beats: [null] }));
  fs.copyFileSync(path.join(FIX, 'mini-v2', 'tokens.json'), path.join(dir, 'tokens.json'));
  assert.throws(() => ir.loadProject(dir, []),
    e => e instanceof Error && !(e instanceof TypeError) && Array.isArray(e.irErrors));
});
test('validateTokens：font.family 只允许 CSS 字体族安全字符（防 </style> 越狱 / CSS 打断）', () => {
  const bad = (family) => ir.validateTokens({ colors: { bg: '#070b16', ink: '#f5f7ff', accent: '#6a5cff', accent2: '#00c2ff', muted: '#c6cdf5' }, font: { family }, subtitle: { bottom: 64, fontSize: 40, maxW: 1560 } }).errors;
  assert.deepEqual(bad('"PingFang SC","Hiragino Sans GB",sans-serif'), [], '常规字体族应通过');
  assert.ok(bad('sans-serif; }</style><script>alert(1)</script>').some(e => /font.family/.test(e)), '</style> 越狱应被拒');
  assert.ok(bad('x; } body { display:none } /*').some(e => /font.family/.test(e)), 'CSS 打断应被拒');
  assert.ok(bad('PingFang; background:url(javascript:alert(1))').some(e => /font.family/.test(e)), 'url() 注入应被拒');
});
test('validateScene：subsOverride 单行 ≤18 字（覆盖不得绕过自动切句约束）', () => {
  const el = { id: 'c1', type: 'card', props: { title: 't', desc: 'd' } };
  const mk = (subs) => ir.validateScene({ id: 'hook', beat: 'hook', layout: 'points', minSec: 3, subsOverride: subs, elements: [el] }, ['hook'], ['points']).errors;
  assert.deepEqual(mk(['十', '八字以内的两行']), [], '短行应通过');
  assert.ok(mk(['一'.repeat(19)]).some(e => /18/.test(e)), '19 字应被拒');
  assert.ok(mk(['']).some(e => /非空/.test(e)), '空行应被拒');
});

test('validateTokens：色键名只允许字母数字与连字符（防 CSS 变量名注入）', () => {
  const colors = { bg: '#070b16', ink: '#f5f7ff', accent: '#6a5cff', accent2: '#00c2ff', muted: '#c6cdf5' };
  const mk = (extra) => ir.validateTokens({ colors: Object.assign({}, colors, extra), font: { family: 'sans-serif' }, subtitle: { bottom: 64, fontSize: 40, maxW: 1560 } });
  assert.deepEqual(mk({}).errors, []);
  assert.deepEqual(mk({ 'accent-2': '#111111', 'A9': '#222222' }).errors, [], '字母开头 + 数字/连字符应通过');
  assert.ok(mk({ 'x}; html{display:none': '#123456' }).errors.some(e => /colors 键名非法/.test(e)), 'CSS 打断串应被拒');
  assert.ok(mk({ '-x': '#123456' }).errors.some(e => /colors 键名非法/.test(e)), '非字母开头应被拒');
});
test('validateTokens：required 色键 malformed 只产一条诊断（去重）', () => {
  const tk = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-v2', 'tokens.json'), 'utf8'));
  tk.colors.accent = 'red';
  const r = ir.validateTokens(tk);
  assert.ok(!r.ok);
  assert.equal(r.errors.filter(m => /accent/.test(m)).length, 1);
});
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  lintMedical, DISCLAIMER, OUTRO_ROLES,
  findAbsolute, termHits, hasExplain, visibleTexts, beatTexts
} = require('../lib/medical-lint');

// 最小合法 story 构造器：audience / beats 可覆盖
function mkStory({ audience = 'general', beats } = {}) {
  return {
    schema: 2,
    meta: { title: 't', audience, template: 'free', durationTarget: 20 },
    beats: beats || [
      { id: 'hook', role: 'hook', emotion: 3, intent: 'x', narration: '你好。', facts: [] },
      { id: 'takeaway', role: 'takeaway', emotion: 3, intent: 'x', narration: '再见。', facts: [] }
    ]
  };
}
const B = (d) => d.filter(x => x.level === 'B');
const W = (d) => d.filter(x => x.level === 'W');
const codes = (d) => d.map(x => x.code);

test('general / professional 受众：不启用患者向门', () => {
  for (const audience of ['general', 'professional']) {
    const d = lintMedical({ story: mkStory({ audience }), scenes: [] });
    assert.deepEqual(codes(d), [], `${audience} 不应产生患者向诊断`);
  }
});

test('G3-A：患者向含 verified:false 的 fact → B 阻断，并指名 claim', () => {
  const story = mkStory({ audience: 'patient', beats: [
    { id: 'hook', role: 'hook', emotion: 3, intent: 'x', narration: '你好。', facts: [] },
    { id: 'ev', role: 'evidence', emotion: 3, intent: 'x', narration: '数字。',
      facts: [{ claim: '死亡率降低50%', source: '', verified: false }] },
    { id: 'takeaway', role: 'takeaway', emotion: 3, intent: 'x', narration: DISCLAIMER, facts: [] }
  ] });
  const d = lintMedical({ story, scenes: [] });
  const hits = B(d).filter(x => x.code === 'MED_FACT_UNVERIFIED');
  assert.equal(hits.length, 1, '应恰好一条未核实诊断');
  assert.ok(hits[0].msg.includes('死亡率降低50%'), '诊断应指名 claim');
});

test('G3-A：facts 全 verified:true 时不报（核实是人工门，机器只认布尔）', () => {
  const story = mkStory({ audience: 'patient', beats: [
    { id: 'takeaway', role: 'takeaway', emotion: 3, intent: 'x', narration: DISCLAIMER,
      facts: [{ claim: 'x', source: '指南', verified: true }] }
  ] });
  const d = lintMedical({ story, scenes: [] });
  assert.ok(!codes(d).includes('MED_FACT_UNVERIFIED'));
});

test('G3-B：患者向 outro 无免责声明 → B；有则放行', () => {
  const base = () => mkStory({ audience: 'patient', beats: [
    { id: 'hook', role: 'hook', emotion: 3, intent: 'x', narration: '你好。', facts: [] },
    { id: 'takeaway', role: 'takeaway', emotion: 3, intent: 'x', narration: '再见。', facts: [] }
  ] });
  const missing = lintMedical({ story: base(), scenes: [] });
  assert.ok(codes(missing).includes('MED_DISCLAIMER'), '缺声明应报 B');
  const s2 = base(); s2.beats[1].narration = '再见。' + DISCLAIMER + '。';
  const present = lintMedical({ story: s2, scenes: [] });
  assert.ok(!codes(present).includes('MED_DISCLAIMER'), '含声明应不报');
});

test('G3-B：免责声明也可写在 outro 场景的可见文本里（不只 narration）', () => {
  const story = mkStory({ audience: 'patient', beats: [
    { id: 'takeaway', role: 'takeaway', emotion: 3, intent: 'x', narration: '再见。', facts: [] }
  ] });
  const scenes = [{ id: 'takeaway', elements: [
    { id: 'c1', props: { title: '收尾', desc: DISCLAIMER } }
  ] }];
  const d = lintMedical({ story, scenes });
  assert.ok(!codes(d).includes('MED_DISCLAIMER'), '可见文本里的声明也应被识别');
});

test('M4-ABS：绝对化疗效/危险医嘱词表 → B（所有受众，命中即报）', () => {
  const cases = [
    ['百分百根治猝死', '治愈承诺'],
    ['100% 安全无风险', '绝对化保证'],
    ['这是最好的选择', '绝对化最优'],
    ['术后无需服药', '危险医嘱'],
    ['立即停药', '危险医嘱'],
    ['保证疗效确切', '疗效承诺']
  ];
  for (const [text] of cases) {
    const hit = findAbsolute(text);
    assert.ok(hit, `「${text}」应命中词表`);
    const story = mkStory({ beats: [
      { id: 'hook', role: 'hook', emotion: 3, intent: 'x', narration: text, facts: [] },
      { id: 'takeaway', role: 'takeaway', emotion: 3, intent: 'x', narration: '再见。', facts: [] }
    ] });
    const d = lintMedical({ story, scenes: [] });
    assert.ok(codes(d).includes('MED_ABSOLUTE'), `「${text}」应产生 B 级诊断`);
  }
});

test('M4-ABS：保守表述不误报', () => {
  for (const text of ['可能有助于降低风险', '请由医生评估', '部分患者可见改善', '一项研究显示']) {
    assert.equal(findAbsolute(text), null, `「${text}」不应命中`);
  }
});

test('M4-ABS：场景可见文本同样受检（不只旁白）', () => {
  const story = mkStory({ beats: [
    { id: 'hook', role: 'hook', emotion: 3, intent: 'x', narration: '你好。', facts: [] },
    { id: 'takeaway', role: 'takeaway', emotion: 3, intent: 'x', narration: '再见。', facts: [] }
  ] });
  const scenes = [{ id: 'hook', elements: [
    { id: 'card', props: { title: '百分百根治', desc: '说明' } }
  ] }];
  const d = lintMedical({ story, scenes });
  const hit = d.find(x => x.code === 'MED_ABSOLUTE');
  assert.ok(hit && hit.el === 'card' && hit.scene === 'hook', '应定位到可见文本的元素');
});

test('M4-TERM：患者向术语密度 ≥2 且无解释 → W（不阻断）', () => {
  const story = mkStory({ audience: 'patient', beats: [
    { id: 'takeaway', role: 'takeaway', emotion: 3, intent: 'x',
      narration: '植入式除颤器的并发症与预后需要评估。' + DISCLAIMER, facts: [] }
  ] });
  const d = lintMedical({ story, scenes: [] });
  const hits = W(d).filter(x => x.code === 'MED_TERM_DENSITY');
  assert.equal(hits.length, 1);
  assert.equal(B(d).filter(x => x.code === 'MED_TERM_DENSITY').length, 0, '术语密度不应阻断');
});

test('M4-TERM：有通俗解释标记 或 <2 个术语 → 不报', () => {
  const explained = mkStory({ audience: 'patient', beats: [
    { id: 'takeaway', role: 'takeaway', emotion: 3, intent: 'x',
      narration: '植入式除颤器，就是一种放在皮下的设备，并发症与预后。' + DISCLAIMER, facts: [] }
  ] });
  assert.ok(!codes(lintMedical({ story: explained, scenes: [] })).includes('MED_TERM_DENSITY'));
  const single = mkStory({ audience: 'patient', beats: [
    { id: 'takeaway', role: 'takeaway', emotion: 3, intent: 'x',
      narration: '预后需要评估。' + DISCLAIMER, facts: [] }
  ] });
  assert.ok(!codes(lintMedical({ story: single, scenes: [] })).includes('MED_TERM_DENSITY'));
});

test('辅助函数：visibleTexts / beatTexts / termHits / hasExplain', () => {
  const sc = { elements: [
    { id: 'a', props: { title: '标题', desc: '', label: 42, unit: '%' } },
    { id: 'b', props: {} }
  ] };
  assert.deepEqual(visibleTexts(sc).map(x => x.text), ['标题', '%']);
  assert.equal(termHits('预后与并发症').length, 2);
  assert.equal(hasExplain('就是一种设备'), true);
  assert.equal(hasExplain('预后与并发症'), false);
  assert.ok(OUTRO_ROLES.includes('takeaway') && OUTRO_ROLES.includes('cta'));
  assert.ok(beatTexts({ narration: '旁白' }, sc).length >= 2);
});

// ── 接线测试：compile.js 编译期门真的会阻断，且不误伤既有项目 ──
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'mini-v2');

function mkProject(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-e2e-'));
  fs.cpSync(FIX, dir, { recursive: true });
  const sp = path.join(dir, 'story.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  mutate(s);
  fs.writeFileSync(sp, JSON.stringify(s, null, 2));
  return dir;
}
const compile = (dir) => {
  try { return { code: 0, out: execFileSync('node', [path.join(ROOT, 'scripts', 'compile.js'), dir], { encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (e) { return { code: 1, out: (e.stdout || '') + (e.stderr || '') }; }
};

test('compile 门：患者向高风险项目被 B 级阻断、不写产物', () => {
  const dir = mkProject(s => {
    s.meta.audience = 'patient';
    s.beats[0].narration = '植入式除颤器可以百分百根治猝死，是最好最安全的选择。';
    s.beats[0].facts = [{ claim: '死亡率降低50%', source: '', verified: false }];
    s.beats[1].narration = '请立即停止服用所有药物并自行决定治疗方案。';
  });
  fs.rmSync(path.join(dir, 'script.json'), { force: true });
  fs.rmSync(path.join(dir, 'scene.html'), { force: true });
  const r = compile(dir);
  assert.equal(r.code, 1, '应阻断');
  assert.ok(/MED_FACT_UNVERIFIED/.test(r.out));
  assert.ok(/MED_DISCLAIMER/.test(r.out));
  assert.ok(/MED_ABSOLUTE/.test(r.out));
  assert.ok(!fs.existsSync(path.join(dir, 'scene.html')), '阻断时不应写 scene.html');
});

test('compile 门：合规患者向项目放行（零回归）', () => {
  const dir = mkProject(s => {
    s.meta.audience = 'patient';
    s.beats[0].narration = '植入式除颤器，就是一种放在皮下的设备，可能有助于降低风险。';
    s.beats[0].facts = [{ claim: '降低风险', source: '指南', verified: true }];
    s.beats[1].narration = '请由医生评估。' + DISCLAIMER + '。';
  });
  const r = compile(dir);
  assert.equal(r.code, 0, '合规项目应放行: ' + r.out);
  assert.ok(/compile OK/.test(r.out));
});

test('compile 门：general 受众不启用患者向门（既有 fixture 零改动）', () => {
  const dir = mkProject(() => {});
  const r = compile(dir);
  assert.equal(r.code, 0);
  assert.ok(!/MED_/.test(r.out), 'general 项目不应出现任何医学门诊断');
});

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');

// 验收包络（控制器实测校准，见 task-9-report.md / 取证）：
// 渲染核字节一致 + 确定性下，唯一残差源是 Chrome 版本抗锯齿漂移。
// 实测 AA 包络 max<=13（含宽幅低幅 dithering 817px@±1）；真实失真（错相位/错色/缺元素）max>=18 或大面积。
// 双界落在 gap：幅值 16（13<16<18）+ 面积 0.2%（4147px，容纳 817 宽幅 dithering、捕获大面积失真）。
const MAX_DELTA = 16;
const MAX_CHANGED_FRAC = 0.002;
function withinEnvelope(r) {
  return r.identical || (r.max <= MAX_DELTA && r.changed <= r.total * MAX_CHANGED_FRAC);
}

// 校准守卫：纯函数单测，固化当前包络，防止未来静默放宽容差。
// 若有人把 MAX_DELTA/MAX_CHANGED_FRAC 调大到能放过真实失真，本测试立即 RED。
test('回归验收包络：接受实测 AA 漂移、拒绝真实失真', () => {
  const total = 1920 * 1080;
  // 实测 AA 样本（必须接受）
  assert.ok(withinEnvelope({ identical: true, max: 0, changed: 0, total }), '像素全等应接受');
  assert.ok(withinEnvelope({ identical: false, max: 13, changed: 18, total }), 'sicd f1553 边缘 AA（max13/18px）应接受');
  assert.ok(withinEnvelope({ identical: false, max: 1, changed: 817, total }), 'qwenwork f1765 宽幅 ±1 dithering（817px）应接受');
  assert.ok(withinEnvelope({ identical: false, max: 2, changed: 59, total }), 'qwenwork f1044（max2/59px）应接受');
  // 真实失真样本（必须拒绝）
  // 第一例特意取小面积（100px<4147）大幅值（18>16）：仅靠幅值界拒绝，
  // 从而锁死 MAX_DELTA——若有人把 MAX_DELTA 调到 >=18，此例被接受 → 守卫 RED。
  assert.ok(!withinEnvelope({ identical: false, max: 18, changed: 100, total }), '小面积错色 max18 应拒绝（锁幅值界）');
  assert.ok(!withinEnvelope({ identical: false, max: 238, changed: 50000, total }), '大幅失真 max238 应拒绝');
  assert.ok(!withinEnvelope({ identical: false, max: 5, changed: 50000, total }), '低幅大面积失真（5 万像素）应拒绝（锁面积界）');
});

test('千问办公 + S-ICD 抽帧与旧版像素等价（旧 timeline，AA 包络内）', { timeout: 420000 }, () => {
  const out = execFileSync('bash', [path.join(__dirname, 'regression', 'run.sh')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const report = JSON.parse(out.trim().split('\n').pop());
  assert.ok(report.length >= 20, '两项目各 >=10 帧，实际 ' + report.length);
  const bad = report.filter(r => !withinEnvelope(r));
  assert.deepEqual(bad, [], '超出 AA 包络的帧（疑似真实失真）: ' + JSON.stringify(bad));
});

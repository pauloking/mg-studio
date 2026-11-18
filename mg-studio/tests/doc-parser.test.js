'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const fs = require('fs');

const { extractRawText, analyzeDocumentText } = require('../lib/doc-parser');
const { createStudioServer } = require('../scripts/studio');

test('doc-parser: extractRawText 支持文本与多格式解包', async () => {
  // 1. 直接传递文本字符串
  const t1 = await extractRawText({ textContent: '  心肌梗死急救要点  \n' });
  assert.equal(t1, '心肌梗死急救要点');

  // 2. Buffer UTF-8 解码
  const buf = Buffer.from('# 冠脉介入术后康复指南\n术后早期需规律服用双联抗血小板药物。', 'utf8');
  const t2 = await extractRawText({ filename: 'guide.md', buffer: buf });
  assert.ok(t2.includes('冠脉介入术后康复指南'));
  assert.ok(t2.includes('双联抗血小板药物'));
});

test('doc-parser: analyzeDocumentText 提取主题、受众与结构化事实', () => {
  const markdownSample = `
# 经导管主动脉瓣置换术 (TAVR) 临床路径共识

前瞻性队列研究表明，对于重度主动脉瓣狭窄高危患者，TAVR 手术成功率达到 97.4%，术后 30 天全因死亡率显著降低 42% (p < 0.01)。
主要生理机制在于经股动脉路径将人工生物瓣膜输送至主动脉根部并撑开，完全恢复左心室血流动力学灌注。
患者术后必须遵医嘱按时到门诊复查心电图与心脏彩超，日常生活中如出现突发头晕或胸闷等危险信号需立即就医。
禁忌证包括活动性心内膜炎及严重主动脉瓣环钙化。
`;

  const res = analyzeDocumentText(markdownSample, 'tavr-guideline.md');

  assert.equal(res.filename, 'tavr-guideline.md');
  assert.equal(res.suggestedTopic, '经导管主动脉瓣置换术 (TAVR) 临床路径共识');
  // 包含门诊、就医、遵医嘱等词
  assert.ok(['patient', 'professional'].includes(res.suggestedAudience));
  assert.equal(res.suggestedTemplate, 'science');

  // 事实提取
  assert.ok(res.facts.length >= 2, '应提取出至少 2 条事实，实际提取: ' + res.facts.length);
  const statFact = res.facts.find(f => f.claim.includes('97.4%') || f.claim.includes('42%'));
  assert.ok(statFact, '应抽取包含百分比统计的事实');
  assert.equal(statFact.verified, false);
  assert.equal(statFact.isUserDoc, true);
  assert.ok(statFact.evidence.includes('tavr-guideline.md'));

  // 机制与警示
  const mechFact = res.facts.find(f => f.claim.includes('机制') || f.claim.includes('左心室'));
  assert.ok(mechFact, '应抽取机理机制相关事实');

  assert.ok(res.keywords.includes('TAVR') || res.keywords.includes('心肌梗死') || res.keywords.includes('介入手术'));
  assert.ok(res.summary.length > 10);
});

test('doc-parser: 教学操作型资料自动识别为 teaching 模板', () => {
  const stepsSample = `
心肺复苏 (CPR) 标准操作流程与步骤拆解

第一步：确认现场环境安全，判断患者意识与颈动脉搏动。
第二步：立即呼救并拨打 120 急救电话。
第三步：实施胸外按压，按压频率严格保持在 100-120 次/分钟，按压深度 5-6 cm。
第四步：开放气道并进行人工呼吸，按压与吹气比例为 30:2。
`;

  const res = analyzeDocumentText(stepsSample, 'cpr-steps.txt');
  assert.equal(res.suggestedTemplate, 'teaching');
  assert.ok(res.facts.some(f => f.claim.includes('100-120') || f.claim.includes('30:2')));
});

test('REST API: POST /api/parse-doc 闭环测试', async () => {
  const ROOT = path.join(__dirname, '..');
  const work = path.join(ROOT, 'tests', 'work', 'doc-parser-api');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(__dirname, 'fixtures', 'mini-style-medical'), work, { recursive: true });

  const app = createStudioServer({ projectDir: work, port: 0 });
  const info = await app.start();
  const port = info.port;

  try {
    // 1. 发送 textContent
    const postData = JSON.stringify({
      filename: 'clinical-study.md',
      textContent: '# 脉冲电场消融技术临床疗效报告\n多中心试验显示肺静脉电隔离成功率达到 98.2%，且无膈神经损伤发生率。不可擅自停服抗凝药物。'
    });

    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/parse-doc',
        method: 'POST',
        headers: {
          'X-Studio-Token': app.csrfToken,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (r) => {
        let data = '';
        r.on('data', chunk => { data += chunk; });
        r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.suggestedTopic, '脉冲电场消融技术临床疗效报告');
    assert.ok(res.body.facts.length >= 1);
    assert.ok(res.body.facts[0].claim.includes('98.2%'));
    assert.equal(res.body.facts[0].isUserDoc, true);

    // 2. 发送 contentBase64
    const base64Content = Buffer.from('# 心房颤动规范化诊疗\n抗凝治疗降低脑卒中风险达 64%。', 'utf8').toString('base64');
    const postData2 = JSON.stringify({
      filename: 'af-treatment.txt',
      contentBase64: base64Content
    });

    const res2 = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/parse-doc',
        method: 'POST',
        headers: {
          'X-Studio-Token': app.csrfToken,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData2)
        }
      }, (r) => {
        let data = '';
        r.on('data', chunk => { data += chunk; });
        r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.write(postData2);
      req.end();
    });

    assert.equal(res2.statusCode, 200);
    assert.equal(res2.body.ok, true);
    assert.equal(res2.body.suggestedTopic, '心房颤动规范化诊疗');
    assert.ok(res2.body.facts.some(f => f.claim.includes('64%')));
  } finally {
    await app.close();
  }
});

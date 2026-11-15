'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { compileProject } = require('../lib/compile');
const { DISCLAIMER } = require('../lib/medical-lint');
const ROOT = path.join(__dirname, '..');

function mk(dir, audience, outroNarration) {
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'mini-v2'), dir, { recursive: true });
  const sp = path.join(dir, 'story.json'); const s = JSON.parse(fs.readFileSync(sp));
  s.meta.audience = audience;
  s.beats[s.beats.length - 1].narration = outroNarration;
  fs.writeFileSync(sp, JSON.stringify(s, null, 2));
  return dir;
}

test('patient 项目编译 → 注入可见免责叠层 #disclaimer', () => {
  const dir = mk(fs.mkdtempSync(path.join(os.tmpdir(), 'disc-')), 'patient', '要点收尾。' + DISCLAIMER);
  const r = compileProject(dir);
  assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
  const html = fs.readFileSync(r.htmlPath, 'utf8');
  assert.ok(html.includes('id="disclaimer"'), '应含 #disclaimer 元素');
  assert.ok(html.includes(DISCLAIMER), '应含免责声明文本');
});

test('general 项目不注入 #disclaimer', () => {
  const dir = mk(fs.mkdtempSync(path.join(os.tmpdir(), 'disc-')), 'general', '要点一，要点二。');
  const r = compileProject(dir);
  assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
  assert.ok(!fs.readFileSync(r.htmlPath, 'utf8').includes('id="disclaimer"'), '非患者向不应注入');
});

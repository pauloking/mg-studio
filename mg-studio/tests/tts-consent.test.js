'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-consent-'));
  fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify({ fps: 30, scenes: [{ id: 'a', narration: '测试旁白。' }] }));
  return dir;
}
function runTts(dir, args) {
  try { execFileSync('node', [path.join(ROOT, 'scripts', 'tts.js'), ...args], { cwd: dir, env: { ...process.env, MG_TTS_YES: '' }, stdio: ['ignore', 'pipe', 'pipe'] }); return 0; }
  catch (e) { return e.status; }
}

test('百炼新合成无确认 → 退出2（计费门，不触网）', () => {
  const dir = mkProject();
  assert.equal(runTts(dir, ['--backend', 'bailian']), 2);
});

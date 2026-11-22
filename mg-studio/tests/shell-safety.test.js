const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { buildTtsCommand, configFor } = require('../scripts/tts.js');

const ROOT = path.join(__dirname, '..');

test('tts：旁白文本作为单个 argv 元素，不经 shell 展开', () => {
  const narration = '你好 $(touch /tmp/PWNED) `id` 世界';
  const { cmd, args, env } = buildTtsCommand({ cfg: { backend: 'local' }, sc: { id: 'a', narration }, raw: '/tmp/a.aiff', platform: 'darwin' });
  assert.equal(cmd, 'say');
  assert.ok(Array.isArray(args));
  assert.equal(args[args.length - 1], narration, '旁白必须是单个参数原样传入');
  assert.ok(!args.some(a => /\$\(|`/.test(a) && a !== narration), '不得把旁白再拼进任何命令串');
  assert.equal(typeof env, 'object');
});

test('tts：百炼后端同样走参数数组，归因信息走 env', () => {
  const narration = '旁白 $HOME $(whoami)';
  const { cmd, args, env } = buildTtsCommand({ cfg: { backend: 'bailian', voice: 'v', model: 'm', instruction: 'i' }, sc: { id: 'a', narration }, raw: '/tmp/a.wav' });
  assert.equal(cmd, 'bl');
  assert.equal(args[args.indexOf('--text') + 1], narration);
  assert.equal(args[args.indexOf('--instruction') + 1], 'i');
  assert.equal(env.BAILIAN_CALLER_TYPE, 'agent');
  assert.equal(env.BAILIAN_SKILL_NAME, 'bailian-gen');
});

test('tts：configFor 优先级（script.json < CLI 参数 / env）', () => {
  const cfg = configFor({ tts: { backend: 'local', voice: 'Tingting' } }, 'bailian');
  assert.equal(cfg.backend, 'bailian');
  assert.equal(cfg.voice, 'Tingting');
});

// 端到端：真跑一次 say，证明含命令替换的旁白不会被执行（仅 macOS）
test('tts：含 $(...) 的旁白不会执行命令（端到端，macOS）', { skip: process.platform !== 'darwin' && 'need macOS say', timeout: 120000 }, () => {
  const work = path.join(ROOT, 'tests', 'work', 'tts-injection');
  const victim = path.join(work, 'PWNED');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  fs.writeFileSync(path.join(work, 'script.json'), JSON.stringify({
    fps: 30, width: 1920, height: 1080,
    scenes: [{ id: 'a', minSec: 1, narration: `测试 $(touch ${victim}) 结束`, subs: ['测试'] }]
  }, null, 2));
  execFileSync('node', [path.join(ROOT, 'scripts', 'tts.js'), '--backend', 'local'], { cwd: work, encoding: 'utf8', timeout: 60000 });
  assert.ok(fs.existsSync(path.join(work, 'vo', 'a.wav')), '配音文件应生成');
  assert.ok(!fs.existsSync(victim), '旁白里的 $(touch ...) 不得被执行');
});

test('Windows 配音通过标准输入传递 Unicode 旁白与输出路径', () => {
  const narration = '中文旁白 "保留引号"';
  const raw = 'C:\\用户\\语音 01.wav';
  const { cmd, args, input } = buildTtsCommand({ cfg: { backend: 'local' }, sc: { narration }, raw, platform: 'win32' });
  assert.equal(cmd, 'powershell.exe');
  assert.ok(args.includes('-EncodedCommand'));
  assert.ok(!args.includes(narration));
  assert.deepEqual(JSON.parse(input.toString('utf8')), { text: narration, output: raw, chinese: true });
});

#!/usr/bin/env node
/* tts.js — 分场景生成配音并转为 44100 单声道 wav（对齐管线）
 * 用法:
 *   node tts.js                          # 本地 macOS say / Windows System.Speech
 *   node tts.js --backend bailian        # 百炼 TTS（需 bl 已鉴权；可能计费）
 * 可选环境变量:
 *   TTS_VOICE   本地默认 Tingting；百炼默认 longanlingxin
 *   TTS_MODEL   百炼默认 qwen-audio-3.0-tts-plus
 *   TTS_RATE    本地 say 语速（字/分，默认不传）
 *   TTS_INSTRUCTION 百炼语气指令（默认温暖平和科普语气）
 * 也可在 script.json 里写 tts:{backend,voice,model,instruction} 覆盖。
 *
 * 安全纪律：一律 execFileSync(命令, 参数数组)，不拼 shell 字符串。
 * 旁白文本来自 story.json（可能由 Agent 生成），拼进 shell 会让 `$(...)`/反引号被展开执行。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createHash } = require('node:crypto');
const { preservedVoice } = require('../lib/shot-segment');

function parseArgs(argv) {
  const out = { backend: null, dir: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--backend=')) out.backend = a.split('=')[1];
    else if (a === '--backend') out.backend = argv[++i];
    else if (a.startsWith('--only=')) out.only = a.split('=')[1];
    else if (a === '--only') out.only = argv[++i];
    else if (a === '--reuse') out.reuse = true;
    else if (!a.startsWith('--')) out.dir = a;
  }
  return out;
}

/** 纯函数：按 --only 过滤场景（无 only → 全部）；返回 { scenes, missing }
 *  only 形如 "demo_trans,mech_v6"；missing 为未命中的 id（调用方告警但不崩溃） */
function selectScenes(scenes, only) {
  if (!only) return { scenes, missing: [] };
  const ids = String(only).split(',').map(s => s.trim()).filter(Boolean);
  const want = new Set(ids);
  const picked = scenes.filter(sc => want.has(sc.id));
  const found = new Set(picked.map(sc => sc.id));
  return { scenes: picked, missing: ids.filter(id => !found.has(id)) };
}

// 百炼调用归因（走 env 传，不拼命令串）
function bailianEnv() {
  return {
    BAILIAN_CALLER_TYPE: 'agent',
    BAILIAN_CALLER_NAME: process.env.BAILIAN_CALLER_NAME || 'qoder',
    BAILIAN_SKILL_NAME: 'bailian-gen',
    BAILIAN_SKILL_VERSION: process.env.BAILIAN_SKILL_VERSION || '2.8.2',
    NO_COLOR: '1'
  };
}

function loadScript(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'script.json'), 'utf8'));
}

function configFor(s, argBackend) {
  const cfg = Object.assign({ backend: 'local', voice: null, model: null, instruction: null }, s.tts || {});
  if (argBackend) cfg.backend = argBackend;
  if (!cfg.revision) {
    cfg.voice = process.env.TTS_VOICE || cfg.voice;
    cfg.model = process.env.TTS_MODEL || cfg.model;
    cfg.instruction = process.env.TTS_INSTRUCTION || cfg.instruction;
  }
  return cfg;
}

/** 纯函数：返回 {cmd, args, env} 三元组（便于单测断言"文本是单个 argv 元素"） */
const WINDOWS_SPEECH = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  if ($request.voice) {
    $synth.SelectVoice([string]$request.voice)
  } elseif ($request.chinese) {
    $voice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'zh-*' } | Select-Object -First 1
    if (!$voice) { throw 'Install a Chinese desktop speech voice in Windows, or configure TTS_VOICE.' }
    $synth.SelectVoice($voice.VoiceInfo.Name)
  }
  $synth.SetOutputToWaveFile([string]$request.output)
  $synth.Speak([string]$request.text)
} finally {
  $synth.Dispose()
}`;

function buildTtsCommand({ cfg, sc, raw, platform = process.platform }) {
  if (cfg.backend === 'bailian') {
    const voice = cfg.voice || 'longanlingxin';
    const model = cfg.model || 'qwen-audio-3.0-tts-plus';
    const instr = cfg.instruction || '用温暖、平和、清晰的语气朗读，语速适中，富有亲和力';
    return {
      cmd: 'bl',
      args: ['speech', 'synthesize', '--model', model, '--voice', voice, '--format', 'wav', '--seed', '42',
        '--instruction', instr, '--text', sc.narration, '--out', raw],
      env: Object.assign({}, process.env, bailianEnv())
    };
  }
  if (platform === 'win32') {
    return {
      cmd: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(WINDOWS_SPEECH, 'utf16le').toString('base64')],
      input: Buffer.from(JSON.stringify({ text: sc.narration, output: raw, voice: cfg.voice, chinese: /\p{Script=Han}/u.test(sc.narration) }), 'utf8'),
      env: { ...process.env }
    };
  }
  const args = ['-v', cfg.voice || 'Tingting'];
  if (!cfg.revision && process.env.TTS_RATE) args.push('-r', String(process.env.TTS_RATE));
  args.push('-o', raw, sc.narration);
  return { cmd: 'say', args, env: Object.assign({}, process.env) };
}

function probeDuration(file) {
  return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}

function run({ dir: argvDir, backend, only, reuse }) {
  const dir = argvDir ? path.resolve(argvDir) : process.cwd();
  const s = loadScript(dir);
  const cfg = configFor(s, backend);
  fs.mkdirSync(path.join(dir, 'vo'), { recursive: true });
  const manifest = path.join(dir, 'vo', 'voices.json');
  let voices = {};
  try { voices = JSON.parse(fs.readFileSync(manifest, 'utf8')) || {}; } catch { /* An older project may have no voice signatures. */ }

  const { scenes, missing } = selectScenes(s.scenes, only);
  if (missing.length) console.warn('[!] --only 未命中场景 id（已忽略）:', missing.join(', '));
  if (!scenes.length) { console.error('[!] --only 未选中任何场景，未生成配音'); process.exit(1); }

  for (const sc of scenes) {
    const wav = path.join(dir, 'vo', sc.id + '.wav');
    const take = preservedVoice(dir, sc, cfg.revision);
    if (take) {
      const tmp = wav + '.tmp.wav';
      try {
        fs.copyFileSync(take, tmp);
        fs.renameSync(tmp, wav);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
      if (Object.hasOwn(voices, sc.id)) {
        delete voices[sc.id];
        fs.writeFileSync(manifest, JSON.stringify(voices));
      }
      console.log('保留拆镜旁白', sc.id);
      continue;
    }
    // 各后端原生产物：say 出 aiff、百炼出 wav，随后统一转 44100 单声道
    const rawSrc = path.join(dir, 'vo', sc.id + (cfg.backend === 'bailian' || process.platform === 'win32' ? '_raw.wav' : '_raw.aiff'));
    const { cmd, args, env, input } = buildTtsCommand({ cfg, sc, raw: rawSrc });
    const filter = cfg.speed && cfg.speed !== 1 ? ['-af', 'atempo=' + cfg.speed] : [];
    const signatureInput = input && { ...JSON.parse(input), output: '<output>' };
    const signature = createHash('sha256')
      .update(JSON.stringify([cmd, args.map(arg => arg === rawSrc ? '<output>' : arg), signatureInput, ...filter])).digest('hex');
    if (reuse && voices[sc.id] === signature && fs.existsSync(wav)) {
      console.log('复用配音', sc.id);
      continue;
    }
    const converted = wav + '.tmp.wav';
    try {
      execFileSync(cmd, args, { env, input, timeout: 120000, windowsHide: true, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', rawSrc, ...filter, '-ar', '44100', '-ac', '1', converted], { stdio: ['ignore', 'pipe', 'pipe'] });
      fs.renameSync(converted, wav);
    } finally {
      fs.rmSync(rawSrc, { force: true });
      fs.rmSync(converted, { force: true });
    }
    voices[sc.id] = signature;
    fs.writeFileSync(manifest, JSON.stringify(voices));
    console.log('ok', sc.id, probeDuration(wav).toFixed(2) + 's', '(' + cfg.backend + ')');
  }
  if (only) console.log(`（--only：仅重配 ${scenes.length} 个场景，其余 vo/*.wav 保持不变）`);
  console.log('配音完成 -> vo/<id>.wav，下一步: node build_timeline.js');
}

if (require.main === module) {
  try { run(parseArgs(process.argv.slice(2))); }
  catch (e) { console.error(e && e.message || e); process.exit(1); }
}
module.exports = { parseArgs, selectScenes, configFor, buildTtsCommand, bailianEnv, probeDuration, run };

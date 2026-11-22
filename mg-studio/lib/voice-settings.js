'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const runFile = promisify(execFile);
const BACKENDS = ['local', 'bailian'];

function settingsFor(tts) {
  tts ||= {};
  const backend = BACKENDS.includes(tts.backend) ? tts.backend : 'local';
  const value = key => (!tts.revision && process.env['TTS_' + key.toUpperCase()]) || tts[key] || '';
  return {
    backend,
    voice: value('voice'),
    speed: tts.speed || 1,
    model: backend === 'bailian' ? value('model') : '',
    instruction: backend === 'bailian' ? value('instruction') : ''
  };
}

function parseSettings(input) {
  function invalid(message) {
    throw Object.assign(new Error(message), { statusCode: 422 });
  }
  function field(value, limit, label, multiline = false) {
    if (typeof value !== 'string' || value.length > limit) invalid(label + '格式有误。');
    const text = (multiline ? value.replace(/[\r\n\t]+/g, ' ') : value).trim();
    if (/[\x00-\x1f\x7f]/.test(text) || text.startsWith('-')) invalid(label + '格式有误。');
    return text;
  }
  if (!input || !BACKENDS.includes(input.backend)) invalid('请选择配音引擎。');
  const { backend, speed } = input;
  if (!Number.isFinite(speed) || speed < 0.75 || speed > 1.5) invalid('语速须介于 0.75 倍和 1.5 倍之间。');
  return {
    backend,
    voice: field(input.voice ?? '', 160, '音色'),
    speed,
    model: backend === 'bailian' ? field(input.model ?? '', 120, '模型') : '',
    instruction: backend === 'bailian' ? field(input.instruction ?? '', 500, '语气指令', true) : ''
  };
}

async function localVoices() {
  try {
    if (process.platform === 'win32') {
      const script = `
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synth.GetInstalledVoices() | Where-Object Enabled | ForEach-Object {
    Write-Output ("{0}{1}{2}" -f $_.VoiceInfo.Name, [char]9, $_.VoiceInfo.Culture.Name)
  }
} finally { $synth.Dispose() }`;
      const command = Buffer.from(script, 'utf16le').toString('base64');
      const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', command],
        { timeout: 5000, windowsHide: true });
      return parseVoices(stdout, /^(.+?)\t([\w-]+)\s*$/);
    }
    if (process.platform !== 'darwin') return [];
    const { stdout } = await runFile('/usr/bin/say', ['-v', '?'], { timeout: 3000 });
    return parseVoices(stdout, /^(.+?)\s+([\w-]+)\s+#/);
  } catch {
    return [];
  }
}

function parseVoices(stdout, pattern) {
  const voices = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(pattern);
    if (match) voices.set(match[1], { name: match[1], locale: match[2] });
  }
  return [...voices.values()].sort((a, b) => Number(b.locale.startsWith('zh')) - Number(a.locale.startsWith('zh')) ||
    a.name.localeCompare(b.name));
}

function narrationRevisionFile(dir) {
  return path.join(dir, 'vo', 'narration-revision.txt');
}

function narrationRevisionMatches(dir, revision) {
  const file = narrationRevisionFile(dir);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') === (revision || '') : !revision;
}

function hasCurrentNarration(dir, revision) {
  return fs.existsSync(path.join(dir, 'vo', 'narration.wav')) && narrationRevisionMatches(dir, revision);
}

module.exports = { BACKENDS, settingsFor, parseSettings, localVoices, narrationRevisionFile, narrationRevisionMatches, hasCurrentNarration };

#!/usr/bin/env node
/* tts.js — 分场景生成配音并转为 44100 单声道 wav（对齐管线）
 * 用法:
 *   node tts.js                          # 本地 macOS say（免费，默认 Tingting）
 *   node tts.js --backend bailian        # 百炼 TTS（需 bl 已鉴权；可能计费）
 * 可选环境变量:
 *   TTS_VOICE   本地默认 Tingting；百炼默认 longanlingxin
 *   TTS_MODEL   百炼默认 qwen-audio-3.0-tts-plus
 *   TTS_RATE    本地 say 语速（字/分，默认不传）
 *   TTS_INSTRUCTION 百炼语气指令（默认温暖平和科普语气）
 * 也可在 script.json 里写 tts:{backend,voice,model,instruction} 覆盖。
 * 百炼调用带 Call attribution（BAILIAN_CALLER_*），符合 bailian-protocol。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = process.cwd();
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'script.json'), 'utf8'));
const argBackend = (process.argv.find(a => a.startsWith('--backend=')) || '').split('=')[1]
  || (process.argv.includes('--backend') ? process.argv[process.argv.indexOf('--backend') + 1] : null);
const cfg = Object.assign({ backend: 'local', voice: null, model: null, instruction: null }, s.tts || {});
if (argBackend) cfg.backend = argBackend;
cfg.voice = process.env.TTS_VOICE || cfg.voice;
cfg.model = process.env.TTS_MODEL || cfg.model;
cfg.instruction = process.env.TTS_INSTRUCTION || cfg.instruction;

fs.mkdirSync(path.join(ROOT, 'vo'), { recursive: true });
const PRE = `BAILIAN_CALLER_TYPE=agent BAILIAN_CALLER_NAME=${process.env.BAILIAN_CALLER_NAME || 'qoder'} BAILIAN_SKILL_NAME=bailian-gen BAILIAN_SKILL_VERSION=${process.env.BAILIAN_SKILL_VERSION || '2.8.2'} NO_COLOR=1 `;

for (const sc of s.scenes) {
  const raw = path.join(ROOT, 'vo', sc.id + '_raw.wav');
  const wav = path.join(ROOT, 'vo', sc.id + '.wav');
  if (cfg.backend === 'bailian') {
    const voice = cfg.voice || 'longanlingxin';
    const model = cfg.model || 'qwen-audio-3.0-tts-plus';
    const instr = cfg.instruction || '用温暖、平和、清晰的语气朗读，语速适中，富有亲和力';
    const cmd = PRE + `bl speech synthesize --model ${model} --voice ${voice} --format wav --seed 42`
      + ` --instruction ${JSON.stringify(instr)} --text ${JSON.stringify(sc.narration)} --out "${raw}"`;
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] });
  } else {
    const voice = cfg.voice || 'Tingting';
    const rate = process.env.TTS_RATE ? `-r ${process.env.TTS_RATE}` : '';
    const aiff = path.join(ROOT, 'vo', sc.id + '_raw.aiff');
    execSync(`say -v ${voice} ${rate} -o "${aiff}" ${JSON.stringify(sc.narration)}`);
    execSync(`ffmpeg -y -loglevel error -i "${aiff}" "${raw}"`);
    fs.unlinkSync(aiff);
  }
  execSync(`ffmpeg -y -loglevel error -i "${raw}" -ar 44100 -ac 1 "${wav}"`);
  fs.unlinkSync(raw);
  const dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${wav}"`).toString().trim());
  console.log('ok', sc.id, dur.toFixed(2) + 's', '(' + cfg.backend + ')');
}
console.log('配音完成 -> vo/<id>.wav，下一步: node build_timeline.js');
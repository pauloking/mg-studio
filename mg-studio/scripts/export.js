#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pendingShots } = require('../lib/director-review');

// Keep the CLI and desktop on the same pipeline. Each stage receives an argv
// array; paths inside app.asar are opened by Electron's Node runtime only.
function execute(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} ${path.basename(args[0])} failed (${result.signal || result.status})`);
}

function exportVideo(backend = 'local', outputName = 'output') {
  const node = (script, ...args) => execute(process.execPath, [path.join(__dirname, script), ...args]);
  const ffmpeg = (...args) => execute('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  const output = path.join('out', outputName + '.mp4');
  const isV2 = fs.existsSync('story.json');
  if (isV2) {
    const story = JSON.parse(fs.readFileSync('story.json', 'utf8'));
    if (pendingShots(story).length) throw new Error('请先核对医学内容与出处，再正式导出。');
    console.log('==> 0/5 编译分镜与 G0 脚本门');
    node('compile.js');
    node('lint_story.js', '.');
  }
  console.log(`==> 1/5 配音 (${backend})`);
  const ttsArgs = ['--backend', backend, '--reuse'];
  if (process.argv.includes('--yes') || process.env.MG_TTS_YES === '1') ttsArgs.push('--yes');
  node('tts.js', ...ttsArgs);
  console.log('==> 2/5 时间轴');
  node('build_timeline.js');
  if (isV2) node('lint_scene.js', '.');

  console.log('==> 3/5 音频轨与 3D 段');
  node('assemble_audio.js');
  if (isV2) { console.log('==> 3.5/5 视觉正确性人工门（解剖/器械示意需专家目检+参考图批准）'); node('visual_review.js', 'check', '.'); }
  node('render_three.js', '.');
  console.log('==> 4/5 逐场景渲染与拼接');
  node('render.js', '--all');
  node('assemble_frames.js', '.');

  console.log('==> 5/5 编码与混音');
  fs.mkdirSync('out', { recursive: true });
  const silent = path.join('out', 'video_only.mp4');
  ffmpeg('-framerate', '30', '-i', 'frames/all/f_%04d.png',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', silent);
  const mix = ['-i', silent, '-i', 'vo/narration.wav'];
  if (fs.existsSync('vo/bgm.wav')) {
    mix.push('-i', 'vo/bgm.wav', '-filter_complex',
      '[2:a]volume=0.25[bg];[1:a][bg]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.98[a]', '-map', '0:v', '-map', '[a]');
  } else {
    mix.push('-map', '0:v', '-map', '1:a');
  }
  if (fs.existsSync(output)) { fs.copyFileSync(output, output + '.bak'); console.log('  已备份旧成片 → ' + output + '.bak'); }
  ffmpeg(...mix, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', output);
  console.log('==> 5.5/5 QA');
  node('auto_qa.js', '.');
  execute('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'csv=p=0', output]);
  console.log(`==> 完成: ${output}`);
}

require('../lib/cli-help').help('用法: node export.js [local|bailian] [输出名]\n一键出片：编译→G0→配音→时间轴→实测门→音频→视觉门→3D→增量渲染→拼接→编码混音→QA。覆盖前自动备份 .bak。');

try {
  exportVideo(process.argv[2], process.argv[3]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
    console.log('==> 0/5 编译分镜与 G0 脚本门');
    node('compile.js');
    node('lint_story.js', '.');
  }
  console.log(`==> 1/5 配音 (${backend})`);
  node('tts.js', '--backend', backend);
  console.log('==> 2/5 时间轴');
  node('build_timeline.js');
  if (isV2) node('lint_scene.js', '.');

  console.log('==> 3/5 音频轨与 3D 段');
  node('assemble_audio.js');
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
  ffmpeg(...mix, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', output);
  console.log('==> 5.5/5 QA');
  node('auto_qa.js', '.');
  execute('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'csv=p=0', output]);
  console.log(`==> 完成: ${output}`);
}

try {
  exportVideo(process.argv[2], process.argv[3]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

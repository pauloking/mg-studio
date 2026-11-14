#!/usr/bin/env bash
# make.sh — 一键跑完整管线（在项目目录里执行，cwd 即项目目录）
# 用法:
#   bash <toolkit>/scripts/make.sh <toolkit目录> [local|bailian] [输出名]
# 例:
#   1) v2 项目（story.json + scenes/*.json [+ tokens.json]）：自动编译
#      bash ../mg-studio/scripts/make.sh ../mg-studio local "my-film"
#   2) v1 项目（script.json + scene.html）：直通，跳过编译与编译后门
#      bash ../mg-studio/scripts/make.sh ../mg-studio bailian "S-ICD_科普"
# 前置: node / 全局 playwright + 本机 Chrome / ffmpeg(含 libx264)；bailian 需 bl 已鉴权
# 环境变量: RENDER_PORT（固定渲染端口）、PW_CHANNEL（浏览器通道）、MG_MEASURE=0（跳过实测盒）
set -euo pipefail
TOOLKIT="${1:?用法: make.sh <toolkit目录> [local|bailian] [输出名]}"
BACKEND="${2:-local}"
OUTNAME="${3:-output}"
FPS=30
if [ -f story.json ]; then
  echo "==> 0/5 编译分镜"
  node "$TOOLKIT/scripts/compile.js"
fi

echo "==> 1/5 配音 ($BACKEND)"
node "$TOOLKIT/scripts/tts.js" --backend "$BACKEND"

echo "==> 2/5 时间轴"
node "$TOOLKIT/scripts/build_timeline.js"

if [ -f story.json ]; then
  echo "==> 2.5/5 编译后门（实测盒 + 实测时长）"
  node "$TOOLKIT/scripts/lint_scene.js" .
fi

echo "==> 3/5 音频轨"
node "$TOOLKIT/scripts/assemble_audio.js"

echo "==> 4/5 逐 scene 增量渲染"
node "$TOOLKIT/scripts/render.js" --all

echo "==> 4.5/5 拼接帧"
node "$TOOLKIT/scripts/assemble_frames.js" .

echo "==> 5/5 编码 + 混音"
mkdir -p out
ffmpeg -y -loglevel error -framerate "$FPS" -i frames/all/f_%04d.png \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p out/video_only.mp4
if [ -f vo/bgm.wav ]; then
  ffmpeg -y -loglevel error -i out/video_only.mp4 -i vo/narration.wav -i vo/bgm.wav \
    -filter_complex "[2:a]volume=0.25[bg];[1:a][bg]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.98[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k "out/${OUTNAME}.mp4"
else
  ffmpeg -y -loglevel error -i out/video_only.mp4 -i vo/narration.wav \
    -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k "out/${OUTNAME}.mp4"
fi
echo "==> 5.5/5 QA"
node "$TOOLKIT/scripts/auto_qa.js" .
echo "==> 完成: out/${OUTNAME}.mp4"
ffprobe -v error -show_entries format=duration,size -of csv=p=0 "out/${OUTNAME}.mp4"

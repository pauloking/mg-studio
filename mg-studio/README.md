# mg-studio（M1 编译核）

声明式分镜 → 确定性 1080p 动效视频。渲染核继承 motion-explainer-video（已验证），新增 IR v2 编译层。

## 用法

v2 项目（story.json + scenes/*.json + tokens.json 可选）：

    bash <toolkit>/scripts/make.sh <toolkit目录> [local|bailian] [输出名]

make.sh 自动先编译（compile.js）再走 配音→时间轴→音频→渲染→编码混音。
v1 项目（script.json + scene.html）直通，行为与旧工具包一致。

单独编译：`node scripts/compile.js [项目目录]`（B 级 lint 阻断写文件）。
单场景调试：scene.html?scene=<id>（__N 为场景帧数，供 M3 增量渲染）。

## 测试

    node --test --test-concurrency=1 tests/*.test.js

含浏览器帧驱动测试（全局 Playwright + Chrome）、旧片像素回归（python3 + PIL）。

## 纪律

动画只由帧号驱动；字幕画进帧里；布景 y<900；transform 归零由运行时保证。
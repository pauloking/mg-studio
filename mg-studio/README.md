# mg-studio（M1 编译核）

声明式分镜 → 确定性 1080p 动效视频。渲染核继承 motion-explainer-video（已验证），新增 IR v2 编译层。

## 用法

v2 项目（story.json + scenes/*.json + tokens.json 可选）：

    bash <toolkit>/scripts/make.sh <toolkit目录> [local|bailian] [输出名]

make.sh 自动先编译（compile.js）再走 配音→时间轴→**编译后门**→音频→渲染→编码混音。（在项目目录内运行，cwd 即项目目录。）
v1 项目（script.json + scene.html）直通，行为与旧工具包一致（跳过编译与编译后门）。

单独编译：`node scripts/compile.js [项目目录]`（B 级 lint 阻断写文件）。
编译后门：`node scripts/lint_scene.js [项目目录]`（实测盒 + 实测时长重跑同一套 lint；`--no-measure` 或 `MG_MEASURE=0` 跳过实测）。
单场景调试：scene.html?scene=<id>（__N 为场景帧数，供 M3 增量渲染）。

环境变量：`PW_PATH`（playwright 路径）、`PW_CHANNEL`（浏览器通道，默认 chrome；空串=playwright 自带 chromium）、`RENDER_PORT`（固定渲染端口，默认临时端口）、`MG_MEASURE=0`（跳过实测盒）。

## 环境诊断与测试

    npm run doctor    # 环境诊断：自检 Node/Chrome/ffmpeg/ffprobe/TTS 运行环境
    npm test          # 全量（含 e2e 出片；需 macOS say + Chrome + ffmpeg）
    npm run test:ci   # 自动动态搜集所有非 e2e 测试（CI 专用，防漏测）

含 props/shell 安全单测、浏览器帧驱动测试（全局 Playwright + Chrome）、编译后门实测盒回归、旧片像素回归（python3 + PIL）。

像素回归的素材不在仓库里，必须由 `MG_REGRESSION_SRC` 显式指定（不内置个人绝对路径）：

    MG_REGRESSION_SRC=/path/to/legacy npm test    # 指向含 qwenwork-video/、sicd-video/ 的素材根

无该素材时（换机/CI）回归自动干净跳过（`run.sh` 输出 `{"skip":true}`、像素测试 skip），校准守卫纯函数单测始终运行；其余测试用随包 fixture，可移植。

## 纪律

动画只由帧号驱动；字幕画进帧里；布景 y<900；transform 归零由运行时保证。
组件 props 先过 `lib/props.js` 类型校验再生成代码；子进程一律 `execFileSync(命令, 参数数组)`，不拼 shell。

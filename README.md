# mg-studio

> MG 全链路工具包：声明式分镜编译 + 确定性 1080p 动效视频渲染。

把「故事骨架 + 分镜」写成 JSON，一条命令产出带配音、字幕、原创 BGM 的 1080p 动效视频。动画只由帧号驱动（无墙钟），可复现、可局部重渲；中文由浏览器渲染、字幕画进帧里（零错字）；编译期动效 lint 在出片前拦截效果与脚本流畅度问题。

渲染核继承自已验证的 motion-explainer-video 管线（字节级冻结），本项目新增 **IR v2 编译层**，把声明式分镜编译为可渲染的 `script.json` + 自包含 `scene.html`。

**当前形态**：本地 CLI / Agent 工具包（Node CommonJS，非网页/GUI）。**里程碑**：M1 编译核已交付（标签 `v0.1.0-m1`，61/61）；main 续增回归可移植性测试，当前全量 62/62 通过。

---

## 仓库结构

工具包本体位于仓库的 `mg-studio/` 子目录，设计文档在 `docs/`：

```
.
├── mg-studio/                 # 工具包本体
│   ├── lib/                   # IR v2 编译层
│   │   ├── ir.js              #   schema 校验 + 项目加载（tokens 深合并）
│   │   ├── subs.js            #   字幕自动切句 + 与旁白一致性
│   │   ├── presets.js         #   动效预设运行时（帧号驱动）
│   │   ├── emit.js            #   生成 scene.html + script.json
│   │   ├── compile.js         #   编译编排 + 数值/色键/视频规格守卫
│   │   ├── motion-lint.js     #   编译期动效 lint
│   │   ├── escape.js          #   作者文本转义（防 script breakout）
│   │   └── components/        #   title-card / points / waveform / stat
│   ├── scripts/               # 渲染核（冻结）+ 一键管线 + 编译 CLI
│   │   ├── make.sh            #   一键：编译→配音→时间轴→音频→渲染→编码混音
│   │   ├── compile.js         #   单独编译 CLI（B 级 lint 阻断写文件）
│   │   ├── tts.js             #   配音（local say / bailian）
│   │   ├── build_timeline.js  #   按真实音频时长排时间轴
│   │   ├── assemble_audio.js  #   旁白 + 可选 BGM 混音
│   │   └── render.js          #   headless Chrome 逐帧确定性渲染
│   ├── templates/             # tokens.default.json（默认设计令牌）
│   ├── tests/                 # node:test 套件 + fixtures + 旧片像素回归
│   └── README.md              # ★ 详细用法（项目格式 / 命令 / 纪律）
├── docs/superpowers/
│   ├── specs/2026-11-13-mg-studio-design.md   # 设计文档
│   └── plans/2026-11-13-mg-studio-m1.md        # M1 实现计划
└── .gitignore                 # 排除 frames/out/vo/*.log/tests/work 等产物
```

> 渲染产物（`frames/`、`out/`、`vo/`、`*.log`）与测试临时目录均已 git-ignore，不入库。

## 快速开始

**前置依赖**：`node`、全局 `playwright` + 本机 Chrome、`ffmpeg`（含 libx264）；跑像素回归测试还需 `python3 + PIL`。配音默认走本地免费 `say`，用百炼配音才需要 `bl` 已鉴权。

```bash
# 1. 克隆（私有仓库，需相应账号登录态）
gh repo clone pauloking/mg-studio
cd mg-studio                          # 仓库根

# 2. 用随包 fixture 试跑一条成片（make.sh 在「项目目录」内执行）
cp -r mg-studio/tests/fixtures/mini-v2 my-demo
cd my-demo
bash ../mg-studio/scripts/make.sh ../mg-studio local demo
# 成片：out/demo.mp4（title-card + points）
# 换 mini-av 可试 waveform + stat 医学图元
```

**写自己的片子**：一个项目目录里放 `story.json`（故事骨架：beats 的角色/情绪/意图/旁白/事实核验）+ `scenes/<beatId>.json`（每 beat 一个场景，文件名必须 === beat.id）+ 可选 `tokens.json`（缺省用默认模板深合并）。然后在项目目录内跑同一条 `make.sh`。完整字段、组件 props、动效预设见 [mg-studio/README.md](mg-studio/README.md) 与 `mg-studio/tests/fixtures/` 示例。

**其他入口**：

```bash
node mg-studio/scripts/compile.js [项目目录]   # 只编译 + 看 lint（B 级错阻断写文件）
# 单场景调试：浏览器开 scene.html?scene=<id>（__N 为该场景帧数）
# v1 老项目（script.json + scene.html）直通，不编译，行为与旧工具包一致
```

## 工作原理

两层管线，`make.sh` 串起全程：

1. **编译层（`lib/`）**：`ir` 校验 IR v2 → `subs` 切句并核对旁白 → `presets` 注入帧号驱动的动效运行时 → `motion-lint` 编译期检查 → `emit` 生成 `script.json` + `scene.html`。B 级问题直接阻断，不写出片文件。
2. **渲染核（`scripts/`，冻结）**：`tts` 配音 → `build_timeline` 按真实音频时长排时间轴 → `assemble_audio` 混音 → `render` 用 headless Chrome 逐帧确定性渲染 → `ffmpeg` 编码混音出 mp4。

确定性保证：动画进度完全由帧号计算（不读 `Date`/performance 墙钟），同一输入逐帧可复现，支持 smoke/range/full 与局部重渲。

## 组件（M1）

| layout | 用途 | 关键 props |
| --- | --- | --- |
| `title-card` | 标题开场 | `text(role=title/subtitle)`、`bar` |
| `points` | 要点卡片 | `card{title,desc}`（stagger 入场） |
| `waveform` | ECG 波形扫描揭示（医学图元） | `{x,y,w,h,color,vf,scroll}` |
| `stat` | 数字滚动统计（医学图元） | `{value,unit,label,decimals}` |

动效预设：入场 `rise/fade/scale/popLeft/grow`，强调 `pulse/highlight`（可 `cue:"narration:0.5"` 按旁白进度触发），退场 `fadeOut/sink`。

## 编译期质量门

`motion-lint` 在出片前拦截（B 级阻断 / W 级警告）：

- `SUBTITLE_ZONE` / `NEAR_SUBTITLE`：布景侵入字幕区（y>940 / y>900）。
- `TEXT_DWELL`：文字停留时长不足（按字数估算）。
- `CONTRAST`：文本对比度 < 4.5（WCAG，按 token 预计算）。
- `DENSITY`：同屏入场峰值过密。
- `SCREEN_BOUNDS`：元素越出 1920×1080 画布。

时长由旁白字数自动估算；数值 IR、色键存在性、视频规格（30fps/1920×1080 冻结）均有编译期守卫。

## 设计纪律

- 动画只由帧号驱动；字幕画进帧里；布景 y<900；元素回静态 `transform='none'` 由运行时保证。
- 渲染核脚本字节级冻结（`make.sh` 仅插入编译步骤）；旧回归素材只读。
- 新代码全 CommonJS + `node:test`；配音默认本地 `say`，测试不调用百炼。
- 医学内容：患者向通俗语言、示意图标注「示意，非真实解剖」、片尾免责声明、不绝对化疗效；`facts[].verified` 与字幕一致性检查是脚本侧人工门（真实解剖动画走 Three.js 路线，不依赖生成式视频）。

## 状态与路线图

- **M1 编译核（已交付，`v0.1.0-m1`）**：IR v2 编译层 + 4 组件 + 编译期 lint + 旧片像素等价回归（素材根 `MG_REGRESSION_SRC` 可配置、缺失自动跳过）+ 声明式端到端验收。当前全量测试 62/62。
- **M2（backlog）**：可配 subtitle bottom + 派生 zone、DOM 测量盒（替代 boxes 近似）、waveform 揭示耦合 enter.at/dur、points 自动换行、DENSITY 整数步进、lint try/catch、browser.js 加固、色键 `Object.hasOwn`、`font.family` 入 `<style>` 的 sanitization、null-element/坐标守卫。
- **M3+**：增量渲染、更多组件与故事模板。

## 测试

```bash
cd mg-studio
npm test          # = node --test --test-concurrency=1 tests/*.test.js（串行避免渲染端口 8742 冲突）
```

覆盖：IR/字幕/预设/编译/lint/转义单元测试、浏览器帧驱动组件测试（全局 Playwright + Chrome）、声明式端到端出片（mini-v2 / mini-av）、旧片像素等价回归（python3 + PIL）。

> **可移植性提示**：像素回归依赖本机只读旧素材，素材根由环境变量 `MG_REGRESSION_SRC` 配置（缺省沿用本机路径，本机回归照常跑）。换机器/CI 无该素材时，`tests/regression/run.sh` 自动输出 `{"skip":true}` 干净跳过、像素测试随之 skip（校准守卫纯函数单测始终运行，验收包络不被弱化）；其余测试用随包 fixture，可移植。在任意机器设 `MG_REGRESSION_SRC` 指向素材根（含 `qwenwork-video/`、`sicd-video/`）即可恢复像素回归。

## 设计文档

- [设计文档](docs/superpowers/specs/2026-11-13-mg-studio-design.md)
- [M1 实现计划](docs/superpowers/plans/2026-11-13-mg-studio-m1.md)
- [工具包详细用法](mg-studio/README.md)
# mg-studio

> MG 全链路工具包：声明式分镜编译 + 增量缓存 + 确定性 1080p 动效视频渲染。

把「故事骨架 + 分镜」写成 JSON，一条命令产出带配音、字幕、原创 BGM 的 1080p 动效视频。动画**只由帧号驱动**（无墙钟），可复现、可局部重渲；中文由浏览器原生排版渲染、字幕直接烧录入帧（零错字、零乱码）；全流程内嵌**多级质量与安全防御门**（叙事脚本门、编译期动效 lint、浏览器实测盒门、医学安全门、自动化 QA 门），在出片前拦截排版穿透、时长停留不足与医学合规风险。

渲染核继承自已验证的 motion-explainer-video 管线（字节级冻结），本项目新增 **IR v2 声明式编译层**、**增量渲染缓存**、**自动化质检体系**及 **3D 解剖/器械外部喂帧管道**。

* **当前形态**：本地 CLI / Agent 工具包（纯 Node CommonJS，**零额外 npm 运行时依赖**，非网页/GUI）。
* **交付状态**：**M1（编译核）+ M2（叙事与脚本门）+ M3（增量渲染与自动化 QA）+ M4（医学安全门与 3D 解剖渲染）全量交付**。
* **质量保证**：自动化测试套件共 **174 项（173 通过 / 1 跳过=旧片素材回归，0 失败）**，100% 持续集成（GitHub Actions CI）绿灯通过。

---

## 仓库结构

工具包本体位于仓库的 `mg-studio/` 子目录，设计文档在 `docs/`：

```
.
├── mg-studio/                 # 工具包本体
│   ├── lib/                   # 核心库与编译层
│   │   ├── ir.js              #   IR v2 schema 校验 + 项目加载（tokens 深合并）
│   │   ├── props.js           #   组件 props 类型校验（数值/文本收敛，防坐标注入）
│   │   ├── subs.js            #   字幕标点自动切句 + 与旁白一致性校验
│   │   ├── presets.js         #   动效预设运行时（纯帧号驱动，入场/强调/退场）
│   │   ├── emit.js            #   生成 scene.html + script.json（注入 __rects 实测钩子与 #disclaimer）
│   │   ├── compile.js         #   编译编排 + props/色键/视频规格编译期守卫
│   │   ├── motion-lint.js     #   动效 lint（估算盒 / 实测盒 / 实测时长均可驱动）
│   │   ├── measure.js         #   真实 DOM 量盒（Playwright 无头实测，缺环境回退估算盒）
│   │   ├── preview.js         #   配音前分镜预览（旁白/标签/facts 格式化）
│   │   ├── scene-map.js       #   帧号→场景→时间轴映射（供人工核查定位）
│   │   ├── color.js           #   对比度与半透明层底色合成计算（WCAG 纯函数）
│   │   ├── escape.js          #   作者文本转义（防 HTML/Script breakout）
│   │   ├── narratives.js      #   叙事模板加载（science/product/teaching/free）
│   │   ├── story-lint.js      #   G0 故事骨架 lint（角色必备/顺序/情绪起伏/预算）
│   │   ├── script-lint.js     #   G0 脚本语言 lint（长句/未解释术语/衔接词/字幕覆盖）
│   │   ├── medical-lint.js    #   医学安全门（facts 溯源核实/免责声明强制/绝对化词表/术语密度）
│   │   ├── fcache.js          #   增量渲染缓存（visualHash 视觉指纹 + 帧数核验）
│   │   ├── calibrate.js       #   TTS 语速动态校准器（按实际配音时长反馈学习）
│   │   ├── three3d.js         #   3D 外部工程接入适配器与喂帧契约核验
│   │   └── components/        #   5 布局组件（title-card / points / waveform / stat / three3d）
│   ├── scripts/               # 全链路执行脚本 + CLI 工具
│   │   ├── make.sh            #   一键出片管线：编译→脚本门→配音→时间轴→实测后门→音频→3D→增量渲染→拼接→编码混音→QA
│   │   ├── doctor.js          #   环境诊断：Node/Chrome/ffmpeg/ffprobe/TTS 自检（支持 --json / --quiet）
│   │   ├── test_ci.js         #   CI 运行器：自动动态搜集全量非 e2e 单元测试（防漏测）
│   │   ├── compile.js         #   单独编译 CLI（B 级 lint 阻断写文件）
│   │   ├── lint_story.js      #   G0 故事门 CLI：检查叙事结构与脚本质量（生成 reports/story-lint.md）
│   │   ├── preview_script.js  #   配音前分镜人审 CLI（打印分镜；存在未核实 facts 阻断）
│   │   ├── lint_scene.js      #   编译后门 CLI：实测 DOM 包围盒 + 实测音频时长重跑 lint
│   │   ├── tts.js             #   配音生成（local say / 阿里云百炼 bailian，支持 --only 场景过滤）
│   │   ├── build_timeline.js  #   按真实音频时长排定毫秒级时间轴
│   │   ├── assemble_audio.js  #   旁白 + 可选 BGM 智能混音
│   │   ├── render_three.js    #   为 timeline 中的 three3d 段调用外部工程确定性渲染
│   │   ├── render.js          #   无头 Chrome 逐帧渲染（支持 --all 增量 / --scene <id> / --no-cache）
│   │   ├── assemble_frames.js #   按时间轴顺序将场景帧硬链接秒级拼接到 frames/all
│   │   ├── contact_sheet.js   #   关键帧接触印样拼图（生成 reports/contact-sheet.png 一眼审全片）
│   │   └── auto_qa.js         #   自动化 QA 门禁：帧数核对、运行时报错、免责声明可见性、音量监测
│   ├── templates/             # 预置模板
│   │   ├── tokens.default.json#   默认设计令牌（色板/字体/安全边距/字幕规范）
│   │   ├── narratives/        #   叙事骨架模板（science.json / product.json / teaching.json / free.json）
│   │   └── prompts/           #   AI Agent 生成 story.json 的提示词模板（story-draft.md）
│   ├── tests/                 # 174 项 node:test 套件 + fixtures + 旧片像素回归
│   └── README.md              # ★ 详细开发者手册（项目规范 / 5 组件 Props / 进阶参数）
├── docs/                      # 架构设计与实现文档
│   ├── superpowers/
│   │   ├── specs/2026-11-13-mg-studio-design.md   # 系统设计规范
│   │   └── plans/
│   │       ├── 2026-11-13-mg-studio-m1.md        # M1 编译核实现计划
│   │       ├── 2026-11-15-mg-studio-m2.md        # M2 叙事与脚本门实现计划
│   │       ├── 2026-11-15-mg-studio-m3.md        # M3 增量渲染与自动 QA 实现计划
│   │       └── 2026-11-15-mg-studio-m4.md        # M4 医学安全门与 3D 渲染实现计划
│   ├── reviews/2026-11-14-code-review.md         # 架构审查与加固报告
│   └── medical-assets-guide.md                   # ★ 医学解剖与生理波形开源素材指南
└── .gitignore                 # 排除 frames/out/vo/*.log/tests/work 等中间产物
```

---

## 快速开始

### 1. 环境准备

运行内置诊断工具 `doctor` 自检本机环境：

```bash
cd mg-studio
npm run doctor
```

* **必要依赖**：
  * `Node.js`（>= 20）
  * `Chrome`（本机 Google Chrome 或通过 Playwright 安装的 Chromium）
  * `ffmpeg` 与 `ffprobe`（含 `libx264` 编码器）
* **配音依赖**：
  * 默认使用本地免费 `say`（macOS 自带，零外部调用开销）。
  * 如需商业级中文配音，配置环境变量 `BL_API_KEY`（阿里云百炼）。
* **可选依赖**：`python3` + `PIL`（用于旧片像素等价回归与 `contact_sheet` 关键帧拼图）。

### 2. 跑一条 Demo 视频（从随包样例起步）

```bash
# 1. 复制一份随包测试项目（mini-v2 包含 title-card 与 points 组件）
cp -r mg-studio/tests/fixtures/mini-v2 my-demo
cd my-demo

# 2. 一键管线出片（make.sh 必须在「项目目录」内执行）
bash ../mg-studio/scripts/make.sh ../mg-studio local demo
# 成片位于：out/demo.mp4（1080p 30fps H.264/AAC）
# 质检报告：reports/qa.md
```

> **提示**：若想体验 ECG 生理波形与统计数值滚动组件，可将上述样例换为 `mg-studio/tests/fixtures/mini-av`。

---

## 创作自己的片子

在项目目录中包含以下文件即可通过 `make.sh` 编译并渲染成片：

```
my-film/
├── story.json               # 故事骨架（meta 目标/受众 + beats 列表：角色/情绪/意图/旁白/事实核查）
├── scenes/                  # 每 beat 对应一个分镜描述文件（文件名必须 === beat.id）
│   ├── hook.json            # 标题卡开场
│   ├── explain.json         # 核心要点 / 生理波形 / 数据统计
│   └── outro.json           # 总结与免责声明
└── tokens.json              # 可选：自定义设计令牌（缺省自动与 templates/tokens.default.json 深合并）
```

### 推荐工作流（人审 + 质检闭环）

1. **构思或借助 AI 生成初稿**：参考 [templates/prompts/story-draft.md](mg-studio/templates/prompts/story-draft.md) 提示词，让 Agent 依据叙事模板生成 `story.json`。
2. **G0 故事与脚本门禁**：
   ```bash
   node ../mg-studio/scripts/lint_story.js .
   ```
   检查结构完整性、情感弧、长句与未解释术语。生成 `reports/story-lint.md`，直至阻断项 B=0。
3. **分镜预览与事实核验人审**：
   ```bash
   node ../mg-studio/scripts/preview_script.js . --md
   ```
   逐句核实旁白与画面意图。存在未核实事实（`facts[].verified: false`）时程序自动以退出码 2 阻断，需作者/专家核实后改 `true`。
4. **一键渲染与增量出片**：
   ```bash
   bash ../mg-studio/scripts/make.sh ../mg-studio local "my-film"
   ```
5. **极速复审**：直接查看 `reports/contact-sheet.png`（所有场景 60% 关键帧排版大图）和 `reports/qa.md`，无需每次重看完整视频。

---

## 全链路工作原理

`make.sh` 编排了确定性视音频生产的 10 个阶段：

```
[0/5] 编译分镜 (compile.js) ──► G0 故事门 (lint_story.js)
      │
[1/5] 配音生成 (tts.js) ──► 动态语速学习 (calibrate.js)
      │
[2/5] 时间轴排定 (build_timeline.js)
      │
[2.5/5] 编译后门：真实 DOM 实测盒 + 实测时长 (lint_scene.js)
      │
[3/5] 音频轨混音 (assemble_audio.js: 旁白 + BGM)
      │
[3.8/5] 外部 3D 渲染 (render_three.js: 外部 Three.js 工程确定性逐帧喂帧)
      │
[4/5] 逐 Scene 增量确定性渲染 (render.js --all: 视觉指纹跳过未变更场景)
      │
[4.5/5] 帧秒级拼合 (assemble_frames.js: OS 硬链接 zero-copy 拼接)
      │
[5/5] 编码与混音 (ffmpeg: H.264 CRF 18 + AAC)
      │
[5.5/5] G4 自动化 QA 门 (auto_qa.js: 帧数核验/运行崩溃/免责声明可见性/音量)
      ▼
   产出 out/<film>.mp4
```

---

## 组件库（全 5 组件）

全量组件均通过 `lib/props.js` 实施强类型收敛与坐标防注入保护，且具有像素级居中与动态对齐增强：

| layout 标识 | 组件用途 | 核心 props | 布局与视觉特征 |
| :--- | :--- | :--- | :--- |
| `title-card` | 标题开场与章节转场 | `text(role=title/subtitle)`、`bar` | 装饰条以 `center center` 中心生长，消除单侧偏心跳变 |
| `points` | 核心要点卡片矩阵 | `card{title,desc}` | **智能居中对齐**：单卡片与双卡片自动计算居中偏移，消除默认偏左感；支持 stagger 瀑布式入场 |
| `waveform` | ECG 生理波形揭示（医学图元） | `{x,y,w,h,color,vf,scroll}` | 确定性扫描游标、荧光余辉效果；支持心室颤动（`vf`）异常乱波与警示变色 |
| `stat` | 统计数字滚动看板（医学图元） | `{value,unit,label,decimals}` | **对称居中**：根据数字与单位宽度动态计算容器，单/多指标对称平衡；数字 0 平滑滚动至目标值 |
| `three3d` | 3D 解剖/器械模型插入段 | `{threeProject, frames}` | 外部 Three.js 确定性工程接入；2D 占位跳过，帧由独立喂帧脚本统一合并入轴 |

**动效预设与时间触发**：
* **入场**：`rise`（升起微弹）、`fade`（平滑淡入）、`scale`（微放人感）、`popLeft`（左侧飞入）、`grow`（条状展开）。
* **强调**：`pulse`（心跳脉冲）、`highlight`（文字高亮）。支持 `cue: "narration:0.5"` 按旁白进度精确触发。
* **退场**：`fadeOut`（淡出）、`sink`（下沉隐退）。

---

## 质量与安全多层防御体系

| 阶段 | 执行工具 | 检验对象 | 判据方式 | 核心规则与动作 |
| :--- | :--- | :--- | :--- | :--- |
| **G0 叙事脚本门** | `lint_story.js` | `story.json` | 文本结构分析 | 拦截角色缺失（`NARR_MISSING_ROLE`）、长句超标（`SCRIPT_LONG_SENTENCE`）、未解释术语（`SCRIPT_TERM_UNEXPLAINED`）、字幕旁白不一致（`SCRIPT_SUBS_MISMATCH`）。**B 级阻断**。 |
| **编译期动效门** | `compile.js` | IR v2 语法树 | 组件估算盒 + 估算时长 | 拦截侵入字幕区（`SUBTITLE_ZONE`）、画布越界（`SCREEN_BOUNDS`）、非法坐标类型。**B 级阻断写出产物**。 |
| **编译后实测门** | `lint_scene.js` | 真实生成的 `scene.html` | **Playwright 无头实测盒** + **真实音频时长** | 用浏览器 `getBoundingClientRect()` 测定每个真实文本 DOM 盒；每块文本独立按 4.5字/秒计算停留时长（`TEXT_DWELL`）；计算合成底色与真实文本的实际对比度（`CONTRAST` < 4.5 阻断）。 |
| **医学安全门** | `lib/medical-lint.js` | 故事与分镜 | 启发式合规词表 | 患者向强制事实核查（`MED_FACT_UNVERIFIED` B 级）；强制免责声明（`MED_DISCLAIMER` B 级）；拦截绝对化疗效/危险医嘱（`MED_ABSOLUTE` B 级，如“100%治愈”、“永不复发”、“擅自停药”）。 |
| **G4 自动化 QA 门**| `auto_qa.js` | 最终渲染产物 | 产物比对与媒体扫描 | 拼接总帧数与时间轴严格对齐（`QA_FRAME_COUNT`）；浏览器无运行时异常（`QA_RUNTIME`）；患者向 `scene.html` 可见免责叠层存在性（`QA_DISCLAIMER`）；音轨均值与静音检测。 |

---

## 增量渲染与缓存机制

对于拥有十几个场景的分镜，修改单一场景旁白时不再需要重渲全片：
1. **视觉指纹识别（`fcache.js`）**：
   根据场景描述对象（布局、元素 props、动效时间）与设计令牌（`tokens.json`）计算 SHA-256 视觉哈希值 `visualHash`。
2. **秒级复用**：
   若该场景的 `visualHash` 未发生变化且输出帧数完全匹配时间轴预期，`render.js --all` 直接跳过渲染，复用 `frames/<sceneId>/` 历史帧。
3. **零拷贝秒级拼合（`assemble_frames.js`）**：
   利用操作系统文件系统**硬链接（Hard-link）**技术，将各场景帧映射至 `frames/all/f_%04d.png`。不占用额外磁盘空间，毫秒级完成万帧组装。

---

## 3D 解剖与器械渲染管线

针对医学手术入路、器械结构与高精解剖动画需求，`mg-studio` 拒绝不可控的 AI 生成式视频，采用**确定性 WebGL/Three.js 喂帧契约**：

1. **组件声明**：在分镜 JSON 中声明 `"layout": "three3d"`，并指定 `props.threeProject` 目录。
2. **喂帧契约脚本（`render_frames.js`）**：
   外部 Three.js 工程只需提供契约脚本并响应以下标准调用：
   ```bash
   node <threeProject>/render_frames.js \
        --out <outDir> --frames <N> --fps 30 --width 1920 --height 1080 --tokens <tokensJsonPath>
   ```
3. **确定性保真**：外部工程依据 `frame / (totalFrames - 1)` 计算几何形变、相机推拉与材质剖切，确保同一帧号无论运行多少次画面完全相同。
4. **资源参考指南**：详细的 3D 解剖模型库（NIH 3D, BodyParts3D, OpenAnatomy）、Blender 减面与 Draco 压缩规范，参见 [docs/medical-assets-guide.md](docs/medical-assets-guide.md)。

---

## 常用 CLI 命令参考

```bash
# === 1. 环境诊断 ===
node mg-studio/scripts/doctor.js          # 人机交互友好自检
node mg-studio/scripts/doctor.js --json   # 机器可读 JSON 输出
node mg-studio/scripts/doctor.js --quiet  # 静默模式（退出码 0 表示通过）

# === 2. 编译与检查 ===
node mg-studio/scripts/compile.js [项目目录]        # 仅编译生成 scene.html 与 script.json
node mg-studio/scripts/lint_story.js [项目目录]     # 跑 G0 故事与脚本门
node mg-studio/scripts/preview_script.js [项目目录] # 预览分镜与 facts 核查（--md 输出 Markdown）
node mg-studio/scripts/lint_scene.js [项目目录]     # 编译后实测盒门（--no-measure 跳过浏览器）

# === 3. 渲染与合成 ===
node mg-studio/scripts/tts.js --backend local       # 配音（--only scene1,scene2 仅重配个别场景）
node mg-studio/scripts/build_timeline.js [项目目录] # 排定时间轴
node mg-studio/scripts/render_three.js [项目目录]   # 渲染 3D 段
node mg-studio/scripts/render.js --all              # 增量渲染所有未命中缓存的场景
node mg-studio/scripts/render.js --scene <id>       # 指定渲染单个场景
node mg-studio/scripts/render.js --no-cache         # 强制全量重新渲染
node mg-studio/scripts/assemble_frames.js [项目目录]# 硬链接拼接全局帧
node mg-studio/scripts/contact_sheet.js [项目目录]  # 导出关键帧接触印样图（reports/contact-sheet.png）
node mg-studio/scripts/auto_qa.js [项目目录]        # 执行 G4 自动化 QA 质检

# === 4. 单场景实时调试 ===
# 启动本地静态服务器后，在浏览器访问：
# http://localhost:PORT/scene.html?scene=<id>       # __N 为该场景帧数，供动画微调
```

---

## 测试套件与 CI

```bash
cd mg-studio
npm run doctor      # 自检运行环境
npm test            # 全量测试（含 e2e macOS say 1080p 视频生成端到端）
npm run test:ci     # 动态自动扫描所有测试文件（CI 专用，防漏测）
```

* **测试覆盖矩阵**：
  * IR 语法校验、原型链注入防御、设计令牌深度合并；
  * 组件 props 类型守卫与 HTML/脚本转义；
  * 浏览器端真实 DOM 实测盒回归（Playwright + Chromium）；
  * 叙事结构、脚本语言学与医学安全门（包含绝对化词表与事实溯源阻断）；
  * 增量缓存（`fcache`）命中与失效断言；
  * Three3D 喂帧契约调度与帧拼接核算；
  * 视觉对齐断言（卡片自动居中、数值对称居中、装饰条居中生长）；
  * 旧片像素等价回归（素材缺失时自动优雅跳过，保证跨机器/CI 可移植性）。

---

## 设计纪律

1. **绝对确定性**：动画逻辑只允许读取当前 `frame`（禁止调用 `Date.now()`、`performance.now()` 等墙钟 API）。同一分镜输入逐帧完全可复现。
2. **作者文本不入解释器**：所有用户文本均经过安全转义，坐标严格校验为有限数字，避免通过 `$(...)` 或 `<script>` 注入执行恶意代码。子进程全部使用 `execFileSync(cmd, argsArray)` 调用。
3. **严肃医学伦理**：患者向科普必须通过事实核查（`facts[].verified: true`），自动附加 `#disclaimer` 免责图层，并标明“示意图，非真实解剖”。
4. **纯粹 Node.js 体系**：全库坚持使用 Node 原生 CommonJS 与 `node:test` 测试框架，**零额外 npm 运行时依赖**。

---

## 相关文档与资源索引

* **架构与规范**：
  * [系统设计规范](docs/superpowers/specs/2026-11-13-mg-studio-design.md)
  * [M1 代码审查与加固报告](docs/reviews/2026-11-14-code-review.md)
* **实现计划与交付路线**：
  * [M1 编译核实现计划](docs/superpowers/plans/2026-11-13-mg-studio-m1.md)
  * [M2 叙事与脚本门实现计划](docs/superpowers/plans/2026-11-15-mg-studio-m2.md)
  * [M3 增量渲染与自动化 QA 实现计划](docs/superpowers/plans/2026-11-15-mg-studio-m3.md)
  * [M4 医学安全门与 3D 渲染实现计划](docs/superpowers/plans/2026-11-15-mg-studio-m4.md)
* **开发者手册与资源库**：
  * [mg-studio 开发者详细用法手册](mg-studio/README.md)
  * [医学解剖与生理波形开源素材指南](docs/medical-assets-guide.md)

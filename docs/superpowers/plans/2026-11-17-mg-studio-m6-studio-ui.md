# M6 实现计划：mg-studio Web 工作台（Studio UI）

> 目标：打造轻量、开箱即用、**零额外 npm 运行时依赖**的本地可视化工作台（Studio UI），为医学专家、科普编导与审校人员提供分镜大纲可视化导航、1080p 帧级实时演播室画布、8 大视觉风格一键热切换、属性与医学核查检视器、以及一键全流程出片管线。

---

## 1. 约束与架构边界

1. **零额外 npm 运行时依赖**：
   - 严格采用 Node.js 原生标准库（`http`, `fs`, `path`, `child_process`, `url`）。
   - 前端采用原生 HTML5 + 现代化 CSS (Flexbox / CSS Grid / CSS Variables) + 原生 ES6 (Fetch, DOM API)，无打包工具链，无 node_modules 膨胀。
2. **本地回环网络安全**：
   - HTTP 服务器严格监听 `127.0.0.1`（默认端口 3000，支持 `--port` 传参）。
   - 静态文件服务采用路径解析安全校验（`path.resolve(projectDir, reqPath).startsWith(projectDir)`），杜绝任何路径穿越读取宿主敏感文件。
3. **100% 既有管线兼容**：
   - 完全复用 `lib/compile.js`, `lib/ir.js`, `lib/presets.js`, `lib/emit.js`, `lib/medical-lint.js` 等已冻结及扩展好的核心模块。
   - 既有终端 CLI（`compile.js`, `render.js`, `make.sh`）与 CI 测试套件零破坏。
4. **确定性帧级画布与平滑回退**：
   - 嵌入 `scene.html` iframe，通过 `window.__frame(f)` 和 `window.__rects()` 实现像素级所见即所得。
   - 若工程尚未执行 TTS（未生成 `timeline.json`），Studio 服务自动生成基于分镜时长的确定性虚拟时间轴（Synthesized Timeline），让创作者无需先配音就能秒级预览画面。

---

## 2. 总体任务拆解与交付物

### Task 1: 服务端核心实现 (`mg-studio/scripts/studio.js`)
- [ ] 命令行参数解析：`node scripts/studio.js [projectDir] [--port 3000] [--open]`。
- [ ] 项目路径自动探查：若未指定参数，优先检查当前目录是否包含 `story.json`，否则回退到内置示例或测试工程（`tests/fixtures/mini-style-medical`）。
- [ ] REST API 实现：
  - `GET /api/project`：加载故事、Tokens、场景、时间轴、8 风格列表及工程元数据。
  - `POST /api/style`：接收 `{ style }`，更新项目风格，执行编译并返回最新配置。
  - `POST /api/scene`：接收 `{ scene }`，持久化至 `scenes/<id>.json` 并校验重新编译。
  - `POST /api/story`：接收 `{ story }`，持久化至 `story.json`（支持医学事实核查勾选状态同步）。
  - `POST /api/compile`：执行 `compileProject(dir)`，生成 `script.json` 与 `scene.html`。
  - `GET /api/lint`：聚合 `lintStory`, `lintMotion`, `lintMedical` 三大质量门禁诊断结果。
  - `POST /api/tts`：触发配音合成子进程。
  - `POST /api/export` 与 `GET /api/task-status`：异步启动渲染任务并支持前端轮询进度。
- [ ] 静态文件伺服与安全防护：
  - `GET /`：返回 `lib/studio.html`。
  - `GET /timeline.json`：若不存在物理文件则返回合成虚拟时间轴。
  - `GET /*`：安全伺服 `scene.html`、`vo/*.wav`、`bgm/*.mp3`、`out/*.mp4` 等静态资源；路径越界立即返回 403。

### Task 2: 前端 SPA 实现 (`mg-studio/lib/studio.html`)
- [ ] 3 栏专业暗色演播室布局（Dark Studio Theme）：
  - **顶栏（Top Toolbar）**：工程标题、8 大风格选择下拉框、编译/质检/导出快捷按钮。
  - **左侧（Story & Beat Navigator）**：叙事节奏卡片流、情绪指示标（1..5 色阶）、医学事实核查勾选指示灯、分镜点击联动。
  - **中央（1080p Viewport & Timeline Scrubber）**：
    - 响应式等比缩放 16:9 画布（嵌入 `scene.html` iframe）。
    - 帧级时间轴滑块、播放/暂停（空格键响应）、慢放档位（0.25x / 0.5x / 1.0x）、当前时间戳与当前台词字幕浮动指示。
    - 辅助线网格与排版盒浮层（DOM Rects）。
  - **右侧（Inspector & Guardrails）**：
    - 视觉图元属性快速修改（文案、入场缓动、spring 超调选项）。
    - 医学事实源检视与核查勾选。
    - 三大门禁诊断红绿灯与 WCAG AA 文本对比度面板。
- [ ] 前端状态机与通信：
  - 与 `studio.js` 的 REST API 交互（Fetch API）。
  - 与 `iframe.contentWindow` 建立生命周期监听（等待 `__ready`，定时器推进 `__frame`）。

### Task 3: CLI 集成与入口配置 (`mg-studio/package.json`)
- [ ] 在 `mg-studio/package.json` 添加 `"studio": "node scripts/studio.js"`。
- [ ] 确保支持 `npm run studio` 与 `npm run studio -- [path]`。

### Task 4: 单元与集成测试编写 (`mg-studio/tests/studio.test.js`)
- [ ] 服务启动与端口监听测试。
- [ ] REST API 契约与异常用例测试（`/api/project`, `/api/style`, `/api/compile`, `/api/lint` 等）。
- [ ] 路径穿越安全测试（测试 `GET /../../etc/passwd` 等返回 403）。
- [ ] 虚拟时间轴合成逻辑测试（无 `timeline.json` 时正常渲染）。
- [ ] 风格切换并持久化回写测试。

### Task 5: 既有测试全量回归与端到端验证
- [ ] 执行 `node --test tests/studio.test.js`。
- [ ] 执行 `npm run test:ci`，确保原先 184 项测试 + 新增测试 100% 通过（零回归）。
- [ ] 在真实 fixture 启动并验证 HTTP 访问与 Canvas 交互。

### Task 6: 文档更新、Git 提交与 PR 交付
- [ ] 更新根目录 `README.md` 与 `mg-studio/README.md`，新增 Web 工作台（Studio UI）章节与操作指南。
- [ ] 提交代码至 `feat/m6-studio-ui`。
- [ ] 推送并创建 GitHub PR，验证 GitHub Actions CI。

# mg-studio Web 工作台（Studio UI）设计规范

- 日期：2026-11-17
- 状态：评审中（Design Review）
- 版本：M6
- 模块：`scripts/studio.js` + `lib/studio.html`
- 架构约束：纯 Node.js 原生标准库，**零额外 npm 运行时依赖**，单页响应式应用，本地回环网络安全。

---

## 1. 设计目标与核心价值

`mg-studio` 在 M1~M5 中建立了一套严格的声明式分镜编译、增量渲染、医学安全门与 8 大视觉动效风格系统，但目前所有操作依赖终端命令与手工修改 JSON，对人类创作者（医学专家、科普编导、内容法务审校）心智负担重，缺乏即时视觉反馈。

本规范设计一套开箱即用的**本地轻量 Web 工作台（mg-studio Studio UI）**，实现以下核心价值：

1. **所见即所得的 1080p 实时演播室**：无需反复命令行编译，分镜图元、文字与动效在网页中秒级渲染。
2. **8 大视觉风格一键实时热切换**：下拉选择 `clean-medical`, `vital-energy`, `deep-tech`, `ink-zen` 等风格，立即查看全片调性。
3. **帧级交互式时间轴（Timeline Scrubber）**：支持空格播放/暂停、逐帧慢动作步进、旁白音频对齐波形与入场锚点提示。
4. **医学合规与排版红绿灯看板**：可视化呈现事实核查（`verified` 勾选）、停留时长达标度、WCAG AA 对比度防线。
5. **一键全流程出片管线**：提供可视化的一键编译、一键配音、一键导出 MP4 功能。

---

## 2. 总体架构与系统交互

```
+-----------------------------------------------------------------------------------------+
|                                mg-studio Web Studio UI                                  |
|                                (lib/studio.html 原生 SPA)                               |
|                                                                                         |
|  +--------------------+  +-------------------------------------+  +------------------+  |
|  |   左侧：分镜大纲树   |  |        居中：1080p 实时演播画布        |  |  右侧：属性与门禁 |  |
|  |   (Story & Beats)  |  |                                     |  |  (Inspector)     |  |
|  |                    |  |    +-----------------------------+  |  |                  |  |
|  |  - Beat 列表       |  |    |  <iframe> scene.html </iframe>|  |  - 8 大风格切换  |  |
|  |  - 情绪指数曲线    |  |    +-----------------------------+  |  |  - 组件参数微调  |  |
|  |  - 事实核查状态    |  |                                     |  |  - 入场/缓动设定 |  |
|  |                    |  |  +-------------------------------+  |  |  - 动效安全红绿灯|  |
|  |                    |  |  |  底部：帧级时间轴与播放控制器 |  |  |                  |  |
|  +--------------------+  +-------------------------------------+  +------------------+  |
+--------------------------------------------+--------------------------------------------+
                                             | HTTP / REST API (本地回环 127.0.0.1)
+--------------------------------------------v--------------------------------------------+
|                          scripts/studio.js (Node.js 原生 http)                          |
|                                                                                         |
|   GET  /api/project     获取工程完整树 (story, tokens, scenes, styles)                 |
|   POST /api/style       切换/更新工程风格 (深合并重写并重编译)                          |
|   POST /api/scene       保存场景 JSON 并局部校验                                        |
|   POST /api/story       保存故事叙事骨架与核实事实                                      |
|   POST /api/compile     触发 compileProject，刷新 scene.html                            |
|   POST /api/lint        运行 story-lint + motion-lint + medical-lint 输出诊断           |
|   POST /api/make        一键出片后台管道调度与进度长轮询/SSE                            |
|   GET  /*               静态文件伺服 (scene.html, timeline.json, audio, out)            |
+-----------------------------------------------------------------------------------------+
```

---

## 3. UI 界面布局与交互设计

界面采用类似专业剪辑调色软件（DaVinci Resolve / Figma）的现代暗调演播室布局（Dark Studio Theme）：

### 3.1 顶栏导航区（Header Toolbar）
* **项目标识与标题**：显示当前编辑工程名称（如 `心律科普`）与路径。
* **风格快速切换器**：
  * 包含全部 8 大官方预设风格的精致选择器：
    `deep-tech`（深邃科技）、`clean-medical`（清爽医疗）、`warm-editorial`（人文典雅）、`swiss-modern`（瑞士现代）、`vital-energy`（活力暖橙）、`cyber-neon`（赛博霓虹）、`ink-zen`（极简水墨）、`aurora-glass`（极光微观）。
  * 切换风格后立即触发后台级联深合并与增量编译，iframe 无刷新重载样式。
* **管线操作按钮群**：
  * `[ 重新编译 ]`：重新生成 `script.json` 与 `scene.html`。
  * `[ 运行质检 ]`：运行三大门禁并弹出诊断抽屉。
  * `[ 合成配音 ]`：调用 local say 或阿里云百炼合成音频。
  * `[ 导出视频 ]`：触发 `make.sh` 渲染出 1080p MP4。

### 3.2 左侧栏：故事大纲与分镜导航（Story & Beat Navigator）
* **叙事角色卡片流**：
  * 展示每个 Beat 的角色标签（`hook`, `conflict`, `mechanism`, `evidence`, `takeaway` 等）。
  * 情绪指数徽章（Emotion 1..5）：用色彩梯度（蓝色平静 -> 橙红高潮）可视化故事弧线。
  * 旁白摘要与字数估算。
  * 医学事实核查红绿灯：未核实事实展示黄色感叹号，已核实展示绿色对勾。
* **点击分镜卡片**：中央画布立即平滑切换至对应场景，时间轴自动定位至场景起点。

### 3.3 中央主舞台：1080p 实时视口与时间轴控制台（Viewport & Timeline）
* **自适应等比 16:9 画布容器**：
  * 利用 CSS `transform: scale(calc(...))` 动态根据视口宽高居中等比缩放 1920×1080 画布。
  * 内嵌 `scene.html` iframe，具备原生 Chromium / WebKit 渲染保真度。
* **安全区与标尺辅助线开关**：
  * 浮动悬浮工具栏提供：`[ 实测盒 (DOM Rects) ]`、`[ 字幕盲区 (y>940) ]`、`[ 16:9 中心网格 ]`。
* **帧级交互式时间轴（Timeline Console）**：
  * 播放/暂停控制（支持键盘空格键 Space 快捷控制）。
  * 慢放档位（`0.25x`, `0.5x`, `1.0x`），便于逐帧观察弹簧超调（Spring Overshoot）动效细节。
  * 时间滑块（Scrubber）：拖动即可调用 `iframe.contentWindow.__frame(f)` 逐帧刷新背景、粒子与图元。
  * 浮动气泡显示当前毫秒、当前帧数、当前字幕台词。

### 3.4 右侧栏：属性检视器与安全门禁（Inspector & Guardrails）
* **Tab 1: 视觉图元检视（Elements & Motion）**：
  * 展示当前场景的布局类型（`title-card`, `points`, `stat`, `waveform`, `three3d`）。
  * 图元列表（标题、正文、卡片、数值等）直接编辑内容。
  * 动效设置：入场预设（`rise`, `scale`, `popLeft`...）与缓动选择器（`ease` 平滑缓出 / `spring` 弹性超调）。
* **Tab 2: 医学核查与免责（Medical & Facts）**：
  * 展开当前 Beat 绑定的核心断言事实列表。
  * 事实证据来源与核实勾选框（点击直接切换 `verified: true/false` 并持久化）。
  * 患者向免责声明提示。
* **Tab 3: 质量门诊断（Guardrails Diagnostics）**：
  * 实时呈现 `lintStory`、`lintMotion`、`lintMedical` 的 B 级与 W 级告警。
  * 对比度诊断看板：展示文本对底色的 WCAG AA 比值（如 `16.58:1 ✓`）。

---

## 4. 后端 API 规范与协议定义

`scripts/studio.js` 作为轻量单文件服务器，运行在 `http://127.0.0.1:3000`（端口可配置）。

### 4.1 REST API 字典

| 端点 | 方法 | 作用 | 请求参数 | 响应结构 |
| :--- | :--- | :--- | :--- | :--- |
| `/api/project` | `GET` | 加载完整项目配置 | 无 | `{ story, tokens, scenes, timeline, styles, hasDist }` |
| `/api/style` | `POST` | 切换风格预设 | `{ style: string }` | `{ ok: true, tokens, style }` |
| `/api/scene` | `POST` | 保存单个场景配置 | `{ scene: object }` | `{ ok: true, errors: [] }` |
| `/api/story` | `POST` | 保存故事叙事与事实 | `{ story: object }` | `{ ok: true, errors: [] }` |
| `/api/compile` | `POST` | 触发全量编译 | 无 | `{ ok: true, mode: 'v2', errors: [] }` |
| `/api/lint` | `GET` | 实时计算三大门禁诊断 | 无 | `{ ok: true, storyErrors, motionErrors, medicalErrors }` |
| `/api/tts` | `POST` | 执行配音合成 | `{ backend: 'local'\|'bailian' }` | `{ ok: true, logs: string }` |
| `/api/export` | `POST` | 异步触发全链路出片 | `{ outName: string }` | `{ ok: true, taskId: string }` |
| `/api/task-status` | `GET` | 轮询出片后台进度 | `?taskId=...` | `{ status: 'running'\|'done'\|'error', progress: number, log: string }` |

### 4.2 安全与边界控制
1. **严格绑定 `127.0.0.1`**：禁止监听 `0.0.0.0`，杜绝局域网未授权访问。
2. **路径穿越防御（Directory Traversal Prevention）**：静态文件伺服采用严格的 `path.resolve` 隔离，非项目目录下文件一律返回 `403 Forbidden`。
3. **作者内容安全转义**：前台编辑器修改文本依然通过 `escape.js` 和 `ir.js` 编译期校验，杜绝任何 XSS 或脚本注入风险。

---

## 5. 零依赖工程实现路径

* **服务器端**：使用 Node.js 原生 `http`, `fs`, `path`, `child_process`, `url` 模块封装，打包为一个简洁高内聚的 `scripts/studio.js`。
* **前端资源**：将 HTML、CSS、JS 一体化集成在 `lib/studio.html` 中（采用系统原生字体族、原生 CSS Grid/Flexbox、原生 Fetch API），无需 Webpack/Vite 预编译，零 `node_modules` 膨胀。
* **CLI 入口集成**：
  在 `mg-studio/package.json` 中配置：
  ```json
  "scripts": {
    "studio": "node scripts/studio.js"
  }
  ```
  用户只需运行 `npm run studio`，终端即可自动打印本地访问地址 `http://localhost:3000` 并可自动拉起默认浏览器。

---

## 6. 验收与测试标准

1. **零依赖与环境跨平台**：在纯洁净 Node.js 环境下无需执行 `npm install` 即可直接拉起工作台。
2. **风格实时切换验证**：点击任意 8 大风格，画布内无需重启服务器，1 秒内完成样式重载。
3. **确定性帧拖拽核验**：拖动时间轴滑块，与 `window.__frame(i)` 的逐帧画面完全一致。
4. **单元测试与 CI 覆盖**：新增 `tests/studio.test.js`，针对 API 响应、路径穿越攻击、静态挂载进行 100% 自动化测试覆盖。

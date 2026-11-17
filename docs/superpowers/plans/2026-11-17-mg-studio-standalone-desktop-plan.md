# MG Studio 独立桌面客户端（Standalone Desktop App）研发实施计划

> **分支**：`feat/desktop-standalone`  
> **目标**：将 `mg-studio` 从本地命令行/Web 工具包，进化为真正拥有原生窗口、项目管理中心（Project Hub）、原生菜单与文件对话框集成的独立桌面软件。

---

## 一、技术方案与架构决策

### 1.1 桌面运行时：Electron Native Shell + 现有引擎零损复用
* **为何以 Electron 作为桌面运行时主力**：
  1. `mg-studio` 现有的 15+ 核心模块（`compile.js`, `doc-parser.js`, `medical-lint.js`, `subs.js` 等）全量由 Node.js CommonJS 实现并具备 198 项高覆盖率单测；
  2. Electron 天然集成 **Node.js + Chromium**，无需重新将业务代码重写为 Rust，更无需在 Tauri 中外挂一个庞大的 Node 二进制 sidecar；
  3. Chromium 渲染环境自带，后续离屏逐帧渲染与无头量盒（DOM measurement）可直接通过 Electron 内部机制或 Playwright 连接，稳定性 100%。

### 1.2 桌面版核心模块划分
```
mg-studio/
├── desktop/                     # 桌面端专属模块
│   ├── main.js                  # Electron 主进程（生命周期、本地服务托管、系统菜单、IPC）
│   ├── preload.js               # 安全预加载脚本（contextBridge 暴露原生系统能力）
│   ├── project-hub.html         # 项目管理中心 / 欢迎页（最近项目、新建工程、模版工坊）
│   └── project-hub.js           # 项目管理器交互逻辑
├── lib/
│   ├── studio.html              # 现有 Web 工作台（自动检测 window.desktopAPI 进行原生增强）
│   └── ...                      # 现有编译核与门禁
└── package.json                 # 增加 electron 依赖与 "desktop" 启动脚本
```

---

## 二、Phase 1 详细任务分解

### 任务 1：安装 Electron 依赖与配置启动脚本
- 在 `mg-studio/package.json` 中引入 `electron`（开发依赖）。
- 增加 `npm run desktop` 与 `npm run desktop:dev` 脚本。

### 任务 2：实现 Electron 主进程（`desktop/main.js`）
- 启动并托管内置 Studio 本地服务（自动获取可用端口，严格绑定 `127.0.0.1`）。
- 窗口管理：
  - 支持 `BrowserWindow` 原生标题栏、macOS 交通灯按钮与暗黑主题集成。
  - 启动默认加载 **Project Hub（项目管理中心）**；选择或新建项目后无缝载入演播室工作台。
- 原生系统菜单：
  - `文件 (File)`：新建分镜工程 (`Cmd+N`)、打开本地工程 (`Cmd+O`)、保存 (`Cmd+S`)、导出 MP4 视频 (`Cmd+E`)。
  - `分镜 (Storyboard)`：重新编译 (`Cmd+B`)、执行门禁质检 (`Cmd+Shift+L`)、合成配音 (`Cmd+Shift+V`)。
  - `视图 (View)`：切换 8 大视觉风格、播放/暂停 (`Space`)、上下一帧。
- 原生 IPC 通信：
  - `dialog:open-directory`：原生选择本地工程文件夹；
  - `dialog:show-save`：原生选择导出文件保存位置；
  - `shell:show-item`：在 Finder/资源管理器中定位成片。

### 任务 3：实现原生预加载桥（`desktop/preload.js`）
- 通过 `contextBridge.exposeInMainWorld('desktopAPI', ...)` 安全注入：
  - `isDesktop: true`；
  - `openProjectDialog()`；
  - `revealInFinder(path)`；
  - `recentProjects: { get(), add(), remove() }`；
  - `appVersion`。

### 任务 4：构建原生「项目管理中心 / 欢迎页」（`desktop/project-hub.html`）
- 启动界面现代化质感：
  - **快速起步**：新建医学分镜工程（自动调用 AI 视频策划工坊）、新建通用科普工程；
  - **打开本地**：一键通过系统原生文件弹窗选取已有分镜项目目录；
  - **最近项目**：持久化记录最近编辑的工程列表（显示标题、分镜数、最后修改时间、一键打开）。
  - **模板中心**：内置经典模板展示（心血管介入、急救指南、降压用药、科技产品）。

### 任务 5：现有工作台（`lib/studio.html`）的原生无缝增强
- 当检测到 `window.desktopAPI` 时：
  - 顶栏增加「返回项目中心」按钮；
  - 导出成片完成后，增加「在 Finder 中显示」快捷按钮；
  - 原生支持 `Cmd+O` 快捷键切换不同项目。

### 任务 6：测试验证与分支交付
- 运行 CI 测试套件确保所有 198 项测试不受任何影响。
- 本地启动桌面应用并验证主进程启动、Project Hub、原生对话框、进入工作台及导出功能。
- 提交代码到 `feat/desktop-standalone` 分支并推送到远端。

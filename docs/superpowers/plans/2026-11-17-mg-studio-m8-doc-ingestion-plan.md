# M8 实现计划：用户自定义资料上传与智能文档解析引擎

## 任务拆解

- [ ] **Task 1: 实现文档解析与事实抽取核心模块 (`lib/doc-parser.js`)**
  - 支持 Buffer (PDF / DOCX / MD / TXT) 与直接文本解析
  - 基于临床与学术特征提取主题、受众、关键词、核心机理与结构化事实
- [ ] **Task 2: 扩展 Studio 服务端 REST API (`scripts/studio.js`)**
  - 新增 `POST /api/parse-doc` 路由处理上传文件/文本解析
- [ ] **Task 3: 编写端到端单元测试套件 (`tests/doc-parser.test.js`)**
  - 覆盖纯文本、Markdown、Word (DOCX) 与 PDF 解码抽取与事实断言
  - 覆盖 REST API 交互
- [ ] **Task 4: 升级前端 Studio UI 向导交互 (`lib/studio.html`)**
  - 重塑 Step 1 布局：强化自定义输入框主导地位，预设 chips 折叠/提示
  - 新增资料上传区域（文件拖拽选择 + 直接文本粘贴）
  - 实现前端文件读取 (FileReader) 与 `POST /api/parse-doc` 通信
  - 一键应用解析结果：自动填入主题、建议受众，流转注入 Step 2 事实库并高亮 `[用户资料]` 标签
- [ ] **Task 5: 全面回归验证与文档更新**
  - 运行 `npm run test:ci` 验证全部 198+ 项测试通过
  - 使用无头浏览器或本地验证端到端资料上传与分镜生成演播
  - 更新 `README.md` 与 `mg-studio/README.md`
- [ ] **Task 6: Git 提交、推送、创建 PR 并合并**

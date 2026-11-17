# M7 实现计划：AI 创作工坊与全流程选题大纲生成

> 目标：在 Studio UI 中直接打通“资料检索 → 事实库提取 → 故事大纲规划 → 自动分镜生成 → 载入演播室”的全流程闭环，并在左侧大纲树支持交互式增删与重排。

---

## 任务拆解与交付物

- [ ] **Task 1: 文献资料检索引擎 (`mg-studio/lib/research.js`)**
  - 接入 Europe PMC REST API 与 OpenAlex，支持关键词检索、论文题目、期刊年份、DOI 提取。
  - 自动从摘要与题目中解析出结构化 Facts 事实候选列表。
  - 包含健壮的异常与离线/模拟回退保障机制。
- [ ] **Task 2: 智能故事线与分镜生成引擎 (`mg-studio/lib/ai-generator.js`)**
  - 加载叙事模板（`science`, `product`, `teaching`, `free`）。
  - 根据主题与事实列表，编排角色闭环（hook, conflict, mechanism, evidence, takeaway）。
  - 自动为每个 Beat 匹配合适的视觉布局组件（`title-card`, `points`, `waveform`, `stat`）。
  - 自动满足 `ir.validateStory`、`ir.validateScene` 与 `medical-lint.js` 门禁约束。
- [ ] **Task 3: 服务端 REST API 扩展 (`mg-studio/scripts/studio.js`)**
  - 实现 `POST /api/research`（检索文献与抽取事实）。
  - 实现 `POST /api/create-project`（一键创建新工程并编译）。
  - 实现 `POST /api/beat/add`（动态插入新分镜）。
  - 实现 `POST /api/beat/delete`（删除指定分镜）。
  - 实现 `POST /api/beat/reorder`（调整分镜排序）。
- [ ] **Task 4: 前端向导与大纲编辑实现 (`mg-studio/lib/studio.html`)**
  - 顶栏新增 `[ ＋ 新建视频 (AI 创作工坊) ]` 按钮。
  - 4 步向导模态框（主题定位 -> 文献检索与证据勾选 -> AI 生成分镜预览 -> 一键载入演播室）。
  - 左侧大纲树增加 `[ ＋ 添加分镜 ]` 及卡片悬浮的 `[ ↑ ]`、`[ ↓ ]`、`[ 🗑️ ]` 操作。
- [ ] **Task 5: 单元与集成测试 (`mg-studio/tests/ai-creator.test.js`)**
  - 测试文献检索、事实提取、项目生成、分镜增删改 API 往返。
  - 确保全量既有测试（188项）持续 100% 保持绿灯。
- [ ] **Task 6: 文档更新、Git 提交与 PR 交付**
  - 更新相关 README 说明并提交 PR。

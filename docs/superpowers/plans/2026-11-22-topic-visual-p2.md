# Topic-Visual P2 实现计划（参数化 2D 示意生成）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 无授权素材时，按视觉简报（visualBrief）参数化生成确定性 2D 示意场景，接入编译/渲染/人工门全链路。

**Architecture:** `lib/schematic-gen.js` 纯函数把 brief 映射为 `layout:'schematic'` 场景；`lib/components/schematic.js` 帧号驱动 canvas 绘制（anatomy 三腔带+导线旋入 / diagram 节点流程 / comparison 双栏）；注册进 `lib/components/index.js` 后 IR/compile/lint 自动接纳；`topic-visual.fallbackScene` 在无素材时回落生成；anatomy/device 经 `visualBrief` 触发 visual-review 人工门。

**Tech Stack:** Node ≥18、node:test、playwright-core（e2e）、本地 say（免费配音）。

**Spec:** docs/superpowers/specs/2026-11-22-topic-visual-spec.md（P2 行）

## Global Constraints

- 帧号驱动确定性：动画只由 `lt/t` 经 `seg/eo` 驱动，无 wall-clock。
- 布景 y+h ≤ 900（字幕安全区，subtitle.bottom=64 冻结）。
- 医学视觉正确性不由自动门保证：anatomy/device/panorama 必须 visual-review 批准后才出片。
- 视频专属（septum/螺旋）不进工具；本组件为通用参数化示意。
- 测试不调用百炼；e2e 用本地 say。
- 镜像视角右室在左；导线有直径、止于间隔内不穿孔。

---

### Task 1: 生成器 + 组件 + 注册（TDD）

**Files:**
- Create: `mg-studio/lib/schematic-gen.js`、`mg-studio/lib/components/schematic.js`
- Modify: `mg-studio/lib/components/index.js`、`mg-studio/lib/topic-visual.js`
- Test: `mg-studio/tests/schematic-gen.test.js`、`mg-studio/tests/schematic.test.js`

**Interfaces:**
- Consumes: `visual-intent.extractBrief(beat)→{subject,type,structures,view}`；`asset-retrieval.findAssets`
- Produces: `generateSchematicScene({beat,labels,minSec=6})→scene|null`；`fallbackScene({beat,dir,labels})→scene|null`；组件契约 `css/runtime/build/extraUpdate/boxes/check`

- [x] 写失败测试（模块缺失 RED）→ 实现生成器/组件/注册/fallbackScene → 13/13 GREEN
- [x] `npm run test:ci` 全量无回归（262 pass / 0 fail）

### Task 2: 目检渲染（视觉纪律）

- [x] 临时项目 compile + 本地 say + build_timeline + render smoke
- [x] Read 帧 PNG 目检：镜像右室在左、导线有径止于间隔、流程三节点、字幕零错字、安全区合规

### Task 3: e2e 全链路 + 人工门反向用例

**Files:**
- Create: `mg-studio/tests/fixtures/mini-schematic/{story.json,scenes/lead.json,ref.png}`、`mg-studio/tests/e2e.schematic.test.js`

- [x] fixture 带已批准 visualReview（reviewer=e2e-fixture，ref.png 占位）→ make.sh 出片、帧数=timeline
- [x] 撤销批准 → make.sh 阻断且报 VISUAL_REVIEW_REQUIRED（2/2 pass）

### Task 4: 提交与 PR

- [x] 分支 `feat/topic-visual-p2`（基于 `feat/topic-visual-p1`），仅工具层文件
- [x] push（代理 127.0.0.1:7890 + HTTP/1.1）→ PR base=feat/topic-visual-p1

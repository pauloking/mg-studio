# Topic-Visual P1 实现计划（视觉意图 + 素材检索 + 接入）

> **For agentic workers:** superpowers:executing-plans / subagent-driven-development。Spec: docs/superpowers/specs/2026-11-22-topic-visual-spec.md。分支 feat/topic-visual-p1（基于 fix/audit-user-perspective，含 visual-review）。

**Goal:** P1＝从 beat 提取视觉简报 + 检索带许可证的真实素材（图标库/本地上传）+ 解析接入 + 人工门标记。不做生成（P2/P3）。

**Global Constraints:** 纯函数可单测；不下载版权不明素材；医学关键形象必须过 visual-review；复用 director-assets/escape/props；不破坏渲染核；node:test；不调百炼。

## Task 1: lib/visual-intent.js
- extractBrief(beat)→{subject,type,structures[],view}。type∈anatomy|device|panorama|comparison|diagram|ambient。
- 复用 motion-plan.extractNodes/extractComparison；ANATOMY/DEVICE 词典匹配 structures；view=mirror/cross/null。
- 测试 tests/visual-intent.test.js：anatomy/device/panorama/comparison/diagram 识别、structures、view。

## Task 2: lib/asset-retrieval.js
- findAssets({brief,dir})→候选[{id,kind,source,license,tags,score}]。
- 源A: director-assets.listAssets()（Lucide/原创，license 明确）按 title/tags 匹配；源B: 本地 assets/index.json（license+source+tags，validateLocalImage 安全）按 tags 匹配。
- 仅返回有 license 的；按 score 排序。测试 tests/asset-retrieval.test.js。

## Task 3: lib/topic-visual.js + visual-review 扩展
- resolveVisual({beat,dir})→{brief,asset,needsReview}；needsReview=type∈anatomy|device|panorama。
- visual-review.needsReview 增加 layout==='topic-visual' 或 sc.visualBrief.type∈anatomy|device|panorama。
- 测试 tests/topic-visual.test.js + 更新 visual-review.test.js。

## 验收
test:ci 绿；给 anatomy beat 能提取 brief+检索候选+needsReview=true；无 license 素材不返回。

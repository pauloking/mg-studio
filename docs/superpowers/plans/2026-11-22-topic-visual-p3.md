# Topic-Visual P3 实现计划（3D 全景优先 + text2img 氛围兜底 + diagram 偏好修正）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development / superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** 补齐"按文章定制形象/全景"：panorama 走内置参数化 3D（确定性、免计费），ambient 走百炼 text2img（consent+Credits 闭环），并修正 diagram/comparison"图标优先"偏好。

**Architecture:** `panorama-gen` 产 `three3d` 场景指向 `builtin:three-panorama` 喂帧工程（vendored Three.js r149 UMD，MIT）；`lib/three3d.resolveProject` 解析 builtin + `params` 转发；`ambient-gen` 调 `bl image generate`（--seed 复现、--out-dir 产出扫描、许可证标记、index 缓存）；`scripts/gen_visual.js` 为缺场景 beat 生成（免费路径离线，ambient 需 --yes）。

**Tech Stack:** Node、node:test、playwright-core + headless Chrome（WebGL）、Three.js r149 UMD（vendored）、百炼 bl（仅 ambient，需授权）。

**Spec:** docs/superpowers/specs/2026-11-22-topic-visual-spec.md（P3 行）；用户选定路线=适配器+回落（3D 优先，text2img 兜底）。

## Global Constraints

- 帧号驱动确定性；3D 取帧用 canvas.toDataURL（headless page.screenshot 抓不到 WebGL 合成层，实测空白）。
- 不用 `--use-gl=swiftshader`（实测导致 WebGL context lost 静默空帧）；用默认 GL 路径 + context-lost 防呆报错。
- 医学/解剖示意必须 visual-review 人工门；3D 为 stylized 示意非真实解剖。
- 测试不调百炼（mock exec）；ambient 真实调用需 --yes/MG_TTS_YES（Credits）。
- vendored three.min.js 保留 MIT 许可证头。

---

### Task 1: diagram/comparison 偏好修正（TDD）
- [x] RED：diagram 仅命中图标时 fallbackScene 应生成（旧版返回 null）
- [x] GREEN：preferGen=[diagram,comparison,panorama]；realAsset(kind!=icon) 优先；anatomy/device 素材优先不变
- [x] 测试：图标仍生成 / 真实图不生成 / anatomy 不变

### Task 2: panorama 内置 3D（TDD + 真渲目检）
- [x] vendoring three r149 UMD（代理下载，Node 可加载，MIT）
- [x] templates/three-panorama/render_frames.js：双腔+间隔+内膜缘+导线+螺旋，mirror 视角，orbit/脉冲持续动效
- [x] lib/three3d.resolveProject(builtin:) + params 转发；render_three 接线
- [x] panorama-gen + fallbackScene panorama 路由；needsReview(three3d)=true
- [x] 根因修复：swiftshader→context lost；改默认 GL + toDataURL 取帧 + lost 防呆
- [x] 真渲目检：螺旋透半透明间隔可见、导线自 RV 旋入、内膜缘在 LV 侧
- [x] e2e mini-panorama：make.sh 出片、3D 帧数=timeline；撤销批准→VISUAL_REVIEW_REQUIRED 阻断

### Task 3: ambient text2img 兜底（consent/缓存/许可证）
- [x] 取证 bl image generate --help（--seed/--out-dir/--out-prefix/--watermark/--negative-prompt）
- [x] ambient-gen：未授权不调用；--seed 复现；index 缓存复用；许可证 'AI 生成 (百炼 text2img)'；产出扫描不猜 JSON
- [x] generateAmbientScene → directed 全幅 image layer
- [x] scripts/gen_visual.js：缺场景生成；ambient 未授权 exit2 不写不调；已有场景不覆盖(--force)
- [x] 测试 mock exec（不真调百炼）+ CLI 三用例

### Task 4: 收尾
- [x] 修正 e2e 断言括号 bug（+ 与 .includes 优先级恒真）
- [x] CI 283 过 0 败；e2e 4/4
- [x] 提交推送更新 PR #33

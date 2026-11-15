# story.json 初稿生成 Prompt（Agent 形态 · M2 §6）

> 工具包提供叙事模板 + lint；初稿生成由 Agent 执行，人工 diff 确认 + facts 核实。

## 输入
- 主题、受众（`patient|professional|general`）、目标时长、叙事模板（`science|product|teaching|free`）

## 步骤
1. 读 `mg-studio/templates/narratives/<template>.json`，按 `requiredRoles` / `firstRole` / `lastRoles` 组织 beats。
2. 每个 beat 产出字段：`id`、`role`、`emotion`(1–5)、`intent`(一句话视觉意图)、`narration`(旁白草稿)、`facts[]`。
3. 医学/关键事实写入 `facts`：`{ claim, source, verified:false }`，一律先置 `false`（人工核实后改 `true`）。

## 迭代（闭环）
- 生成后运行：`node mg-studio/scripts/lint_story.js <项目目录>`
- 按报告里的 B/W 反馈改写，直至 **B=0**（W 视情况优化：长句、术语解释、逻辑桥、时长预算）。
- 用户 diff 确认并锁定 `story.json`；再逐条核实 `facts`，把对应 `verified` 置 `true`。

## 禁区（medical-lint 会拦）
- 不做绝对化疗效承诺（根治/百分百/最好/零风险…）。
- 患者向：outro 必须含"本视频为健康科普，不构成诊疗建议"；术语首现给通俗解释。

## 验收
走 G0：`node mg-studio/scripts/lint_story.js <项目>` 退出码 0，报告 `reports/story-lint.md` 可读。

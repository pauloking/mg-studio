# 创意层与生产层分工（mg-studio 定位）

## 结论（来自真实对照实验）

同内容（海绵城市）、同管线，两条路径产出质量差异巨大：

- **auto 关键词映射**（`gen_visual`：visual-intent 关键词 → 通用组件）→ 文本盒/描迹线，"低品质 PPT"。映射器不"理解"文章，只匹配关键词，创意天花板极低。
- **bespoke 作者画面**（模型读文章后单独设计 `scene.html` / directed 组合）→ 主体意象（夜城雨落、海绵剖面、快排vs缓排）+ 定制构图与 choreography，达到/超过直接生成质量。参考示例：`examples/sponge-bespoke/`。

因此：**工具的目的不是"比模型更会画"，而是把模型的一次性手绘变成可生产、可质检的资产。**

## 分工

| 层 | 负责 | 载体 |
|---|---|---|
| 创意层 | 读文章 → 单独设计意象/构图/choreography | 模型 bespoke authoring：v1 `scene.html`（帧号驱动契约）或 v2 directed/declarative 组合 |
| 生产层 | 确定性逐帧渲染、可复现/单帧调试/局部重渲、音画自动对齐、中文零错字字幕、增量渲染、编码混音、CI 回归、CLI/桌面 | mg-studio scripts/lib |
| 质检层 | 医学 facts 核实、免责声明、禁绝对化、专家视觉门+参考图对照、素材许可证溯源、视觉基线门 | compile/lint/visual-review/auto_qa |
| 草稿层 | 快速预览叙事结构（animatic），**不可直接交付** | `gen_visual`（auto 映射），产物标 `animatic:true` |

## 工作流（主交付路径）

1. 模型读文章/需求，bespoke 编写 `script.json`(v1) 或 `story.json`+`scenes/`(v2) 与画面（`scene.html` / directed）。
2. `bash scripts/make.sh <toolkit> local <name>`：配音→时间轴→音频→渲染→拼接→编码混音→QA。
3. 改画面/旁白后重跑：自动备份旧片(.bak)、增量重渲、重新 QA、音画对齐。
4. 医学内容：facts 须 verified + 专家视觉门批准（参考图对照）后才交付。

## animatic（草稿）路径

`gen_visual` 仅用于快速预览结构，产物场景带 `animatic:true`：
- compile 给 W 级 `ANIMATIC_DRAFT` 提醒；
- **export 交付门阻断**含 animatic 场景的项目（除非 `--allow-animatic` 仅预览）；
- 交付前须由 bespoke 作者画面替换这些场景。

## 教训

- 不要拿 auto 映射器当交付去和 bespoke 创意比——必输。
- 自动 primitive 3D 落在"既不准确也不示意"的恐怖谷；准确解剖靠专家参考影像/专业建模外部工程，自动只承诺干净示意。
- 审计绿/功能测试/像素统计 ≠ 视觉对；交付前必须渲染真看。

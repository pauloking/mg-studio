# MG 全链路工具（暂名 mg-studio）设计文档

日期：2026-11-13
状态：待用户审阅
形态：CLI/Agent 工具包（在 motion-explainer-video 方法论上演进的新工具包）

## 1. 背景与取证

已验证资产（来源：跨会话记忆 + motion-explainer-video 技能原文，2026-11-13 核对）：

- **2D 确定性渲染核**（千问办公宣传片、S-ICD 患者科普已验收）：`script.json` → `tts.js`（本地 say / 百炼）→ `build_timeline.js`（ffprobe 实测时长反推帧级时间轴、字幕钳制）→ `assemble_audio.js`（旁白落位 + 程序化原创 BGM）→ `render.js`（Playwright + headless Chrome，`window.__frame(i)` 喂帧，smoke/range 模式）→ ffmpeg libx264。中文由浏览器渲染零错字，逐帧确定可复现。
- **Three.js 医学三维管线**（LBBAP 教学片已验收）：喂帧契约相同，核心优势是"可绑定量"（激活时间 = 弧长 ÷ 传导速度，HUD 毫秒数从几何量出）。
- **生成式视频对照实验结论**：解剖正确性场景四类失败模式（腔室错位、身份漂移、波前变闪电、无法验证真三维），否决为成片路线，仅保留氛围镜用途。
- **已知坑**（现靠文档与人记忆）：字幕条 bottom:64 遮挡（布景须 y<900）、旋转切静态须清 transform、字幕 cue 钳制场景边界、换配音须清全部帧重渲、本机 ffmpeg 无 drawtext。

现状缺口：

1. `scene.html` 每个项目手写（buildScenes + up<Id>），是最大人力成本与效果方差来源。
2. `script.json` 只有旁白 + 字幕，无叙事结构；流畅度与故事性无机器保障。
3. 设计纪律与验收清单是文字不是强制；迭代（尤其换配音）要全量重渲。

## 2. 目标与非目标

目标（对应三条保障 + 链路优化）：

- **故事性**：叙事结构化、模板化 lint、故事弧检查，AI 初稿 + 人工门。
- **脚本流畅度**：朗读时长模型、口语 lint、字幕-旁白一致性、时长预算对齐。
- **效果**：声明式分镜编译生成 scene.html，调校过的组件库 + 设计 token，动效 lint 把踩过的坑变成机器检查。
- **链路**：阶段门编排、scene 级增量渲染、自动 QA、关键帧 contact sheet 人工门。

非目标（本期不做）：

- Web 工作台（二期；IR 按未来工作台的 document 设计，留好接口）。
- 账号、协作、计费、多语言、通用素材市场。
- 生成式视频成片（仅氛围镜，沿用既有结论）。
- 不改动原 motion-explainer-video 工具包（已验证资产保持可用，新工具包独立演进）。

## 3. 已确认决策（2026-11-13）

| 决策点 | 结论 |
| --- | --- |
| 服务对象 | 先服务用户自己（医学科普/产品宣传视频），效率优先 |
| 内容边界 | 医学科普优先：准确性门 + 医学图元 + Three.js 3D 插入段 |
| 起步形态 | CLI/Agent 工具包，复用已验证渲染核 |
| 脚本生产 | AI 初稿 + 人工门：beat 模板约束下生成/改写，diff 确认，医学事实标待核实 |

## 4. 核心判断与总体架构

瓶颈不在渲染，在"叙事 → 分镜 → 动效"的翻译损耗与迭代成本。架构 = **一份 IR 作唯一事实源 + 四层机制**，渲染核不动。

```
story.json（叙事源） ─┐
scenes/*.json（视觉源）─┼─ compile_scenes.js ─→ script.json v2 + scene.html
tokens.json（设计源） ─┘         │
        lint_story.js / lint_script.js（G0 脚本门）
                                 ▼
              tts.js → build_timeline.js（+校准）→ assemble_audio.js
                                 ▼
        render.js --scene（scene 级增量，frames/<id>/ + cache/）
                                 ▼
              assemble_frames.js（硬链接拼接）→ ffmpeg 编码混音
                                 ▼
        auto_qa.js + contact_sheet.js（G4 QA 门 + 人工终审）
```

工具包目录：

```
mg-studio/
  scripts/    lint_story / lint_script / compile_scenes / build_timeline /
              tts / assemble_audio / render / assemble_frames /
              auto_qa / contact_sheet / make.sh
  components/ 动效组件生成器（v1 清单见 §8）
  templates/  story/scene/tokens 模板 + 三套叙事模板
  medical/    术语表、事实核查清单、3D 插入适配器
  references/ 方法论（继承 motion-explainer-video）
```

项目目录：`story.json`、`scenes/*.json`、`tokens.json` 为源；`script.json`、`timeline.json`、`scene.html` 为编译产物；`vo/`、`frames/<sceneId>/`、`cache/`、`reports/`、`out/` 为过程与输出。

## 5. IR 规范

三个源文件，编译产物向后兼容现有渲染核。

### 5.1 story.json（叙事源）

```json
{
  "schema": 2,
  "meta": {
    "title": "…", "audience": "patient|professional|general",
    "template": "science|product|teaching|free",
    "durationTarget": 60
  },
  "beats": [
    {
      "id": "hook", "role": "hook", "emotion": 4,
      "intent": "一句话视觉意图",
      "narration": "旁白草稿",
      "facts": [ { "claim": "…", "source": "…", "verified": false } ]
    }
  ]
}
```

- role 枚举：`hook / context / conflict / mechanism / evidence / demo / takeaway / cta / objective / prerequisite / steps / summary / selfcheck`。
- emotion：1–5，供情绪曲线检查。
- facts：医学/关键事实清单，`verified:false` 项在患者向项目中阻断全片渲染门。

### 5.2 scenes/<id>.json（视觉源）

```json
{
  "id": "hook", "beat": "hook", "minSec": 6,
  "layout": "title-card",
  "elements": [
    { "id": "t1", "type": "text", "props": { "content": "…" },
      "enter": { "preset": "rise", "at": 0.2, "dur": 0.6 },
      "emphasis": [ { "preset": "pulse", "cue": "narration:0.5" } ],
      "exit": { "preset": "fade", "dur": 0.4 } }
  ],
  "cues": [ { "at": "narration:0.42", "target": "t1", "action": "highlight" } ],
  "subsOverride": null,
  "custom": null
}
```

- `layout` 引用组件；`custom` 非空时编译器跳过生成，保留手写 up 函数（逃生舱）。
- `cue.at` 支持 `narration:0.42`（旁白进度比例）与 `lt:1.2`（场景内秒），编译期换算为帧；`enter/exit` 的 `at/dur` 单位均为场景内秒。
- `subsOverride` 为空时由编译器从 narration 自动切句（每行 ≤ 18 字，按标点优先），覆盖时 lint 校验与 narration 一致。

### 5.3 tokens.json（设计源）

色板（医学蓝绿主色 + 警示/语义色）、字体族、字号阶梯、间距、圆角、字幕区定义（默认 bottom:64，即 y>940 禁入布景）。对比度在编译期按 token 预计算。3D 插入段注入同一份 tokens。

### 5.4 编译产物

- `script.json v2`：保留 v1 全部字段（fps/width/height/options/tts/scenes[{id,minSec,narration,subs}]），新增 beat/layout/elements/cues/medical 块。v1 旧文件直通消费（兼容模式，跳过编译）。
- `scene.html`：由编译器生成，遵守既有契约 `__ready/__N/__frame(i)/__err`，新增单 scene 模式（`?scene=<id>` 时 `__N` 为局部帧数、`__frame(j)` 局部驱动）。动画只由帧号驱动，禁读墙钟。

## 6. L1 叙事层（故事性保障）

三套叙事模板（`templates/narratives/`），定义必需 role、顺序约束、时长占比建议：

- **science（科普）**：hook → conflict（常见误解）→ mechanism → evidence → takeaway（就医提示）。
- **product（产品）**：hook（痛点）→ demo → evidence → cta。
- **teaching（教学）**：objective → prerequisite → steps → summary → selfcheck。
- `free`：跳过顺序约束，保留通用规则。

`lint_story.js` 规则（阻断级 B / 警告级 W）：

- B：首 beat 为 hook 类且预计开始 < 5s；末 beat 为 takeaway/cta/selfcheck。
- B：模板必需 role 齐全（free 模板除外）。
- B：患者向项目存在 `verified:false` 的 fact。
- W：无 conflict/turn 类 beat（科普/产品模板）；emotion 极差 < 2（情绪平铺）；单 beat 预估时长 > 15s（建议拆）。

AI 初稿流程（Agent 形态）：Agent 按模板生成 story.json 初稿 → lint 报告反馈迭代 → 用户 diff 确认锁定 → facts 抽取并标待核实 → 人工核实勾选。工具包提供 prompt 模板与 lint，生成由 Agent 执行。

## 7. L2 脚本层（流畅度保障）

`lint_script.js`：

- **朗读时长模型**：预估时长 = 字数 ÷ charsPerSec + pad。初始 charsPerSec = 4.5；`build_timeline.js` 每次用实测 TTS 时长回写 `calibration.json`（按 backend+voice 分键），模型自校准。
- **时长预算**：全片预估 vs `durationTarget` ±10%，超支定位到 beat 报告。
- **口语 lint（W）**：单句 > 30 字；术语首现无通俗解释（`medical/terms.json` 词典 + 启发式：后 20 字内出现"就是/也就是/一种"或括号解释视为已解释）；beat 开头 12 字内无衔接词（所以/但是/那么/接下来/因此/而/于是）提示逻辑桥缺失。
- **字幕一致性（B）**：subsOverride 与 narration 逐句 diff；自动切句产物抽检每行 ≤ 18 字。

## 8. L3 动效编译层（效果保障）

`compile_scenes.js`：scenes + tokens + 组件库 → scene.html（生成 buildScenes/up 函数，复用 seg/eo/eio）。

组件库 v1（医学科普优先，8 个 + 1 个特殊类型）：

| 组件 | 用途 | 关键预设 |
| --- | --- | --- |
| title-card | 标题+副标题 | rise/fade |
| points | 要点卡片逐个入场 | stagger rise |
| compare | 双栏对比 | 左右滑入 |
| flow | 流程箭头逐步描绘 | 路径生长 |
| path-trace | 血管/传导束示意（SVG stroke 描绘） | 描绘+脉冲 |
| waveform | ECG/波形面板（canvas） | 扫描绘制 |
| stat | 数字滚动+单位 | count-up |
| chart-grow | 柱状/折线生长 | 生长+标注 |
| three3d | Three.js 插入段（§10） | — |

每个组件内置 enter/emphasis/exit 预设与参数；easing 继承 seg/eo/eio，新增确定性 spring 查表。组件 exit 统一清 transform（把坑①变成编译器保证）。

动效 lint：

- 编译期 B：元素包围盒侵入字幕区（y>940）；文字停留 < max(字数×0.28s, 1.2s)；token 对比度 < 4.5。
- 编译期 W：y>900 接近字幕区；同屏同时运动元素 > 6。
- 渲染期：smoke 帧对关键元素做 DOM rect 抽查遮挡（`__frame` 后查询）。

逃生舱：`custom` scene 保留手写 up 函数，编译器只注入契约骨架。

## 9. L4 编排、增量渲染与 QA

### 9.1 阶段门（make.sh 编排，每门有产物、可 `--from <gate>` 重入）

- **G0 脚本门**：lint_story + lint_script 阻断项全过 + 人工确认 story.json。产物：reports/story-lint.md。
- **G1 分镜门**：编译 + 关键帧小渲染（render.js 关键帧模式，每 scene 取 enter 完成帧、emphasis 峰值帧、exit 前帧）+ contact_sheet（PIL 拼图）→ 人工目检布局。产物：reports/contact-sheet.png。
- **G2 smoke 门**：smoke 渲染 + 渲染期 lint → 人工目检。
- **G3 全片门**：增量渲染 + 拼接 + 编码混音。
- **G4 QA 门**：auto_qa 阻断项全过 → 人工终审（故事好不好、医学对不对）。产物：reports/qa.md。

### 9.2 增量渲染（解决"换配音清全部帧"痛点）

- 帧按 scene 分目录：`frames/<sceneId>/f_%04d.png`（局部帧号）。
- `cache/index.json`：每 scene 记录 `{visualHash, audioHash, frameCount, duration}`。visualHash = hash(scene json + tokens + 组件版本 + 编译器版本)；audioHash = hash(vo/<id>.wav)。
- 失效规则：visualHash 变 → 重渲该 scene；audioHash 变且时长变 → 重渲该 scene，**后续 scene 局部帧不变**（局部帧只依赖本 scene 的视觉与时长），只需重拼。
- `render.js --scene <id>` 渲染单 scene；`--all` 逐 scene 渲染并跳过缓存命中；`--no-cache` 兜底。
- `assemble_frames.js`：按 timeline 顺序硬链接各 scene 帧 → `frames/all/f_%04d.png` → 单次 ffmpeg 编码（保持单一编码 pass）。换配音不再 rm 全部帧，只清失效 scene 目录，杜绝脏帧。
- 首次全量 = 逐 scene 渲染 + 拼接，输出须与旧全片渲染等价（M1 回归验证）。

### 9.3 auto_qa.js

阻断级：帧数与 timeline 总帧数一致；render 日志 runtime error: none；字幕一致性；患者向医学门（§10）；blackdetect 命中。

警告级：freezedetect > 2s（片头片尾静帧豁免）；音量窗旁白均值 − 间隙均值 ≥ 15dB（参考 −20/−40）；integrated loudness 目标 −16 LUFS ±1；时长偏差。

输出 reports/qa.json + qa.md，阻断/警告分级呈现。

## 10. 医学安全门与 3D 插入段

医学安全（继承既有约束并机器化）：

- 患者向：outro 必须含"本视频为健康科普，不构成诊疗建议"（编译期注入 + 渲染期 DOM 检查可见）；facts 全部 verified 才过 G3。
- 解剖/植入示意图：path-trace/compare 等组件自动加"示意，非真实解剖"标注。
- 绝对化疗效词表 lint（根治/百分百/最好等，B 级）；结论保守，必要时提示"由医生评估"。
- 面向患者用通俗语言（术语密度 lint 联动）。

3D 插入段（three3d scene）：

- 声明 `threeProject` 路径 + 目标时长；适配器调该工程的喂帧渲染（lbban 管线复用），按目标帧数确定性重渲输出 PNG 到 `frames/<id>/`，参与同一套缓存与拼接。
- tokens 注入 3D 工程统一色板；保留可绑定量（HUD 毫秒数从几何量出）；标注"图形层·示意"。
- 不做 iframe 嵌入，避免双渲染时钟破坏确定性。

## 11. 里程碑与验收

- **M1 编译核**：IR v2 + compile_scenes + 组件 4 个（title-card/points/waveform/stat）。验收：千问办公、S-ICD 旧项目经新管线重出片，抽帧与旧版对比一致；旧 script.json 直通兼容。
- **M2 叙事与脚本**：story.json + 两套 lint + AI 初稿流程 + 校准。验收：下一条真实视频脚本走 G0 全流程，lint 报告可读、校准回写生效。
- **M3 增量与 QA**：scene 帧缓存 + assemble_frames + auto_qa + contact_sheet。验收：换配音实测只重渲时长变化的 scene；QA 报告阻断/警告正确分级。
- **M4 医学门与 3D**：facts 核实门 + 免责声明强制 + three3d 插入。验收：一条含 3D 段的科普片端到端过 G0–G4。

每个里程碑独立可验收；M1 完成即可投入真实生产（lint 未就绪部分人工兜底）。验收纪律沿用：smoke 目检 → 全片 → 成片抽帧 + 音量窗校验。

## 12. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 编译器表现力不如手写 | custom 逃生舱 + 组件持续调校 + 旧片回归对比兜底 |
| IR 膨胀失控 | schema 版本字段 + 三源文件分离 + 编译期校验 |
| 增量缓存误判 | hash 含组件/编译器版本；--no-cache 兜底；QA 帧数校验 |
| lint 误报挡路 | 阻断/警告分级，警告不阻断；阈值集中在配置可调 |
| 2D/3D 风格割裂 | tokens 注入 3D 工程；contact sheet 统一目检 |

## 13. 兼容与迁移

- 旧 v1 script.json 直通消费，原 motion-explainer-video 工具包不改动。
- 旧项目迁移 = 把 narration/subs 拆进 story.json + scenes/，手写 scene.html 可整体标 custom 保留，逐步替换为声明式组件。
# 按文定制形象/全景（Topic-Visual）设计 spec

> 状态：设计稿，待批准后转实现计划。目标：读文章/问题 → 检索/生成对应医学形象或全景 → 接入现有分镜管线 → 经 visual-review 人工门保证正确。**不**用纯文生图做医学关键形象。

## 1. 问题与边界
- 现状：动效＝固定组件+预设；motion-plan 只按文本定制**结构**（流程/对比/指标），不画主题形象/全景。
- 缺口：无法"读文章→画出对应解剖形象/全景"。
- 边界（审查 Blocker）：自动门不保视觉正确 ⇒ 任何生成/检索形象必须过 **visual-review 人工门**（reference+reviewer+approved）。
- 医学关键形象优先**真实开源素材/参数化/外部3D**；文生图仅用于非关键氛围镜且强制标注"AI 生成·示意"。

## 2. 总体架构（复用现有层）
```
beat.narration/facts
   └─① visual-intent 提取 visualBrief{subject,type,structures[],view,refs[]}
        └─② asset-retrieval 检索(开源医学库+本地M8素材) → 候选+许可证/出处
             ├─命中→ ④ 接入 scene(directed/three3d/image)
             └─未命中→ ③ generation 兜底
                  ├─2D示意: 参数化组件(septum类)按 brief 确定性绘制
                  ├─3D/全景: 外部 Three.js 喂帧(three3d)按 brief 配相机/剖切
                  └─氛围: 文生图(标注AI示意, 仅非关键)
        └─⑤ visual-review 人工门(reference+reviewer+approved) 才渲染
        └─⑥ credits: 素材许可证/出处 或 生成prompt+seed 入 facts/credits
```

## 3. 模块设计
### ① visual-intent（lib/visual-intent.js）
- 输入 beat；输出 visualBrief。
- 复用 motion-plan.extractNodes/extractComparison；新增医学实体识别（medical/terms.json + 解剖/器械词典）。
- type ∈ anatomy|device|panorama|diagram|comparison|ambient；view ∈ 镜像/剖面/全景；structures[] 关键结构。
- 纯函数、可单测。

### ② asset-retrieval（lib/asset-retrieval.js）
- 源：开源医学库索引（NIH 3D/BodyParts3D/OpenAnatomy，见 docs/medical-assets-guide.md）+ 本地 M8 上传素材。
- 返回候选 [{kind:model|image, url|path, license, source, match}]；优先真实素材。
- 只检索元数据/本地，不下载版权不明素材；许可证必须明确。

### ③ generation（lib/topic-visual-gen.js）
- 2D：参数化组件按 brief 绘制（确定性 canvas/SVG，帧号驱动）。
- 3D/全景：生成/配置外部 Three.js 工程参数，走 three3d 喂帧契约。
- 氛围：文生图（可复现 seed），强制"AI 生成·示意"水印。
- 产物写入 scene + visualBrief.reference。

### ④ 接入（compile/emit）
- 新 layout `topic-visual` 或复用 directed/three3d/image；scene 携带 visualBrief。
- 与现有 props 校验/转义/坐标防注入一致。

### ⑤ 人工门（复用 visual-review）
- topic-visual/anatomy/panorama 场景强制 visualReview 批准；未批准 B 阻断渲染。

### ⑥ credits
- 素材：license+source 入 credits；生成：prompt+seed+model 入 credits，可复现。

## 4. 分阶段
- P1：visual-intent + asset-retrieval + 本地/开源素材接入 directed（最快见效，真实素材）。
- P2：参数化 2D 示意生成（septum 类组件按 brief 参数化）。
- P3：3D/全景外部工程 + 文生图氛围兜底 + 人工门/credits 闭环。

## 5. 验收
- 给一篇文章，能产出对应形象/全景分镜；检索命中用真实素材，未命中走生成；全部过 visual-review；credits 完整；test:ci 绿。
- 医学关键形象不允许纯文生图无人工门。

## 6. 风险
- 素材版权/准确性 ⇒ 许可证校验+人工门。
- 生成不可控 ⇒ 优先真实/参数化/3D；文生图仅氛围+标注。
- 与现有组件/门兼容 ⇒ 复用 props/escape/visual-review，不破坏渲染核。

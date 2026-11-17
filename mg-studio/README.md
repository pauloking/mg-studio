# mg-studio 详细开发者手册

> MG 工具包内部规范、分镜 JSON Schema、5 大组件 Props 字典、3D 喂帧契约与 CLI 参数完整指南。

---

## 1. 项目格式规范（IR v2）

一个标准的 `mg-studio` 声明式视频工程目录包含以下文件：

```
my-project/
├── story.json               # [必须] 故事骨架描述
├── scenes/                  # [必须] 分镜组件目录
│   ├── <beatId1>.json       # 场景 1 描述（文件名必须严格等于 beatId）
│   ├── <beatId2>.json       # 场景 2 描述
│   └── ...
└── tokens.json              # [可选] 自定义视觉与排版令牌（未提供时自动使用内置默认模板）
```

### 1.1 `story.json` Schema 详解

`story.json` 定义整部视频的叙事结构、受众定位、旁白脚本及事实核查链条：

```json
{
  "schema": 2,
  "meta": {
    "title": "冠心病介入治疗科普",
    "audience": "patient",
    "template": "science",
    "durationTarget": 45
  },
  "beats": [
    {
      "id": "hook",
      "role": "hook",
      "emotion": 4,
      "intent": "开篇点出突发胸痛的危机感",
      "narration": "突发胸痛如大石压胸，这是心脏发出的求救信号。",
      "facts": [
        {
          "claim": "急性胸痛可能为心肌缺血或心梗先兆",
          "source": "中华心血管病学会指南2024",
          "verified": true
        }
      ]
    },
    {
      "id": "outro",
      "role": "takeaway",
      "emotion": 3,
      "intent": "总结并提示就医免责",
      "narration": "早识别早开通，本视频为健康科普，不构成诊疗建议。",
      "facts": []
    }
  ]
}
```

* **`meta.audience`**：受众分类，支持 `patient`（患者向，触发最严医学安全门）、`professional`（专业医务/学术向）、`general`（大众通用向）。
* **`meta.template`**：叙事骨架模板，支持 `science`（科普，要求 hook-mechanism-evidence-takeaway）、`product`（产品演示）、`teaching`（教学拆解）、`free`（自由无约束）。
* **`beats[].role`**：叙事功能角色，如 `hook`、`conflict`、`mechanism`、`evidence`、`takeaway`、`cta` 等。
* **`beats[].emotion`**：情绪指数（1~5），G0 故事门要求全篇情绪极差 $\ge 2$，避免平淡如水。
* **`beats[].facts`**：关键论断核查链条。患者向项目存在 `verified: false` 时会被编译期阻断。

---

### 1.2 `scenes/<beatId>.json` Schema 详解

每个场景独立成文件，描述该 beat 在屏幕上的组件布局、动效预设与时间锚点：

```json
{
  "id": "hook",
  "beat": "hook",
  "minSec": 4,
  "layout": "title-card",
  "elements": [
    {
      "id": "title",
      "type": "text",
      "props": { "role": "title", "content": "急性胸痛的黄金时间" },
      "enter": { "preset": "scale", "at": 0.4, "dur": 0.8 }
    },
    {
      "id": "bar",
      "type": "bar",
      "props": {},
      "enter": { "preset": "grow", "at": 1.0, "dur": 0.6 }
    },
    {
      "id": "subtitle",
      "type": "text",
      "props": { "role": "subtitle", "content": "牢记黄金救治 120 分钟" },
      "enter": { "preset": "rise", "at": 1.4, "dur": 0.6 }
    }
  ],
  "cues": [
    { "el": "title", "action": "pulse", "at": "narration:0.5" }
  ],
  "subsOverride": null,
  "custom": null
}
```

* **`layout`**：选用的布局组件，必须在已注册的 5 个组件中之一（`title-card`, `points`, `waveform`, `stat`, `three3d`）。
* **`minSec`**：场景保底显示秒数。当配音过短时以此为下限，保证观众看得清。
* **`elements`**：场景内包含的图元列表。
* **`cues`**：时间锚点触发器。支持按相对旁白进度 `narration:r`（如 `narration:0.5` 表示旁白说到一半时）或绝对秒数 `lt:sec` 触发强调动作。
* **`subsOverride`**：可选字符串数组，用于手动覆盖默认自动切句的字幕。若提供，单行不得超过 18 字且内容必须与旁白严格一致。

---

### 1.3 `tokens.json` 设计令牌

设计令牌控制全片的色彩系统、字体家族与字幕位置安全区。未显式定义的值会自动继承自 `templates/tokens.default.json`：

```json
{
  "colors": {
    "bg": "#0D1117",
    "surface": "#161B22",
    "surface2": "#21262D",
    "text": "#F0F6FC",
    "muted": "#8B949E",
    "accent": "#58A6FF",
    "accent2": "#F778BA",
    "warn": "#D29922",
    "danger": "#F85149",
    "success": "#3FB950"
  },
  "font": "system-ui, -apple-system, 'PingFang SC', sans-serif",
  "fontSize": 48,
  "maxW": 1600,
  "bottom": 64,
  "subtitle": {
    "font": "system-ui, sans-serif",
    "fontSize": 36,
    "color": "#FFFFFF",
    "bg": "rgba(0,0,0,0.65)"
  }
}
```

* **色键校验**：色键名只允许小写英文字母与数字，色值仅允许 `#RRGGBB` / `#RRGGBBAA` 或 `rgba()`，防止 CSS 变量名注入攻击。

---

### 1.4 MG 视觉与动效风格系统（M5 Styles & Themes）

为了终结成片“全部千篇一律深蓝暗调”的问题，`mg-studio` 提供了可插拔的风格套件系统（Design Themes），支持背景渲染策略解耦、卡片材质自适应与弹性缓动增强。

#### 1.4.1 官方预设风格矩阵（8 大风格）

| 风格标识 (`style`) | 命名 | 适用场景 | 背景策略 (`bgType`) | 卡片材质 | 核心色调 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`deep-tech`** | 深邃科技 | 前沿科技、数字系统、极客演示 | 深蓝黑渐变 + 网格 + 悬浮尘埃 + 径向光晕 | 暗蓝半透玻璃拟态 + 高亮冷蓝细边框 | 冷白字、荧光紫、电光青 |
| **`clean-medical`** | 清爽医疗 | 临床手术机理、患者科普、药械演示 | 柔和浅灰白渐变 + 微细微蓝点阵 (Dot Grid) + 柔和呼吸环境光 | 纯白高光卡片 + 漫反射微阴影 + 浅蓝灰边框 | 深青黑字、临床湖蓝、珊瑚红 |
| **`warm-editorial`** | 人文典雅 | 医学史话、深度纪录、温和长者关怀 | 暖米羊皮纸色 + 纸张微细网格 + 典雅四角画框 | 象牙白质感大圆角底板 + 无生硬发光边框 | 经典衬线体、赤陶红、深炭灰 |
| **`swiss-modern`** | 瑞士现代 | 年轻化科普、高冲击力产品演示 | 纯净高对比冷灰 + 极简四角精准十字标记 | 纯平几何色块 + 纯黑硬朗描边 + 投影 | 纯黑粗字、高纯蓝、深玫瑰红 |
| **`vital-energy`** | 活力暖橙 | 运动康复、营养膳食、慢病管理、家庭医生 | 暖阳柔和晨曦渐变 + 极轻暖色网格 + 柔光晕 | 暖白纯净底板 + 24px 大圆角 + 暖橙浅投影 | 浓郁深褐字、活力暖橙、草木绿 |
| **`cyber-neon`** | 赛博霓虹 | 脑机接口、合成生物、数字孪生、高精尖科技 | 极夜深紫黑 + 荧光紫网格 + 上浮微粒子 | 深紫黑半透面板 + 霓虹紫微边框 + 发光阴影 | 纯白高亮字、电光青、荧光粉紫 |
| **`ink-zen`** | 极简水墨 | 中医药学、经络针灸、哲学通识、高端学术 | 传统素雅宣纸微黄底 + 淡墨留白 + 朱砂朱印细框 | 宣纸素白卡片 + 8px 微圆角 + 极细浅墨描边 | 浓墨黑字、朱砂印红、远山黛青 |
| **`aurora-glass`** | 极光微观 | 细胞微观、分子免疫、纳米靶向、神经科学 | 深海极夜蓝 + 极光双色有机流光带 + 发光孢子 | 毛玻璃拟态深色卡片 + 28px 圆角 + 极光发光 | 荧光微绿白字、极光青绿、天青蓝 |

#### 1.4.2 如何声明与应用风格

风格可在 `story.json` 的 `meta.style` 或 `tokens.json` 的 `style` 中一键声明：

```json
{
  "schema": 2,
  "meta": {
    "title": "冠心病介入科普",
    "audience": "patient",
    "template": "science",
    "style": "clean-medical"
  }
}
```

系统采用**三级级联深合并**：
`templates/tokens.default.json` → `templates/styles/<style>.json` → 用户 `tokens.json`。
* **100% 向后兼容**：不声明 `style` 时，系统自动保持原有的深蓝科技默认视觉，既有工程零漂移。
* **局部微调**：声明了 `style` 后，若需自定义个别品牌色（如改变 `accent`），只需在项目的 `tokens.json` 中定义该颜色即可精准覆盖。
* **WCAG AA 门禁**：所有预设风格全部经过 WCAG AA 对比度实测检验（对比度 $\ge 4.5$），杜绝浅色背景下的看不清与排版阻断。

---

## 2. 五大布局组件与 Props 字典

### 2.1 `title-card` 标题与章节卡

* **用途**：片头引题、核心转场、大章节开场。
* **支持元素类型**：
  * `text`：
    * `role`: `"title"`（主标题，字号较大）或 `"subtitle"`（副标题，位于装饰条下方）。
    * `content`: 文本内容。
  * `bar`：
    * 标题装饰分割条。
    * **视觉增强**：运行时已设定 `transform-origin: center center`，展开动画从中间向两侧平滑延伸，杜绝单侧跳跃。

### 2.2 `points` 要点卡片矩阵

* **用途**：核心结论阐述、对比要点、治疗原则、病因列表。
* **支持元素类型**：
  * `card`：
    * `title`: 卡片小标题。
    * `desc`: 卡片描述正文。
* **视觉增强**：
  * **智能居中对齐**：当只有 1 张卡片时自动水平正中排版；当为 2 张卡片时自动向中间聚拢居中；3 张及以上均匀排列。
  * 卡片支持通过 `enter.at` 结合步进差实现优雅的瀑布流入场（Stagger）。

### 2.3 `waveform` ECG 生理波形图元

* **用途**：心电监护仪扫描展示、心律失常对比演示。
* **支持元素类型**：
  * `waveform`：
    * `x`: 区域左上角横坐标（像素数值，如 `180`）。
    * `y`: 区域左上角纵坐标（如 `360`，必须在布景安全区 y < 900 内）。
    * `w`: 区域宽度（如 `1560`）。
    * `h`: 区域高度（如 `360`）。
    * `color`: 引用 `tokens.json` 中的色键名（如 `"accent"` 或 `"danger"`）。
    * `vf`: 心室颤动乱波开关（`0` 正常波形 / `1` 室颤乱波）。
    * `scroll`: 扫描线移动速度因子（如 `0.6`）。

### 2.4 `stat` 统计数值看板

* **用途**：临床试验数据、生存率、发生率、时长等关键指标。
* **支持元素类型**：
  * `stat`：
    * `value`: 目标数值（如 `35.2` 或 `98`）。动画从 0 滚动增长至目标值。
    * `unit`: 单位字符串（如 `"%"`、`"ms"`、`"小时"`）。
    * `label`: 指标说明文字。
    * `decimals`: 小数位数（如 `0` 或 `1`）。
* **视觉增强**：
  * **对称居中**：卡片宽度依据字符数量动态估算，单指标与双指标自适应水平对称居中，彻底消除传统硬编码宽度导致的左偏失衡。

### 2.5 `three3d` 3D 解剖与器械插入段

* **用途**：真实 CT/MRI 三维重建器官、支架释放推演、外科手术入路动画。
* **支持元素类型**：
  * `three3d`：
    * `threeProject`: 外部喂帧工程目录路径（相对项目目录或绝对路径）。
    * `frames`: 可选整数，预期渲染帧数（默认直接沿用时间轴 `end - start`）。
* **管线特性**：`render.js --all` 遇到 `three3d` 场景时会自动跳过 2D 渲染；由 `scripts/render_three.js` 调用外部契约脚本统一出帧至 `frames/<id>/`。

---

## 3. 动效预设与时间锚点

> 详细的动效数学模型、历史成片动效提炼与候选效果库，参见 [docs/motion-effects-guide.md](../docs/motion-effects-guide.md)。

所有动画完全由帧号推进，运行时在 `lib/presets.js` 固化：

| 动效预设 | 分类 | 默认时长 | 视觉表现 |
| :--- | :--- | :--- | :--- |
| `rise` | 入场 | 0.6s | 从下方 translateY(30px) 渐现并回弹归零 |
| `fade` | 入场 | 0.5s | opacity 0 → 1 平滑显现 |
| `scale` | 入场 | 0.7s | scale(0.85) → scale(1.0) 人性化微缩放入场 |
| `popLeft` | 入场 | 0.6s | 从左侧 translateX(-40px) 弹动入场 |
| `grow` | 入场 | 0.7s | scaleX(0) → scaleX(1) 装饰条由内向外伸展 |
| `pulse` | 强调 | 0.4s | scale(1.0) → scale(1.06) → scale(1.0) 心跳微颤 |
| `highlight` | 强调 | 0.5s | 滤镜变亮 brightness(1.3) 并高亮底色 |
| `fadeOut` | 退场 | 0.5s | opacity 1 → 0 消失 |
| `sink` | 退场 | 0.5s | translateY(0) → translateY(40px) 下沉渐隐 |

**时间锚点（Cues）配置方式**：
* 相对旁白：`"at": "narration:0.5"`（旁白进行到 50% 处触发）。
* 绝对时间：`"at": "lt:2.4"`（场景开始后 2.4 秒处触发）。

**入场缓动曲线（Enter Easings）**：
在元素的 `enter` 配置中可通过 `easing` 字段指定缓动动画：
* `"easing": "ease"`（默认）：标准三次缓出（Cubic Ease Out），平滑无冲击。
* `"easing": "spring"` 或 `"overshoot"`：弹性回弹超调曲线（Back / Overshoot Easing），在入场接近终点时微微冲过目标值后回弹稳定，带来极具活力的 MG 动感。

---

## 4. 外部 3D 喂帧契约规范

为保证确定性离线逐帧渲染，外部 Three.js 工程必须提供契约执行脚本 `render_frames.js`：

### 契约参数标准
```bash
node <threeProject>/render_frames.js \
     --out <outDir> \
     --frames <N> \
     --fps 30 \
     --width 1920 \
     --height 1080 \
     --tokens <tokensJsonPath>
```

### 契约实现要点
1. **纯帧号驱动**：计算动画进度必须使用 `const t = frame / (totalFrames - 1)`，禁止使用 `Date.now()`、`performance.now()` 或无头浏览器的真实墙钟定时器。
2. **输出规范**：在 `--out` 指定的目录下必须输出 `f_0000.png` 至 `f_{N-1}.png`，格式为 1920×1080 RGBA PNG。
3. **色彩继承**：根据 `--tokens` 读取主工程的颜色变量，使 3D 渲染器的背景与光照色调与 2D 场景严丝合缝。

---

## 5. 命令行参考与环境变量

### 5.1 CLI 命令汇总

| 命令 | 默认作用 | 常用选项 |
| :--- | :--- | :--- |
| `scripts/studio.js` | 启动本地 Web 可视化工作台 | `npm run studio` 或 `node studio.js [项目目录] [--port 3000] [--open]` |
| `scripts/make.sh` | 全链路一键成片 | `bash make.sh <toolkit> [local\|bailian] [outName]` |
| `scripts/doctor.js` | 运行环境诊断 | `--json`（输出结构化 JSON），`--quiet`（静默模式） |
| `scripts/lint_story.js` | 检查故事结构与语言 | `node lint_story.js [项目目录]`（生成 `reports/story-lint.md`） |
| `scripts/preview_script.js` | 分镜人审与事实核验 | `--md`（输出 Markdown），`--yes`（跳过未核实阻断） |
| `scripts/compile.js` | 编译 IR 并输出 scene.html | `node compile.js [项目目录]` |
| `scripts/lint_scene.js` | 真实 DOM 盒编译后门 | `--no-measure`（跳过浏览器，使用估算盒） |
| `scripts/tts.js` | 旁白音频合成 | `--backend local\|bailian`，`--only scene1,scene2`（仅配个别场景） |
| `scripts/render.js` | 无头浏览器逐帧渲染 | `--all`（增量渲染未命中缓存场景），`--scene <id>`，`--no-cache` |
| `scripts/contact_sheet.js` | 生成关键帧印样拼图 | `--cols N`（默认 4 列，输出 `reports/contact-sheet.png`） |
| `scripts/auto_qa.js` | 自动化 QA 门禁核验 | `--skip-media`（跳过耗时的黑场与静止画面扫描） |

### 5.2 环境变量一览

* **`PW_CHANNEL`**：指定渲染浏览器通道。默认为 `chrome`（调用本机 Chrome），设为空字符串 `""` 则使用 Playwright 内置下载的 Chromium。
* **`PW_PATH`**：指定 Playwright 模块所在目录（当 Playwright 安装在非标准路径时配置）。
* **`RENDER_PORT`**：固定本地无头渲染静态服务器端口。缺省自动使用安全临时端口，支持多任务并行渲染防冲突。
* **`MG_MEASURE=0`**：设置后 `lint_scene.js` 主动跳过无头浏览器启动，退回估算盒模式（主要用于极简环境调试）。
* **`MG_DOCTOR=1`**：开启后 `make.sh` 在出片前自动执行一次环境全面健康体检。
* **`MG_REGRESSION_SRC`**：指定旧版历史回归素材绝对路径。若未配置，像素回归测试将自动安全跳过，不阻断 CI。
* **`BL_API_KEY`**：阿里云百炼配音 API Key（使用 `--backend bailian` 时需要）。

---

## 6. 质量门诊断代码字典

系统分为 **B（Blocking 阻断）** 与 **W（Warning 警告）** 两级：

### 故事与脚本门（`lint_story.js`）
* `NARR_HOOK_FIRST` (B)：首个 beat 必须是 `hook` 角色。
* `NARR_MISSING_ROLE` (B)：缺失该模板要求的核心角色（如科普模板缺 `mechanism`）。
* `NARR_END_ROLE` (B)：收尾 beat 必须是总结/行动倡释角色。
* `NARR_FLAT_EMOTION` (W)：情绪跨度小于 2，缺乏起伏。
* `SCRIPT_LONG_SENTENCE` (W)：单句文字超过 30 字，口播容易断气。
* `SCRIPT_TERM_UNEXPLAINED` (W)：出现高难医学术语但缺少通俗解释标记。
* `SCRIPT_NO_BRIDGE` (W)：分镜转折缺乏承上启下的衔接词。
* `SCRIPT_SUBS_MISMATCH` (B)：手动字幕覆盖与旁白文本不匹配。

### 动效排版门（`compile.js` / `lint_scene.js`）
* `SUBTITLE_ZONE` (B)：元素下边界侵入底部 y > 940 字幕盲区。
* `NEAR_SUBTITLE` (W)：元素下边界侵入 y > 900 邻近区。
* `TEXT_DWELL` (B)：单块文本停留时长不足（阅读速度超过 4.5 字/秒）。
* `CONTRAST` (B)：文本与背景（或卡片底色）对比度 < 4.5（WCAG AA 违规）。
* `SCREEN_BOUNDS` (B)：组件几何越出 1920×1080 屏幕范围。

### 医学安全门（`medical-lint.js`）
* `MED_FACT_UNVERIFIED` (B)：患者向存在未核实事实（`verified: false`）。
* `MED_DISCLAIMER` (B)：患者向视频 outro 缺少标准科普免责声明。
* `MED_ABSOLUTE` (B)：命中绝对化疗效或危险医嘱词汇（如“彻底根治”、“百分百安全”、“擅自停药”）。
* `MED_TERM_DENSITY` (W)：专业术语密度过高，建议口语化降解。

### 自动化 QA 门（`auto_qa.js`）
* `QA_FRAME_COUNT` (B)：实际组装帧数与时间轴预期总帧数不相等。
* `QA_RUNTIME` (B)：无头 Chrome 在逐帧渲染期间发生未捕获 JavaScript 异常。
* `QA_DISCLAIMER` (B)：患者向最终编译的 `scene.html` 缺失可见 `#disclaimer` 节点。
* `QA_BLACK` (W)：视频中检出超过 0.5 秒的异常全黑段。
* `QA_FREEZE` (W)：视频中检出超过 2.0 秒的完全静止无动效段。

---

## 7. Web 可视化工作台（Studio UI）

`mg-studio` 提供了无需配置、**零额外 npm 运行时依赖**的本地单页可视化演播室工作台。

### 7.1 启动方式

```bash
cd mg-studio
npm run studio
# 或显式指定分镜工程目录与端口：
node scripts/studio.js ../my-film --port 3000 --open
```

### 7.2 核心特性与架构安全
* **网络与路径安全**：服务严格绑定至本地回环地址 `127.0.0.1`，静态文件伺服采用严格的 `path.resolve` 边界核验，主动防御目录穿越探测（测试覆盖 403 阻断）。
* **虚拟时间轴平滑回退**：工程初创或尚未调用配音生成时，Studio 服务端自动按文字长度与分镜时长预估生成虚拟时间轴（Synthesized Timeline），让创作者在撰写分镜时即可秒级预览画面与动效，无需等待语音合成。
* **8 大视觉风格一键切换**：顶栏下拉即时切换 `deep-tech`、`clean-medical`、`warm-editorial`、`swiss-modern`、`vital-energy`、`cyber-neon`、`ink-zen`、`aurora-glass`，实时级联深合并与增量编译。
* **快捷键操作**：
  * `空格键 (Space)`：播放 / 暂停。
  * `方向左键 (←)`：后退一帧。
  * `方向右键 (→)`：前进一帧。
* **门禁诊断抽屉**：实时呈现叙事门、动效门、医学安全门 B 级与 W 级告警及 WCAG AA 对比度诊断。

### 7.3 REST API 字典一览

| 接口 | 方法 | 说明 |
| :--- | :--- | :--- |
| `/api/project` | `GET` | 读取工程大纲、分镜、设计令牌、风格清单与文件状态 |
| `/api/style` | `POST` | 热切换项目风格（深合并回写并触发增量编译） |
| `/api/scene` | `POST` | 保存单分镜修改（旁白、入场缓动、组件参数）并触发编译 |
| `/api/story` | `POST` | 保存叙事骨架与医学事实核查（`verified` 勾选同步） |
| `/api/compile` | `POST` | 全量重新编译 `script.json` 与 `scene.html` |
| `/api/lint` | `GET` | 聚合叙事、脚本、医学、动效三大门禁全量诊断 |
| `/api/tts` | `POST` | 调用配音脚本与时间轴构建器 |
| `/api/export` | `POST` | 启动后台出片流水线，返回异步 `taskId` |
| `/api/task-status` | `GET` | 轮询后台出片进度与日志（`?taskId=...`） |
| `GET /*` | `GET` | 静态文件伺服（`scene.html`、`timeline.json`、音频/视频），越界返回 403 |


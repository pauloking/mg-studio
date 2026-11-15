# mg-studio 动效系统全景指南与效果库手册

> 系统解析当前已落地的帧驱动动效体系，归纳提炼历史优秀成片动效资产，并建立标准 MG 视效与医学特化动效候选库与扩展规范。

---

## 1. 动效架构与设计哲学

在 `mg-studio` 中，动态图形（Motion Graphics, MG）并非前端网页中常见的用于人机交互的 CSS 补间动画，而是**专为确定性 1080p 视频离线逐帧光栅化打造的数学驱动系统**。

### 核心设计原则

1. **绝对帧号驱动（Zero Wall-Clock Dependency）**：
   * 严禁读取 `Date.now()`、`performance.now()`、CSS `animation` 或基于墙钟的 `requestAnimationFrame`。
   * 画面中任意元素在当前帧的状态（位置、缩放、透明度、滤镜）完全由场景本地时间 $lt$（即 `frame / fps - scene.start`）及纯数学缓动函数计算求得。无论在任意机器、离线还是并行环境下，同一帧号的渲染结果保证 100% 逐像素一致。
2. **状态归零纪律（Transform Reset Discipline）**：
   * 所有入场动效完成后，元素的 CSS 变换必须显式重置为 `transform: none`（或回归原点）；
   * 退场动效开始前不得残留中间偏移，彻底避免因多段动效累加导致的文字排版“漂移”或布局盒实测失效。
3. **多通道正交叠加（Orthogonal Channel Composition）**：
   * 单一元素在同一生命周期内支持同时叠加三段动效：入场通道（`enter`） $\times$ 强调通道（`emphasis`） $\times$ 退场通道（`exit`），由 `chan(...)` 运行时执行矩阵式安全合并。
4. **编译期动效安全门拦截（Motion Linting Guardrails）**：
   * 动效不得越出 1920×1080 视口（`SCREEN_BOUNDS`）；
   * 元素底边界不得侵入底部 y > 940 字幕盲区（`SUBTITLE_ZONE`）；
   * 单个场景同屏运动元素峰值密度不得失控（`DENSITY` $\le 6$）；
   * 文本停留时长必须满足每块文本独立 $\ge 4.5\text{ 字/秒}$ 的生理阅读时限（`TEXT_DWELL`）。

---

## 2. 当前已交付落地的核心动效

当前工具包内置了 **9 种通用图元预设动效** 与 **4 类专业组件专属动效**，所有参数与类型均受编译层 `lib/props.js` 与 `lib/presets.js` 强校验。

### 2.1 通用动效预设字典（9 种）

```javascript
// 缓动函数（三次平滑减速）：eo(p) = 1 - (1 - p)^3
const PRE = {
  // --- 入场预设 (Enter) ---
  rise:     p => ({ op: p, ty: (1 - p) * 48 }),
  fade:     p => ({ op: p }),
  scale:    p => ({ op: p, sc: 0.9 + 0.1 * p }),
  popLeft:  p => ({ op: p, tx: (1 - p) * -40 }),
  grow:     p => ({ op: p, sx: p }),

  // --- 强调预设 (Emphasis) ---
  pulse:    p => ({ sc: 1 + 0.06 * Math.sin(p * Math.PI) }),
  highlight:p => ({ br: 1 + 0.35 * Math.sin(p * Math.PI) }),

  // --- 退场预设 (Exit) ---
  fadeOut:  p => ({ op: 1 - p }),
  sink:     p => ({ op: 1 - p, ty: p * 30 })
};
```

#### 详细参数规格表

| 预设标识 | 动效分类 | 默认时长 | 视觉变换数学描述 | 适用图元与典型场景 |
| :--- | :--- | :--- | :--- | :--- |
| **`rise`** | 入场 | 0.6s | $\text{ty}: 48 \to 0\text{px}, \text{op}: 0 \to 1$ | **正文文本、列表卡片**。最通用的经典 MG 上浮微弹入场。 |
| **`fade`** | 入场 | 0.5s | $\text{op}: 0 \to 1$ | **背景底板、免责声明、波形画布**。需要沉静自然显现、避免视觉跳跃的元素。 |
| **`scale`** | 入场 | 0.6s | $\text{scale}: 0.9 \to 1.0, \text{op}: 0 \to 1$ | **主标题、徽标、重点结论**。具有从视线深处向前聚焦推入的人性化质感。 |
| **`popLeft`**| 入场 | 0.6s | $\text{tx}: -40 \to 0\text{px}, \text{op}: 0 \to 1$ | **副标题、左对齐信息标签**。从左向右轻快滑入。 |
| **`grow`** | 入场 | 0.7s | $\text{scaleX}: 0 \to 1, \text{op}: 0 \to 1$ | **标题装饰分割条、进度条**。配合中心锚点（`center center`）实现由内向外展开。 |
| **`pulse`** | 强调 | 0.5s | $\text{scale}: 1.0 \to 1.06 \to 1.0$（半正弦） | **心血管重点、生理报警、核心关键词**。模拟搏动感，轻微微颤放大。 |
| **`highlight`**| 强调 | 0.6s | $\text{brightness}: 1.0 \to 1.35 \to 1.0$（半正弦）| **数据突破值、药物名称、关键病灶**。如闪光灯掠过般瞬间提亮发光。 |
| **`fadeOut`**| 退场 | 0.4s | $\text{op}: 1 \to 0$ | **全场景通用退场**。平稳原地淡出。 |
| **`sink`** | 退场 | 0.4s | $\text{ty}: 0 \to 30\text{px}, \text{op}: 1 \to 0$ | **卡片下沉退场**。向下微沉并渐渐消失。 |

---

### 2.2 专业组件专属动态效果（4 类）

除通用图元补间外，`mg-studio` 将高难度动态逻辑内聚在组件内部，通过外部参数声明即可调动高精动画：

#### 1. ECG 生理波形动效（`waveform` 组件）
* **扫描线游标与揭示（Scanline Reveal）**：
  * 画布采用动态矩形裁切（`ctx.clip(0, 0, width * p, height)`），扫描游标以呼吸节奏从左至右扫描揭开波形，模拟临床心电监护仪电子束偏转。
* **荧光余辉衰减（Phosphor Decay）与连续走纸（Scroll）**：
  * 扫描线头部高亮显色，尾迹呈现柔和灰蓝渐暗网格；通过 `scroll` 因子实现连续平滑相位位移，避免心电波形静态呆滞。
* **心律失常紊乱演化（VFib / AFib Turbulence）**：
  * 内置基于 5 高斯核的极限环正常心电模型与 4 阶高频混沌正弦室颤模型：
    $$\text{ecg}(t) = (1 - \text{vf}) \cdot \text{normalBeat}(u) + \text{vf} \cdot \text{vfWave}(u, t)$$
  * 参数 `vf: 0 \to 1` 可平滑过渡，使绿色正常心律实时畸变为高危粉红乱波，配合报警色变色。

#### 2. 数据滚动递增动效（`stat` 组件）
* **计数生长（Counter Count-up）**：
  * 数字不只是死板文字，而是从 `0` 开始通过三次减速缓动（Ease-Out）平滑递增至目标数值（如 $0 \to 35.2$）。
  * 自动绑定 `props.decimals` 小数精度并保持等宽数字字体（`tabular-nums`），杜绝数字滚动时的横向抖动。

#### 3. 卡片瀑布流阶梯延时（`points` 组件）
* **交错入场（Stagger Waterfall）**：
  * 在多要点卡片矩阵中，通过控制各卡片 `enter.at` 步进差（例如 $0.4\text{s}, 0.75\text{s}, 1.1\text{s}$），使多张卡片依次错落弹入。
  * 搭配底层智能居中计算，单张、双张或三张卡片自动取得屏幕视觉黄金重心。

#### 4. 全自由度 3D 解剖空间变换（`three3d` 组件）
* **空间连续推演**：
  * 通过标准喂帧契约（`render_frames.js`），支持外部 Three.js 独立工程根据帧归一化时间 $p = \text{frame} / (\text{totalFrames} - 1)$ 执行相机推拉（Camera Dolly）、器官 360 度环视旋转、解剖切片渐变透明剖切，以及血管支架自膨胀物理变形。

---

### 2.3 动效调度机制：Cues 与语义进度锚点

动效强调动作（`emphasis`）可通过 `cues` 数组精确绑定触发时机，彻底解决传统工具“配音一旦重录、动效时序全部错位”的痛点：

```json
{
  "cues": [
    { "el": "title", "action": "pulse", "at": "narration:0.5" },
    { "el": "badge", "action": "highlight", "at": "lt:2.4" }
  ]
}
```

* **`lt:sec`（场景相对秒数）**：在场景开始后绝对秒数触发。
* **`narration:r`（旁白语义锚点）**：将动效锚定在旁白进度的百分比位置（$r \in [0, 1]$）。无论后续更换本地配音（`say`）还是阿里百炼（`bailian`），抑或调整语速，动效始终精准踩在特定词句的发音瞬间。

---

## 3. 历史优秀动效实践检索（源自成熟验证项目）

深入检索母体项目 `motion-explainer-video` 以及经典全流程成片（`sicd-video` 医学科普、`qwenwork-video` 办公产品演示）的渲染底层，提炼出以下已被像素级验证、极具表现力但尚未完全标准化封装的手写动效资产：

### 3.1 文本与工作台类动效（来自 `qwenwork-video`）

1. **打字机动态输出（Typewriter Effect）**：
   * **原理**：依据输入时间段 $lt \in [t_{\text{start}}, t_{\text{end}}]$ 动态截取文本子串：
     ```javascript
     const n = Math.floor(fullText.length * seg(lt, 0.9, 2.3));
     element.textContent = fullText.slice(0, n);
     ```
   * **适用**：AI 对话生成过程、终端指令键入、病历信息录入演示。
2. **文本骨架屏生长（Skeleton Text Line Grow）**：
   * **原理**：模拟文档内容生成，多行灰度骨架占位块设置 `transform-origin: left center`，依次以 `scaleX(p)` 横向生长展开。
   * **适用**：报告自动生成、文章撰写机理展示。
3. **柱状统计图阶梯拔高（Bar Chart Grow）**：
   * **原理**：柱状容器设置 `transform-origin: bottom center`，通过 `scaleY(eo(seg(...)))` 从底部向上拔高。
   * **适用**：临床试验对比柱状图、疗效统计柱状图。
4. **旋转加载指示器（Spinning Loader）**：
   * **原理**：旋转图标基于连续时间无缝自转 `rotate((t * 360) % 360 + "deg")`，完成后平滑切为绿色勾号 `✓`。
   * **适用**：系统分析中、标本化验中、心电数据处理中。

---

### 3.2 医学机理特化动效（来自 `sicd-video`）

1. **高能电击光晕闪烁（Defibrillator Shock Flash）**：
   * **原理**：在除颤瞬间（如 $4.4\text{s} \sim 5.0\text{s}$），利用半正弦曲线驱动外发光阴影与视口微高光：
     ```javascript
     const f = Math.sin(seg(lt, 4.4, 5.0) * Math.PI);
     monitorEl.style.boxShadow = `0 0 ${80 + 120 * f}px rgba(255, 220, 150, ${0.3 + 0.5 * f}), 0 30px 80px rgba(0,0,0,.5)`;
     ```
   * **适用**：体外除颤、消融脉冲释放、激光治疗瞬间。
2. **导线与病灶轮廓动态加粗（Stroke-Width Pulse & Path Glow）**：
   * **原理**：动态插值 SVG 路径的 `stroke-width`（如 $7 \to 11\text{px}$）与不透明度，使皮下植入电极从暗淡变为荧光高亮。
   * **适用**：介入导管入路追踪、血管走行动画、神经传导高亮。
3. **禁用路径淡出与红叉封锁（Path Disabling & Crossed-Out Sign）**：
   * **原理**：传统血管入路路径平滑淡出，同时其上层弹出一个微缩放红圈斜杠禁行图标（`scale(0.9 -> 1.0)`）。
   * **适用**：对比说明“不进入心脏或静脉血管，避免血管损伤”。
4. **卡片微动悬浮呼吸（Continuous Floating Breathing）**：
   * **原理**：当卡片入场完成后，叠加低频微幅正弦浮动，打破死板静止：
     ```javascript
     const fl = Math.sin(t * 1.3 + index * 2.1) * 6 * enterProgress;
     cardEl.style.transform = `translateY(${(1 - p) * 60 + fl}px)`;
     ```
   * **适用**：多卡片并排展示时，让画面始终具有活体呼吸感。
5. **多阶段状态机步进（Multi-stage Phase Stepper）**：
   * **原理**：“监测中” $\to$ “识别到室颤” $\to$ “自动放电除颤” $\to$ “恢复正常心律”，状态胶囊徽标随阶段切换文本、背景色与指示色。
   * **适用**：术前评估 $\to$ 术中植入 $\to$ 术后恢复等完整临床路径展示。

---

## 4. 标准 MG 与医学特化候选动效库（Candidate Repertoire）

为支撑未来 M5+ 阶段更加丰富的医学与产品分镜，现建立以下候选动效储备库：

### 4.1 动态文字排版类（Kinetic Typography Candidates）

| 候选动效名称 | 视觉表现 | 物理/数学实现方案 | 建议命名 |
| :--- | :--- | :--- | :--- |
| **逐字阶梯跳动 (Letter Stagger)** | 词组中的每个字依次弹起并回落 | 拆分 `span`，按字符索引 $i \times 0.05\text{s}$ 递增延时执行 `rise` | `enter: "staggerLetters"` |
| **老虎机滚动翻牌 (Slot Machine Roll)** | 数字或词条从下方向上轮转替换 | 多行容器 `overflow: hidden`，基于行高步进做 `translateY` 切换 | `emphasis: "textFlip"` |
| **马克笔荧光涂抹 (Highlighter Wipe)** | 文本背景像马克笔划线一般横向刷出 | 背景层伪元素 `scaleX(0 -> 1)`，`transform-origin: left` | `emphasis: "markerWipe"` |
| **震颤报警抖动 (Wiggle / Shake)** | 文本或红框高频左右抖动 | $\text{tx} = A \cdot \sin(\omega t) \cdot \exp(-\lambda t)$ 衰减振动 | `emphasis: "shake"` |

---

### 4.2 矢量与路径动态类（Vector & Path Drawing Candidates）

| 候选动效名称 | 视觉表现 | 物理/数学实现方案 | 建议命名 |
| :--- | :--- | :--- | :--- |
| **路径光迹描摹 (SVG Path Draw)** | 线条像画笔一样沿着复杂几何实时绘制 | 计算 SVG 路径全长 $L = \text{path.getTotalLength()}$，动态驱动 `strokeDashoffset = L * (1 - p)` | `enter: "drawPath"` |
| **管线流动脉冲 (Traveling Flow Dot)** | 光点或箭头沿着血管/管线匀速流动 | 依据 SVG 路径的 `getPointAtLength(p * L)` 实时计算粒子 $(x, y)$ 坐标 | `emphasis: "flowDot"` |
| **形状拓扑平滑变形 (Morphing)** | 一个几何图标无缝平滑变成另一个图标 | 锁定相同顶点数的 SVG `<path d="...">`，对控制点执行三次贝塞尔插值 | `layout: "morph"` |
| **环形进度展开 (Circle Fill)** | 环形仪表盘或圆环图沿顺时针画圆展开 | SVG 圆形 `stroke-dasharray` 配合旋转矩阵变换 | `enter: "circleReveal"` |

---

### 4.3 严肃医学机理特化动效（Specialized Medical Dynamics）

| 候选动效名称 | 临床机理与视觉表现 | 实现方案建议 |
| :--- | :--- | :--- |
| **红细胞层流粒子 (Laminar Blood Flow)** | 模拟红细胞在微血管与大动脉内的非牛顿流体层流，中央流速快、贴壁流速慢 | Canvas 2D 粒子系统，抛物线速度场 $v(r) = v_{\max}(1 - r^2/R^2)$ 帧驱动步进更新 |
| **心肌动作电位传导 (Purkinje Wave)** | 窦房结发卡放电，电信号沿房室束向心室呈树状网脉冲扩散 | SVG 树状路径组合 `strokeDashoffset` 级联触发 + 组织局部发光 |
| **冠脉支架自膨胀释放 (Stent Deployment)** | 导管球囊到位后，金属网眼沿径向向外扩张撑开狭窄斑块 | 2D/3D 参数化网状网格径向膨胀变形（配合 Three.js 或 Canvas Path） |
| **药物靶向对接锁定 (Ligand-Receptor Docking)** | 小分子抑制剂旋转靠近受体活性口袋，契合瞬间发生键合光效 | 刚体轨迹插值 + 命中瞬间触发 `pulse` 与粒子吸附 |
| **细胞凋亡与膜裂解 (Apoptosis / Lysis)** | 病变细胞膜表面起泡（Blebbing），随后裂解为小碎片淡出 | 顶点着色器扰动或 Canvas 多边形噪声形变后破碎淡化 |

---

## 5. 动效扩展开发规范

当需要在未来版本中扩充预设库时，必须严格遵守以下研发纪律：

### 5.1 新增通用预设步骤（以 `enter: "popRight"` 为例）

1. **在 `lib/presets.js` 中注册数学模型**：
   ```javascript
   // 1. 加入名字列表
   const ENTER_PRESETS = ['rise', 'fade', 'scale', 'popLeft', 'grow', 'popRight'];
   // 2. 赋予默认时长
   const PRESET_DEFAULT_DUR = { ..., popRight: 0.6 };
   // 3. 在 PRE_RUNTIME 中加入纯函数（p 已经过 cubic ease-out 缓动）
   popRight: p => ({ op: p, tx: (1 - p) * 40 }),
   ```
2. **在 `lib/compile.js` 中补齐校验白名单**：
   编译器会自动核对分镜 JSON 中的预设名，若拼写错误直接在编译期报错阻断。
3. **编写单元测试**：
   在 `tests/presets.test.js` 中补充断言：
   * 当 $p = 0$ 时，初始偏移与透明度是否正确；
   * 当 $p = 1$ 时，$\text{tx} \equiv 0$ 且 $\text{op} \equiv 1$（保证动效结束时彻底回归恒等态）。
4. **动效 Lint 回归**：
   确保新动效位移不会导致合法元素瞬时穿透画布或压迫底部字幕区。

### 5.2 性能与安全守卫

* **禁止 layout 触发**：
  动效纯函数只允许输出 `tx`, `ty`, `sc`, `sx`, `op`, `br` 字段，这些属性在现代渲染器中均由 GPU 负责变换，不会触发耗时的 DOM 重新重排（Reflow）。
* **同屏并发控制**：
  单场景内入场时间重叠的运动元素数量不得超过 6 个（由 `motion-lint.js` 中的 `DENSITY` 规则监测警告），避免无头 Chrome 在帧离线光栅化时因瞬时复杂度过高掉帧。

---

## 6. 动效速查与属性字典（Reference Matrix）

| 动效名称 | 触发分类 | 声明语法示例 | 作用属性 | 视觉效果一句话概述 |
| :--- | :--- | :--- | :--- | :--- |
| `rise` | `enter` | `{"preset": "rise", "dur": 0.6}` | `translateY`, `opacity` | 从下方 48px 平滑浮起并淡入 |
| `fade` | `enter` | `{"preset": "fade", "dur": 0.5}` | `opacity` | 原地透明度渐现 |
| `scale` | `enter` | `{"preset": "scale", "dur": 0.6}` | `scale`, `opacity` | 从 0.9 弹性微缩放推进聚焦 |
| `popLeft` | `enter` | `{"preset": "popLeft", "dur": 0.6}` | `translateX`, `opacity` | 从左侧 -40px 弹跳滑入 |
| `grow` | `enter` | `{"preset": "grow", "dur": 0.7}` | `scaleX`, `opacity` | 从中心向两侧水平拉伸展开 |
| `pulse` | `emphasis` | `{"action": "pulse", "at": "narration:0.5"}` | `scale` | 模拟心跳微颤放大 6% 后复原 |
| `highlight`| `emphasis` | `{"action": "highlight", "at": "lt:1.8"}` | `filter: brightness` | 瞬时高光提亮 35% 后恢复 |
| `fadeOut` | `exit` | `{"preset": "fadeOut", "dur": 0.4}` | `opacity` | 原地平滑淡出消失 |
| `sink` | `exit` | `{"preset": "sink", "dur": 0.4}` | `translateY`, `opacity` | 向下沉降 30px 并渐隐 |
| `counter` | 组件内置 | `props: {"value": 35.2, "decimals": 1}` | `textContent` | 数字从 0 实时平滑递增滚动 |
| `ecgScan` | 组件内置 | `props: {"vf": 0, "scroll": 0.6}` | Canvas Path & Clip | 心电扫描线平移揭示与余辉 |
| `ecgVFib` | 组件内置 | `props: {"vf": 1}` | Canvas Path | 正常心电变异为室颤紊乱波 |
| `three3d` | 组件内置 | `props: {"threeProject": "./path"}` | WebGL Frame | 外部 3D 相机推拉与多维空间变换 |

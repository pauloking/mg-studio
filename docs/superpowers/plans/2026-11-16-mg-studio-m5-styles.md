# M5 实现计划：MG 视觉与动效风格系统（Styles & Themes）

> 目标：终结“所有视频都长同一个深蓝暗调样”的单一呆板问题，建立可插拔的 MG Style（风格套件）体系，解耦背景与组件材质，提供首批开箱即用的专业预设风格，并支持动效缓动增强。

---

## 1. 背景与问题定义

当前 `mg-studio` 生成的所有视频具有强烈的“千篇一律”感：
1. **背景 Canvas 强制写死**：在 `lib/emit.js` 的 `drawBG(t)` 中硬编码了深海蓝渐变、80px 蓝紫网格线、固定位置的两个径向渐变光晕及正弦浮动尘埃光点，无视 `tokens.colors.bg`。
2. **卡片材质与边框硬编码**：`points.js` 的卡片背景写死为 `rgba(18,25,52,.94)`（深暗蓝），边框与阴影无法自适应浅色或平面风格。
3. **动效缓动曲线单一**：仅有单一的三次减速曲线（`eo`），缺乏弹性回弹（Spring/Overshoot）等活力动效。
4. **缺少 Style 概念**：工程中只有单独散落的颜色 hex，没有一键切换整体视觉调性的设计风格包。

---

## 2. 总体架构设计

### 2.1 风格套件定义（Design Theme Preset）

每个 Style 是一个独立的 JSON 规范文件，存放在 `templates/styles/<name>.json`：
1. **色彩系统（Colors）**：包含 `bg`, `ink`, `muted`, `accent`, `accent2`, `surface`, `border` 等。
2. **背景策略（Background Strategy）**：`bgType` 指定背景绘制器（`grid-tech`, `clean-light`, `warm-editorial`, `swiss-modern`, `solid`）。
3. **排版字体（Font & Typography）**：适合该风格的字体族与字阶。
4. **表面材质（Surfaces & Cards）**：卡片背景、边框粗细、圆角大小（`cardRadius`）、阴影参数（`cardShadow`）。
5. **字幕与免责样式（Subtitle & Disclaimer）**：适配明暗背景的字幕面板配色。

### 2.2 三级级联深合并（Cascade Merge）

```
[templates/tokens.default.json]
             │
             ▼ (深合并)
[templates/styles/<style>.json] （若用户声明了 style）
             │
             ▼ (深合并)
[用户自定义 tokens.json]
```

* **无感知兼容**：用户若不声明 `style`，默认自动采纳 `deep-tech` 风格，产物与 M1~M4 保持 100% 像素与字节等价。
* **声明生效**：在 `story.json` 的 `meta.style` 或 `tokens.json` 的 `style` 中声明（如 `"style": "clean-medical"`），即刻生效。

---

## 3. 首批预设风格矩阵

| 风格标识 | 命名 | 适用场景 | 背景策略 | 卡片材质 | 核心色调 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`deep-tech`** | 深邃科技 | 前沿科技、数字系统、极客演示 | 深蓝黑渐变 + 网格 + 悬浮尘埃 + 径向光晕 | 暗蓝半透玻璃拟态 + 高亮冷蓝细边框 | 冷白字、荧光紫、电光青 |
| **`clean-medical`** | 清爽医疗 | 临床手术机理、患者科普、药械演示 | 柔和白/浅灰蓝渐变 + 微细微蓝点阵 (Dot Grid) + 柔和呼吸环境光 | 纯白卡片 + 柔和半透漫反射浅阴影 + 浅蓝灰边框 | 深青黑字、临床湖蓝、珊瑚红 |
| **`warm-editorial`** | 人文典雅 | 医学史话、深度纪录、温和长者关怀 | 暖米羊皮纸色 + 纸张微噪点质感 + 柔和暖光晕 | 象牙白质感大圆角底板 + 无生硬发光边框 | 经典衬线体、赤陶红、深炭灰 |
| **`swiss-modern`** | 瑞士现代 | 年轻化科普、高冲击力产品演示 | 纯净高对比冷灰/纯白 + 极简边框装饰 | 纯平几何色块 + 纯黑硬朗描边 (Neo-brutalism) | 纯黑粗字、明黄、克莱因蓝 |

---

## 4. 落地任务清单

- [x] **Task 1: 建立预设风格包目录**
  * 在 `mg-studio/templates/styles/` 创建 `deep-tech.json`, `clean-medical.json`, `warm-editorial.json`, `swiss-modern.json`。
- [x] **Task 2: IR v2 加载层与校验升级 (`lib/ir.js`)**
  * 注册合法风格白名单 `STYLES = ['deep-tech', 'clean-medical', 'warm-editorial', 'swiss-modern']`。
  * `loadProject` 实现三级深合并逻辑。
  * `validateStory` 校验 `meta.style`；`validateTokens` 校验 `tokens.style` 与 `tokens.bgType`。
- [x] **Task 3: 渲染发射层解耦 (`lib/emit.js`)**
  * 解耦 `drawBG(t)` 为支持 `grid-tech`, `clean-light`, `warm-editorial`, `swiss-modern`, `solid` 的多模式渲染器。
  * 扩充 `:root` CSS 变量（`--surface`, `--border`, `--card-shadow`, `--card-radius`, `--title-bar`, `--subtitle-bg`, `--subtitle-color` 等）。
- [x] **Task 4: 组件层材质 CSS 变量化 (`lib/components/`)**
  * `points.js`：卡片背景、边框、阴影、圆角采用 CSS 变量；`boxes` 对比度计算读取 `tokens.colors.surface`。
  * `title-card.js`：装饰条支持 `--title-bar`。
  * `stat.js` / `waveform.js`：网格与数字颜色与主题深度联动。
- [x] **Task 5: 动效缓动增强 (`lib/presets.js`)**
  * 引入 `overshoot` / `spring` 弹性缓动曲线。
- [x] **Task 6: 编写单元测试与集成测试 (`tests/styles.test.js`)**
  * 测试风格加载、深合并、浅色模式对比度、背景策略生成。
  * 保证全量 174 项既有测试 100% 保持通过，新增 10 项测试全部通过（共 184 项）。
- [x] **Task 7: 建立测试样例并验证端到端出片**
  * 创建 `tests/fixtures/mini-style-medical/` 验证浅色医疗风格端到端成片。
- [x] **Task 8: 文档更新与 PR 交付**
  * 更新 `README.md` 与 `mg-studio/README.md`。
  * 提交 GitHub PR 并通过 CI 自动化测试。

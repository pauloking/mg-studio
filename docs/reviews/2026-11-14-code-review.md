# mg-studio 代码评估（M1 交付后 / 2026-11-14）

- **评估对象**：`main` @ `f9a9cb6`（20 个 commit，2026-11-13 ～ 11-14）
- **评估范围**：`mg-studio/lib/`、`mg-studio/scripts/`、`mg-studio/tests/`、设计文档与 README
- **不在范围**：社区/生态/商业化（仓库为 private），渲染核的上游来源（不在仓库内，无法核验）
- **评估方式**：源码逐文件阅读 + 本机实跑（`npm test`、真实夹具编译、headless Chrome 实测 DOM 盒、shell 展开验证）

---

## 0. 结论摘要

M1 编译核的工程质量明显高于同类个人项目：确定性渲染（纯帧号驱动、禁读墙钟）、契约级测试（浏览器内断言 computed style 与 `transform` 归零）、像素回归配"校准守卫"锁死容差——这三件事做对，才有"可复现出片"这个立身之本。

**主要风险不在架构，而在"质量门"的可信度**：

1. 两条 P0 是**文本进解释器**的问题：组件 `x/y` 坐标裸奔进生成的 JS 字符串字面量；旁白文本裸奔进 `execSync` 的 shell 字符串。
2. 动效 lint 守的是"作者视线里最贵的那三件事"（不压字幕、字要看清、有对比度），但它用的**包围盒是硬编码估算**、**对比度查的是错的颜色**、**停顿时长口径会把片子往慢里逼**——门在，但守不准。
3. 设计文档承诺的医学安全门（`verified:false` 阻断、免责声明注入、绝对化词表、术语密度）在代码里**一条都没有**；`audience: "patient"` 目前只是元数据。对"医学科普"这一明确内容边界，这是合规风险而非功能缺失。

| 维度 | 评价 |
| --- | --- |
| 架构分层 | 好。IR 校验 / 编译 / 冻结渲染核职责清晰，v1 直通兼容干净 |
| 确定性设计 | 好。帧号驱动 + smoke/range/单场景三模式，可局部重渲、可单帧调试 |
| 测试质量 | 好。真断言、非快照；容差守卫是亮点 |
| 编译期质量门 | 待加固。思路对，判据不准（估算盒 / 错色 / 口径） |
| 输入安全 | 不足。props 与旁白文本未经转义/校验即进入 JS 与 shell |
| 可复现性 | 部分。零依赖哲学好，但依赖口头声明、无 CI、无 lockfile、渲染核"字节级冻结"外部不可验 |
| 发布就绪度 | 不足。无 LICENSE、无 CI、固定端口、个人绝对路径入库 |

**定位判断**：作为"个人/小团队 + Agent 驱动出片"的内部工具，M1 已可投入真实生产；作为对外开源项目或面向患者的医学科普产品，还差一轮"安全门 + 可复现声明"的加固。

---

## 1. 值得肯定的地方

1. **分层真正落地**。`lib/` 只做翻译（IR → `script.json` + `scene.html`），`scripts/` 管管道，渲染核"字节级冻结"不随身改动。新层包住已验证资产，而不是推倒重写——这是这类项目最容易做错的一步，这里做对了。
2. **确定性是设计出来的，不是碰巧的**。动画进度完全由帧号计算，`window.__frame(i)` 喂帧，因此天然支持 smoke（抽帧目检）/ range（局部重渲）/ 单场景（`?scene=<id>`）三种模式。这是"同输入必同输出"的根因，也是后续增量渲染的地基。
3. **测试是真测试**。断言的是浏览器里 `getComputedStyle` 的渐入曲线、入场结束 `transform === 'none'`（把"旋转切静态残留"这个老坑固化成回归）、B 级错误时**不写任何文件**、`scene.html` 契约关键字齐全。像素回归还专门写了纯函数"校准守卫"锁死 `MAX_DELTA=16`（13<16<18 的 gap 论证），防止后人悄悄放宽容差——这个细节是专业度分水岭。
4. **"把踩过的坑变成机器检查"思路对**，5 条规则（字幕区 / 文字停留 / 对比度 / 密度 / 越界）都选在真实事故点上。
5. **零依赖部署**：无 `node_modules`，靠系统 Chrome + ffmpeg，换目录即可出片。
6. **文档诚实**：主动列 M2 backlog、主动标注"人工兜底"。

---

## 2. 问题清单

### P0-1　组件 props 坐标未校验 → 生成代码被打断 + 静默错渲染

**位置**：`lib/compile.js:10-42`（`normalizeScene` 只校验了 `stat.value` 与 `waveform` 的 x/y/w/h）、`lib/components/points.js:19`、`lib/components/stat.js:17`

```js
// points.js / stat.js：未校验的值直接拼进生成的 JS 字符串字面量
`${v}.style.left='${x}px';`
```

**复现 A（代码越狱）**：`props.x = "0';window.__PWN=1;'"`

```
$ node scripts/compile.js <proj>
compile OK → ...
$ grep "e0.style.left" scene.html
e0.style.left='0';window.__PWN=1;'px'
```

`compile` 全绿，`scene.html` 里出现可执行语句 —— `lib/escape.js` 的"防 script breakout"承诺在这条路径上没有覆盖。

**复现 B（静默错渲染，更现实）**：`props.x = "130px"`

```
e0.style.left='130pxpx'
```

布局静默错掉，且 `SCREEN_BOUNDS` 拿 `"130px" + 520 > 1920` 走字符串比较返回 `false`，**五条门全部放行**。LLM 或人写顺手带单位是很常见的输入。

**影响**：门给出虚假通过；错误延迟到成片才暴露；作者文本可执行。

---

### P0-2　脚本层把作者文本拼进 shell → 命令替换可执行

**位置**：`scripts/tts.js:37-45`、`scripts/build_timeline.js:22`（均 `execSync("<字符串拼接>")`），`scripts/compile.js` 之外的 v1 路径同样是字符串拼接

```js
execSync(`say -v ${voice} ${rate} -o "${aiff}" ${JSON.stringify(sc.narration)}`);
```

`JSON.stringify` 保证的是 **JSON** 转义，不是 **shell** 转义：`$`、反引号、`\` 都不处理。

**复现**：旁白含 `$(touch /tmp/PWNED)` → bash 展开后命令被执行（实测文件被创建）。

**影响**：本工具包的明确用途是"Agent 生成 `story.json` → 出片"，即**旁白文本来自模型**。"模型顺手写了一句话导致执行了命令"不是恶意攻击场景，而是事故场景（例如教学片里引用一条命令、或引号嵌套的术语）。

---

### P1-1　动效 lint 的包围盒是硬编码估算（门可以被打穿）

**位置**：`lib/components/points.js:24-27`（恒返回 `h: 260`）、`lib/components/stat.js:25-28`（恒返回 `h: 280`）、`lib/components/title-card.js:27-31`（固定 y/w/h）

卡片真实高度随文案行数变化。实测同一张卡（1920×1080，`.pt-card` 宽 520）：

| 文案长度 | lint 认为的盒底 | 实测 DOM 盒底 |
| --- | --- | --- |
| 标题 6 字 + 说明 1 行 | 860 | 822 |
| 标题 6 字 + 说明 53 字（3 行） | 860 | **957** |

复现场景：`y=600` + 3 行说明 + `minSec=16`（刚好过 `TEXT_DWELL`）→ `compile OK`，仅 `[W] NEAR_SUBTITLE`（认为盒底 860），而字幕条顶在 **922**、卡片实际盒底 **957** —— **成片里卡片压住了字幕条**。

**影响**：README 把 lint 当核心卖点，而它守的正是它测不准的那个量。P0-1、P1-2、P1-3 三个问题同源：`boxes()` 是相对 DOM 的"第二份真相"。

---

### P1-2　`TEXT_DWELL` 口径不合理，会逼作者灌 `minSec` 把片子拖慢

**位置**：`lib/motion-lint.js:26`

```js
const need = Math.max(b.text.length * 0.28, 1.2);   // 0.28s/字 ≈ 3.57 字/秒
```

且 `points`/`title-card` 把**标题与说明合并成一段**计算：`text: (title||'') + (desc||'')`。

- 96 字卡片 → 需要 **26.9 s** 停留（直接阻断）
- 53 字卡片 → 需要 **14.8 s**

结果必然是把 `minSec` 调到 16、20 去"骗过"门，而成片节奏被拖垮（时间轴还有 `pad 1.1s`、首场景最小 6.5 s、末场景最小 8.5 s）。这个门优化了"不要一闪而过"，代价是"必然太慢"。

**附带问题**：判据用的是编译期估算时长（`字数/4.5 + 1.1`），而真实时长由 **TTS 实测音频** + `build_timeline` 的 `pad`/`intro`/`outro` 决定 —— 门站错了阶段，两侧都会误判。

---

### P1-3　对比度门查的颜色不是实际渲染色

**位置**：`lib/components/stat.js:25-28`、`lib/components/points.js:24-27`

- `stat`: label 标 `colorKey: 'accent2'`，但 `.st-label` 的 CSS 是 `var(--muted)`；而真正最显眼的 160px 大数字（运行期写入）**完全不参与检查**。
- `points`: `desc` 实际是 `var(--muted)`，按 `ink` 检查。
- 卡片背景 `rgba(18,25,52,.94)` 叠在 `bg` 上，检查时只对 `bg` 算 → 深色卡片上的深色文字会被误判为合格。

---

### P1-4　字幕计时"按行数均分"，不看字数

**位置**：`scripts/build_timeline.js:43-47`

```js
from: winFrom + span * k / arr.length,
to:   winFrom + span * (k + 1) / arr.length
```

18 字的长行与 2 字的短行分到同样时长。项目主打"字幕画进帧里零错字"，但读起来会明显赶/拖。按字数加权分配 `span` 即可。

---

### P1-5　设计文档承诺的医学安全门，代码里一条都没有

**承诺处**：`docs/superpowers/specs/...-design.md` §5.1、§6（lint_story B 级）、§10、§227
**实际**：`lib/ir.js:32` 只检查 `facts[].verified` 是不是布尔；`meta.audience` 除枚举校验外再未被读过一次。

实测 `audience: "patient"` + `facts[].verified: false` 的项目 → `compile OK`。

未实现项：
- 患者向存在 `verified:false` 的 fact → B 阻断
- outro 免责声明"本视频为健康科普，不构成诊疗建议"编译期注入 + 渲染期 DOM 检查
- 绝对化疗效词表（根治/百分百/最好）B 级
- 术语密度 / 通俗语言 lint

**影响**：README"医学内容纪律"一段读起来像有机器门，实际全靠人。对面向患者的内容这是合规风险。

---

### P2　工程与可复现面

| 项 | 位置 | 说明 |
| --- | --- | --- |
| 固定端口 8742 | `scripts/render.js:33` | 支持 `RENDER_PORT` 但测试未设、无重试。端口被占 → 4 个 e2e 全红，报错只有 `EADDRINUSE`（本次评估实测踩到，改 `RENDER_PORT=8799` 才 62/62 通过） |
| 依赖口头声明 | `mg-studio/package.json` | `dependencies` 为空、无 `engines`、无 lockfile；playwright/Chrome/ffmpeg/python3+PIL 全靠 README 口头约定 |
| 个人绝对路径入库 | `tests/regression/run.sh:9` | 缺省值是 `/Users/wangguoyang/Documents/Qoder/...`，泄露本机目录结构（`MG_REGRESSION_SRC` 可覆盖，这点做得好） |
| "字节级冻结"不可外部验证 | `scripts/` | 基线旧片素材不在仓库，也无 `cmp`/哈希清单脚本（注释提到的 `task-9-report.md` 不在库内） |
| 无 LICENSE / 无 CI | 仓库根 | 私有仓库可理解，但决定能否复用、交接、给外部跑 |
| 编译产物未 ignore | `.gitignore` | 只排了 `frames/ out/ vo/`；`script.json` / `scene.html` 编译后会被 git 看见（注意 `mini-v1` fixture 需要跟踪这两个文件，处理时要小心） |
| 静态服越权判断 | `scripts/render.js:41` | `f.startsWith(ROOT)` 前缀判断（应 `path.resolve` + `path.sep`），只绑 127.0.0.1，实际风险低 |
| v1 路径无校验 | `scripts/build_timeline.js:22` | `scene.id` 未经 IR 校验即进 `ffprobe` 命令串 |

---

### P3　文档与结构细节

- `scripts/make.sh` 头部注释仍是 `motion-video-toolkit`，用法说明只提 `script.json + scene.html`，与 v2 现状脱节。
- 仓库名 `mg-studio`，本体又套在 `mg-studio/`，路径读作 `mg-studio/mg-studio/lib/...`。
- 1.8k 行 TDD 实现计划入库，作为协作痕迹可以保留，但对外阅读噪声大（核心信息在 260 行设计文档里）。

---

## 3. 修复优先级（本次 PR 覆盖 1～5）

| # | 动作 | 对应问题 | 量级 |
| --- | --- | --- | --- |
| 1 | 组件 props schema 校验；生成代码用 `JSON.stringify` 而非模板拼接 | P0-1 | 小 |
| 2 | 全仓 `execSync(字符串)` → `execFileSync(命令, 参数数组)`；`BAILIAN_CALLER_*` 走 env | P0-2 | 小 |
| 3 | 新增"编译后门"：用真实 DOM 量盒 + 实测时长跑同一套 lint | P1-1 / P1-2 后半 | 中 |
| 4 | `TEXT_DWELL` 按文本块独立计、语速 4.5 字/秒；对比度按真实渲染色与卡片合成底色 | P1-2 / P1-3 | 小 |
| 5 | 渲染端口改临时端口、`engines`/`peerDependencies`、CI、去个人路径 | P2 | 小 |
| 6 | 医学门四条（verified / 免责声明 / 绝对化词表 / 术语密度） | P1-5 | 中，建议独立 PR |
| 7 | 字幕按字数加权分配时长 | P1-4 | 小，独立 PR |
| 8 | LICENSE、编译产物 ignore 策略、`make.sh` 注释、目录嵌套 | P2 / P3 | 小 |

---

## 4. 复现命令

```bash
git clone https://github.com/pauloking/mg-studio && cd mg-studio/mg-studio

# 基线（注意：默认端口被占时 4 个 e2e 会 EADDRINUSE 失败）
RENDER_PORT=8799 npm test          # 62/62 通过，约 290s

# P0-1：坐标越狱
mkdir -p /tmp/p/scenes && cat > /tmp/p/story.json <<'EOF'
{"schema":2,"meta":{"title":"t","audience":"general","template":"science","durationTarget":20},
 "beats":[{"id":"a","role":"hook","emotion":3,"intent":"x","narration":"第一句。","facts":[]}]}
EOF
cat > /tmp/p/scenes/a.json <<'EOF'
{"id":"a","beat":"a","layout":"points","minSec":6,
 "elements":[{"id":"c1","type":"card","props":{"title":"标题","desc":"说明","x":"0';window.__PWN=1;'","y":420}}]}
EOF
node scripts/compile.js /tmp/p && grep -o "left='0';window.__PWN=1;'px'" /tmp/p/scene.html   # 命中即复现

# P1-1：估算盒 vs 真实盒（需 tmux/浏览器以外的 headless Chrome）
#   y=600 + 3 行说明 → compile OK 且仅 [W] NEAR_SUBTITLE，实测卡片盒底 957 > 字幕顶 922
```

---

## 5. 一句话结论

**工程质量在线，质量门的可信度不在线。** 把"估算盒"换成"真实盒"、把"字符串拼接"换成"参数化调用"，这个工具包就从"能出片的脚本集合"变成"可交付的编译器"。

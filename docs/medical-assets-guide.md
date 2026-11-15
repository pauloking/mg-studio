# mg-studio 医学解剖与生理波形开源素材指南

> 面向严肃医学科普、临床机理展示与医疗器械演示的开源医学资产库索引、合规基准及工程管线接入规范。

---

## 1. 背景与设计原则

严肃医学内容视频（包括患者健康宣教、临床术式机理拆解、医疗器械工作原理演示）不同于一般娱乐或营销类动态图形（Motion Graphics）。医学可视化对**解剖空间关系、生理病理机制、信号波形特征**具有严苛的真实性要求。通用生成式视频模型（如 Sora、Runway）在医学领域常出现“器官畸变”、“血管连接错乱”、“心电波形物理荒谬”等严重幻觉。

`mg-studio` 采用**确定性声明式编译与代码驱动逐帧渲染架构**，天然适合与高保真医学模型和数学/临床数据源深度融合。为确保基于 `mg-studio` 产出的医学视频既具备顶级专业视效，又完全符合伦理、法律合规与开源许可纪律，特制定本素材指南。

### 核心合规与质量基准

1. **准确性与可验证性（Clinical Accuracy & Traceability）**：
   - 视频中所展示的解剖模型、病理状态和生理波形必须具备权威学术或临床数据源背书。
   - 脚本中的医学论断必须通过 `story.json` 中的 `facts[].verified: true` 审计。
2. **版权合规与商用友好（Commercial-Friendly Licensing）**：
   - 严禁从未授权的付费医学图库（如未经授权抓取商业 3D 网站）盗用模型。
   - 优先采纳 **Public Domain (CC0 / 知识共享零)** 与 **CC-BY 4.0 (知识共享署名)** 协议资源。
   - 谨慎使用 **CC-BY-SA**（相同方式共享，可能导致衍生视频被迫开源）与 **CC-NC**（非商业性使用，禁止商业化应用）。
3. **患者向宣教纪律（Patient Education Ethics）**：
   - 患者向（`audience: "patient"`）视频必须通过 `lib/medical-lint.js` 的医学安全门。
   - 凡涉及非真实患者实拍重建的模型，画面角落须标注“**示意图，非真实解剖**”。
   - 片尾必须包含标准化医疗免责声明（“本内容仅供医学科普参考，不构成具体诊疗建议”）。

---

## 2. 三维解剖与器官模型库（3D Anatomy & Organ Models）

三维解剖模型是医疗器械入路（如经股动脉经导管介入 TAVR、冠脉支架植入）与脏器病理（心肌梗死、脑卒中、肿瘤占位）展示的核心。

### 2.1 NIH 3D Print Exchange (3D.nih.gov)

* **发起机构**：美国国家卫生研究院 (National Institutes of Health, NIH) 与国家过敏和传染病研究所 (NIAID)。
* **官方入口**：[https://3d.nih.gov](https://3d.nih.gov)
* **核心资产内容**：
  * **临床解剖重建**：基于真实患者 CT / MRI 增强扫描重建的人体心脏、主动脉弓、颅脑多边形网络、骨骼关节、呼吸道树状结构。
  * **医疗设备与器械**：心血管支架、人工心脏瓣膜、起搏器电极、骨科内固定钢板、穿刺针头、微创手术导管。
  * **大分子与病原体结构**：与 PDB (Protein Data Bank) 同步的抗体、病毒衣壳、受体配体结合复合物。
* **数据格式**：STL、OBJ、glTF / GLB。
* **许可协议**：绝大多数属于 **Public Domain (美国联邦政府公有领域 / CC0)**，完全商用自由；部分用户上传项采用 **CC-BY 4.0**。
* **`mg-studio` 接入场景**：
  * 最适合在 `three3d` 组件中作为器械与器官交互动画的基底模型。

### 2.2 BodyParts3D / Anatomography (DBCLS)

* **发起机构**：日本生命科学数据库中心 (Database Center for Life Sciences, DBCLS)。
* **官方入口**：[https://lifesciencedb.jp/bp3d/](https://lifesciencedb.jp/bp3d/)
* **核心资产内容**：
  * **全身全解剖系统标准模型**：基于成年人体 MRI 连续切片手工高精度重建的完整人体解剖图谱。
  * 涵盖 2,000+ 独立解剖器官部件（骨骼、骨连接、心血管全分支动脉与静脉系统、外周与中枢神经系统、脏器实质及筋膜）。
  * 每个器官均精确对应国际解剖本体论标准 **FMA (Foundational Model of Anatomy)** ID（如 FMA7088 表示心脏 Heart）。
* **数据格式**：OBJ（按 FMA ID 独立分部件打包）。
* **许可协议**：**CC-BY-SA 2.1 Japan**（衍生作品如以模型包分发需相同共享；若作为最终离线渲染视频输出，标明 DBCLS 署名即可合法合规）。
* **`mg-studio` 接入场景**：
  * 需要做全身大比例定位、多系统穿透剖切（如从皮肤到骨骼、肌肉再到深部血管）时的标准底模。

### 2.3 OpenAnatomy Project (哈佛医学院 / BWH)

* **发起机构**：Harvard Medical School, Brigham and Women's Hospital (Surgical Planning Lab)。
* **官方入口**：[https://www.openanatomy.org](https://www.openanatomy.org)
* **核心资产内容**：
  * **专为 WebGL 与浏览器 3D 打造的解剖图谱**：
    * SPL Brain Atlas（哈佛外科计划实验室大脑解剖图谱）：分叶、深部核团（基底节、丘脑、海马体）、脑干神经核高保真网格。
    * SPL Chest Atlas（胸腔图谱）：肺段、支气管树、纵隔、胸膜腔。
    * Knee Atlas（膝关节图谱）：半月板、前交叉韧带 (ACL)、后交叉韧带 (PCL)、软骨层。
  * 具备层级化解剖学元数据标签（Hierarchical Anatomy Labels JSON）。
* **数据格式**：glTF / GLB、VTK、JSON 元数据。
* **许可协议**：Open Source Academic License / CC-BY。
* **`mg-studio` 接入场景**：
  * 专为浏览器渲染设计，拓扑规范、法线干净，天然契合 `mg-studio` 的 Three.js 确定性逐帧渲染器。

### 2.4 Sketchfab 开放医学专区（筛选 CC-BY / CC0）

* **平台入口**：[https://sketchfab.com/search?type=models&licenses=322a74c4463d42b7886b6103e62f0724](https://sketchfab.com/search?type=models&licenses=322a74c4463d42b7886b6103e62f0724)（CC-BY 过滤）
* **代表性创作者与机构**：
  * 国际知名解剖学教授、大英博物馆（医学史藏品）、Scientific Animations 社区贡献者。
  * 包含高质量的心脏搏动循环骨骼动画模型、动态血管狭窄与斑块破裂三维网格。
* **下载与格式**：原作者 OBJ/FBX，平台自带自动转换的优化版 glTF/GLB。
* **许可审查注意点**：必须在搜索过滤条件中严格勾选 `Creative Commons: Attribution (CC-BY)` 或 `CC0 Public Domain`，避开默认的 `Standard` 商业授权或带 `NC` (非商用) 标签的模型。

### 2.5 3D Slicer + TCIA 临床开放影像三维重建

对于极其罕见的特殊病灶或特定临床病例（如法洛四联症、特定颅内巨大动脉瘤），公共模型库可能缺少对应现成网格。此时推荐从开放临床影像数据库自主分割提取：

* **数据来源**：**TCIA (The Cancer Imaging Archive)**（[https://www.cancerimagingarchive.net](https://www.cancerimagingarchive.net)）或 **MedPix**。
* **处理工具**：开源医学图像计算平台 **3D Slicer**（[https://www.slicer.org](https://www.slicer.org)）。
* **管线流程**：
  1. 导入匿名去标识化 DICOM 序列切片。
  2. 使用 `Segment Editor` 工具箱通过灰度阈值（Thresholding, 如骨骼 HU>200，造影剂增强血管 HU>150）与区域生长（Grow from seeds）完成目标解剖分割。
  3. 执行平滑滤镜（Surface Smoothing: Taubin filter），导出为轻量 STL / OBJ。
* **优势**：100% 真实患者临床解剖，具备最高科研级论证力，且源数据完全遵循 HIPAA 隐私去标识化标准。

---

## 3. 生理波形与信号模型（Physiological Waveforms & Signals）

生理波形（心电图 ECG、动脉血压 ABP、脉搏血氧饱和度 PPG、呼吸波 RESP）是生命状态的最直观表达。在 `mg-studio` 中，波形不仅能通过 `waveform` 组件渲染，还能与旁白节奏、心律失常报警音效、数值滚动（`stat` 组件）实现毫秒级精准联动。

### 3.1 PhysioNet / MIT-BIH Arrhythmia Database（金标准）

* **管理机构**：MIT 计算生理学实验室与 Beth Israel Deaconess 医疗中心。
* **官方入口**：[https://physionet.org/content/mitdb/1.0.0/](https://physionet.org/content/mitdb/1.0.0/)
* **核心内容**：
  * 全球生物医学工程最经典的 48 例双导联心电记录（采样率 360 Hz）。
  * 包含经两位以上心脏病学专家独立核验的逐搏心拍注释（Beat Annotation）：
    * 正常窦性心律（Normal Sinus Rhythm, NSR）
    * 心房颤动（Atrial Fibrillation, AFib）
    * 室性心动过速（Ventricular Tachycardia, VT）
    * 心室颤动（Ventricular Fibrillation, VFib）
    * 室性早搏（Premature Ventricular Contraction, PVC / PVC Couplet）
    * 左/右束支传导阻滞（LBBB / RBBB）
    * 心室起搏节律（Paced Rhythm）
* **许可协议**：Open Access (PhysioNet Credentialed/Open License / ODC-BY 1.0)。
* **在 `mg-studio` 中的落地方式**：
  * 使用 Python `wfdb` 库提取 2~5 秒典型病理片段，降采样至视频帧适配的归一化数组（如 30fps 下每秒 60 点），写入 `assets/waveforms/<condition>.json` 供组件回放。

### 3.2 PhysioNet / MIMIC-III & MIMIC-IV Waveform Database

* **管理机构**：MIT Laboratory for Computational Physiology。
* **官方入口**：[https://physionet.org/content/mimic4wdb/0.1.0/](https://physionet.org/content/mimic4wdb/0.1.0/)
* **核心内容**：
  * 真实重症监护病房（ICU）多参数监护仪全同步连续波形。
  * **联合多通道**：
    * 导联 II / V 心电波形（ECG）
    * 有创连续桡动脉/股动脉血压（Arterial Blood Pressure, ABP）
    * 指尖光电容积脉搏波（Photoplethysmogram, PPG / SpO2）
    * 阻抗胸腹呼吸波（Respiratory Waveform, RESP）
    * 呼气末二氧化碳分压波（Capnography, EtCO2）
* **临床价值**：
  * 展示“血流动力学连锁崩溃”场景（如室颤发生瞬间：心电波形变为无序正弦状乱波，同时动脉血压波形从 120/80 mmHg 瞬间跌落为水平基线，血氧脉搏波搏动消失）。

### 3.3 动力学数学合成模型（McSharry ODE 模型）

在追求零外部数据文件依赖、或需要按任意心率与心电间期动态可调渲染时，推荐采用国际公认的 **McSharry 动力学常微分方程模型**（McSharry et al., *IEEE Transactions on Biomedical Engineering*, 2003）：

#### 模型动力学方程
在极坐标平面上，极限环半径为 $r = 1$，相角以 $\dot{\theta} = \omega = 2\pi f_{\text{HR}}$ 匀速旋转。心电垂直偏转变量 $z$ 由 5 个对应 P、Q、R、S、T 特征波的高斯脉冲驱动：

$$\dot{z} = -\sum_{i \in \{P, Q, R, S, T\}} a_i \Delta \theta_i \exp\left(-\frac{\Delta \theta_i^2}{2 b_i^2}\right) - (z - z_0)$$

其中：
* $\Delta \theta_i = (\theta - \theta_i) \pmod{2\pi}$ 为当前相角与特征波极值角之差。
* $a_i$ 为波峰/波谷幅度（例如 $R$ 波取大幅正值，$Q$ 与 $S$ 波取负值）。
* $b_i$ 决定各特征波的时程宽度。
* $\theta_i$ 确定各特征波的相对发生时间相位。

#### 优势
* **纯数学计算**：仅需标准 JS / Math 库即可在每帧实时计算或编译期预生成。
* **无级平滑可调**：改变心率只需缩放角速度 $\omega$；模拟心肌缺血/急性心梗（STEMI）只需调整 $S\text{-}T$ 区段的偏置基准 $z_0$ 或 $a_T$ 幅度，不会出现波形拉伸接缝断裂。

### 3.4 NeuroKit2（Python 生理计算仿真工具箱）

* **开源代码库**：[https://github.com/neuropsychology/NeuroKit](https://github.com/neuropsychology/NeuroKit)
* **核心功能**：几行 Python 脚本即可合成带呼吸性窦性心律不齐（RSA）及可控高斯白噪声的高保真生理信号：

```python
import neurokit2 as nk
import json

# 合成 10 秒 75bpm 心率的临床心电信号
ecg = nk.ecg_simulate(duration=10, sampling_rate=100, heart_rate=75, noise=0.02)
# 归一化至 [0, 1] 区间
ecg_norm = ((ecg - ecg.min()) / (ecg.max() - ecg.min())).tolist()

with open("ecg_75bpm.json", "w") as f:
    json.dump(ecg_norm, f)
```

---

## 4. 医学矢量图元与解剖示意（Medical Vectors & Illustration Assets）

在 2D 动效分镜、信息卡片（`points` 布局）或片头开场中，清晰、专业的矢量图标能够大幅提升视觉质感，且在 1080p 及 4K 场景下保持绝对清晰、无像素锯齿。

### 4.1 Servier Medical Art (SMART)（顶级推荐）

* **出品方**：法国施维雅（Servier）实验室科研团队。
* **官方入口**：[https://smart.servier.com](https://smart.servier.com)
* **核心内容**：
  * **3,000+ 专业独立医学矢量素材**，专为科学与临床交流设计。
  * 细分大类：
    * **解剖学 (Anatomy)**：完整心血管树、单器官解剖剖面（心室瓣膜、肾脏皮质髓质、眼球截面、肺泡结构）。
    * **细胞与分子 (Cellular & Molecular)**：红细胞、巨噬细胞、T/B淋巴细胞、神经元突触、受体离子通道。
    * **生物与生化机制 (Biochemistry)**：DNA双螺旋、质粒、抗原抗体结合、信号传导通路转导。
    * **病理学 (Pathology)**：动脉粥样硬化斑块进展各阶段、血栓形成、心肌坏死、炎症浸润。
    * **医疗器械与实验仪器 (Medical & Lab Devices)**：显微镜、输液泵、离心管、注射器、手术刀具。
* **数据格式**：标准矢量 SVG、高分辨率 PNG。
* **许可协议**：**CC-BY 4.0**（完全免费商用，支持任意修改与分发，仅需在片尾致谢注明 "Images from Servier Medical Art, licensed under CC-BY 4.0"）。
* **在 `mg-studio` 中的落地方式**：
  * 将 SVG 直接内联至分镜 HTML 中，利用 CSS 变量（如 `var(--c-accent)`）控制描边与填充色，实现与 `tokens.json` 设计系统的完美调和。

### 4.2 SciDraw (scidraw.io)

* **出品方**：Champalimaud Centre for the Unknown 科学绘图社区。
* **官方入口**：[https://scidraw.io](https://scidraw.io)
* **核心内容**：由一线科研人员绘制的生命科学开源矢量库，尤其在神经科学、啮齿动物实验模型、微观神经环路图谱方面极具特色。
* **格式与许可**：SVG 格式，遵循 **CC-BY 4.0**。

### 4.3 医学视觉色彩与语义编码规范（BioRender 标准参考）

在 `mg-studio` 的 `tokens.json` 中配置医学配色方案时，应严格遵循国际通行的医学与解剖色彩语义，切勿混淆：

| 解剖/生理结构 | 推荐 Hex 色值 | 语义说明 | 典型用途 |
| :--- | :--- | :--- | :--- |
| **含氧动脉血 (Artery)** | `#E53935` / `#D32F2F` | 高饱和鲜红 | 主动脉、体循环动脉、含氧红细胞 |
| **脱氧静脉血 (Vein)** | `#1E88E5` / `#1976D2` | 清澈深天蓝 | 腔静脉、肺动脉、脱氧血液 |
| **神经组织 (Nerve)** | `#FDD835` / `#FBC02D` | 明亮亮黄 | 脑神经、交感/副交感神经干、传导束 |
| **淋巴系统 (Lymphatic)**| `#43A047` / `#2E7D32` | 清亮翠绿 | 淋巴管、淋巴结、胸导管 |
| **结缔组织与肌腱 (Tendon)** | `#ECEFF1` / `#CFD8DC` | 灰白半透珠光色 | 肌腱、心瓣膜腱索、心包膜 |
| **肌肉实质 (Muscle)** | `#8E24AA` / `#C2185B` | 深紫红 / 砖红褐 | 心肌、骨骼肌纤维束 |
| **骨骼与钙化 (Bone/Calc)**| `#FFF9C4` / `#F5F5F5` | 象牙白 / 灰米白 | 骨小梁、动脉粥样硬化钙化斑块 |
| **病灶与坏死 (Lesion/Infarct)**| `#37474F` / `#212121` | 黯黑炭灰 / 坏死暗紫 | 心肌梗死坏死区、缺血脑软化灶 |

---

## 4. 临床真实影像与文献图库（Clinical Imaging Repositories）

当视频需要展示“真实临床确诊凭据”（如冠脉造影 DSA 血管狭窄再通前后对比、胸部 CT 磨玻璃影动态切片扫描）时，需调用合规脱敏的临床影像。

### 4.1 Radiopaedia (radiopaedia.org)

* **平台性质**：全球最大的同行评审放射学合作百科与病例数据库。
* **官方入口**：[https://radiopaedia.org](https://radiopaedia.org)
* **核心资产内容**：
  * 数万例经国际放射学专家严格同行评审的完整临床病例（Case Articles）。
  * 涵盖 X 射线（X-Ray）、电子计算机断层扫描（CT 连续切片）、磁共振成像（MRI T1/T2/DWI）、血管造影（DSA 动态视频/动图）、超声心动图（Echocardiogram 电影循环）。
* **许可协议**：多数采用 **Creative Commons Attribution-NonCommercial-ShareAlike (CC-BY-NC-SA)**；部分特定公有领域合作项目提供商用授权。
* **合规指引**：商业化收费产品演示中如需使用，应选择标记为公共版权的病例，或联系作者取得商用许可；内部教学与公益科普直接引用并规范署名。

### 4.2 NLM Open-i (openi.nlm.nih.gov)

* **机构背景**：美国国家医学图书馆 (National Library of Medicine, NLM)。
* **官方入口**：[https://openi.nlm.nih.gov](https://openi.nlm.nih.gov)
* **核心资产内容**：
  * 专门索引来自 PubMed Central (PMC) 开放获取学术文献中的图表与临床多媒体影像（300 万+ 图片与视频片段）。
  * 包含术中实拍、病理切片染色（H&E 染色、免疫组化 IHC）、电镜超微结构。
* **检索与过滤**：支持通过精确布尔表达式与 License 过滤器直接筛出 **Open Access / CC-BY** 的医学影像。

---

## 5. `mg-studio` 工程化落地与接入管线规范

将外部医学素材集成至 `mg-studio` 时，必须兼顾**性能开销**（防止 headless Chrome 渲染 OOM）、**确定性逐帧回放**（防墙钟漂移）与**医学安全门审计**。

### 5.1 3D 解剖网格降面与轻量化规范

医学机构导出的原始 CT/MRI 重建模型或高精科研 OBJ 网格，顶点数通常在 50 万至 500 万面以上，文件体积可达 200MB~1GB。直接引入会导致：
* 浏览器加载内存飙升，无头 Chrome 发生 WebGL 上下文丢失或被系统 OOM 终止。
* 离线渲染每帧光栅化耗时大幅增加。

#### 生产优化标准（Blender 预处理流）
1. **重拓扑与减面 (Decimate & Retopology)**：
   - 目标：将单一解剖器官（如心脏全模型）的面数压缩至 **20,000 ~ 50,000 面**（Polygons）。
   - 保留形态特征：使用 Blender 的 `Decimate Modifier`（塌陷模式 Collapse，勾选 `Preserve Boundaries`），并在血管分支处做局部权重细分。
2. **材质与纹理烘焙 (PBR Baking)**：
   - 将复杂的次表面散射（SSS）或高精组织细节烘焙为 1 张基础贴图（Base Color）与 1 张法线贴图（Normal Map）。
   - 纹理分辨率锁定为 **1024×1024** 或至多 **2048×2048**。
3. **Draco 几何压缩导出为 `.glb`**：
   - 统一导出为二进制单文件 `.glb`。
   - 开启 Draco 网格压缩（Draco compression: level 7~10），使得单个 3D 解剖资产体积稳定在 **1MB ~ 3MB** 之间。

#### 确定性逐帧喂帧契约
集成至 `mg-studio` 的 Three.js 场景时，必须遵守 `scripts/render_three.js` 契约：
* 严禁在脚本中调用 `requestAnimationFrame`、`Date.now()`、`performance.now()`。
* 暴露标准驱动函数 `window.__seekFrame(frameIndex, totalFrames)`：

```javascript
// 确定性时间驱动示例
window.__seekFrame = function(frame, totalFrames) {
  const progress = frame / (totalFrames - 1);
  // 器官平滑旋转 45 度
  organMesh.rotation.y = progress * (Math.PI / 4);
  // 支架沿轴线展开推进
  stentMesh.scale.set(1 + progress * 0.2, 1, 1 + progress * 0.2);
  // 重新渲染画面
  renderer.render(scene, camera);
};
```

---

### 5.2 生理波形组件 (`waveform`) 数据接入

`mg-studio` 的 `waveform` 组件支持心电波形的高保真扫描揭示。接入真实波形数据时，推荐遵循两级数据形态：

1. **结构化参数形态（`scenes/<id>.json` 内联）**：
   适用于常规演示，通过内置高斯/正弦合成算法或 60 点归一化浮点数组：
   ```json
   {
     "layout": "waveform",
     "props": {
       "x": 200,
       "y": 400,
       "w": 1520,
       "h": 320,
       "color": "accent",
       "vf": false,
       "scroll": true
     }
   }
   ```
2. **高密度真实临床采样回放**：
   从 PhysioNet 提取的真实波形存储于 `assets/waveforms/mit_100_afib.json`，在编译层通过定制注入。配合荧光余辉扫描线，实现绿色（`#00E676`）正常波形平稳流淌、在心律失常发生瞬间突变为危险警示红（`#FF1744`）的视觉质感。

---

### 5.3 医学安全门合规自检清单

在执行 `npm test` 或通过 `scripts/make.sh` 编译成片前，分镜编排必须通过 `mg-studio` 内置的医学守卫规则（详见 `lib/medical-lint.js`）：

```
[医学安全自检清单]
[x] 事实溯源核实：story.json 中患者向涉及的所有 facts[].verified 必须全部明确置为 true。
[x] 免责声明层：项目编译出的 scene.html 必须具备可见的 #disclaimer 节点。
[x] 绝对化禁用词：禁止在 narration 旁白中出现："彻底根治"、"百分之百安全"、"永不复发"、"毫无副作用"。
[x] 危险医嘱阻断：禁止在未说明医嘱的前提下出现绝对化停药指引（如："可直接停药"、"擅自停用"）。
[x] 画面解剖免责：凡使用非患者真实影像的三维模型，分镜画面显眼区域须常驻或入场出现 "示意图，非真实解剖" 水印标注。
```

---

## 6. 资源与许可矩阵速查表（Quick Reference Matrix）

| 资源名称 | 核心领域 | 典型格式 | 核心许可协议 | 商业使用 | 署名要求 | 官方入口 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **NIH 3D Print Exchange** | 3D解剖重建、医疗植入物 | STL, OBJ, GLB | Public Domain / CC0 / CC-BY | **允许** | 视具体页面（政府作品免署名） | [3d.nih.gov](https://3d.nih.gov) |
| **BodyParts3D (DBCLS)** | 全身全系统解剖学图谱 | OBJ, 3D 渲染图 | CC-BY-SA 2.1 Japan | **允许** | **必须署名** DBCLS | [lifesciencedb.jp/bp3d](https://lifesciencedb.jp/bp3d/) |
| **OpenAnatomy (Harvard)** | 脑/胸/膝 WebGL 3D 图谱 | glTF, JSON | Open Academic / CC-BY | **允许** | **必须署名** SPL Harvard | [openanatomy.org](https://www.openanatomy.org) |
| **PhysioNet (MIT-BIH)** | 临床心电图、心律失常金标准 | WFDB, CSV, 数组 | ODC-BY 1.0 / Open Access | **允许** | **必须引用** MIT-BIH 文献 | [physionet.org](https://physionet.org) |
| **PhysioNet (MIMIC)** | ICU 多参数生理波形 (ECG/ABP/PPG) | WFDB, PhysioNet | ODC-BY 1.0 (需申请准入) | **受限/允许** | **必须引用** MIMIC 论文 | [physionet.org](https://physionet.org) |
| **McSharry ODE 模型** | 纯数学微分方程 ECG 仿真 | 纯 JS / 公式 | 公有数学模型 | **完全自由** | 建议标注算法来源 | IEEE TBME 2003 |
| **Servier Medical Art** | 3,000+ 医学专业矢量图标与插图 | SVG, PNG | **CC-BY 4.0** | **允许** | **必须在片尾或说明中署名** | [smart.servier.com](https://smart.servier.com) |
| **SciDraw** | 实验生物与神经环路矢量插图 | SVG | **CC-BY 4.0** | **允许** | **必须署名** 原作者与平台 | [scidraw.io](https://scidraw.io) |
| **Radiopaedia** | 临床放射学病例影像 (CT/MRI/DSA) | DICOM, JPEG, MP4 | CC-BY-NC-SA (部分开放) | **非商用自由/商业需授权** | **必须署名** 病例贡献者 | [radiopaedia.org](https://radiopaedia.org) |
| **NLM Open-i** | PubMed Central 文献临床图谱 | JPEG, PNG | Open Access / CC-BY (筛查) | **允许 (按筛选结果)** | 引用具体文献 PMCID | [openi.nlm.nih.gov](https://openi.nlm.nih.gov) |

---

## 7. 结语

本指南旨在为 `mg-studio` 打造坚实、严谨、可持续演进的医学工程化内容底座。在后续迭代（如 M4 复杂解剖管线）中，建议建立 `assets/medical/` 共享资产子模块，对进入代码库的模型与波形资产实行哈希溯源与许可自动化扫描。

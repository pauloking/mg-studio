'use strict';
/* visual-quality.js — 视觉交付基线门（防"几何占位/平涂色块"被当交付）。
 * 自动门此前只查结构/合规/确定性，不查"画面是否像设计过的医学示意"。本门补该缺口：
 *   PLACEHOLDER_3D  three3d 工程仅primitive几何(球/盒/锥)且无剖切/标注/布光 → B（ programmer-art ）
 *   FLAT_2D         schematic 运行时仅平涂 fillRect、无渐变/圆角/字阶 → B
 * 启发式但针对已发生的真实事故（浮球+盒全景、平涂色块2D）。达基线后放行。 */
const fs = require('fs'), path = require('path');
const { resolveProject } = require('./three3d');

function threeSignals(src) {
  const hasLabels = /CanvasTexture|Sprite\(/.test(src);
  const hasCutaway = /clippingPlanes/.test(src);
  const lightRig = (src.match(/DirectionalLight|PointLight|HemisphereLight|SpotLight/g) || []).length >= 2;
  const hasTissue = /MeshPhysicalMaterial|MeshStandardMaterial/.test(src);
  const primitive = /SphereGeometry|BoxGeometry|ConeGeometry/.test(src);
  return { hasLabels, hasCutaway, lightRig, hasTissue, primitive };
}

function lintVisualQuality({ scenes, dir }) {
  const out = [];
  for (const sc of scenes || []) {
    if (sc.layout === 'three3d') {
      const el = (sc.elements || []).find(e => e.type === 'three3d');
      const tp = el && el.props && el.props.threeProject;
      if (!tp) continue;
      const srcPath = path.join(resolveProject(tp, dir), 'render_frames.js');
      let src = ''; try { src = fs.readFileSync(srcPath, 'utf8'); } catch (e) { continue; }
      const s = threeSignals(src);
      const placeholder = (s.primitive && !s.hasCutaway && !s.hasLabels) || !s.hasLabels || !s.lightRig || !s.hasTissue;
      if (placeholder) out.push({ level: 'B', code: 'PLACEHOLDER_3D', scene: sc.id, el: el.id,
        msg: '3D 工程为几何占位（缺剖切/组织材质/标注/布光之一），不达交付视觉基线；请重做为设计过的医学示意或改用专家参考影像' });
    } else if (sc.layout === 'schematic') {
      const srcPath = path.join(__dirname, 'components', 'schematic.js');
      let src = ''; try { src = fs.readFileSync(srcPath, 'utf8'); } catch (e) { continue; }
      const grad = /createLinearGradient|createRadialGradient/.test(src);
      const rounded = /arcTo|roundRect/.test(src);
      const typo = (src.match(/ctx\.font\s*=/g) || []).length >= 3;
      if (!grad || !rounded || !typo) out.push({ level: 'B', code: 'FLAT_2D', scene: sc.id, el: '',
        msg: 'schematic 为平涂色块（缺渐变/圆角/字阶），不达交付视觉基线' });
    }
  }
  return out;
}
module.exports = { lintVisualQuality, threeSignals };

'use strict';
/* schematic-gen.js — Topic-Visual P2：按视觉简报参数化生成 2D 示意场景。纯函数、确定性。
 * anatomy → 横剖面三腔带（view=mirror 右室在左）+ 导线旋入；device → 器械流程；
 * diagram/comparison → 节点流程/双栏。panorama/ambient 属 P3，返回 null。 */
const { extractBrief } = require('./visual-intent');
const GENERATED_TYPES = ['anatomy', 'device', 'diagram', 'comparison'];

function generateSchematicScene({ beat, labels, minSec = 6 }) {
  const brief = extractBrief(beat);
  if (!GENERATED_TYPES.includes(brief.type)) return null;
  const kind = brief.type === 'anatomy' ? 'anatomy' : brief.type === 'device' ? 'diagram' : brief.type;
  return {
    id: beat.id, beat: beat.id, layout: 'schematic', minSec, visualBrief: brief,
    elements: [{
      id: 'graphic', type: 'schematic',
      props: {
        x: 160, y: 140, w: 1600, h: 720,
        structures: brief.structures, view: brief.view, type: kind,
        labels: labels || brief.structures
      }
    }]
  };
}
module.exports = { generateSchematicScene, GENERATED_TYPES };

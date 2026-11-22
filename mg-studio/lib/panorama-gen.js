'use strict';
/* panorama-gen.js — Topic-Visual P3：panorama（术野/全景/视野）→ 内置参数化 3D 喂帧工程。
 * 3D 优先：确定性、免计费、可人工门对照参考图；stylized 示意非真实解剖。 */
const { extractBrief } = require('./visual-intent');

function generatePanoramaScene({ beat, minSec = 8 }) {
  const brief = extractBrief(beat);
  if (brief.type !== 'panorama') return null;
  return {
    id: beat.id, beat: beat.id, layout: 'three3d', minSec, visualBrief: brief,
    elements: [{
      id: 'panorama', type: 'three3d',
      props: { threeProject: 'builtin:three-panorama', params: { structures: brief.structures, view: brief.view } }
    }]
  };
}
module.exports = { generatePanoramaScene };

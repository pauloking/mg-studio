'use strict';
/* panorama-gen.js — Topic-Visual P3：panorama（术野/全景/视野）自动路线=干净 2D 分区示意。
 * 教训：自动 primitive 3D 落在"恐怖谷"——既不准确也不示意，比干净分区图解更差。
 * 故自动 panorama 委托 schematic-gen 产明确是图解的 2D 场景；
 * "准确"路线保留 three3d 适配器供专家 authored/真实工程（外部喂帧），不自动产 primitive 3D。 */
const { generateSchematicScene } = require('./schematic-gen');
const { extractBrief } = require('./visual-intent');

function generatePanoramaScene({ beat, minSec = 8 }) {
  if (extractBrief(beat).type !== 'panorama') return null;
  return generateSchematicScene({ beat, minSec });
}
module.exports = { generatePanoramaScene };

#!/usr/bin/env node
'use strict';
require('../lib/cli-help').help('用法: node gen_visual.js [项目目录] [--yes] [--force]\n为缺少场景的 beat 按视觉简报生成场景：panorama→内置3D、anatomy/device/diagram/comparison→参数化2D、ambient→百炼text2img(需--yes确认计费)。已有场景默认不覆盖(--force 覆盖)。');
/* gen_visual.js — Topic-Visual P3 生成入口：把"按文章定制形象/全景"落地为场景文件。
 * 免费路径（3D/2D）离线确定性；ambient text2img 需 --yes/MG_TTS_YES 确认（Credits 闭环）。 */
const fs = require('fs'), path = require('path');
const { resolveVisual, fallbackScene } = require('../lib/topic-visual');
const { generatePanoramaScene } = require('../lib/panorama-gen');
const { generateAmbientScene } = require('../lib/ambient-gen');

function main() {
  const argv = process.argv.slice(2);
  const yes = argv.includes('--yes');
  const force = argv.includes('--force');
  const pos = argv.filter(a => !a.startsWith('--'));
  const dir = path.resolve(pos.length ? pos[0] : process.cwd());
  const story = JSON.parse(fs.readFileSync(path.join(dir, 'story.json'), 'utf8'));
  const beats = story.beats || [];
  const pending = [];
  for (const b of beats) {
    const sp = path.join(dir, 'scenes', b.id + '.json');
    if (fs.existsSync(sp) && !force) continue;
    const brief = resolveVisual({ beat: b, dir }).brief;
    let result;
    if (brief.type === 'panorama') result = { ok: true, scene: generatePanoramaScene({ beat: b }) };
    else if (brief.type === 'ambient') result = generateAmbientScene({ beat: b, dir, yes });
    else result = { ok: true, scene: fallbackScene({ beat: b, dir }) };
    pending.push({ beat: b, result });
  }
  const needConsent = pending.filter(p => p.result && p.result.consent);
  if (needConsent.length) {
    console.error('计费提示：以下 ambient 场景需百炼 text2img（可能消耗 Credits）：' + needConsent.map(p => p.beat.id).join(', '));
    console.error('确认后重跑: node gen_visual.js ' + dir + ' --yes');
    return 2;
  }
  fs.mkdirSync(path.join(dir, 'scenes'), { recursive: true });
  let wrote = 0;
  for (const p of pending) {
    if (!p.result || !p.result.ok || !p.result.scene) { console.log('  skip', p.beat.id, p.result && p.result.err ? '(' + p.result.err + ')' : '(有素材/不生成)'); continue; }
    fs.writeFileSync(path.join(dir, 'scenes', p.beat.id + '.json'), JSON.stringify(p.result.scene, null, 2));
    console.log('  gen', p.beat.id, '→', p.result.scene.layout);
    wrote++;
  }
  console.log('gen_visual 完成：写出 ' + wrote + ' 个场景');
  return 0;
}
if (require.main === module) process.exit(main());
module.exports = { main };

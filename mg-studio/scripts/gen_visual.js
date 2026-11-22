#!/usr/bin/env node
'use strict';
require('../lib/cli-help').help('用法: node gen_visual.js [项目目录] [--yes] [--force]\n生成 animatic 草稿场景（仅预览叙事结构，不可直接交付）：panorama→插画组合/2D示意、anatomy/device→2D示意、diagram/comparison→points(motion-graphic)、ambient→百炼text2img(需--yes)。交付请 bespoke 作者画面替换（见 docs/authoring-and-production.md）。');
/* gen_visual.js — animatic 草稿生成入口（非交付）。auto 关键词映射创意天花板低，
 * 主交付路径=模型 bespoke authoring + 工具生产/质检（docs/authoring-and-production.md）。
 * 产物场景标 animatic:true，export 交付门阻断（--allow-animatic 仅预览）。 */
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
  let needMotion = false;
  for (const b of beats) {
    const sp = path.join(dir, 'scenes', b.id + '.json');
    if (fs.existsSync(sp) && !force) continue;
    const brief = resolveVisual({ beat: b, dir }).brief;
    let result;
    if (brief.type === 'panorama') result = { ok: true, scene: generatePanoramaScene({ beat: b }) };
    else if (brief.type === 'ambient') result = generateAmbientScene({ beat: b, dir, yes });
    else if (brief.type === 'diagram' || brief.type === 'comparison') {
      // 交给既有 motion-graphic 编排（composeScenes: points单卡+motion=flow → 描迹链/对比/指标），
      // 而非静态分区盒——让动效工具真正参与自动路径
      result = { ok: true, scene: { id: b.id, beat: b.id, layout: 'points', minSec: 6,
        elements: [{ id: 'card', type: 'card', props: { title: brief.subject, desc: b.narration } }] } };
      needMotion = true;
    }
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
    p.result.scene.animatic = true;
    fs.writeFileSync(path.join(dir, 'scenes', p.beat.id + '.json'), JSON.stringify(p.result.scene, null, 2));
    console.log('  gen', p.beat.id, '→', p.result.scene.layout, '(animatic 草稿)');
    wrote++;
  }
  if (needMotion && story.meta.motion !== 'focus') {
    story.meta.motion = 'flow';
    fs.writeFileSync(path.join(dir, 'story.json'), JSON.stringify(story, null, 2));
    console.log('  meta.motion=flow（启用 motion-graphic 编排）');
  }
  console.log('gen_visual 完成：写出 ' + wrote + ' 个场景');
  return 0;
}
if (require.main === module) process.exit(main());
module.exports = { main };

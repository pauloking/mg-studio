'use strict';
/* three3d.js — three3d 插入段适配器（§10）：调用外部 Three.js「喂帧」工程确定性渲染到 frames/<id>/
 *
 * 喂帧契约（threeProject 目录须含 render_frames.js）：
 *   node <threeProject>/render_frames.js \
 *        --out <outDir> --frames <N> --fps 30 --width 1920 --height 1080 --tokens <tokensJsonPath>
 *   → 在该目录写出 f_0000.png .. f_{N-1}.png（确定性：只由帧号驱动，不读墙钟；同参数同产物）。
 *
 * 本适配器只做编排（校验契约 → 调用 → 核对帧数），不嵌入 iframe（避免双渲染时钟破坏确定性）。
 * 生成的帧进入 frames/<id>/，与 2D 段共用 fcache 缓存与 assemble_frames 拼接。
 */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const CONTRACT = 'render_frames.js';

/** 校验 threeProject 是否满足喂帧契约；返回缺失项数组 */
function checkContract(threeProjectDir) {
  const miss = [];
  if (!threeProjectDir || !fs.existsSync(threeProjectDir)) { miss.push('threeProject 目录不存在'); return miss; }
  if (!fs.existsSync(path.join(threeProjectDir, CONTRACT))) miss.push('缺 ' + CONTRACT + '（喂帧契约脚本）');
  return miss;
}

/**
 * renderThreeScene({ threeProjectDir, outDir, frameCount, fps, width, height, tokensPath })
 * → { ok, count, expected, err? }
 */
function renderThreeScene({ threeProjectDir, outDir, frameCount, fps = 30, width = 1920, height = 1080, tokensPath }) {
  const miss = checkContract(threeProjectDir);
  if (miss.length) return { ok: false, count: 0, expected: frameCount, err: miss.join('; ') };
  if (!Number.isInteger(frameCount) || frameCount <= 0) return { ok: false, count: 0, expected: frameCount, err: 'frameCount 须为正整数' };
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const args = [path.join(threeProjectDir, CONTRACT), '--out', outDir, '--frames', String(frameCount),
    '--fps', String(fps), '--width', String(width), '--height', String(height)];
  if (tokensPath) args.push('--tokens', tokensPath);
  try { execFileSync('node', args, { cwd: threeProjectDir, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return { ok: false, count: 0, expected: frameCount, err: 'render_frames 执行失败: ' + ((e.message || e) + '').slice(0, 200) }; }
  const count = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter(f => f.endsWith('.png')).length : 0;
  return { ok: count === frameCount, count, expected: frameCount, err: count === frameCount ? null : `帧数 ${count} != ${frameCount}` };
}

module.exports = { checkContract, renderThreeScene, CONTRACT };

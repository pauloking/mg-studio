'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const INDEX = 'index.json';
const CACHE_DIR = ['frames', 'cache'];
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); }
function hashFile(p) { try { return sha(fs.readFileSync(p)); } catch (e) { return null; } }
function visualHash({ scene, tokens, compVersion = '1', compilerVersion = '1' }) {
  // 只取影响画布的 token 子集，避免无关字段抖动导致无谓重渲。
  // M5 新面必须进哈希：bgType/card/titleBar/style 任一变化都会改画面，
  // 漏掉会导致增量渲染把旧样式帧当缓存命中（实测复现过）。
  const tk = tokens && tokens.colors ? { colors: tokens.colors, font: tokens.font, subtitle: tokens.subtitle,
    bgType: tokens.bgType, card: tokens.card, titleBar: tokens.titleBar, style: tokens.style } : tokens;
  return sha(JSON.stringify({ scene, tokens: tk, compVersion, compilerVersion }));
}
function loadIndex(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, ...CACHE_DIR, INDEX), 'utf8')); } catch (e) { return {}; }
}
function saveIndex(dir, idx) {
  const d = path.join(dir, ...CACHE_DIR); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, INDEX), JSON.stringify(idx, null, 2));
}
function decide({ visualHash, audioHash, frameCount, cached }) {
  if (!cached) return { render: true, reason: '新增场景' };
  if (cached.visualHash !== visualHash) return { render: true, reason: '视觉变化' };
  if (cached.frameCount !== frameCount) return { render: true, reason: '时长/帧数变化' };
  return { render: false, reason: '缓存命中' };
}
module.exports = { sha, hashFile, visualHash, loadIndex, saveIndex, decide, INDEX, CACHE_DIR };

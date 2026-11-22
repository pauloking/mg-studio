'use strict';
/* ambient-gen.js — Topic-Visual P3：ambient 氛围形象 text2img 兜底（百炼 bl image generate）。
 * 计费闭环：默认不调用；需 --yes 或 MG_TTS_YES=1 确认（可能消耗 Credits）。
 * 复现：--seed 由 prompt 哈希决定；缓存：assets/index.json 按 prompt+seed 命中即复用不再调用。
 * 许可证：产出标记 'AI 生成 (百炼 text2img)'，进入带许可证素材索引供检索复用。
 * 接口已取证（bl image generate --help）：--out-dir 下载、--out-prefix 命名、--seed、--watermark、--negative-prompt。
 * 产出通过扫描 out-dir 新增文件获得，不依赖未验证的 JSON 形状。 */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { extractBrief } = require('./visual-intent');
const { storeAsset } = require('./project-assets');
const LICENSE = 'AI 生成 (百炼 text2img)';

function hash(s) { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h % 2147483647; }
function promptFor(brief) {
  // 不注入主题词：实测 wan2.7-image 会把 prompt 中的主题/声明词渲染成画面文字（含错字），
  // 医学背景绝不允许 baked 文字。纯图形描述 + 强 negative 双保险。
  return '纯抽象背景图：深色科技感柔和渐变光晕与细粒子，蓝紫青色调，中心留暗区。画面中绝对不要出现任何文字、汉字、字母、数字、标题、字幕、水印、logo、人物、器官或器械，仅图形与光效。';
}

function generateAmbientAsset({ beat, dir, yes = false, exec = execFileSync, env = process.env }) {
  const brief = extractBrief(beat);
  if (brief.type !== 'ambient') return { ok: false, err: '非 ambient 类型' };
  const prompt = promptFor(brief);
  const seed = hash(prompt);
  const assetsDir = path.join(dir, 'assets');
  const indexP = path.join(assetsDir, 'index.json');
  let index = []; try { index = JSON.parse(fs.readFileSync(indexP, 'utf8')); } catch (e) {}
  const hit = index.find(a => a && a.prompt === prompt && a.seed === seed);
  if (hit && fs.existsSync(path.join(dir, hit.path))) return { ok: true, reused: true, asset: hit };
  if (!(yes || env.MG_TTS_YES === '1')) return { ok: false, consent: true, err: 'ambient text2img 可能消耗 Credits；需 --yes 或 MG_TTS_YES=1 确认后才调用百炼' };
  fs.mkdirSync(assetsDir, { recursive: true });
  const prefix = 'ambient-' + beat.id;
  const before = new Set(fs.readdirSync(assetsDir));
  try {
    exec('bl', ['image', 'generate', '--prompt', prompt, '--size', '16:9', '--seed', String(seed),
      '--out-dir', assetsDir, '--out-prefix', prefix, '--watermark', 'false',
      '--negative-prompt', '文字, 汉字, 字母, 数字, 标题, 字幕, 水印, logo, 人物, 人脸, 器官, 解剖, 器械, 血腥', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { return { ok: false, err: 'bl image generate 失败: ' + String(e.message).slice(0, 160) }; }
  const created = fs.readdirSync(assetsDir).filter(f => !before.has(f) && f.startsWith(prefix) && /\.(png|jpe?g|webp)$/i.test(f));
  if (!created.length) return { ok: false, err: 'bl 未产出图片文件' };
  // 内容寻址入库（assets/<sha256>.<ext> + .json sidecar），满足 directed isStoredMedia/checkedAssetPath 契约
  const raw = path.join(assetsDir, created[0]);
  const media = storeAsset(dir, created[0], fs.readFileSync(raw));
  fs.rmSync(raw, { force: true });
  const asset = { id: prefix, kind: 'image', license: LICENSE, source: 'bailian text2img', tags: [brief.type, brief.subject], path: media.file, name: media.name, prompt, seed };
  index.push(asset); fs.writeFileSync(indexP, JSON.stringify(index, null, 2));
  return { ok: true, reused: false, asset, media };
}

/** ambient → directed 全幅氛围图场景（image layer, hold）。未授权/失败时返回 consent/err，不产出场景。 */
function generateAmbientScene(opts) {
  const r = generateAmbientAsset(opts);
  if (!r.ok) return r;
  const beat = opts.beat;
  return {
    ok: true, asset: r.asset, reused: r.reused,
    scene: {
      id: beat.id, beat: beat.id, layout: 'directed', minSec: 6, visualBrief: extractBrief(beat),
      elements: [{ id: 'bg', type: 'layer', props: { kind: 'image', action: 'hold', color: 'accent', x: 3, y: 3, w: 91, h: 81, at: 0, span: 0.9, media: r.media || { file: r.asset.path, name: r.asset.name, kind: 'image' } } }]
    }
  };
}
module.exports = { generateAmbientAsset, generateAmbientScene, promptFor, hash, LICENSE };

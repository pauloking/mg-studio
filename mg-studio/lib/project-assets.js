'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { validateLocalImage } = require('./director-assets');

const MAX_ASSET_BYTES = 48 * 1024 * 1024;
const FORMATS = {
  png: ['image', 'image/png'], jpg: ['image', 'image/jpeg'], webp: ['image', 'image/webp'],
  svg: ['image', 'image/svg+xml'], mp4: ['video', 'video/mp4'], webm: ['video', 'video/webm']
};

function isStoredMedia(media) {
  return Boolean(media && typeof media.name === 'string' && media.name.length <= 160 &&
    typeof media.file === 'string' && /^assets\/[a-f0-9]{64}\.(?:png|jpg|webp|svg|mp4|webm)$/.test(media.file) &&
    media.kind === FORMATS[path.extname(media.file).slice(1)][0]);
}

function checkedAssetPath(dir, media) {
  if (!isStoredMedia(media)) throw new Error('无效的工程素材引用。');
  const file = path.join(dir, media.file);
  if (!fs.lstatSync(file).isFile() || !fs.realpathSync(file).startsWith(fs.realpathSync(dir) + path.sep)) {
    throw new Error('工程素材不在工程目录中：' + media.name);
  }
  return file;
}

function detectFormat(name, data) {
  const ext = path.extname(name).slice(1).toLowerCase().replace(/^jpeg$/, 'jpg');
  switch (ext) {
    case 'png': return data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? ext : '';
    case 'jpg': return data.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) ? ext : '';
    case 'webp': return data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' ? ext : '';
    case 'svg': return data.length <= 2_000_000 && validateLocalImage({
      name, data: 'data:image/svg+xml;base64,' + data.toString('base64')
    }) ? ext : '';
    case 'mp4': return data.toString('ascii', 4, 8) === 'ftyp' ? ext : '';
    case 'webm': return data.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')) ? ext : '';
    default: return '';
  }
}

function storeAsset(dir, name, data) {
  if (typeof name !== 'string' || !name.trim() || name.length > 160 || data.length > MAX_ASSET_BYTES) {
    throw Object.assign(new Error('素材须有文件名且小于 48 MB。'), { statusCode: 422 });
  }
  const ext = detectFormat(name, data);
  if (!ext) throw Object.assign(new Error('素材格式无效。请选择 PNG、JPEG、WebP、静态 SVG、MP4 或 WebM。'), { statusCode: 422 });
  const hash = createHash('sha256').update(data).digest('hex');
  const media = { file: 'assets/' + hash + '.' + ext, name, kind: FORMATS[ext][0], source: 'imported' };
  const root = path.join(dir, 'assets');
  fs.mkdirSync(root, { recursive: true });
  if (!fs.lstatSync(root).isDirectory()) throw new Error('素材目录无效。');
  const file = path.join(dir, media.file);
  try { fs.writeFileSync(file, data, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  checkedAssetPath(dir, media);
  try { fs.writeFileSync(file + '.json', JSON.stringify(media), { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return media;
}

function catalog(dir) {
  const root = path.join(dir, 'assets');
  if (!fs.existsSync(root) || !fs.lstatSync(root).isDirectory()) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^[a-f0-9]{64}\.(?:png|jpg|webp|svg|mp4|webm)\.json$/.test(entry.name))
    .flatMap(entry => {
      try {
        const media = JSON.parse(fs.readFileSync(path.join(root, entry.name), 'utf8'));
        if (media.file + '.json' === 'assets/' + entry.name) {
          checkedAssetPath(dir, media);
          return [media];
        }
      } catch { /* Skip unavailable catalog entries. */ }
      return [];
    });
}

function copyAssets(from, to, entries = catalog(from)) {
  if (!entries.length) return;
  fs.mkdirSync(path.join(to, 'assets'), { recursive: true });
  for (const entry of entries) {
    fs.copyFileSync(checkedAssetPath(from, entry), path.join(to, entry.file));
    fs.writeFileSync(path.join(to, entry.file + '.json'), JSON.stringify(entry));
  }
}

async function uploadAsset(req, dir, name) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_ASSET_BYTES) {
      req.resume();
      throw Object.assign(new Error('单个素材须小于 48 MB。'), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  return storeAsset(dir, name, Buffer.concat(chunks, size));
}

module.exports = { isStoredMedia, checkedAssetPath, storeAsset, catalog, copyAssets, uploadAsset };

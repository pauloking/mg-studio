'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DOMParser } = require('@xmldom/xmldom');

const icons = {
  'heart-pulse': '心脏与心律', stethoscope: '听诊器', clock: '时钟', activity: '信号波形',
  pill: '药物', syringe: '注射器', microscope: '显微镜', 'flask-conical': '实验烧瓶',
  'book-open': '资料', 'shield-check': '安全与核对', search: '放大镜', package: '产品包装',
  smartphone: '手机', headphones: '耳机', 'battery-charging': '电池', route: '路线',
  layers: '图层', timer: '计时器', zap: '电能', 'chart-no-axes-column': '柱图',
  'cloud-rain': '雨云', droplet: '水滴', waves: '水流', sprout: '植物',
  'tree-deciduous': '树木', house: '建筑', 'map-pin': '位置', lightbulb: '灯泡',
  settings: '齿轮', camera: '摄影', 'circle-check': '完成', network: '网络',
  'rain-roof': '楼群与斜屋顶', 'rain-street': '路面与雨水口', 'rain-soil': '绿地剖面'
};
const directory = path.join(__dirname, '..', 'templates', 'director-icons');
const cache = new Map();

function getIcon(id) {
  if (!Object.hasOwn(icons, id)) return '';
  if (!cache.has(id)) cache.set(id, fs.readFileSync(path.join(directory, id + '.svg'), 'utf8'));
  return cache.get(id);
}

function listAssets() {
  return Object.entries(icons).map(([id, title]) => ({
    id, title, source: id.startsWith('rain-') ? 'MG Studio 原创图解' : 'Lucide',
    preview: 'data:image/svg+xml;base64,' + Buffer.from(getIcon(id)).toString('base64')
  }));
}

function validateLocalImage(media) {
  if (!media || typeof media.name !== 'string' || media.name.length > 160 || typeof media.data !== 'string') return false;
  const match = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(media.data);
  if (!match || match[2].length > 2_800_000) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (match[1] === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (match[1] === 'image/jpeg') return bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  if (match[1] === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  const svg = bytes.toString('utf8');
  if (/<!(?:DOCTYPE|ENTITY)|<\?/i.test(svg.replace(/^\s*<\?xml\s[^?]+\?>/, ''))) return false;
  const parser = new DOMParser({ errorHandler: { warning() {}, error() {}, fatalError() {} } });
  const root = parser.parseFromString(svg, 'image/svg+xml').documentElement;
  // Imported graphics are rendered as inert images. Exclude external references,
  // foreign content and active elements as well.
  if (root?.localName !== 'svg' || /<\s*(?:[\w-]+:)?(?:script|foreignObject|iframe|use|image)\b|\bon[a-z]+\s*=|@import|url\(\s*['"]?(?!#)/i.test(svg)) return false;
  return true;
}

function validateLocalVideo(media) {
  if (!media || typeof media.name !== 'string' || media.name.length > 160 || typeof media.data !== 'string') return false;
  const match = /^data:video\/(mp4|webm);base64,([A-Za-z0-9+/=]+)$/.exec(media.data);
  if (!match || match[2].length > 2_800_000) return false;
  const head = Buffer.from(match[2].slice(0, 32), 'base64');
  return match[1] === 'mp4' ? head.toString('ascii', 4, 8) === 'ftyp' : head.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'));
}

module.exports = { icons, getIcon, listAssets, validateLocalImage, validateLocalVideo };

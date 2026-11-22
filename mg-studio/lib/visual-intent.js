'use strict';
/* visual-intent.js — 从 beat 提取视觉简报（Topic-Visual P1）。纯函数。 */
const ANATOMY = ['室间隔', '左束支', '右束支', '左室', '右室', '心内膜', '心外膜', '瓣膜', '心房', '心室', '主动脉', '间隔', '心肌', '传导系统', '希氏束', '浦肯野', '心脏'];
const DEVICE = ['导线', '电极', '起搏器', '鞘', '导管', '螺旋', '植入'];
// 主体关键词→授权插画/图标（优先 MG Studio 原创图解 rain-*），供全景/图片设计组合
const SUBJECT_ASSETS = [
  [/屋顶|建筑|楼|房/, ['rain-roof', 'house']],
  [/道路|路面|雨水口|街道/, ['rain-street']],
  [/绿地|土壤|剖面|植物|草|树/, ['rain-soil', 'sprout']],
  [/云|下雨|降雨/, ['cloud-rain']],
  [/水滴|下渗|渗/, ['droplet']],
  [/水流|径流|汇流|排/, ['waves']]
];
function extractAssets(text) {
  const out = [];
  for (const [re, ids] of SUBJECT_ASSETS) if (re.test(text)) for (const id of ids) if (!out.includes(id)) out.push(id);
  return out;
}

function extractBrief(beat) {
  const text = ((beat && beat.narration) || '') + ' ' + ((beat && beat.intent) || '');
  const structures = [];
  for (const t of ANATOMY.concat(DEVICE)) if (text.includes(t) && !structures.includes(t)) structures.push(t);
  let type;
  if (/全景|术野|视野/.test(text)) type = 'panorama';
  else if (ANATOMY.some(t => text.includes(t))) type = 'anatomy';
  else if (DEVICE.some(t => text.includes(t))) type = 'device';
  else if (/对比|对照|vs\.?/.test(text)) type = 'comparison';
  else if (/步骤|阶段|依次|流程|环节/.test(text)) type = 'diagram';
  else type = 'ambient';
  let view = null;
  if (/镜像|右室在左/.test(text)) view = 'mirror';
  else if (/剖面|横断/.test(text)) view = 'cross';
  const subject = (beat && beat.intent) || structures[0] || '示意图';
  return { subject, type, structures, view, assets: extractAssets(text) };
}
module.exports = { extractBrief, extractAssets, ANATOMY, DEVICE, SUBJECT_ASSETS };

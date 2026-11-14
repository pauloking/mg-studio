'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'templates', 'narratives');
const IDS = ['science', 'product', 'teaching', 'free'];
function loadTemplate(id) {
  if (!IDS.includes(id)) throw new Error('未知叙事模板: ' + id + '（可选 ' + IDS.join('/') + '）');
  return JSON.parse(fs.readFileSync(path.join(DIR, id + '.json'), 'utf8'));
}
module.exports = { IDS, loadTemplate };

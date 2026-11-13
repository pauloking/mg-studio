'use strict';
function splitSubs(narration, maxLen = 18) {
  const clauses = narration.match(/[^。！？；，、：]+[。！？；，、：]?/g) || [];
  const lines = []; let cur = '';
  for (const cl of clauses) {
    if (cl.length > maxLen) {
      if (cur) { lines.push(cur); cur = ''; }
      for (let i = 0; i < cl.length; i += maxLen) lines.push(cl.slice(i, i + maxLen));
      continue;
    }
    if ((cur + cl).length > maxLen) { if (cur) lines.push(cur); cur = cl; }
    else cur += cl;
    if (/[。！？；]$/.test(cl)) { lines.push(cur); cur = ''; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [narration];
}
function normalizeText(s) { return String(s).replace(/[，。！？；、：·…—\s]/g, ''); }
function checkSubs(override, narration) {
  const a = normalizeText(override.join(''));
  const b = normalizeText(narration);
  if (a === b) return { ok: true, detail: '' };
  let i = 0; while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  return { ok: false, detail: `首个分歧在第 ${i} 字: 字幕="${a.slice(i, i + 10)}" 旁白="${b.slice(i, i + 10)}"` };
}
module.exports = { splitSubs, normalizeText, checkSubs };

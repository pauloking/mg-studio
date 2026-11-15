#!/usr/bin/env node
'use strict';
/* auto_qa.js — G4 QA 门（阻断/警告分级，§9.3）
 * 用法: node auto_qa.js [项目目录] [--skip-media]
 * 产物: reports/qa.json + reports/qa.md；退出码 0 通过 / 1 有 B
 */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { lintMedical } = require('../lib/medical-lint');
const { checkSubs } = require('../lib/subs');

function parseMeanVolume(s) { const m = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(s || ''); return m ? parseFloat(m[1]) : null; }

function ffmpegParse(args) { try { return execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] }).toString(); } catch (e) { return (e.stderr || '').toString(); } }

function runQA({ dir, timeline, story, videoPath, skipMedia, subsByBeat = {} }) {
  const diag = [];
  // B: 拼接帧数 == 时间轴总帧数
  const allDir = path.join(dir, 'frames', 'all');
  const n = fs.existsSync(allDir) ? fs.readdirSync(allDir).filter(f => f.endsWith('.png')).length : 0;
  if (n !== timeline.totalFrames) diag.push({ level: 'B', code: 'QA_FRAME_COUNT', scene: '', msg: `拼接帧 ${n} != 时间轴 ${timeline.totalFrames}` });
  // B: 渲染 runtime error
  try { const st = JSON.parse(fs.readFileSync(path.join(dir, 'frames', 'render-status.json'), 'utf8')); if (st.runtimeError) diag.push({ level: 'B', code: 'QA_RUNTIME', scene: '', msg: '渲染 runtime error: ' + st.runtimeError }); } catch (e) {}
  // B: 字幕 override 与旁白一致
  const beats = (story && story.beats) || [];
  for (const sc of (timeline.scenes || [])) {
    const ov = subsByBeat[sc.id];
    if (Array.isArray(ov)) { const b = beats.find(x => x.id === sc.id); const c = checkSubs(ov, (b && b.narration) || ''); if (!c.ok) diag.push({ level: 'B', code: 'QA_SUBS_MISMATCH', scene: sc.id, msg: c.detail }); }
  }
  // B: 患者向医学门
  for (const d of lintMedical({ story, scenes: [] })) if (d.level === 'B') diag.push({ level: 'B', code: d.code, scene: d.scene, msg: d.msg });
  // W: 媒体检查（黑场/静止/时长）
  if (!skipMedia && videoPath && fs.existsSync(videoPath)) {
    const bl = ffmpegParse(['-hide_banner', '-i', videoPath, '-vf', 'blackdetect=d=0.5:pix_th=0.02', '-an', '-f', 'null', '-']);
    const black = (bl.match(/black_start:/g) || []).length;
    if (black) diag.push({ level: 'W', code: 'QA_BLACK', scene: '', msg: `检出 ${black} 段黑场（核对是否意外）` });
    const fr = ffmpegParse(['-hide_banner', '-i', videoPath, '-vf', 'freezedetect=n=0.001:d=2', '-an', '-f', 'null', '-']);
    const fz = (fr.match(/freeze_start:/g) || []).length;
    if (fz) diag.push({ level: 'W', code: 'QA_FREEZE', scene: '', msg: `检出 ${fz} 段静止 >2s（片头尾可豁免）` });
    let dur = 0; try { dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath]).toString().trim()) || 0; } catch (e) {}
    const expect = timeline.totalFrames / (timeline.fps || 30);
    if (dur && Math.abs(dur - expect) > 0.3) diag.push({ level: 'W', code: 'QA_DURATION', scene: '', msg: `时长 ${dur.toFixed(2)}s vs 预期 ${expect.toFixed(2)}s` });
  }
  const B = diag.filter(d => d.level === 'B'), W = diag.filter(d => d.level === 'W');
  return { diagnostics: diag, blocking: B, warnings: W };
}

function main() {
  const args = process.argv.slice(2); const pos = args.filter(a => !a.startsWith('--'));
  const dir = pos.length ? path.resolve(pos[0]) : process.cwd();
  const skipMedia = args.includes('--skip-media');
  const tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  let story = { meta: {}, beats: [] }, subsByBeat = {};
  try {
    const ir = require('../lib/ir'); const { LAYOUT_NAMES } = require('../lib/components');
    const project = ir.loadProject(dir, LAYOUT_NAMES);
    story = project.story || story;
    for (const sc of project.scenes) if (Array.isArray(sc.subsOverride)) subsByBeat[sc.id] = sc.subsOverride;
  } catch (e) {}
  const videoPath = path.join(dir, 'out', 'video_only.mp4');
  const r = runQA({ dir, timeline: tl, story, videoPath, skipMedia, subsByBeat });
  const lines = ['# QA 报告', '', `阻断 ${r.blocking.length} · 警告 ${r.warnings.length}`, ''];
  for (const d of r.diagnostics) lines.push(`- [${d.level}] ${d.code} ${d.scene || ''} ${d.msg}`);
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'reports', 'qa.json'), JSON.stringify(r, null, 2));
  fs.writeFileSync(path.join(dir, 'reports', 'qa.md'), lines.join('\n') + '\n');
  for (const d of r.diagnostics) console.log(`[${d.level}] ${d.code} ${d.scene || ''} ${d.msg}`);
  console.log(`\nQA ${r.blocking.length ? 'BLOCKED' : 'OK'}（B=${r.blocking.length} W=${r.warnings.length}）→ reports/qa.md`);
  return r.blocking.length ? 1 : 0;
}
if (require.main === module) process.exit(main());
module.exports = { runQA, parseMeanVolume };

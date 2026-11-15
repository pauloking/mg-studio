'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { lintScript, sentences, termUnexplained } = require('../lib/script-lint');

const codes = d => d.map(x => x.code);
function story(beats) { return { schema: 2, meta: {}, beats }; }
function beat(id, narration) { return { id, role: 'mechanism', emotion: 3, intent: 'x', narration, facts: [] }; }

test('sentences：按中英文标点切句并去空', () => {
  assert.deepEqual(sentences('甲。乙！丙？丁'), ['甲', '乙', '丙', '丁']);
});

test('termUnexplained：首现无解释命中；有"就是"/括号则放行', () => {
  assert.deepEqual(termUnexplained('房颤需要治疗。', ['房颤']), ['房颤']);
  assert.deepEqual(termUnexplained('房颤，就是一种心律失常。', ['房颤']), []);
  assert.deepEqual(termUnexplained('房颤（心律不齐）需治疗。', ['房颤']), []);
});

test('单句 >30 字 → SCRIPT_LONG_SENTENCE(W)', () => {
  const s = story([beat('a', '字'.repeat(32) + '。')]);
  assert.ok(codes(lintScript({ story: s, charsPerSec: 4.5 })).includes('SCRIPT_LONG_SENTENCE'));
});

test('时长预算偏差 >10% → SCRIPT_BUDGET(W)', () => {
  const s = story([beat('a', '一二三四五六七八九十。')]);
  assert.ok(codes(lintScript({ story: s, charsPerSec: 4.5, durationTarget: 30 })).includes('SCRIPT_BUDGET'));
});

test('术语未解释 → SCRIPT_TERM_UNEXPLAINED(W)', () => {
  const s = story([beat('a', '房颤需要治疗。')]);
  assert.ok(codes(lintScript({ story: s, charsPerSec: 4.5, terms: ['房颤'] })).includes('SCRIPT_TERM_UNEXPLAINED'));
});

test('beat 开头无衔接词 → SCRIPT_NO_BRIDGE(W)', () => {
  const s = story([beat('a', '这是一句没有衔接词的话。')]);
  assert.ok(codes(lintScript({ story: s, charsPerSec: 4.5 })).includes('SCRIPT_NO_BRIDGE'));
});

test('有衔接词则不报 SCRIPT_NO_BRIDGE', () => {
  const s = story([beat('a', '因此我们看下一个要点。')]);
  assert.ok(!codes(lintScript({ story: s, charsPerSec: 4.5 })).includes('SCRIPT_NO_BRIDGE'));
});

test('subsOverride 与旁白不一致 → SCRIPT_SUBS_MISMATCH(B)', () => {
  const s = story([beat('a', '甲。乙。')]);
  const d = lintScript({ story: s, charsPerSec: 4.5, subsByBeat: { a: ['完全不同的字幕'] } });
  assert.ok(d.some(x => x.level === 'B' && x.code === 'SCRIPT_SUBS_MISMATCH'));
});

test('自动切句（无 override）不产生 B', () => {
  const s = story([beat('a', '这是一段正常长度的旁白。')]);
  assert.ok(!lintScript({ story: s, charsPerSec: 4.5 }).some(x => x.level === 'B'));
});

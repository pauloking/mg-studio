'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { lintStory, estSec } = require('../lib/story-lint');
const { loadTemplate } = require('../lib/narratives');

function mk(beats) { return { schema: 2, meta: { title: 't', audience: 'professional', template: 'science' }, beats }; }
const B = 'hook', M = 'mechanism', E = 'evidence', T = 'takeaway', C = 'cta';
function beat(id, role, narration = '短句。', emotion = 3) { return { id, role, emotion, intent: 'x', narration, facts: [] }; }
const codes = d => d.map(x => x.code);

test('合规 science 结构：无 B', () => {
  const story = mk([beat('h', B, '开场。', 4), beat('m', M), beat('e', E), beat('t', T)]);
  const d = lintStory({ story, template: loadTemplate('science') });
  assert.ok(!d.some(x => x.level === 'B'), JSON.stringify(d));
});

test('首 beat 非 hook → NARR_HOOK_FIRST(B)', () => {
  const story = mk([beat('c', 'context'), beat('m', M), beat('e', E), beat('t', T)]);
  assert.ok(codes(lintStory({ story, template: loadTemplate('science') })).includes('NARR_HOOK_FIRST'));
});

test('缺必需 role → NARR_MISSING_ROLE(B)', () => {
  const story = mk([beat('h', B), beat('t', T)]);
  const d = lintStory({ story, template: loadTemplate('science') }).filter(x => x.code === 'NARR_MISSING_ROLE');
  assert.equal(d.length, 2);
});

test('末 beat 非 outro → NARR_END_ROLE(B)', () => {
  const story = mk([beat('h', B), beat('m', M), beat('e', E), beat('x', M)]);
  assert.ok(codes(lintStory({ story, template: loadTemplate('science') })).includes('NARR_END_ROLE'));
});

test('science 缺 conflict → NARR_NO_CONFLICT(W)', () => {
  const story = mk([beat('h', B), beat('m', M), beat('e', E), beat('t', T)]);
  assert.ok(codes(lintStory({ story, template: loadTemplate('science') })).includes('NARR_NO_CONFLICT'));
});

test('emotion 极差 <2 → NARR_FLAT_EMOTION(W)', () => {
  const story = mk([beat('h', B, '开场。', 3), beat('m', M, '中。', 3), beat('e', E, '证。', 3), beat('t', T, '尾。', 3)]);
  assert.ok(codes(lintStory({ story, template: loadTemplate('science') })).includes('NARR_FLAT_EMOTION'));
});

test('单 beat 预估 >15s → NARR_LONG_BEAT(W)', () => {
  const long = '字'.repeat(80) + '。';
  const story = mk([beat('h', B), beat('m', M, long), beat('e', E), beat('t', T)]);
  assert.ok(codes(lintStory({ story, template: loadTemplate('science'), charsPerSec: 4.5 })).includes('NARR_LONG_BEAT'));
});

test('free 模板不报顺序/必备（无 B）', () => {
  const story = { schema: 2, meta: { template: 'free' }, beats: [beat('a', 'context'), beat('b', 'demo')] };
  const d = lintStory({ story, template: loadTemplate('free') });
  assert.ok(!d.some(x => x.level === 'B'));
});

test('estSec 公式：字数/cps + 1.1', () => {
  assert.ok(Math.abs(estSec('一二三四五', 5) - (5 / 5 + 1.1)) < 1e-9);
});

const { test } = require('node:test');
const assert = require('node:assert');
const { splitSubs, normalizeText, checkSubs } = require('../lib/subs');

test('按标点切句且每行 <= 18 字', () => {
  assert.deepEqual(splitSubs('你好，世界。今天天气不错。'), ['你好，世界。', '今天天气不错。']);
  const long = '这是一个非常非常非常非常非常非常非常非常长的句子没有任何标点';
  for (const line of splitSubs(long)) assert.ok(line.length <= 18, line);
});
test('短分句贪心合并', () => {
  assert.deepEqual(splitSubs('要点一，要点二，要点三。'), ['要点一，要点二，要点三。']);
});
test('normalize 去标点空白', () => {
  assert.equal(normalizeText('你好， 世界。'), '你好世界');
});
test('subs 覆盖一致性', () => {
  assert.ok(checkSubs(['你好世界'], '你好，世界。').ok);
  assert.ok(!checkSubs(['你好'], '你好，世界。').ok);
  assert.ok(checkSubs(['千问办公，一站式 AI 生产力平台'], '千问办公，一站式AI生产力平台。').ok);
});

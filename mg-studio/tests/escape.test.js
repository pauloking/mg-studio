const { test } = require('node:test');
const assert = require('node:assert');
const { escHtml } = require('../lib/escape');
test('escHtml 转义 HTML 特殊字符，保留普通文本/数字/null', () => {
  assert.equal(escHtml('a<b>c&d"e\'f'), 'a&lt;b&gt;c&amp;d&quot;e&#39;f');
  assert.equal(escHtml('血压 < 120 mmHg'), '血压 &lt; 120 mmHg');
  assert.equal(escHtml('正常'), '正常');
  assert.equal(escHtml(null), '');
  assert.equal(escHtml(35.2), '35.2');
});
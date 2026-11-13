'use strict';
// HTML 实体转义：组件 innerHTML 插值用，保留标签结构、转义作者文本中的 < > & " '
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
module.exports = { escHtml };
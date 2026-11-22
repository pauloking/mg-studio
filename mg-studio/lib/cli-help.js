'use strict';
/* cli-help.js — 统一 --help/-h 支持（Audit: CLI 可发现性） */
function help(usage) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage);
    process.exit(0);
  }
}
module.exports = { help };

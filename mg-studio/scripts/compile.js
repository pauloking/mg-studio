#!/usr/bin/env node
'use strict';
const path = require('path');
const { compileProject } = require('../lib/compile');
const dir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
let r;
try { r = compileProject(dir); }
catch (e) { console.error(e.message); process.exit(1); }
if (r.mode === 'v1') { console.log('v1 passthrough: 无需编译'); process.exit(0); }
for (const l of r.lint) console.log(`[${l.level}] ${l.code} ${l.scene || ''}/${l.el || ''}: ${l.msg}`);
if (r.errors.length) { console.error('compile BLOCKED:', r.errors.join(' | ')); process.exit(1); }
console.log('compile OK →', r.scriptPath, r.htmlPath);
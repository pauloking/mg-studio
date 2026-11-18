'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { compileProject } = require('../lib/compile');

function openDemoProject(projectsDir) {
  const fixture = path.join(__dirname, '..', 'tests', 'fixtures', 'mini-style-medical');
  const target = path.join(projectsDir, 'mini-style-medical');
  if (fs.existsSync(target)) return target;

  fs.mkdirSync(projectsDir, { recursive: true });
  const staging = fs.mkdtempSync(path.join(projectsDir, '.demo-'));
  try {
    fs.cpSync(fixture, staging, { recursive: true });
    const compiled = compileProject(staging);
    if (compiled.errors.length) throw new Error(compiled.errors.join('\n'));
    try {
      fs.renameSync(staging, target);
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code) || !fs.existsSync(target)) throw error;
    }
    return target;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

module.exports = { openDemoProject };

'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

function workerEnvironment() {
  const env = { ...process.env };
  if (process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = '1';
    // Finder-launched apps may not inherit the Homebrew/MacPorts PATH.
    if (process.platform === 'darwin') {
      const dirs = (env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin').split(path.delimiter);
      for (const dir of ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin']) {
        if (fs.existsSync(dir) && !dirs.includes(dir)) dirs.push(dir);
      }
      env.PATH = dirs.join(path.delimiter);
    }
  }
  return env;
}

function runWorker(script, args, { cwd, onLog = () => {}, spawnProcess = spawn, timeout }) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(process.execPath, [script, ...args], {
      cwd, env: workerEnvironment(), windowsHide: true, timeout, stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.setEncoding?.('utf8');
    child.stderr.setEncoding?.('utf8');
    child.stdout.on('data', chunk => onLog(String(chunk)));
    child.stderr.on('data', chunk => onLog(String(chunk)));
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(script)} 退出 (${signal || code})`));
    });
  });
}

module.exports = { runWorker, workerEnvironment };

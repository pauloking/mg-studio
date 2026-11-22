#!/usr/bin/env node
'use strict';
/* doctor.js — 运行环境诊断与依赖自检
 *
 * 检查项:
 * 1. Node.js (>= 20)
 * 2. 浏览器渲染环境 (Google Chrome 或 Playwright Chromium)
 * 3. 编解码工具 (ffmpeg & ffprobe)
 * 4. TTS 配音后端 (macOS say 或 阿里云百炼 API Key)
 * 5. Python 3 + PIL (可选，用于像素等价回归与关键帧拼图)
 *
 * 用法:
 *   node scripts/doctor.js          # 人机交互友好诊断
 *   node scripts/doctor.js --json   # 输出 JSON 数据
 *   node scripts/doctor.js --quiet  # 静默运行，仅以退出码表示就绪 (0) 或缺失 (1)
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function checkNode() {
  const v = process.versions.node;
  const major = parseInt(v.split('.')[0], 10);
  const ok = major >= 20;
  return {
    name: 'Node.js',
    required: true,
    ok,
    version: `v${v}`,
    message: ok ? `v${v} (要求 >= 20)` : `当前版本 v${v} 低于要求的 >= 20，请升级 Node.js`,
    remedy: '建议升级至 Node.js 20 或更高版本 (如使用 nvm install 22)'
  };
}

function checkCommand(cmd, args = ['-version']) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
    const firstLine = out.split('\n')[0].trim();
    return { found: true, output: firstLine };
  } catch {
    return { found: false, output: '' };
  }
}

function checkFFmpeg() {
  const r = checkCommand('ffmpeg', ['-version']);
  const m = r.output.match(/ffmpeg version\s+([^\s]+)/i);
  const version = m ? m[1] : (r.found ? '已安装' : null);
  return {
    name: 'ffmpeg',
    required: true,
    ok: r.found,
    version,
    message: r.found ? (m ? `ffmpeg ${m[1]}` : '已安装') : '未检测到 ffmpeg',
    remedy: 'macOS: brew install ffmpeg | Ubuntu/Debian: sudo apt-get install -y ffmpeg'
  };
}

function checkFFprobe() {
  const r = checkCommand('ffprobe', ['-version']);
  const m = r.output.match(/ffprobe version\s+([^\s]+)/i);
  const version = m ? m[1] : (r.found ? '已安装' : null);
  return {
    name: 'ffprobe',
    required: true,
    ok: r.found,
    version,
    message: r.found ? (m ? `ffprobe ${m[1]}` : '已安装') : '未检测到 ffprobe (通常随 ffmpeg 附带)',
    remedy: 'macOS: brew install ffmpeg | Ubuntu/Debian: sudo apt-get install -y ffmpeg'
  };
}

function checkBrowser() {
  const pwChannel = process.env.PW_CHANNEL;
  let playwrightAvailable = false;
  try {
    require.resolve('playwright');
    playwrightAvailable = true;
  } catch {}

  // 1. 优先检查 Playwright Chromium
  if (playwrightAvailable) {
    try {
      const pw = require('playwright');
      const exe = pw.chromium.executablePath();
      if (exe && fs.existsSync(exe)) {
        return {
          name: '浏览器 (Playwright Chromium)',
          required: true,
          ok: true,
          version: path.basename(exe),
          message: `Playwright Chromium 就绪 (${exe})`,
          remedy: null
        };
      }
    } catch {}
  }

  // 2. 检查本机 Chrome
  const chromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];
  for (const p of chromePaths) {
    if (fs.existsSync(p)) {
      return {
        name: '浏览器 (Google Chrome)',
        required: true,
        ok: true,
        version: path.basename(p),
        message: `检测到本地浏览器: ${p}`,
        remedy: null
      };
    }
  }

  const linuxChrome = checkCommand('google-chrome', ['--version']);
  if (linuxChrome.found) {
    return {
      name: '浏览器 (Google Chrome)',
      required: true,
      ok: true,
      version: linuxChrome.output,
      message: linuxChrome.output,
      remedy: null
    };
  }

  const linuxChromium = checkCommand('chromium-browser', ['--version']);
  if (linuxChromium.found) {
    return {
      name: '浏览器 (Chromium)',
      required: true,
      ok: true,
      version: linuxChromium.output,
      message: linuxChromium.output,
      remedy: null
    };
  }

  return {
    name: '浏览器 (Chrome/Chromium)',
    required: true,
    ok: false,
    version: null,
    message: '未找到 Chrome 或 Playwright Chromium 渲染内核',
    remedy: '请安装 Google Chrome，或运行: npx playwright install chromium'
  };
}

function checkTTS() {
  const sayRes = checkCommand('say', ['-v', '?']);
  const hasSay = sayRes.found;
  const hasBailian = Boolean(process.env.BAILIAN_API_KEY || process.env.DASHSCOPE_API_KEY);

  const ok = hasSay || hasBailian;
  const backends = [];
  if (hasSay) backends.push('macOS say');
  if (hasBailian) backends.push('阿里云百炼 (DASHSCOPE_API_KEY)');

  return {
    name: 'TTS 配音后端',
    required: true,
    ok,
    version: backends.join(', ') || null,
    message: ok ? `可用后端: ${backends.join('、')}` : '无可用配音后端 (既无 macOS say，亦未配置 BAILIAN_API_KEY / DASHSCOPE_API_KEY)',
    remedy: 'macOS 自带 say；Linux/Windows 或高质量配音请配置环境变量: export DASHSCOPE_API_KEY="sk-..."'
  };
}

function checkPython() {
  const py = checkCommand('python3', ['--version']);
  if (!py.found) {
    return {
      name: 'Python 3 (可选)',
      required: false,
      ok: false,
      version: null,
      message: '未安装 python3（仅用于旧片像素回归与关键帧拼图，不影响基础出片）',
      remedy: 'brew install python3 或 sudo apt install python3 python3-pil'
    };
  }

  let hasPIL = false;
  try {
    execFileSync('python3', ['-c', 'import PIL'], { stdio: 'ignore', timeout: 2000 });
    hasPIL = true;
  } catch {}

  return {
    name: 'Python 3 & PIL (可选)',
    required: false,
    ok: true,
    version: py.output,
    message: hasPIL ? `${py.output} (PIL 就绪)` : `${py.output} (未安装 PIL/Pillow，拼图功能将跳过)`,
    remedy: hasPIL ? null : '建议安装 Pillow: pip3 install pillow'
  };
}

function checkDeps() {
  let deps = {};
  try { deps = require('../package.json').dependencies || {}; } catch (e) {}
  const missing = [];
  for (const name of Object.keys(deps)) { try { require.resolve(name); } catch (e) { missing.push(name); } }
  const ok = missing.length === 0;
  return { name: 'npm 运行时依赖', required: true, ok, version: Object.keys(deps).length + ' 项',
    message: ok ? '全部可解析' : '缺失: ' + missing.join(', '),
    remedy: ok ? null : '在 mg-studio 目录运行: npm install' };
}

function runDiagnostics() {
  const checks = [
    checkNode(),
    checkDeps(),
    checkFFmpeg(),
    checkFFprobe(),
    checkBrowser(),
    checkTTS(),
    checkPython()
  ];

  const ok = checks.filter(c => c.required).every(c => c.ok);
  return { ok, checks };
}

function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const isQuiet = args.includes('--quiet');

  const diag = runDiagnostics();

  if (isJson) {
    console.log(JSON.stringify(diag, null, 2));
    return diag.ok ? 0 : 1;
  }

  if (isQuiet) {
    return diag.ok ? 0 : 1;
  }

  console.log('=== mg-studio 环境诊断报告 ===\n');

  for (const c of diag.checks) {
    const mark = c.ok ? '✓' : (c.required ? '✗' : '!');
    const reqTag = c.required ? '[必要]' : '[可选]';
    console.log(`${mark} ${reqTag} ${c.name}: ${c.message}`);
    if (!c.ok && c.remedy) {
      console.log(`   └─ 修复指引: ${c.remedy}`);
    }
  }

  console.log('');
  if (diag.ok) {
    console.log('==> [就绪] 核心环境与依赖满足要求，可以编译与出片。\n');
    return 0;
  } else {
    console.error('==> [警告] 缺少必要的渲染或编解码依赖，请按上方提示安装后重试。\n');
    return 1;
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  runDiagnostics,
  checkNode,
  checkFFmpeg,
  checkFFprobe,
  checkBrowser,
  checkTTS,
  checkPython,
  main
};

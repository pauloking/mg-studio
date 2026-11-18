/**
 * MG Studio Desktop - Main Process (Electron)
 * 托管本地 Studio 演播室服务器，提供系统原生菜单、文件对话框、项目管理器与安全沙箱
 */

'use strict';

const { app, BrowserWindow, Menu, dialog, shell, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

function logError(title, err) {
  try {
    const userData = app.isReady() ? app.getPath('userData') : process.cwd();
    const logPath = path.join(userData, 'mg-studio-error.log');
    const msg = `[${new Date().toISOString()}] ${title}: ${err && (err.stack || err.message || err)}\n`;
    fs.appendFileSync(logPath, msg, 'utf8');
  } catch (e) {}
}

process.on('uncaughtException', (err) => {
  logError('Uncaught Exception', err);
  try {
    if (dialog && typeof dialog.showErrorBox === 'function') {
      dialog.showErrorBox('MG Studio 运行异常', `程序遇到未处理的错误：\n${err && (err.stack || err.message || err)}`);
    }
  } catch (e) {}
});

process.on('unhandledRejection', (reason) => {
  logError('Unhandled Rejection', reason);
});

const { createStudioServer, resolveProjectDir } = require('../scripts/studio');
const { runDiagnostics } = require('../scripts/doctor');
const { openDemoProject } = require('./demo-project');

function projectsDir() {
  return path.join(app.getPath('documents'), 'MG Studio Projects');
}

let mainWindow = null;
let currentServer = null;
let currentProjectInfo = null;

// 最近项目文件存储路径
function getRecentsFilePath() {
  const userDataDir = app.getPath('userData');
  return path.join(userDataDir, 'recent-projects.json');
}

function loadRecentProjects() {
  try {
    const p = getRecentsFilePath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (err) {
    console.warn('Failed to read recent projects:', err);
  }
  return [];
}

function saveRecentProject(proj) {
  try {
    let list = loadRecentProjects();
    list = list.filter(item => item.path !== proj.path);
    list.unshift(proj);
    list = list.slice(0, 15); // 最多保留 15 个
    fs.writeFileSync(getRecentsFilePath(), JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save recent project:', err);
  }
}

function clearRecentProjects() {
  try {
    const p = getRecentsFilePath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    // ignore
  }
}

// 启动或切换 Studio 本地服务
async function startStudioForProject(projectDir) {
  if (currentServer) {
    try {
      await currentServer.close();
    } catch (e) {
      console.warn('Error closing previous studio server:', e);
    }
    currentServer = null;
  }

  const resolved = resolveProjectDir(projectDir);
  const server = createStudioServer({
    projectDir: resolved, port: 0, projectsDir: projectsDir(),
    onProjectCreated(projectPath, meta) {
      if (currentServer !== server || !currentProjectInfo) return;
      currentProjectInfo = {
        ...currentProjectInfo, title: meta.title, audience: meta.audience,
        path: projectPath, lastOpened: new Date().toISOString()
      };
      saveRecentProject(currentProjectInfo);
    }
  });
  currentServer = server;
  const running = await server.start();

  // 读取工程基本信息用于最近项目记录
  let title = path.basename(resolved);
  let audience = 'patient';
  try {
    const storyPath = path.join(resolved, 'story.json');
    if (fs.existsSync(storyPath)) {
      const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
      if (story.meta && story.meta.title) title = story.meta.title;
      if (story.meta && story.meta.audience) audience = story.meta.audience;
    }
  } catch (e) {}

  currentProjectInfo = {
    title,
    path: resolved,
    audience,
    host: running.host,
    port: running.port,
    lastOpened: new Date().toISOString()
  };

  saveRecentProject(currentProjectInfo);
  return currentProjectInfo;
}

// 创建主窗口
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: 'MG Studio 演播室',
    backgroundColor: '#090a10',
    // Keep interactive web controls below the native title bar on macOS.
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  buildAppMenu();

  // 检查启动命令行是否指定了项目路径
  const args = process.argv.slice(1).filter(a => !a.startsWith('-') && !a.endsWith('.js') && !a.includes('electron'));
  const candidateDir = args.length > 0 ? args[0] : null;

  let initialProject = null;
  if (candidateDir && fs.existsSync(candidateDir)) {
    try {
      const stat = fs.statSync(candidateDir);
      if (stat.isDirectory() && fs.existsSync(path.join(candidateDir, 'story.json'))) {
        initialProject = candidateDir;
      }
    } catch (e) {}
  }

  if (initialProject) {
    // 直接载入指定工程
    startStudioForProject(initialProject).then(info => {
      mainWindow.loadURL(`http://${info.host}:${info.port}/`);
    }).catch(err => {
      console.error('Failed to load project from args:', err);
      mainWindow.loadFile(path.join(__dirname, 'project-hub.html'));
    });
  } else {
    // 默认展示项目管理中心 (Project Hub)
    mainWindow.loadFile(path.join(__dirname, 'project-hub.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 构建系统原生菜单
function buildAppMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: 'MG Studio',
      submenu: [
        { role: 'about', label: '关于 MG Studio' },
        { type: 'separator' },
        {
          label: '偏好设置...',
          accelerator: 'Cmd+,',
          click: () => {
            if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'project-hub.html'));
          }
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 MG Studio' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出 MG Studio' }
      ]
    }] : []),
    {
      label: '文件',
      submenu: [
        {
          label: '🏠 项目中心 (Project Hub)',
          accelerator: 'CmdOrCtrl+H',
          click: () => {
            if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'project-hub.html'));
          }
        },
        {
          label: '✨ 新建视频 (AI 创作工坊)...',
          accelerator: 'CmdOrCtrl+N',
          click: async () => {
            if (!mainWindow) return;
            try {
              if (currentProjectInfo && mainWindow.webContents.getURL() === `http://${currentProjectInfo.host}:${currentProjectInfo.port}/`) {
                await mainWindow.webContents.executeJavaScript('document.getElementById("btnNewProject")?.click();');
                return;
              }
              const demoDir = openDemoProject(projectsDir());
              const info = await startStudioForProject(demoDir);
              await mainWindow.loadURL(`http://${info.host}:${info.port}/?action=wizard`);
            } catch (error) {
              dialog.showErrorBox('无法打开新建视频向导', error.message);
            }
          }
        },
        {
          label: '📁 打开本地工程...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (mainWindow) {
              const res = await dialog.showOpenDialog(mainWindow, {
                title: '选择包含 story.json 的工程目录',
                properties: ['openDirectory', 'createDirectory']
              });
              if (!res.canceled && res.filePaths.length > 0) {
                const info = await startStudioForProject(res.filePaths[0]);
                mainWindow.loadURL(`http://${info.host}:${info.port}/`);
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: '🧪 打开随包示例 (mini-style-medical)',
          click: async () => {
            const demoDir = openDemoProject(projectsDir());
            const info = await startStudioForProject(demoDir);
            mainWindow.loadURL(`http://${info.host}:${info.port}/`);
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '分镜与演播',
      submenu: [
        {
          label: '⚡ 重新编译分镜',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('document.getElementById("btnCompile")?.click();');
          }
        },
        {
          label: '🛡️ 运行全量安全门检',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('if (typeof runLintCheck === "function") runLintCheck();');
          }
        },
        {
          label: '🎙️ 合成配音与排轴',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('document.getElementById("btnTts")?.click();');
          }
        },
        {
          label: '🎬 导出 1080p 视频',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('document.getElementById("btnExport")?.click();');
          }
        },
        { type: 'separator' },
        {
          label: '⏯️ 播放 / 暂停 (空格键)',
          accelerator: 'Space',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('if (typeof togglePlay === "function") togglePlay();');
          }
        }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新载入' },
        { role: 'forceReload', label: '强制重新载入' },
        { role: 'toggleDevTools', label: '切换开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '📖 MG Studio 完整手册',
          click: () => shell.openExternal('https://github.com/pauloking/mg-studio#readme')
        },
        {
          label: '🌟 GitHub 仓库与更新',
          click: () => shell.openExternal('https://github.com/pauloking/mg-studio')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ==========================================
// IPC 监听器
// ==========================================

// 原生选择项目目录
ipcMain.handle('dialog:open-project', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择分镜工程目录',
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

// 原生保存文件
ipcMain.handle('dialog:show-save', async (event, options) => {
  if (!mainWindow) return null;
  const res = await dialog.showSaveDialog(mainWindow, options || {});
  return res.canceled ? null : res.filePath;
});

// 在资源管理器/Finder 中显示
ipcMain.handle('shell:reveal', (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

// 切换并载入项目
ipcMain.handle('project:switch', async (event, target) => {
  try {
    let targetDir = target;
    let queryParam = '';

    if (typeof target === 'object' && target !== null) {
      targetDir = target.demo || !target.path ? openDemoProject(projectsDir()) : target.path;
      if (target.action === 'wizard') {
        queryParam = '?action=wizard';
      }
    }

    const info = await startStudioForProject(targetDir);
    if (mainWindow) {
      await mainWindow.loadURL(`http://${info.host}:${info.port}/${queryParam}`);
    }
    return { ok: true, info };
  } catch (err) {
    console.error('Failed to switch project:', err);
    return { ok: false, error: err.message };
  }
});

// 回到项目中心
ipcMain.handle('window:open-hub', () => {
  if (mainWindow) {
    mainWindow.loadFile(path.join(__dirname, 'project-hub.html'));
  }
  return true;
});

// 最近项目接口
ipcMain.handle('project:get-recent', () => loadRecentProjects());
ipcMain.handle('project:add-recent', (event, proj) => {
  saveRecentProject(proj);
  return true;
});
ipcMain.handle('project:clear-recent', () => {
  clearRecentProjects();
  return true;
});
ipcMain.handle('project:get-current', () => currentProjectInfo);

// 环境诊断
ipcMain.handle('env:get-diagnostics', () => {
  try {
    const diag = runDiagnostics();
    return diag.results;
  } catch (e) {
    return null;
  }
});

// 系统通知
ipcMain.handle('app:notify', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title: title || 'MG Studio', body: body || '' }).show();
  }
  return true;
});

// ==========================================
// 应用生命周期
// ==========================================

app.whenReady().then(() => {
  createMainWindow();

  if (process.env.ELECTRON_SMOKE_TEST) {
    setTimeout(() => {
      console.log('==> [SMOKE TEST] Electron window created and initialized cleanly. Exiting.');
      app.quit();
    }, 1500);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  if (currentServer) {
    try {
      await currentServer.close();
    } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

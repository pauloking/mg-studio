/**
 * MG Studio Desktop - Preload Script
 * 安全暴露 Electron 原生能力给前端 UI (Context Isolation)
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  appVersion: '0.1.0',
  platform: process.platform,

  // 原生文件与目录对话框
  openProjectDialog: () => ipcRenderer.invoke('dialog:open-project'),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:show-save', options),
  revealInFinder: (filePath) => ipcRenderer.invoke('shell:reveal', filePath),

  // 项目管理与切换
  switchProject: (projectPath) => ipcRenderer.invoke('project:switch', projectPath),
  getRecentProjects: () => ipcRenderer.invoke('project:get-recent'),
  addRecentProject: (project) => ipcRenderer.invoke('project:add-recent', project),
  clearRecentProjects: () => ipcRenderer.invoke('project:clear-recent'),
  openProjectHub: () => ipcRenderer.invoke('window:open-hub'),
  getCurrentProject: () => ipcRenderer.invoke('project:get-current'),

  // 环境自检
  getEnvDiagnostics: () => ipcRenderer.invoke('env:get-diagnostics'),

  // 原生通知
  showNotification: (title, body) => ipcRenderer.invoke('app:notify', { title, body })
});

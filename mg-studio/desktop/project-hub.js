/**
 * MG Studio Desktop - Project Hub Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  const btnNewProject = document.getElementById('btnNewProject');
  const btnOpenProject = document.getElementById('btnOpenProject');
  const btnOpenDemo = document.getElementById('btnOpenDemo');
  const btnClearRecent = document.getElementById('btnClearRecent');
  const recentList = document.getElementById('recentList');

  // 1. 新建工程（打开向导）
  btnNewProject.addEventListener('click', async () => {
    if (window.desktopAPI) {
      await window.desktopAPI.switchProject({ action: 'wizard' });
    }
  });

  // 2. 原生对话框打开已有工程
  btnOpenProject.addEventListener('click', async () => {
    if (window.desktopAPI) {
      const selected = await window.desktopAPI.openProjectDialog();
      if (selected) {
        await window.desktopAPI.switchProject(selected);
      }
    }
  });

  const sampleStatus = document.getElementById('sampleStatus');
  const sampleButtons = [btnOpenDemo, ...document.querySelectorAll('[data-example]')];
  sampleButtons.forEach(button => {
    button.addEventListener('click', async () => {
      if (!window.desktopAPI) return;
      sampleStatus.hidden = false;
      sampleStatus.textContent = '正在打开示例工程…';
      sampleButtons.forEach(item => { item.disabled = true; });
      try {
        const result = await window.desktopAPI.switchProject({ demo: true, demoId: button.dataset.example });
        if (!result.ok) throw new Error(result.error);
      } catch (error) {
        sampleStatus.textContent = `无法打开示例工程。 ${error.message}`;
      } finally {
        sampleButtons.forEach(item => { item.disabled = false; });
      }
    });
  });

  // 5. 加载并渲染最近项目
  async function loadRecentProjects() {
    if (!window.desktopAPI) return;
    try {
      const recents = await window.desktopAPI.getRecentProjects();
      if (!recents || recents.length === 0) {
        recentList.innerHTML = `
          <div style="padding: 30px 0; text-align: center; color: var(--text-muted); font-size: 12px;">
            暂无历史项目，点击左侧按钮立即开始创作
          </div>
        `;
        return;
      }

      recentList.innerHTML = '';
      recents.forEach(p => {
        const item = document.createElement('div');
        item.className = 'recent-item';
        item.innerHTML = `
          <div class="recent-info">
            <h4></h4>
            <p></p>
          </div>
          <span class="recent-badge">${p.audience === 'patient' ? '患者科普' : p.audience === 'professional' ? '专业学术' : '通用'}</span>
        `;
        item.querySelector('h4').textContent = p.title || '未命名工程';
        const location = item.querySelector('p');
        location.textContent = location.title = p.path;
        item.addEventListener('click', async () => {
          await window.desktopAPI.switchProject(p.path);
        });
        recentList.appendChild(item);
      });
    } catch (err) {
      console.warn('Failed to load recents:', err);
    }
  }

  // 清空最近项目
  btnClearRecent.addEventListener('click', async () => {
    if (window.desktopAPI) {
      await window.desktopAPI.clearRecentProjects();
      loadRecentProjects();
    }
  });

  // 6. 环境诊断指标加载
  async function loadDiagnostics() {
    if (!window.desktopAPI) return;
    try {
      const diag = await window.desktopAPI.getEnvDiagnostics();
      if (diag) {
        const updateDot = (id, ok) => {
          const el = document.getElementById(id);
          if (el) el.style.background = ok ? '#10b981' : '#f43f5e';
        };
        updateDot('dotNode', diag.node && diag.node.ok);
        updateDot('dotChrome', diag.browser && diag.browser.ok);
        updateDot('dotFFmpeg', diag.ffmpeg && diag.ffmpeg.ok);
        updateDot('dotTTS', diag.tts && diag.tts.ok);
      }
    } catch (e) {
      console.warn('Diagnostics error:', e);
    }
  }

  loadRecentProjects();
  loadDiagnostics();
});

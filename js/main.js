/* ============================================================
   入口文件：初始化所有模块，注册跨模块回调
============================================================ */

import { initUI, setTabChangeCallback } from './ui.js';
import { initContent, loadAnnouncements, loadTeams } from './content.js';
import { initAuth, setAuthChangeCallback } from './auth.js';
import { initTools, renderToolsPanel } from './tools.js';

/* 把跨模块需要用到的方法挂到全局，供其他模块调用 */
window.app = {
  loadAnnouncements,
  loadTeams,
  renderToolsPanel
};

/* 标签切换时刷新对应内容 */
setTabChangeCallback((name) => {
  if (name === 'tools') renderToolsPanel();
  if (name === 'teams') loadTeams();
});

/* 登录状态变化时刷新工具面板 */
setAuthChangeCallback(() => {
  renderToolsPanel();
});

/* 初始化 */
initUI();
initContent();
initAuth();
initTools();

/* 如果首屏直接落在 tools 标签，补一次渲染 */
if (document.querySelector('.panel[data-panel="tools"]')?.classList.contains('is-active')) {
  renderToolsPanel();
}
/* ============================================================
   入口文件：初始化所有模块，注册跨模块回调
============================================================ */

import { initUI, setTabChangeCallback } from './ui.js';
import {
  initContent,
  loadAnnouncements, loadTeams, loadSchedule,
  loadHistory, loadThanks, loadStaff
} from './content.js?v=20261003-06';
import { initAuth, setAuthChangeCallback } from './auth.js';
import { initTools, renderToolsPanel } from './tools.js';

/* 把跨模块需要用到的方法挂到全局，供其他模块调用 */
window.app = {
  loadAnnouncements,
  loadTeams,
  loadSchedule,
  renderToolsPanel
};

/* tab 数据懒加载：每个 tab 只加载一次 */
const __tabLoaded = new Set();

function ensureTabLoaded(name) {
  if (__tabLoaded.has(name)) return;
  __tabLoaded.add(name);

  if (name === 'tools')    renderToolsPanel();
  if (name === 'teams')    loadTeams();
  if (name === 'schedule') loadSchedule();
  if (name === 'about')    { loadHistory(); loadThanks(); loadStaff(); }
}

/* 标签切换时按需加载对应内容 */
setTabChangeCallback((name) => {
  ensureTabLoaded(name);
});

/* 登录状态变化时刷新工具面板 */
setAuthChangeCallback(() => {
  renderToolsPanel();
  loadSchedule();
});

/* 初始化 */
initUI();
initContent();
initAuth();
initTools();

const initialTab = (location.hash.replace('#', '') || 'home');
ensureTabLoaded(initialTab);
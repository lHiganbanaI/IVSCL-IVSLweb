/* ============================================================
   入口文件：初始化所有模块，注册跨模块回调
============================================================ */

import { initUI, setTabChangeCallback } from './ui.js';
import {
  initContent,
  loadAnnouncements, loadTeams, loadSchedule,
  loadHistory, loadThanks, loadStaff
} from './content.js?v=20261004-04';
import { initAuth, setAuthChangeCallback } from './auth.js';
import { initTools, renderToolsPanel } from './tools.js';
import { renderKingTimeline } from './king.js';

window.app = {
  loadAnnouncements,
  loadTeams,
  loadSchedule,
  renderToolsPanel
};

const __tabLoaded = new Set();

function ensureTabLoaded(name) {
  if (__tabLoaded.has(name)) return;
  __tabLoaded.add(name);

  if (name === 'tools')    renderToolsPanel();
  if (name === 'teams')    loadTeams();
  if (name === 'schedule') loadSchedule();
  if (name === 'about')    { loadHistory(); loadThanks(); loadStaff(); }
  if (name === 'king')     renderKingTimeline();
}

setTabChangeCallback((name) => {
  ensureTabLoaded(name);
});

setAuthChangeCallback(() => {
  renderToolsPanel();
  loadSchedule();
});

initUI();
initContent();
initAuth();
initTools();

const initialTab = (location.hash.replace('#', '') || 'home');
ensureTabLoaded(initialTab);
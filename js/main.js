/* ============================================================
   入口文件：初始化所有模块，注册跨模块回调
============================================================ */

import { initUI, setTabChangeCallback } from './ui.js';
import {
  initContent,
  loadAnnouncements, loadTeams, loadSchedule,
  loadHistory, loadThanks, loadStaff,
  loadResults, loadHub, loadGuessBoard
} from './content.js?v=20261005-07';
import { initAuth, setAuthChangeCallback } from './auth.js?v=20261005-07';
import { initTools, renderToolsPanel } from './tools.js?v=20261005-07';
import { renderKingTimeline } from './king.js';
import { showActionNotice } from './ui-toast.js';

window.app = {
  loadAnnouncements,
  loadTeams,
  loadSchedule,
  renderToolsPanel,
  showActionNotice
};

const __tabLoaded = new Set();

function ensureTabLoaded(name) {
  if (__tabLoaded.has(name)) return;
  __tabLoaded.add(name);

  if (name === 'tools')    renderToolsPanel();
  if (name === 'teams')    loadTeams();
  if (name === 'schedule') loadSchedule();
  if (name === 'hub')      loadHub();
  if (name === 'results')  loadResults();
  if (name === 'board')    loadGuessBoard();
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
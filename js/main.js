/* ============================================================
   入口文件：初始化所有模块，注册跨模块回调
============================================================ */

import { initUI, setTabChangeCallback } from './ui.js?v=20261006-17';
import {
  initContent,
  loadAnnouncements, loadTeams, loadSchedule,
  loadHistory, loadThanks, loadStaff,
  loadGuessBoard
} from './content.js?v=20261006-17';
import { initAuth, setAuthChangeCallback } from './auth.js?v=20261006-17';
import { initTools, renderToolsPanel } from './tools.js?v=20261006-17';
import { renderMinePage } from './mine.js?v=20261006-17';
import { showActionNotice } from './ui-toast.js?v=20261006-17';

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
  if (name === 'board')    loadGuessBoard();
  if (name === 'about')    { loadHistory(); loadThanks(); loadStaff(); }
  if (name === 'mine')     renderMinePage();
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
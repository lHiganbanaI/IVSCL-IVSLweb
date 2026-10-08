/* ============================================================
   入口文件：装配各领域控制器，注册 tab 加载映射
   @file js/main.js
============================================================ */
import { initUI, setTabChangeCallback } from './ui.js?v=20261006-29';
import {
  initContent,
  loadAnnouncements, loadTeams, loadSchedule,
  loadHistory, loadThanks, loadStaff,
  loadGuessBoard
} from './content.js?v=20261006-29';
import { initAuth, setAuthChangeCallback } from './auth.js?v=20261006-29';
import { renderMinePage } from './mine.js?v=20261006-29';
import { showActionNotice } from './ui-toast.js?v=20261006-29';

/* 对外门面：暴露常用加载器 / toast */
window.app = {
  loadAnnouncements,
  loadTeams,
  loadSchedule,
  showActionNotice
};

/* tab → 加载器（声明式映射，新增 tab 只需加一行） */
const TAB_LOADERS = {
  teams:    () => loadTeams(),
  schedule: () => loadSchedule(),
  board:    () => loadGuessBoard(),
  about:    () => { loadHistory(); loadThanks(); loadStaff(); },
  mine:     () => renderMinePage()
};

const __tabLoaded = new Set();

function ensureTabLoaded(name) {
  if (__tabLoaded.has(name) || !TAB_LOADERS[name]) return;
  __tabLoaded.add(name);
  TAB_LOADERS[name]();
}

setTabChangeCallback(ensureTabLoaded);
setAuthChangeCallback(() => loadSchedule());

initUI();
initContent();
initAuth();

ensureTabLoaded(location.hash.replace('#', '') || 'home');

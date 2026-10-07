/* ============================================================
   内容层 · 兼容入口
   content.js 原为 2341 行上帝模块，已按领域拆分为 js/controllers/*。
   本文件仅保留对外的公共 API re-export（委托给各领域控制器单例），
   确保 index.html / main.js / tools.js / mine.js / my-matches.js 的调用不变。
   @file js/content.js
============================================================ */
import { showActionNotice, showAlert, showConfirm } from './ui-toast.js';
import { clearVotesCache as _clearVotesCache } from './controllers/shared.js';
import { store } from './store.js';
import { announcementsController } from './controllers/announcements.js';
import { qaController } from './controllers/qa.js';
import { homeController } from './controllers/home.js';
import { teamsController } from './controllers/teams.js';
import { aboutController } from './controllers/about.js';
import { scheduleController } from './controllers/schedule.js';
import { resultsController } from './controllers/results.js';
import { hubController } from './controllers/hub.js';
import { guessController } from './controllers/guess.js';

/* 兼容 re-export：toast */
export { showActionNotice, showAlert, showConfirm };

/* 打 Call 缓存清理 */
export const refreshVotes = () => _clearVotesCache();

/* /api/teams 请求缓存 → DataStore 统一持有 */
export const fetchTeams = () => store.fetchTeams();
export const fetchTeamLogos = () => store.fetchTeamLogos();
export const invalidateTeams = () => store.invalidateTeams();

/* 公告 */
export const loadAnnouncements = () => announcementsController.load();

/* Q&A */
export const loadQAs = () => qaController.load();

/* 主页 */
export const loadHomeSchedule = () => homeController.loadSchedule();
export const loadHomeResults = () => homeController.loadResults();

/* 队伍 */
export const renderTeams = (list, container, opts = {}) => teamsController.render(list, container, opts);
export const loadTeams = () => teamsController.load();

/* 关于（历届 / 鸣谢 / 工作人员） */
export const loadHistory = () => aboutController.loadHistory();
export const loadThanks = () => aboutController.loadThanks();
export const loadStaff = () => aboutController.loadStaff();

/* 赛程 */
export const showMatchDetails = (match, appointment) => scheduleController.showMatchDetails(match, appointment);
export const renderSchedule = (list, container, title, logoMap, nameMap, scheduleId = null, appointments = [], tournament = null) =>
  scheduleController.renderSchedule(list, container, title, logoMap, nameMap, scheduleId, appointments, tournament);
export const loadSchedule = () => scheduleController.load();
export const renderScheduleAdmin = () => scheduleController.renderScheduleAdmin();
export const mountToolInto = (toolId, boxId) => scheduleController.mountToolInto(toolId, boxId);

/* 赛果 */
export const loadResults = () => resultsController.load();

/* 赛事中心 */
export const loadHub = () => hubController.load();

/* 竞猜 */
export const loadGuessBoard = () => guessController.loadBoard();
export const renderGuessCenter = () => guessController.renderCenter();

/* 首屏内容 */
export function initContent() {
  loadAnnouncements();
  loadQAs();
  loadHomeSchedule();
  loadHomeResults();
}

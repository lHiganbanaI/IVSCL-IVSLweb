/* ============================================================
   DataStore：前端统一数据服务层（单例）
   ------------------------------------------------------------
   职责：
     - 统一 API 请求与错误处理
     - 团队 / 队徽等只读数据的请求缓存与失效
     - 各类资源的只读数据获取（渲染交给展示层）
   渲染层（content.js 等）只消费数据，不持有请求状态。
============================================================ */
import { apiRequest, getCurrentUser } from './api.js';

export class DataStore {
  constructor() {
    this._teamsPromise = null;       // /api/teams 请求缓存
    this._teamLogosPromise = null;   // /api/team-logos 请求缓存
  }

  /* ---------- 会话 ---------- */
  getUser() {
    return getCurrentUser();
  }

  /* ---------- 通用请求 ---------- */
  request(path, options) {
    return apiRequest(path, options);
  }

  /* ---------- 团队（带缓存） ---------- */
  fetchTeams() {
    if (!this._teamsPromise) {
      this._teamsPromise = this.request('/api/teams?basic=1').catch(err => {
        this._teamsPromise = null;
        throw err;
      });
    }
    return this._teamsPromise;
  }

  /* 完整队伍数据（含 base64 logo）：赛程 / 赛果等需要展示队徽的页面使用，
     避免依赖 /api/team-logos 单点（该接口偶发超时会导致队徽全部回退为占位图） */
  fetchTeamsFull() {
    if (!this._teamsFullPromise) {
      this._teamsFullPromise = this.request('/api/teams').catch(err => {
        this._teamsFullPromise = null;
        throw err;
      });
    }
    return this._teamsFullPromise;
  }

  fetchTeamLogos() {
    if (!this._teamLogosPromise) {
      this._teamLogosPromise = this.request('/api/team-logos').catch(err => {
        this._teamLogosPromise = null;
        throw err;
      });
    }
    return this._teamLogosPromise;
  }

  invalidateTeams() {
    this._teamsPromise = null;
    this._teamLogosPromise = null;
  }

  /* ---------- 公告 ---------- */
  loadAnnouncements() {
    return this.request('/api/announcements');
  }

  /* ---------- 赛程 / 约赛 ---------- */
  loadSchedule() {
    return this.request('/api/schedule');
  }

  loadAppointments(scheduleId) {
    return this.request(`/api/match-appointments?schedule_id=${scheduleId}`);
  }

  /* ---------- 工作人员 ---------- */
  loadStaff() {
    return this.request('/api/staff');
  }

  /* ---------- 队长 / 选手 ---------- */
  loadMySchool() {
    return this.request('/api/team/school');
  }

  loadTeamsFull() {
    return this.request('/api/teams');
  }

  loadPlayers(school) {
    return this.request(
      school ? `/api/team/players?school=${encodeURIComponent(school)}` : '/api/team/players'
    );
  }
}

/** 全局共享单例 */
export const store = new DataStore();

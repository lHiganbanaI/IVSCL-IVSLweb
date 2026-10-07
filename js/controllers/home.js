/* ============================================================
   主页控制器 · HomeController（今日赛程 / 最新战报）
   @file js/controllers/home.js
============================================================ */
import { sanitize, formatBeijing } from '../utils.js';
import { parseTournament } from '../tournament.js';
import { store } from '../store.js';

function todayStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dateStrOf(t) {
  const d = new Date(t);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export class HomeController {
  constructor() {}

  /* 拉取 schedule + teams + appointments，返回解析后的扁平比赛与 nameMap */
  async fetchContext() {
    const [scheduleData, teamData] = await Promise.all([
      store.loadSchedule().catch(() => ({})),
      store.fetchTeams().catch(() => ({ teams: [] }))
    ]);
    const schedule = scheduleData.schedule;
    const nameMap = {};
    (teamData.teams || []).forEach(t => { nameMap[t.short] = t.name; });

    let appointments = [];
    if (schedule && schedule.matches) {
      const appointmentData = await store.loadAppointments(schedule.id).catch(() => ({ appointments: [] }));
      appointments = appointmentData.appointments || [];
    }
    const tournament = schedule ? parseTournament(schedule.matches) : null;
    const flatMatches = tournament ? tournament.allMatches : (Array.isArray(schedule?.matches) ? schedule.matches : []);
    return { schedule, nameMap, appointments, flatMatches };
  }

  async loadSchedule() {
    const box = document.getElementById('homeSchedule');
    if (!box) return;
    try {
      const { nameMap, appointments, flatMatches } = await this.fetchContext();
      if (!flatMatches.length) {
        box.innerHTML = '<li class="home-schedule__state">赛程尚未发布</li>';
        box.setAttribute('aria-busy', 'false');
        return;
      }

      const appointmentByIndex = new Map(appointments.map(a => [a.match_index, a]));
      const list = flatMatches.map((m, i) => ({ match: m, index: i, appointment: appointmentByIndex.get(i) }));

      const upcoming = list
        .filter(item => !item.appointment?.is_finished)
        .sort((a, b) => {
          const at = a.appointment?.start_time ? new Date(a.appointment.start_time).getTime() : Infinity;
          const bt = b.appointment?.start_time ? new Date(b.appointment.start_time).getTime() : Infinity;
          return at - bt;
        });

      let show = upcoming.filter(item => {
        const t = item.appointment?.start_time;
        return t && dateStrOf(t) === todayStr();
      }).slice(0, 2);

      let label = '今日';
      if (!show.length) {
        show = upcoming.slice(0, 2);
        label = '近期';
      }
      if (!show.length) {
        box.innerHTML = '<li class="home-schedule__state">暂无未完成的比赛</li>';
        box.setAttribute('aria-busy', 'false');
        return;
      }

      box.innerHTML = show.map(item => {
        const aName = nameMap[item.match.a] || item.match.a || '轮空';
        const bName = nameMap[item.match.b] || item.match.b || '轮空';
        const timeStr = item.appointment?.start_time ? formatBeijing(item.appointment.start_time) : '待定';
        return `
          <li class="home-schedule__item">
            <div class="home-schedule__meta">
              <span class="home-schedule__label">${label}</span>
              <span class="home-schedule__time">${sanitize(timeStr)}</span>
            </div>
            <div class="home-schedule__vs">
              <span>${sanitize(aName)}</span>
              <em>VS</em>
              <span>${sanitize(bName)}</span>
            </div>
          </li>
        `;
      }).join('');
    } catch (err) {
      box.innerHTML = '<li class="home-schedule__state">加载失败</li>';
    }
    box.setAttribute('aria-busy', 'false');
  }

  async loadResults() {
    const box = document.getElementById('homeResults');
    if (!box) return;
    try {
      const { nameMap, appointments, flatMatches } = await this.fetchContext();
      if (!flatMatches.length) {
        box.innerHTML = '<li class="home-schedule__state">赛程尚未发布</li>';
        box.setAttribute('aria-busy', 'false');
        return;
      }

      const appointmentByIndex = new Map(appointments.map(a => [a.match_index, a]));
      const finished = flatMatches
        .map((m, i) => ({ match: m, index: i, appointment: appointmentByIndex.get(i) }))
        .filter(item => item.appointment?.is_finished && item.appointment.score_a != null && item.appointment.score_b != null)
        .sort((a, b) => (b.appointment.id || 0) - (a.appointment.id || 0))
        .slice(0, 1);

      if (!finished.length) {
        box.innerHTML = '<li class="home-schedule__state">还没有已完赛的比赛</li>';
        box.setAttribute('aria-busy', 'false');
        return;
      }

      box.innerHTML = finished.map(item => {
        const aName = nameMap[item.match.a] || item.match.a || '—';
        const bName = nameMap[item.match.b] || item.match.b || '—';
        const sa = item.appointment.score_a;
        const sb = item.appointment.score_b;
        const aWin = sa > sb;
        const bWin = sb > sa;
        return `
          <li class="home-result__item">
            <div class="home-result__team ${aWin ? 'is-win' : ''}">
              ${aWin ? '<em>🏆</em>' : ''}
              <span>${sanitize(aName)}</span>
            </div>
            <div class="home-result__score">${sa} : ${sb}</div>
            <div class="home-result__team ${bWin ? 'is-win' : ''}">
              <span>${sanitize(bName)}</span>
              ${bWin ? '<em>🏆</em>' : ''}
            </div>
          </li>
        `;
      }).join('');
    } catch (err) {
      box.innerHTML = '<li class="home-schedule__state">加载失败</li>';
    }
    box.setAttribute('aria-busy', 'false');
  }
}

export const homeController = new HomeController();

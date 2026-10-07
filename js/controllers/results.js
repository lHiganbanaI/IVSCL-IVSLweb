/* ============================================================
   赛果控制器 · ResultsController（已完赛 / 战报）
   @file js/controllers/results.js
============================================================ */
import { sanitize } from '../utils.js';
import { store } from '../store.js';
import { parseTournament } from '../tournament.js';
import { scheduleSideHtml, formatMatchTime } from './shared.js';
import { scheduleController } from './schedule.js';

export class ResultsController {
  constructor() {}

  render(list, container, title, nameMap, appointments) {
    const appointmentByIndex = new Map(appointments.map(a => [a.match_index, a]));
    const done = list
      .map((m, i) => ({ match: m, flatIndex: i, appointment: appointmentByIndex.get(i) }))
      .filter(item => item.appointment?.is_finished && item.appointment.score_a != null && item.appointment.score_b != null)
      .sort((a, b) => (b.appointment.id || 0) - (a.appointment.id || 0));

    if (!done.length) {
      container.innerHTML = '<div class="board__state">暂无已完赛的赛果</div>';
      return;
    }

    const items = done.map(({ match, flatIndex, appointment }) => {
      const aName = nameMap[match.a] || match.a || '轮空';
      const bName = nameMap[match.b] || match.b || '轮空';
      const sa = appointment.score_a, sb = appointment.score_b;
      const decided = sa !== sb;
      const winA = decided && sa > sb;
      const winB = decided && sb > sa;
      const time = appointment.start_time ? formatMatchTime(appointment.start_time) : '';
      const line = decided
        ? (sa > sb
            ? `${aName} 以 ${sa}:${sb} 战胜 ${bName}`
            : `${bName} 以 ${sb}:${sa} 战胜 ${aName}`)
        : `${aName} 与 ${bName} 战成 ${sa}:${sb} 平手`;

      return `
        <div class="result-card" role="button" tabindex="0"
             data-result-index="${flatIndex}" aria-label="查看 ${aName} 对阵 ${bName} 详情">
          ${scheduleSideHtml(match.a, {}, nameMap, winA)}
          <div class="result-card__center">
            <div class="result-card__score">
              <b class="${winA ? 'is-win' : ''}">${sa}</b><span>:</span><b class="${winB ? 'is-win' : ''}">${sb}</b>
            </div>
            <div class="result-card__line">${sanitize(line)}</div>
            ${time ? `<div class="result-card__time">${sanitize(time)}</div>` : ''}
          </div>
          ${scheduleSideHtml(match.b, {}, nameMap, winB)}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="results-head"><span class="results-head__title">${sanitize(title)}</span><span class="results-head__count">${done.length} 场已完赛</span></div>
      <div class="results-list">${items}</div>
    `;

    container.querySelectorAll('[data-result-index]').forEach(card => {
      card.addEventListener('click', () => {
        const idx = Number(card.dataset.resultIndex);
        scheduleController.showMatchDetails(list[idx], appointmentByIndex.get(idx));
      });
    });
    container.setAttribute('aria-busy', 'false');
  }

  async load() {
    const box = document.getElementById('resultsBoard');
    if (!box) return;
    box.innerHTML = '<div class="board__state">正在加载赛果…</div>';
    try {
      const data = await store.loadSchedule();
      const s = data.schedule;
      if (!s || !s.matches) {
        box.innerHTML = '<div class="board__state">尚未发布赛程</div>';
        return;
      }
      const tournament = parseTournament(s.matches);
      const flatMatches = tournament ? tournament.allMatches : (Array.isArray(s.matches) ? s.matches : []);
      const appointmentData = await store.loadAppointments(s.id).catch(() => ({ appointments: [] }));
      const appointments = appointmentData.appointments || [];
      const td = await store.fetchTeams().catch(() => ({ teams: [] }));
      const nameMap = {};
      (td.teams || []).forEach(t => { nameMap[t.short] = t.name; });
      this.render(flatMatches, box, s.title || '赛程', nameMap, appointments);
    } catch (err) {
      box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    }
  }
}

export const resultsController = new ResultsController();

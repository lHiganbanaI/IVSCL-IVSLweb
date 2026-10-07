/* ============================================================
   赛事中心控制器 · HubController（对阵总览 + 竞猜积分榜）
   @file js/controllers/hub.js
============================================================ */
import { apiRequest } from '../api.js';
import { sanitize } from '../utils.js';
import { store } from '../store.js';
import { parseTournament } from '../tournament.js';
import { scheduleSideHtml, formatMatchTime } from './shared.js';
import { scheduleController } from './schedule.js';

export class HubController {
  constructor() {}

  render(list, container, title, nameMap, appointments, leaderboard) {
    const appointmentByIndex = new Map(appointments.map(a => [a.match_index, a]));
    const board = (leaderboard || []).slice(0, 10);

    const matchesHtml = list.map((m, i) => {
      const appt = appointmentByIndex.get(i);
      const aName = nameMap[m.a] || m.a || '轮空';
      const bName = nameMap[m.b] || m.b || '轮空';
      const finished = !!appt?.is_finished;
      const sa = appt?.score_a, sb = appt?.score_b;
      const decided = finished && sa != null && sb != null && sa !== sb;
      const winA = decided && sa > sb, winB = decided && sb > sa;
      const time = appt?.start_time ? formatMatchTime(appt.start_time) : '';
      const stateTag = finished
        ? '<span class="hub-match__state is-finished">已完赛</span>'
        : appt ? '<span class="hub-match__state is-scheduled">已约赛</span>' : '<span class="hub-match__state">待约赛</span>';
      return `
        <div class="hub-match" role="button" tabindex="0" data-hub-index="${i}"
             aria-label="查看 ${aName} 对阵 ${bName} 详情">
          ${scheduleSideHtml(m.a, {}, nameMap, winA)}
          <div class="hub-match__center">
            ${stateTag}
            <div class="hub-match__score">
              ${decided
                ? `<b class="${winA ? 'is-win' : ''}">${sa}</b><span>:</span><b class="${winB ? 'is-win' : ''}">${sb}</b>`
                : '<span class="hub-match__vs">VS</span>'}
            </div>
            ${time ? `<div class="hub-match__time">${sanitize(time)}</div>` : ''}
          </div>
          ${scheduleSideHtml(m.b, {}, nameMap, winB)}
        </div>
      `;
    }).join('');

    const lbHtml = board.length
      ? board.map((p, i) => `<li class="hub-lb__row"><b>#${i + 1}</b><span>${sanitize(p.username)}</span><em>猜中 ${p.correct}/${p.total}</em></li>`).join('')
      : '<li class="hub-lb__empty">暂无竞猜积分</li>';

    container.innerHTML = `
      <div class="hub">
        <div class="hub__head"><h3 class="hub__title">${sanitize(title)}</h3><span class="hub__count">${list.length} 场</span></div>
        <section class="hub-block">
          <div class="hub-block__head"><h4>🏆 竞猜积分榜</h4><span class="hub-block__note">猜中 / 参与场次</span></div>
          <ul class="hub-lb">${lbHtml}</ul>
        </section>
        <section class="hub-block">
          <div class="hub-block__head"><h4>对阵总览</h4></div>
          <div class="hub-list">${matchesHtml}</div>
        </section>
      </div>
    `;

    container.querySelectorAll('[data-hub-index]').forEach(card => {
      card.addEventListener('click', () => {
        const idx = Number(card.dataset.hubIndex);
        scheduleController.showMatchDetails(list[idx], appointmentByIndex.get(idx));
      });
    });
    container.setAttribute('aria-busy', 'false');
  }

  async load() {
    const box = document.getElementById('hubBoard');
    if (!box) return;
    box.innerHTML = '<div class="board__state">正在加载赛事中心…</div>';
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
      const lb = await apiRequest('/api/guesses/leaderboard?schedule_id=' + s.id).catch(() => ({ leaderboard: [] }));
      this.render(flatMatches, box, s.title || '赛程', nameMap, appointments, lb.leaderboard || []);
    } catch (err) {
      box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    }
  }
}

export const hubController = new HubController();

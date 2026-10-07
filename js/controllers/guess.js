/* ============================================================
   竞猜控制器 · GuessController（竞猜榜 / 竞猜中心 / 公开排行榜）
   @file js/controllers/guess.js
============================================================ */
import { apiRequest, getCurrentUser } from '../api.js';
import { sanitize } from '../utils.js';
import { store } from '../store.js';
import { scheduleController } from './schedule.js';

export class GuessController {
  constructor() {}

  /* 竞猜中心（管理员 / 绝版内测可进入，挂载竞猜工具） */
  renderCenter() {
    const box = document.getElementById('guessCenter');
    if (!box) return;
    const u = getCurrentUser();
    if (!u || !['admin', 'beta'].includes(u.role)) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <div class="guess-center">
        <div class="guess-center__head"><h3>赛事竞猜</h3><em>GUESS</em></div>
        <div id="guessCenterBox"></div>
      </div>`;
    scheduleController.mountToolInto('guess', 'guessCenterBox');
  }

  renderBoardPage(box, title, board, cb, nameMap) {
    const nm = (s) => nameMap[s] || s;
    const matchRows = (board || []).length
      ? board.map((p, i) => `
          <li class="gb-row">
            <b class="gb-row__rank">#${i + 1}</b>
            <span class="gb-row__name">${sanitize(p.username)}</span>
            <em class="gb-row__score">${p.correct} / ${p.total} 场</em>
          </li>`).join('')
      : '<li class="gb-empty">暂无竞猜记录</li>';

    const champRows = (cb.leaderboard || []).length
      ? cb.leaderboard.map((p, i) => `
          <li class="gb-row">
            <b class="gb-row__rank">#${i + 1}</b>
            <span class="gb-row__name">${sanitize(p.username)}</span>
            <span class="gb-row__pick">→ ${sanitize(nm(p.pick))}</span>
            <em class="gb-row__score">${cb.settled ? (p.correct ? '✓ 猜中' : '✗') : '·'}</em>
          </li>`).join('')
      : '<li class="gb-empty">暂无冠军竞猜记录</li>';

    box.innerHTML = `
      <div class="gb">
        <div class="gb__head"><h3 class="gb__title">${sanitize(title)}</h3><span class="gb__count">公开排行榜</span></div>
        <section class="gb-block">
          <div class="gb-block__head"><h4>场次竞猜积分</h4><span class="gb-block__note">按猜中数排序</span></div>
          <ul class="gb-list">${matchRows}</ul>
        </section>
        <section class="gb-block">
          <div class="gb-block__head"><h4>🏆 冠军竞猜</h4><span class="gb-block__note">${cb.settled ? `冠军：${sanitize(nm(cb.champion))}` : '冠军待定，赛后揭晓'}</span></div>
          <ul class="gb-list">${champRows}</ul>
        </section>
      </div>
    `;
    box.setAttribute('aria-busy', 'false');
  }

  async loadBoard() {
    const box = document.getElementById('boardBoard');
    if (!box) return;
    box.innerHTML = '<div class="board__state">正在加载竞猜榜…</div>';
    this.renderCenter();
    try {
      const data = await store.loadSchedule();
      const s = data.schedule;
      if (!s || !s.id) {
        box.innerHTML = '<div class="board__state">尚未发布赛程</div>';
        return;
      }
      const td = await store.fetchTeams().catch(() => ({ teams: [] }));
      const nameMap = {};
      (td.teams || []).forEach(t => { nameMap[t.short] = t.name; });
      const lb = await apiRequest('/api/guesses/leaderboard?schedule_id=' + s.id).catch(() => ({ leaderboard: [] }));
      const cb = await apiRequest('/api/guesses/champion/leaderboard?schedule_id=' + s.id).catch(() => ({ leaderboard: [], settled: false, champion: null }));
      this.renderBoardPage(box, s.title || '赛程', lb.leaderboard || [], cb, nameMap);
    } catch (err) {
      box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    }
  }
}

export const guessController = new GuessController();

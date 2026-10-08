/* ============================================================
   关于控制器 · AboutController（历届冠亚军 / 特别鸣谢 / 工作人员）
   @file js/controllers/about.js
============================================================ */
import { sanitize, getInitial } from '../utils.js';
import {
  HISTORY_LOGO_DIR, HISTORY_LOGO_EXT,
  THANKS_SUB_MAP,
  DEFAULT_HISTORY, DEFAULT_THANKS
} from '../config.js?v=20261006-29';
import { store } from '../store.js';
import { canVote, hydrateVoteButtons } from './shared.js';

export class AboutController {
  constructor() {}

  renderHistory(list, container) {
    if (!list || !list.length) {
      container.innerHTML = '<div class="board__state" style="flex:1">暂无历史数据</div>';
      return;
    }
    const nodesHtml = list.map(item => {
      if (item.upcoming) {
        return `
          <div class="timeline-h__node timeline-h__node--upcoming">
            <div class="timeline-h__dot" aria-hidden="true"></div>
            <div class="timeline-h__event">${sanitize(item.event)}</div>
            <div class="timeline-h__card timeline-h__card--upcoming">
              <p class="timeline-h__upcoming-text">
                <b>敬请期待</b>
                冠军与亚军<br>将在赛事落幕后揭晓
              </p>
            </div>
          </div>
        `;
      }
      const champion = item.champion || {};
      const runner   = item.runnerUp || {};
      const champLogo = `${HISTORY_LOGO_DIR}loge_${sanitize(champion.short || '')}${HISTORY_LOGO_EXT}`;
      const runLogo   = `${HISTORY_LOGO_DIR}loge_${sanitize(runner.short || '')}${HISTORY_LOGO_EXT}`;
      const FALLBACK = (color, stroke) => `data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2246%22 fill=%22${color}%22 stroke=%22${stroke}%22 stroke-width=%222%22 stroke-dasharray=%226 6%22/><text x=%2250%22 y=%2264%22 font-size=%2240%22 font-weight=%22900%22 fill=%22${stroke}%22 text-anchor=%22middle%22 font-family=%22sans-serif%22>?</text></svg>`;
      return `
        <div class="timeline-h__node">
          <div class="timeline-h__dot" aria-hidden="true"></div>
          <div class="timeline-h__event">${sanitize(item.event)}</div>
          <div class="timeline-h__card">
            <div class="timeline-h__crown">
              <div class="timeline-h__crown-logo-wrap">
                <img class="timeline-h__crown-logo" src="${champLogo}" alt="${sanitize(champion.name || '')} logo" loading="lazy"
                  onerror="this.onerror=null;this.src='${FALLBACK('%23182242', '%23d4b47a')}'">
              </div>
              <div class="timeline-h__crown-name">
                <em>🏆 冠 军</em>
                <b>${sanitize(champion.name || '')}</b>
              </div>
            </div>
            <div class="timeline-h__runner">
              <img class="timeline-h__runner-logo" src="${runLogo}" alt="${sanitize(runner.name || '')} logo" loading="lazy"
                onerror="this.onerror=null;this.src='${FALLBACK('%23182224', '%23a68bd4')}'">
              <div class="timeline-h__runner-info">
                <em>🥈 亚 军</em>
                <b>${sanitize(runner.name || '')}</b>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    container.innerHTML = `<div class="timeline-h__axis" aria-hidden="true"></div>${nodesHtml}`;
    container.setAttribute('aria-busy', 'false');
  }

  async loadHistory() {
    const box = document.getElementById('timelineTrack');
    if (!box) return;
    let list = null;
    try {
      const res = await fetch('data/history.json');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.history)) list = data.history;
      }
    } catch (err) {}
    if (!list || !list.length) list = DEFAULT_HISTORY;
    this.renderHistory(list, box);
  }

  renderThanks(list, container) {
    if (!list || !list.length) {
      container.innerHTML = '<div class="board__state" style="grid-column:1/-1">暂无鸣谢名单</div>';
      return;
    }
    container.innerHTML = list.map(item => {
      const category = sanitize(item.category || '');
      const icon     = item.icon || '🤝';
      const members  = Array.isArray(item.members) ? item.members : [];
      const sub      = THANKS_SUB_MAP[category] || 'MEMBER';
      const rows = members.map(m => {
        const name   = typeof m === 'string' ? m : (m.name || '');
        const avatar = typeof m === 'string' ? null : m.avatar;
        const nameSafe = sanitize(name);
        const initial  = sanitize(getInitial(name));
        const avatarHtml = avatar
          ? `<img class="thanks-card__avatar thanks-card__avatar--img"
                  src="assets/avatars/${sanitize(avatar)}.jpg"
                  alt="${nameSafe}"
                  loading="lazy"
                  onerror="this.outerHTML='&lt;span class=&quot;thanks-card__avatar&quot;&gt;${initial}&lt;/span&gt;'">`
          : `<span class="thanks-card__avatar">${initial}</span>`;
        return `
          <li class="thanks-card__member">
            ${avatarHtml}
            <span class="thanks-card__name">${nameSafe}</span>
          </li>
        `;
      }).join('');
      return `
        <div class="thanks-card" data-category="${category}">
          <div class="thanks-card__head">
            <span class="thanks-card__icon" aria-hidden="true">${icon}</span>
            <div class="thanks-card__info">
              <h4>${category}</h4>
              <span class="thanks-card__sub">${sub}</span>
            </div>
          </div>
          <ul class="thanks-card__list">${rows}</ul>
        </div>
      `;
    }).join('');
    container.setAttribute('aria-busy', 'false');
  }

  async loadThanks() {
    const box = document.getElementById('thanksGrid');
    if (!box) return;
    let list = null;
    try {
      const res = await fetch('data/thanks.json');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.thanks)) list = data.thanks;
      }
    } catch (err) {}
    if (!list || !list.length) list = DEFAULT_THANKS;
    this.renderThanks(list, box);
  }

  async loadStaff() {
    const box = document.getElementById('staffGrid');
    if (!box) return;
    box.setAttribute('aria-busy', 'true');
    try {
      const data = await store.loadStaff();
      const staff = Array.isArray(data.staff) ? data.staff : [];
      const groups = [
        { role: 'judge', title: '裁判', sub: 'REFEREES', icon: '⚖️' },
        { role: 'commentator', title: '解说', sub: 'COMMENTATORS', icon: '🎙️' }
      ];
      box.innerHTML = groups.map(group => {
        const names = staff.filter(person => person.role === group.role);
        const rows = names.length
          ? names.map(person => {
              const uname = person.username || '未命名';
              const initial = sanitize(String(uname).slice(0, 1).toUpperCase());
              return `
                <li class="staff-name-row">
                  ${person.avatar
                    ? `<img class="staff-avatar" src="${sanitize(person.avatar)}" alt="" loading="lazy">`
                    : `<span class="staff-avatar staff-avatar--fallback" aria-hidden="true">${initial}</span>`}
                  <span class="staff-name-row__name">${sanitize(uname)}</span>
                  ${canVote() ? `<button class="vote-btn" data-vote-target="staff" data-vote-key="${sanitize(uname)}" type="button" aria-label="为 ${sanitize(uname)} 打 Call">🔥 0</button>` : ''}
                </li>
              `;
            }).join('')
          : '<li class="staff-empty">暂未登记</li>';
        return `
          <article class="thanks-card staff-card">
            <div class="thanks-card__head">
              <span class="thanks-card__icon" aria-hidden="true">${group.icon}</span>
              <div class="thanks-card__info"><h4>${group.title}</h4><span class="thanks-card__sub">${group.sub}</span></div>
              <span class="tool-modal__count">${names.length} 人</span>
            </div>
            <ul class="thanks-card__list">${rows}</ul>
          </article>
        `;
      }).join('');
      hydrateVoteButtons(box);
    } catch (err) {
      box.innerHTML = `<div class="board__state" style="grid-column:1/-1">工作人员名单暂时无法加载：${sanitize(err.message)}</div>`;
    }
    box.setAttribute('aria-busy', 'false');
  }
}

export const aboutController = new AboutController();

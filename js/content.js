/* ============================================================
   内容加载：公告、Q&A、队伍、历届冠亚军、特别鸣谢
============================================================ */

import { apiRequest } from './api.js';
import { sanitize, formatTime, getInitial } from './utils.js';
import {
  TEAM_LOGO_DIR, TEAM_LOGO_EXT,
  HISTORY_LOGO_DIR, HISTORY_LOGO_EXT,
  THANKS_SUB_MAP,
  DEFAULT_QAS, DEFAULT_HISTORY, DEFAULT_THANKS
} from './config.js';

/* ============================================================
   公告栏
============================================================ */
function renderAnnouncements(list, container) {
  if (!list || !list.length) {
    container.innerHTML = '<li class="board__state">暂无公告</li>';
    return 0;
  }
  container.innerHTML = list.map(item => {
    const tag      = sanitize(item.tag || '公告');
    const tagClass = item.tag_class || 'tag--notice';
    const time     = formatTime(item.time);
    const text     = sanitize(item.text || '');
    return `
      <li>
        <div class="msg__top">
          <span class="msg__tag ${tagClass}">${tag}</span>
          ${time ? `<span class="msg__time">${sanitize(time)}</span>` : ''}
        </div>
        <p class="msg__text">${text}</p>
      </li>
    `;
  }).join('');
  return list.length;
}

export async function loadAnnouncements() {
  const box = document.querySelector('[data-board="announcements"]');
  const cnt = document.querySelector('[data-count="announcements"]');
  if (!box) return;

  try {
    const data = await apiRequest('/api/announcements');
    const list = data.announcements || [];
    const n = renderAnnouncements(list, box);
    if (cnt) cnt.textContent = n + ' 条';
  } catch (err) {
    console.warn('[公告栏] 加载失败：', err.message);
    box.innerHTML = '<li class="board__state">加载失败：' + sanitize(err.message) + '</li>';
  }
  box.setAttribute('aria-busy', 'false');
}

/* ============================================================
   Q&A
============================================================ */
function renderQAs(list, container) {
  if (!list || !list.length) {
    container.innerHTML = '<li class="board__state">暂无 Q&amp;A</li>';
    return 0;
  }
  container.innerHTML = list.map((item, i) => {
    const question = sanitize(item.question || '');
    const answer   = sanitize(item.answer || '');
    const id       = 'qa-' + i;
    return `
      <li class="qa-item" data-qa>
        <button class="qa-item__q" type="button" aria-expanded="false" aria-controls="${id}">
          <span class="qa-item__mark" aria-hidden="true">Q</span>
          <span class="qa-item__text">${question}</span>
          <span class="qa-item__arrow" aria-hidden="true">▾</span>
        </button>
        <div class="qa-item__a" id="${id}" role="region">
          <div class="qa-item__a-inner">
            <span class="qa-a-mark">A：</span>${answer}
          </div>
        </div>
      </li>
    `;
  }).join('');

  container.querySelectorAll('.qa-item').forEach(item => {
    const btn = item.querySelector('.qa-item__q');
    btn.addEventListener('click', () => {
      const isOpen = item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });
  return list.length;
}

export async function loadQAs() {
  const box = document.querySelector('[data-board="qas"]');
  const cnt = document.querySelector('[data-count="qas"]');
  if (!box) return;

  let list = null;
  try {
    const res = await fetch('data/qas.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.qas)) list = data.qas;
    }
  } catch (e) {}
  if (!list || !list.length) list = DEFAULT_QAS;

  const n = renderQAs(list, box);
  if (cnt) cnt.textContent = n + ' 条';
  box.setAttribute('aria-busy', 'false');
}

/* ============================================================
   队伍信息
============================================================ */
export function renderTeams(list, container) {
  if (!list || !list.length) {
    container.innerHTML = '<div class="board__state">暂无队伍信息</div>';
    container.setAttribute('aria-busy', 'false');
    return;
  }
  container.innerHTML = list.map(item => {
    const name  = sanitize(item.name  || '');
    const short = sanitize(item.short || '');

    /* 优先用云端存的 logo，没有就 fallback 到静态路径 */
    const logoSrc = item.logo
      ? item.logo
      : `${TEAM_LOGO_DIR}loge_${short}${TEAM_LOGO_EXT}`;

    return `
      <div class="team-card">
        <div class="team-card__logo-wrap">
          <img class="team-card__logo" src="${logoSrc}" alt="${name} logo" loading="lazy"
            onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2246%22 fill=%22%23182242%22 stroke=%22%23d4b47a%22 stroke-width=%222%22 stroke-dasharray=%226 6%22/><text x=%2250%22 y=%2264%22 font-size=%2240%22 font-weight=%22900%22 fill=%22%23d4b47a%22 text-anchor=%22middle%22 font-family=%22sans-serif%22>?</text></svg>'">
        </div>
        <h3 class="team-card__name">${name}</h3>
        <span class="team-card__short">${short}</span>
      </div>
    `;
  }).join('');
  container.setAttribute('aria-busy', 'false');
}

export async function loadTeams() {
  const box = document.getElementById('teamsGrid');
  if (!box) return;
  try {
    const data = await apiRequest('/api/teams');
    renderTeams(data.teams || [], box);
  } catch (err) {
    console.warn('[队伍信息] 加载失败：', err.message);
    box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
  }
  box.setAttribute('aria-busy', 'false');
}

/* ============================================================
   历届冠亚军
============================================================ */
function renderHistory(list, container) {
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

    return `
      <div class="timeline-h__node">
        <div class="timeline-h__dot" aria-hidden="true"></div>
        <div class="timeline-h__event">${sanitize(item.event)}</div>
        <div class="timeline-h__card">
          <div class="timeline-h__crown">
            <div class="timeline-h__crown-logo-wrap">
              <img class="timeline-h__crown-logo" src="${champLogo}" alt="${sanitize(champion.name || '')} logo" loading="lazy"
                onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2246%22 fill=%22%23182242%22 stroke=%22%23d4b47a%22 stroke-width=%222%22 stroke-dasharray=%226 6%22/><text x=%2250%22 y=%2264%22 font-size=%2240%22 font-weight=%22900%22 fill=%22%23d4b47a%22 text-anchor=%22middle%22 font-family=%22sans-serif%22>?</text></svg>'">
            </div>
            <div class="timeline-h__crown-name">
              <em>🏆 冠 军</em>
              <b>${sanitize(champion.name || '')}</b>
            </div>
          </div>
          <div class="timeline-h__runner">
            <img class="timeline-h__runner-logo" src="${runLogo}" alt="${sanitize(runner.name || '')} logo" loading="lazy"
              onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2246%22 fill=%22%23182224%22 stroke=%22%23a68bd4%22 stroke-width=%222%22 stroke-dasharray=%226 6%22/><text x=%2250%22 y=%2264%22 font-size=%2240%22 font-weight=%22900%22 fill=%22%23a68bd4%22 text-anchor=%22middle%22 font-family=%22sans-serif%22>?</text></svg>'">
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

export async function loadHistory() {
  const box = document.getElementById('timelineTrack');
  if (!box) return;
  let list = null;
  try {
    const res = await fetch('data/history.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.history)) list = data.history;
    }
  } catch (err) {}
  if (!list || !list.length) list = DEFAULT_HISTORY;
  renderHistory(list, box);
}

/* ============================================================
   特别鸣谢
============================================================ */
function renderThanks(list, container) {
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
      /* 兼容两种格式：
         - 字符串：只有名字
         - 对象：{ name, avatar }
      */
      const name   = typeof m === 'string' ? m : (m.name || '');
      const avatar = typeof m === 'string' ? null : m.avatar;

      const nameSafe = sanitize(name);
      const initial  = sanitize(getInitial(name));

      /* 有 avatar 就渲染图片，没有就 fallback 到首字母 */
      const avatarHtml = avatar
        ? `<img class="thanks-card__avatar thanks-card__avatar--img"
                src="assets/avatars/${sanitize(avatar)}.jpg"
                alt="${nameSafe}"
                loading="lazy"
                onerror="this.outerHTML='<span class=&quot;thanks-card__avatar&quot;>${initial}</span>'">`
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

export async function loadThanks() {
  const box = document.getElementById('thanksGrid');
  if (!box) return;
  let list = null;
  try {
    const res = await fetch('data/thanks.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.thanks)) list = data.thanks;
    }
  } catch (err) {}
  if (!list || !list.length) list = DEFAULT_THANKS;
  renderThanks(list, box);
}

/* ============================================================
   初始化所有内容
============================================================ */
export function initContent() {
  loadAnnouncements();
  loadQAs();
  loadHistory();
  loadThanks();
  loadTeams();
} 
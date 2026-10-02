/* ============================================================
   内容加载：公告、Q&A、队伍、历届冠亚军、特别鸣谢
============================================================ */

import { apiRequest, getCurrentUser } from './api.js';
import { sanitize, formatTime, getInitial } from './utils.js';
import {
  TEAM_LOGO_DIR, TEAM_LOGO_EXT,
  HISTORY_LOGO_DIR, HISTORY_LOGO_EXT,
  THANKS_SUB_MAP,
  DEFAULT_QAS, DEFAULT_HISTORY, DEFAULT_THANKS
} from './config.js';

/* ============================================================
   /api/teams 请求缓存
   —— 避免首屏、赛程页、各工具弹窗重复请求同一份数据
============================================================ */
let __teamsPromise = null;
let __teamLogosPromise = null;

export function showActionNotice(message, isError = false) {
  let notice = document.getElementById('actionNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'actionNotice';
    notice.className = 'action-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    document.body.appendChild(notice);
  }
  notice.textContent = message;
  notice.classList.toggle('action-notice--error', isError);
  notice.classList.add('is-visible');
  clearTimeout(notice._hideTimer);
  notice._hideTimer = setTimeout(() => notice.classList.remove('is-visible'), 3200);
}

export function fetchTeams() {
  if (!__teamsPromise) {
    __teamsPromise = apiRequest('/api/teams?basic=1').catch(err => {
      __teamsPromise = null;   // 失败允许下次重试
      throw err;
    });
  }
  return __teamsPromise;
}

export function fetchTeamLogos() {
  if (!__teamLogosPromise) {
    __teamLogosPromise = apiRequest('/api/team-logos').catch(err => {
      __teamLogosPromise = null;
      throw err;
    });
  }
  return __teamLogosPromise;
}

export function invalidateTeams() {
  __teamsPromise = null;
  __teamLogosPromise = null;
}

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
    /* 静态 JSON 交给浏览器默认缓存，不再每次强制下载 */
    const res = await fetch('data/qas.json');
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
    const count = document.getElementById('teamsResultCount');
    if (count) count.textContent = '共 0 支队伍';
    container.setAttribute('aria-busy', 'false');
    return;
  }
  container.innerHTML = list.map(item => {
    const name  = sanitize(item.name  || '');
    const short = sanitize(item.short || '');

    const logoSrc = item.logo
      ? item.logo
      : `${TEAM_LOGO_DIR}loge_${short}${TEAM_LOGO_EXT}`;

    return `
      <div class="team-card" data-team-card-short="${short}">
        <div class="team-card__logo-wrap">
          <img class="team-card__logo" src="${logoSrc}" alt="${name} logo" loading="lazy"
            onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2246%22 fill=%22%23182242%22 stroke=%22%23d4b47a%22 stroke-width=%222%22 stroke-dasharray=%226 6%22/><text x=%2250%22 y=%2264%22 font-size=%2240%22 font-weight=%22900%22 fill=%22%23d4b47a%22 text-anchor=%22middle%22 font-family=%22sans-serif%22>?</text></svg>'">
        </div>
        <h3 class="team-card__name">${name}</h3>
        <span class="team-card__short">${short}</span>
      </div>
    `;
  }).join('');
  const search = document.getElementById('teamsSearch');
  const count = document.getElementById('teamsResultCount');
  const applyTeamSearch = () => {
    const query = (search?.value || '').trim().toLocaleLowerCase();
    const cards = [...container.querySelectorAll('.team-card')];
    let visibleCount = 0;
    cards.forEach(card => {
      const visible = !query || card.textContent.toLocaleLowerCase().includes(query);
      card.hidden = !visible;
      if (visible) visibleCount++;
    });
    if (count) count.textContent = query ? `匹配 ${visibleCount} / ${cards.length} 支` : `共 ${cards.length} 支队伍`;
  };
  if (search && !search.dataset.bound) {
    search.addEventListener('input', applyTeamSearch);
    search.dataset.bound = 'true';
  }
  applyTeamSearch();
  container.setAttribute('aria-busy', 'false');
}

export async function loadTeams() {
  const box = document.getElementById('teamsGrid');
  if (!box) return;
  try {
    const data = await fetchTeams();
    renderTeams(data.teams || [], box);
    fetchTeamLogos().then(result => {
      if (!box.isConnected) return;
      const logos = new Map((result.teams || []).map(team => [team.short, team.logo]));
      box.querySelectorAll('[data-team-card-short]').forEach(card => {
        const logo = logos.get(card.dataset.teamCardShort);
        const img = card.querySelector('img');
        if (logo && img) img.src = logo;
      });
    }).catch(() => {});
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
    const res = await fetch('data/history.json');
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

export async function loadThanks() {
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
  renderThanks(list, box);
}

/* ============================================================
   工作人员一览
============================================================ */
export async function loadStaff() {
  const box = document.getElementById('staffGrid');
  if (!box) return;
  box.setAttribute('aria-busy', 'true');
  try {
    const data = await apiRequest('/api/staff');
    const staff = Array.isArray(data.staff) ? data.staff : [];
    const groups = [
      { role: 'judge', title: '裁判', sub: 'REFEREES', icon: '⚖️' },
      { role: 'commentator', title: '解说', sub: 'COMMENTATORS', icon: '🎙️' }
    ];
    box.innerHTML = groups.map(group => {
      const names = staff.filter(person => person.role === group.role);
      const rows = names.length
        ? names.map(person => `
            <li class="thanks-card__member">
              <span class="thanks-card__avatar">${sanitize(getInitial(person.username))}</span>
              <span class="thanks-card__name">${sanitize(person.username || '未命名')}</span>
            </li>
          `).join('')
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
  } catch (err) {
    box.innerHTML = `<div class="board__state" style="grid-column:1/-1">工作人员名单暂时无法加载：${sanitize(err.message)}</div>`;
  }
  box.setAttribute('aria-busy', 'false');
}

/* ============================================================
   赛事赛程（64 进 32 对阵表）
============================================================ */
function teamLogoSrc(short, logoMap) {
  if (logoMap && logoMap[short]) return logoMap[short];
  return `${TEAM_LOGO_DIR}loge_${sanitize(short || '')}${TEAM_LOGO_EXT}`;
}

function scheduleSideHtml(short, logoMap, nameMap) {
  const shortSafe = sanitize(short || '轮空');
  const name = sanitize(nameMap && nameMap[short] ? nameMap[short] : (short || '轮空'));
  const src = teamLogoSrc(short, logoMap);
  return `
    <div class="schedule-card__side" data-schedule-team-short="${shortSafe}">
      <img class="schedule-card__logo" src="${src}" alt="${name} logo" loading="lazy"
        onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2246%22 fill=%22%23182242%22 stroke=%22%23d4b47a%22 stroke-width=%222%22 stroke-dasharray=%226 6%22/><text x=%2250%22 y=%2264%22 font-size=%2240%22 font-weight=%22900%22 fill=%22%23d4b47a%22 text-anchor=%22middle%22 font-family=%22sans-serif%22>?</text></svg>'">
      <span class="schedule-card__name">${name}</span>
    </div>
  `;
}

function formatMatchTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

function ensureMatchDetailsModal() {
  let mask = document.getElementById('matchDetailsModal');
  if (mask) return mask;
  mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.id = 'matchDetailsModal';
  mask.setAttribute('aria-hidden', 'true');
  mask.innerHTML = '<div class="modal tool-modal" role="dialog" aria-modal="true" aria-labelledby="matchDetailsTitle"><button class="modal__close" type="button" aria-label="关闭">×</button><div class="match-details-content"></div></div>';
  document.body.appendChild(mask);
  const close = () => {
    mask.classList.remove('is-open');
    mask.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };
  mask.querySelector('.modal__close').addEventListener('click', close);
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && mask.classList.contains('is-open')) close(); });
  return mask;
}

function showMatchDetails(match, appointment) {
  const mask = ensureMatchDetailsModal();
  const content = mask.querySelector('.match-details-content');
  const user = getCurrentUser();
  const signups = appointment?.signups || [];
  const mySignups = signups.filter(s => s.is_mine);
  const time = appointment?.start_time ? formatMatchTime(appointment.start_time) : '队伍尚未约定时间';
  const signupList = (role, label) => {
    const names = signups.filter(s => s.role === role).map(s => `<li>${sanitize(s.username)}</li>`).join('');
    return `<div class="match-signup-group"><b>${label}报名（${signups.filter(s => s.role === role).length}）</b>${names ? `<ul>${names}</ul>` : '<p>暂无报名</p>'}</div>`;
  };
  let signupAction = '<p class="draw-info">登录裁判或解说账号后可以报名。</p>';
  if (user && ['judge', 'commentator', 'admin'].includes(user.role) && appointment) {
    const roles = user.role === 'admin' ? ['judge', 'commentator'] : [user.role];
    signupAction = `${roles.map(role => {
      const signed = mySignups.some(s => s.role === role);
      const label = role === 'judge' ? '裁判' : '解说';
      return `<button class="btn ${signed ? 'btn--ghost' : 'btn--primary'} btn--sm match-signup-button" data-signup-role="${role}" type="button">${signed ? '取消' : '报名'}${label}</button>`;
    }).join('')}<p class="draw-info" id="matchSignupMessage" role="status" aria-live="polite"></p>`;
  }
  const isJudge = user && ['judge', 'admin'].includes(user.role);
  const finishAction = appointment && isJudge
    ? `<button class="btn btn--ghost btn--sm" id="matchFinishBtn" type="button">${appointment.is_finished ? '恢复为未完赛' : '标记为已完赛'}</button><p class="draw-info" id="matchFinishMessage" role="status" aria-live="polite"></p>`
    : '';
  content.innerHTML = `
    <h3 class="tool-modal__title" id="matchDetailsTitle">${sanitize(match.a)} VS ${sanitize(match.b)} <em>比赛详情</em></h3>
    <div class="match-detail-status ${appointment?.is_finished ? 'match-detail-status--finished' : appointment ? 'match-detail-status--scheduled' : ''}">${appointment?.is_finished ? '已完赛' : appointment ? '已约赛 · 未完赛' : '待约赛'}</div>
    <section class="match-detail-section" aria-label="比赛安排">
      <h4>比赛安排</h4>
      <div class="tool-modal__info"><b>比赛时间：</b>${sanitize(time)}</div>
      ${appointment?.booked_by_school ? `<div class="tool-modal__info"><b>预约学校：</b>${sanitize(appointment.booked_by_school)}</div>` : ''}
      ${appointment?.created_by_name ? `<div class="tool-modal__info"><b>提交队长：</b>${sanitize(appointment.created_by_name)}</div>` : ''}
      ${appointment?.notes ? `<div class="tool-modal__info"><b>补充信息：</b>${sanitize(appointment.notes)}</div>` : ''}
    </section>
    ${appointment ? `<section class="match-detail-section" aria-label="工作人员报名"><h4>工作人员报名</h4>${signupList('judge', '裁判')}${signupList('commentator', '解说')}</section>` : '<p class="draw-info">队长提交比赛时间后，裁判和解说可以在这里报名。</p>'}
    <div class="tool-actions">${signupAction}${finishAction}</div>
  `;
  mask.classList.add('is-open');
  mask.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  content.querySelectorAll('.match-signup-button').forEach(signupButton => signupButton.addEventListener('click', async () => {
    const signupRole = signupButton.dataset.signupRole;
    const isSigned = mySignups.some(s => s.role === signupRole);
    signupButton.disabled = true;
    let mutationComplete = false;
    try {
      await apiRequest(`/api/match-appointments/${appointment.id}/signup`, {
        method: isSigned ? 'DELETE' : 'POST',
        body: JSON.stringify({ role: signupRole })
      });
      mutationComplete = true;
      const roleLabel = signupRole === 'judge' ? '裁判' : '解说';
      showActionNotice(isSigned ? `已取消${roleLabel}报名` : `${roleLabel}报名成功`);
      const data = await apiRequest(`/api/match-appointments?schedule_id=${currentScheduleId}`);
      currentAppointments = data.appointments || [];
      renderSchedule(currentScheduleMatches, document.getElementById('scheduleBoard'), currentScheduleTitle, currentScheduleLogoMap, currentScheduleNameMap, currentScheduleId, currentAppointments);
      const updated = currentAppointments.find(a => a.id === appointment.id);
      showMatchDetails(match, updated);
    } catch (err) {
      showActionNotice(mutationComplete ? '操作已成功，但赛程刷新失败，请重新打开详情查看' : err.message, true);
      const message = content.querySelector('#matchSignupMessage');
      if (message) message.textContent = mutationComplete ? '操作已成功，详情刷新失败，请重新打开查看。' : err.message;
      signupButton.disabled = false;
    }
  }));
  const finishButton = content.querySelector('#matchFinishBtn');
  if (finishButton) finishButton.addEventListener('click', async () => {
    finishButton.disabled = true;
    let mutationComplete = false;
    try {
      await apiRequest(`/api/match-appointments/${appointment.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_finished: !appointment.is_finished })
      });
      mutationComplete = true;
      showActionNotice(appointment.is_finished ? '比赛已恢复为未完赛' : '已标记为完赛');
      const data = await apiRequest(`/api/match-appointments?schedule_id=${currentScheduleId}`);
      currentAppointments = data.appointments || [];
      renderSchedule(currentScheduleMatches, document.getElementById('scheduleBoard'), currentScheduleTitle, currentScheduleLogoMap, currentScheduleNameMap, currentScheduleId, currentAppointments);
      showMatchDetails(match, currentAppointments.find(a => a.id === appointment.id));
    } catch (err) {
      showActionNotice(mutationComplete ? '状态已更新，但赛程刷新失败，请重新打开详情查看' : err.message, true);
      const message = content.querySelector('#matchFinishMessage');
      if (message) message.textContent = mutationComplete ? '状态已更新，详情刷新失败，请重新打开查看。' : err.message;
      finishButton.disabled = false;
    }
  });
}

let currentScheduleId = null;
let currentScheduleMatches = [];
let currentScheduleTitle = '';
let currentScheduleLogoMap = {};
let currentScheduleNameMap = {};
let currentAppointments = [];
let scheduleResizeHandler = null;
let scheduleLoadSequence = 0;

export function renderSchedule(list, container, title, logoMap, nameMap, scheduleId = null, appointments = []) {
  currentScheduleId = scheduleId;
  currentScheduleMatches = list || [];
  currentScheduleTitle = title || '';
  currentScheduleLogoMap = logoMap || {};
  currentScheduleNameMap = nameMap || {};
  currentAppointments = appointments;
  if (!list || !list.length) {
    if (scheduleResizeHandler) window.removeEventListener('resize', scheduleResizeHandler);
    scheduleResizeHandler = null;
    container.innerHTML = '<div class="board__state">赛程尚未发布</div>';
    container.setAttribute('aria-busy', 'false');
    return;
  }
  const appointmentByIndex = new Map(appointments.map(a => [a.match_index, a]));
  const sortedMatches = list.map((match, index) => ({ match, index, appointment: appointmentByIndex.get(index) }))
    .sort((left, right) => {
      const leftDone = Number(left.appointment?.is_finished || 0);
      const rightDone = Number(right.appointment?.is_finished || 0);
      if (leftDone !== rightDone) return leftDone - rightDone;
      const leftTime = left.appointment?.start_time ? new Date(left.appointment.start_time).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.appointment?.start_time ? new Date(right.appointment.start_time).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime || left.index - right.index;
    });
  const cards = sortedMatches.map(({ match: p, index: i, appointment }) => {
    const judgeCount = (appointment?.signups || []).filter(signup => signup.role === 'judge').length;
    const commentatorCount = (appointment?.signups || []).filter(signup => signup.role === 'commentator').length;
    const status = appointment?.is_finished ? 'finished' : appointment ? 'scheduled' : 'unbooked';
    const appointmentTime = appointment ? `<span class="schedule-card__time">${sanitize(formatMatchTime(appointment.start_time))}</span>` : '';
    const appointmentStaff = appointment ? `<span class="schedule-card__staff">裁判 ${judgeCount} · 解说 ${commentatorCount}</span>` : '';
    return `
    <div class="schedule-card ${appointment?.is_finished ? 'schedule-card--finished' : ''}" role="button" tabindex="0" data-match-index="${i}" data-schedule-status="${status}" data-team-search="${sanitize(`${p.a || ''} ${p.b || ''}`)}" aria-label="查看 ${sanitize(p.a || '轮空')} 对阵 ${sanitize(p.b || '轮空')} 详情">
      ${scheduleSideHtml(p.a, logoMap, nameMap)}
      <div class="schedule-card__center">
        <span class="schedule-card__state ${appointment?.is_finished ? 'schedule-card__state--finished' : appointment ? 'schedule-card__state--scheduled' : ''}">${appointment?.is_finished ? '已完赛' : appointment ? '已约赛 · 未完赛' : '待约赛'}</span>
        ${appointmentTime}
        <div class="schedule-card__vs">VS</div>
        ${appointmentStaff}
      </div>
      ${scheduleSideHtml(p.b, logoMap, nameMap)}
    </div>
  `;
  }).join('');
  container.innerHTML = `
    <div class="schedule-board__head">
      <h3>${sanitize(title || '64 进 32 淘汰赛')}</h3>
      <span class="schedule-board__count" id="scheduleResultCount" aria-live="polite">${list.length} 场对阵</span>
    </div>
    <div class="list-controls schedule-controls" role="search">
      <label class="list-controls__search"><span>搜索对阵</span><input id="scheduleSearch" type="search" placeholder="输入队伍名称或简称" autocomplete="off"></label>
      <label class="list-controls__filter"><span>比赛状态</span><select id="scheduleStatusFilter"><option value="all">全部状态</option><option value="unfinished">未完赛</option><option value="scheduled">已约赛 · 未完赛</option><option value="unbooked">待约赛</option><option value="finished">已完赛</option></select></label>
    </div>
    <div class="schedule-grid">${cards}</div>
    <p class="schedule-no-results" id="scheduleNoResults" hidden>没有符合条件的对阵，请调整搜索内容或比赛状态。</p>
    <button class="btn btn--ghost btn--sm schedule-show-more" id="scheduleShowMore" type="button" aria-expanded="false" hidden>显示更多</button>
  `;
  container.querySelectorAll('[data-match-index]').forEach(card => {
    const open = () => {
      const index = Number(card.dataset.matchIndex);
      showMatchDetails(list[index], appointmentByIndex.get(index));
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
  const showMoreButton = container.querySelector('#scheduleShowMore');
  const cardsEls = [...container.querySelectorAll('[data-match-index]')];
  let expanded = false;
  const searchInput = container.querySelector('#scheduleSearch');
  const statusFilter = container.querySelector('#scheduleStatusFilter');
  const resultCount = container.querySelector('#scheduleResultCount');
  const noResults = container.querySelector('#scheduleNoResults');
  const updateScheduleFilters = () => {
    const query = (searchInput?.value || '').trim().toLocaleLowerCase();
    const status = statusFilter?.value || 'all';
    const filtered = cardsEls.filter(card => {
      const matchesText = !query || `${card.textContent} ${card.dataset.teamSearch || ''}`.toLocaleLowerCase().includes(query);
      const matchesStatus = status === 'all' || (status === 'unfinished' ? card.dataset.scheduleStatus !== 'finished' : card.dataset.scheduleStatus === status);
      card.dataset.filterMatch = matchesText && matchesStatus ? 'true' : 'false';
      return matchesText && matchesStatus;
    });
    const initialCount = 6;
    const visibleCount = expanded ? filtered.length : Math.min(filtered.length, initialCount);
    if (resultCount) resultCount.textContent = query || status !== 'all'
      ? `匹配 ${filtered.length} 场 · 已显示 ${visibleCount} / ${cardsEls.length}`
      : `已显示 ${visibleCount} / ${cardsEls.length} 场`;
    if (noResults) noResults.hidden = filtered.length > 0;
    filtered.forEach((card, index) => { card.hidden = !expanded && index >= initialCount; });
    cardsEls.filter(card => card.dataset.filterMatch !== 'true').forEach(card => { card.hidden = true; });
    showMoreButton.hidden = filtered.length <= initialCount;
    showMoreButton.textContent = expanded ? '收起' : '显示更多';
    showMoreButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  };
  searchInput?.addEventListener('input', () => { expanded = false; updateScheduleFilters(); });
  statusFilter?.addEventListener('change', () => { expanded = false; updateScheduleFilters(); });
  if (scheduleResizeHandler) window.removeEventListener('resize', scheduleResizeHandler);
  const updateVisibleCards = () => {
    updateScheduleFilters();
  };
  showMoreButton.addEventListener('click', () => { expanded = !expanded; updateScheduleFilters(); });
  scheduleResizeHandler = updateVisibleCards;
  window.addEventListener('resize', scheduleResizeHandler);
  updateVisibleCards();
  container.setAttribute('aria-busy', 'false');
}

export async function loadSchedule() {
  const box = document.getElementById('scheduleBoard');
  if (!box) return;
  const loadSequence = ++scheduleLoadSequence;

  try {
    const data = await apiRequest('/api/schedule');
    if (loadSequence !== scheduleLoadSequence || !box.isConnected) return;
    const s = data.schedule;
    if (!s || !s.matches || !s.matches.length) {
      renderSchedule([], box, '', {}, {});
      return;
    }
    // 赛程接口返回后立即先画出对阵，不等队伍图片或报名详情。
    renderSchedule(s.matches, box, s.title, {}, {}, s.id, []);
    const appointmentData = await apiRequest(`/api/match-appointments?schedule_id=${s.id}`).catch(() => ({ appointments: [] }));
    if (loadSequence !== scheduleLoadSequence || !box.isConnected) return;
    const appointments = appointmentData.appointments || [];
    renderSchedule(s.matches, box, s.title, {}, {}, s.id, appointments);

    // 名称和图片不影响对阵、时间和报名状态，放到后台补齐。旧版 Worker
    // 的 /api/teams 仍会返回 logo，新版则由 /api/team-logos 单独提供。
    let nameMap = {};
    let logoMap = {};
    const applyTeamDisplay = () => {
      if (loadSequence !== scheduleLoadSequence || !box.isConnected || currentScheduleId !== s.id) return;
      currentScheduleNameMap = nameMap;
      currentScheduleLogoMap = logoMap;
      box.querySelectorAll('[data-schedule-team-short]').forEach(side => {
        const short = side.dataset.scheduleTeamShort;
        const name = nameMap[short] || short;
        const img = side.querySelector('img');
        const label = side.querySelector('.schedule-card__name');
        if (label) label.textContent = name;
        if (img) {
          img.alt = `${name} logo`;
          if (logoMap[short]) img.src = logoMap[short];
        }
      });
    };
    fetchTeams().then(teamData => {
      (teamData.teams || []).forEach(team => {
        if (!team.short) return;
        nameMap[team.short] = team.name || team.short;
        if (team.logo) logoMap[team.short] = team.logo;
      });
      applyTeamDisplay();
    }).catch(() => {});
    fetchTeamLogos().then(logoData => {
      (logoData.teams || []).forEach(team => { if (team.short && team.logo) logoMap[team.short] = team.logo; });
      applyTeamDisplay();
    }).catch(() => {});
  } catch (err) {
    if (loadSequence !== scheduleLoadSequence) return;
    console.warn('[比赛赛程] 加载失败：', err.message);
    box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
  }
  box.setAttribute('aria-busy', 'false');
}

/* ============================================================
   首屏内容（只加载主页需要的）
   其他 tab 内容由 main.js 在切换时按需加载
============================================================ */
export function initContent() {
  loadAnnouncements();
  loadQAs();
}

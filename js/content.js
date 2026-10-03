/* ============================================================
   内容加载：公告、Q&A、队伍、历届冠亚军、特别鸣谢、赛程、比分、队长管理
============================================================ */

import { apiRequest, getCurrentUser } from './api.js';
import { sanitize, formatTime, getInitial, formatBeijing } from './utils.js';
import {
  TEAM_LOGO_DIR, TEAM_LOGO_EXT,
  HISTORY_LOGO_DIR, HISTORY_LOGO_EXT,
  THANKS_SUB_MAP,
  DEFAULT_QAS, DEFAULT_HISTORY, DEFAULT_THANKS
} from './config.js';
import { parseTournament } from './tournament.js';

/* ============================================================
   /api/teams 请求缓存
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
      __teamsPromise = null;
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
   公告栏（支持置顶）
============================================================ */
function renderAnnouncements(list, container) {
  if (!list || !list.length) {
    container.innerHTML = '<li class="board__state">暂无公告</li>';
    return 0;
  }
  container.innerHTML = list.map(item => {
    const tag      = sanitize(item.tag || '动态');
    const tagClass = item.tag_class || 'tag--event';
    const time     = formatTime(item.time);
    const text     = sanitize(item.text || '');
    const pinned   = !!item.is_pinned;
    return `
      <li class="${pinned ? 'is-pinned' : ''}">
        <div class="msg__top">
          ${pinned ? '<span class="msg__pin" aria-hidden="true">📌</span>' : ''}
          <span class="msg__tag ${tagClass}">${tag}</span>
          ${pinned ? '<span class="msg__tag msg__tag--pin">置顶</span>' : ''}
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
   主页 · 今日赛程
============================================================ */
export async function loadHomeSchedule() {
  const box = document.getElementById('homeSchedule');
  if (!box) return;

  let schedule = null;
  let appointments = [];
  let nameMap = {};

  try {
    const [scheduleData, teamData] = await Promise.all([
      apiRequest('/api/schedule').catch(() => ({})),
      fetchTeams().catch(() => ({ teams: [] }))
    ]);
    schedule = scheduleData.schedule;
    (teamData.teams || []).forEach(t => { nameMap[t.short] = t.name; });

    if (schedule && schedule.matches) {
      const appointmentData = await apiRequest(`/api/match-appointments?schedule_id=${schedule.id}`).catch(() => ({ appointments: [] }));
      appointments = appointmentData.appointments || [];
    }
  } catch (err) {
    box.innerHTML = '<li class="home-schedule__state">加载失败</li>';
    box.setAttribute('aria-busy', 'false');
    return;
  }

  const tournament = schedule ? parseTournament(schedule.matches) : null;
  const flatMatches = tournament ? tournament.allMatches : (Array.isArray(schedule?.matches) ? schedule.matches : []);

  if (!flatMatches.length) {
    box.innerHTML = '<li class="home-schedule__state">赛程尚未发布</li>';
    box.setAttribute('aria-busy', 'false');
    return;
  }

  const appointmentByIndex = new Map(appointments.map(a => [a.match_index, a]));
  const list = flatMatches.map((m, i) => ({
    match: m,
    index: i,
    appointment: appointmentByIndex.get(i)
  }));

  const upcoming = list
    .filter(item => !item.appointment?.is_finished)
    .sort((a, b) => {
      const at = a.appointment?.start_time ? new Date(a.appointment.start_time).getTime() : Infinity;
      const bt = b.appointment?.start_time ? new Date(b.appointment.start_time).getTime() : Infinity;
      return at - bt;
    });

  const todayStr = (() => {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  let show = upcoming.filter(item => {
    const t = item.appointment?.start_time;
    if (!t) return false;
    const d = new Date(t);
    const pad = n => String(n).padStart(2, '0');
    const dStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return dStr === todayStr;
  }).slice(0, 2);   // 最多显示 2 条

  let label = '今日';
  if (!show.length) {
    show = upcoming.slice(0, 2);   // 降级时也只显示 2 条
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
    const timeStr = item.appointment?.start_time
      ? formatBeijing(item.appointment.start_time)
      : '待定';
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
  box.setAttribute('aria-busy', 'false');
}

/* ============================================================
   主页 · 最新战报
============================================================ */
export async function loadHomeResults() {
  const box = document.getElementById('homeResults');
  if (!box) return;

  let schedule = null;
  let appointments = [];
  let nameMap = {};

  try {
    const [scheduleData, teamData] = await Promise.all([
      apiRequest('/api/schedule').catch(() => ({})),
      fetchTeams().catch(() => ({ teams: [] }))
    ]);
    schedule = scheduleData.schedule;
    (teamData.teams || []).forEach(t => { nameMap[t.short] = t.name; });

    if (schedule && schedule.matches) {
      const appointmentData = await apiRequest(`/api/match-appointments?schedule_id=${schedule.id}`).catch(() => ({ appointments: [] }));
      appointments = appointmentData.appointments || [];
    }
  } catch (err) {
    box.innerHTML = '<li class="home-schedule__state">加载失败</li>';
    box.setAttribute('aria-busy', 'false');
    return;
  }

  const tournament = schedule ? parseTournament(schedule.matches) : null;
  const flatMatches = tournament ? tournament.allMatches : (Array.isArray(schedule?.matches) ? schedule.matches : []);

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
  box.setAttribute('aria-busy', 'false');
}

/* ============================================================
   队伍信息
============================================================ */
let __teamsListCache = [];
let __mySchool = null;
let __myTeamInfo = null;
let __currentTeamsTab = 'all';
let __teamsTabsBound = false;

export function renderTeams(list, container, opts = {}) {
  const editMode = opts.editMode === true;

  if (!list || !list.length) {
    container.innerHTML = '<div class="board__state" style="grid-column:1/-1">暂无队伍信息</div>';
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
        ${editMode ? `<button class="team-card__edit" data-team-edit="${short}" type="button" aria-label="编辑队员">✏️ 编辑队员</button>` : ''}
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
    if (count) count.textContent = query
      ? `匹配 ${visibleCount} / ${cards.length} 支`
      : `共 ${cards.length} 支队伍`;
  };
  if (search && !search.dataset.bound) {
    search.addEventListener('input', applyTeamSearch);
    search.dataset.bound = 'true';
  }
  applyTeamSearch();

  if (editMode) {
    container.querySelectorAll('[data-team-edit]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openPlayerEditorPanel(btn.dataset.teamEdit);
      });
    });
  }

  container.setAttribute('aria-busy', 'false');
}

async function refreshMySchool() {
  const user = getCurrentUser();
  __mySchool = null;
  __myTeamInfo = null;
  if (user?.role === 'team') {
    try {
      const d = await apiRequest('/api/team/school').catch(() => ({}));
      __mySchool = d.profile?.school || null;
    } catch {}
    if (__mySchool) {
      try {
        const td = await apiRequest('/api/teams').catch(() => ({}));
        const found = (td.teams || []).find(t => t.short === __mySchool);
        if (found) __myTeamInfo = found;
      } catch {}
    }
  }
}

function updateTeamsChrome() {
  const user = getCurrentUser();
  const mineTab = document.querySelector('[data-teams-tab="mine"]');
  const adminActions = document.getElementById('teamsAdminActions');

  if (mineTab) mineTab.hidden = !(user?.role === 'team');

  if (adminActions) {
    if (user?.role === 'admin') {
      adminActions.innerHTML = `<button class="btn btn--ghost btn--sm" id="adminManageTeamsBtn" type="button">🛡️ 管理队伍</button>`;
      const btn = document.getElementById('adminManageTeamsBtn');
      btn?.addEventListener('click', () => showTeamsAdminView());
    } else {
      adminActions.innerHTML = '';
    }
  }

  if (__currentTeamsTab === 'mine' && user?.role !== 'team') {
    __currentTeamsTab = 'all';
    document.querySelectorAll('[data-teams-tab]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.teamsTab === 'all');
    });
  }
}

function bindTeamsTabs() {
  if (__teamsTabsBound) return;
  __teamsTabsBound = true;
  document.querySelectorAll('[data-teams-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      __currentTeamsTab = btn.dataset.teamsTab;
      document.querySelectorAll('[data-teams-tab]').forEach(b => {
        b.classList.toggle('is-active', b === btn);
      });
      renderTeamsByTab();
    });
  });
}

async function renderTeamsByTab() {
  const grid = document.getElementById('teamsGrid');
  const searchBar = document.getElementById('teamsSearchBar');
  const mineEmpty = document.getElementById('myTeamEmpty');
  if (!grid) return;

  if (__currentTeamsTab === 'mine') {
    if (searchBar) searchBar.hidden = true;

    /* ---------- 未绑定：显示"绑定 / 创建"两个按钮 ---------- */
    if (!__mySchool) {
      grid.innerHTML = '';
      grid.hidden = true;

      if (mineEmpty) {
        mineEmpty.hidden = false;
        mineEmpty.innerHTML = `
          <div class="my-team-empty">
            <div class="my-team-empty__head">
              <div class="my-team-empty__icon">🏫</div>
              <div class="my-team-empty__text">
                <div class="my-team-empty__title">你还没有绑定队伍</div>
                <div class="my-team-empty__desc">从已有队伍中绑定你的学校，或创建一个全新的学校队伍</div>
              </div>
            </div>

            <div class="my-team-empty__actions">
              <button class="btn btn--primary btn--block" id="bindTeamBtn" type="button">🔗 绑定已有队伍</button>
              <button class="btn btn--ghost btn--block" id="createMyTeamBtn" type="button">🏫 创建新队伍</button>
            </div>
          </div>
        `;

        document.getElementById('bindTeamBtn')?.addEventListener('click', () => openTeamBindPanel());
        document.getElementById('createMyTeamBtn')?.addEventListener('click', () => openTeamEditorPanel(null));
      }
      return;
    }

    /* ---------- 已绑定：显示自己那支队伍 ---------- */
    if (mineEmpty) mineEmpty.hidden = true;
    grid.hidden = false;
    const mine = __teamsListCache.filter(t => t.short === __mySchool);
    renderTeams(mine, grid, { editMode: true });
  } else {
    /* 所有队伍 */
    if (searchBar) searchBar.hidden = false;
    if (mineEmpty) mineEmpty.hidden = true;
    grid.hidden = false;
    renderTeams(__teamsListCache, grid, { editMode: false });
  }
}

export async function loadTeams() {
  const box = document.getElementById('teamsGrid');
  if (!box) return;

  await refreshMySchool();
  updateTeamsChrome();
  bindTeamsTabs();
  bindTeamsAdminViews();

  try {
    const data = await fetchTeams();
    __teamsListCache = data.teams || [];
    await renderTeamsByTab();

    fetchTeamLogos().then(result => {
      if (!box.isConnected) return;
      const logos = new Map((result.teams || []).map(team => [team.short, team.logo]));
      __teamsListCache.forEach(t => {
        if (logos.has(t.short)) t.logo = logos.get(t.short);
      });
      box.querySelectorAll('[data-team-card-short]').forEach(card => {
        const logo = logos.get(card.dataset.teamCardShort);
        const img = card.querySelector('img');
        if (logo && img) img.src = logo;
      });
    }).catch(() => {});
  } catch (err) {
    console.warn('[队伍信息] 加载失败：', err.message);
    box.hidden = false;
    box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
  }
  box.setAttribute('aria-busy', 'false');
}

/* ============================================================
   管理员队伍管理视图
============================================================ */
let __adminViewsBound = false;

function bindTeamsAdminViews() {
  if (__adminViewsBound) return;
  __adminViewsBound = true;

  document.getElementById('teamsAdminBackBtn')?.addEventListener('click', hideTeamsAdminView);
  document.getElementById('teamsAdminDetailBackBtn')?.addEventListener('click', () => {
    const adminView = document.getElementById('teamsAdminView');
    const detailView = document.getElementById('teamsAdminDetailView');
    if (adminView) adminView.hidden = false;
    if (detailView) detailView.hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const search = document.getElementById('teamsAdminSearch');
  if (search && !search.dataset.bound) {
    search.dataset.bound = 'true';
    search.addEventListener('input', () => renderTeamsAdminList());
  }
}

function showTeamsAdminView() {
  const main = document.getElementById('teamsMainView');
  const adminView = document.getElementById('teamsAdminView');
  const detailView = document.getElementById('teamsAdminDetailView');
  const editorPanel = document.getElementById('teamEditorPanel');
  const bindPanel = document.getElementById('teamBindPanel');
  if (!main || !adminView) return;

  main.hidden = true;
  if (detailView) detailView.hidden = true;
  if (editorPanel) editorPanel.hidden = true;
  if (bindPanel) bindPanel.hidden = true;
  adminView.hidden = false;

  renderTeamsAdminList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideTeamsAdminView() {
  const main = document.getElementById('teamsMainView');
  const adminView = document.getElementById('teamsAdminView');
  const detailView = document.getElementById('teamsAdminDetailView');
  if (!main || !adminView) return;

  adminView.hidden = true;
  if (detailView) detailView.hidden = true;
  main.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.__showTeamsAdminView = showTeamsAdminView;

function renderTeamsAdminList() {
  const grid = document.getElementById('teamsAdminGrid');
  const count = document.getElementById('teamsAdminCount');
  const search = document.getElementById('teamsAdminSearch');
  if (!grid) return;

  const query = (search?.value || '').trim().toLowerCase();
  const filtered = __teamsListCache.filter(t => {
    if (!query) return true;
    return (t.name || '').toLowerCase().includes(query) || (t.short || '').toLowerCase().includes(query);
  });

  if (count) {
    count.textContent = query
      ? `匹配 ${filtered.length} / ${__teamsListCache.length} 支`
      : `共 ${__teamsListCache.length} 支队伍`;
  }

  if (!filtered.length) {
    grid.innerHTML = '<div class="board__state" style="grid-column:1/-1">没有匹配的队伍</div>';
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const name = sanitize(item.name || '');
    const short = sanitize(item.short || '');
    const logoSrc = item.logo ? item.logo : `${TEAM_LOGO_DIR}loge_${short}${TEAM_LOGO_EXT}`;
    return `
      <div class="team-card team-card--admin" data-admin-team="${short}" role="button" tabindex="0" aria-label="查看 ${name} 详情">
        <div class="team-card__logo-wrap">
          <img class="team-card__logo" src="${logoSrc}" alt="${name} logo" loading="lazy"
            onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2246%22 fill=%22%23182242%22 stroke=%22%23d4b47a%22 stroke-width=%222%22 stroke-dasharray=%226 6%22/><text x=%2250%22 y=%2264%22 font-size=%2240%22 font-weight=%22900%22 fill=%22%23d4b47a%22 text-anchor=%22middle%22 font-family=%22sans-serif%22>?</text></svg>'">
        </div>
        <h3 class="team-card__name">${name}</h3>
        <span class="team-card__short">${short}</span>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-admin-team]').forEach(card => {
    const open = () => showTeamAdminDetail(card.dataset.adminTeam);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

async function showTeamAdminDetail(school) {
  const adminView = document.getElementById('teamsAdminView');
  const detailView = document.getElementById('teamsAdminDetailView');
  const detailContent = document.getElementById('teamsAdminDetailContent');
  if (!adminView || !detailView || !detailContent) return;

  const schoolInfo = __teamsListCache.find(t => t.short === school) || {};
  const schoolName = schoolInfo.name || school;
  const schoolShort = schoolInfo.short || school;
  const schoolLogo = schoolInfo.logo || '';

  adminView.hidden = true;
  detailView.hidden = false;
  detailContent.innerHTML = '<div class="board__state">加载选手名单中…</div>';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  let players = [];
  let coachName = '';
  try {
    const pd = await apiRequest('/api/team/players?school=' + encodeURIComponent(school));
    const list = pd.players || [];
    players = list.filter(x => !x.is_coach);
    coachName = (list.find(x => x.is_coach) || {}).name || '';
  } catch (err) {
    detailContent.innerHTML = `<div class="board__state">加载失败：${sanitize(err.message)}</div>`;
    return;
  }

  const groups = [
    { key: '求生', label: '求生', icon: '🏃' },
    { key: '监管', label: '监管', icon: '👁️' },
    { key: '双边', label: '双边', icon: '⚔️' }
  ];

  const groupsHtml = groups.map(g => {
    const list = players.filter(p => p.position === g.key);
    if (!list.length) return '';
    return `
      <div class="admin-team-group">
        <div class="admin-team-group__head">
          <span class="admin-team-group__icon">${g.icon}</span>
          <h4>${g.label}</h4>
          <span class="admin-team-group__count">${list.length} 人</span>
        </div>
        <div class="admin-team-players">
          ${list.map(p => `
            <div class="admin-team-player">
              <div class="admin-team-player__name">
                ${sanitize(p.name || '未命名')}
                ${p.cn_short ? `<span class="admin-team-player__cn">（${sanitize(p.cn_short)}）</span>` : ''}
              </div>
              <div class="admin-team-player__uid">ID ${sanitize(p.uid || '—')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  detailContent.innerHTML = `
    <div class="admin-team-detail">
      <div class="admin-team-detail__head">
        ${schoolLogo
          ? `<img class="admin-team-detail__logo" src="${schoolLogo}" alt="${sanitize(schoolName)} logo">`
          : `<div class="admin-team-detail__logo admin-team-detail__logo--empty">?</div>`}
        <div class="admin-team-detail__info">
          <h3 class="admin-team-detail__name">${sanitize(schoolName)}</h3>
          <div class="admin-team-detail__short">${sanitize(schoolShort)}</div>
          <div class="admin-team-detail__stats">
            <span>选手 <b>${players.length}</b></span>
            ${coachName ? `<span>教练 <b>${sanitize(coachName)}</b></span>` : ''}
          </div>
        </div>
      </div>
      ${players.length ? groupsHtml : '<div class="board__state">该校尚未提交选手名单</div>'}
    </div>
  `;
}

/* ============================================================
   内嵌队伍编辑面板 —— 打开 / 关闭
============================================================ */
function showTeamEditorPanel() {
  const panel = document.getElementById('teamEditorPanel');
  const mainView = document.getElementById('teamsMainView');
  const adminView = document.getElementById('teamsAdminView');
  const detailView = document.getElementById('teamsAdminDetailView');
  const bindPanel = document.getElementById('teamBindPanel');
  if (!panel || !mainView) return;
  mainView.hidden = true;
  if (adminView) adminView.hidden = true;
  if (detailView) detailView.hidden = true;
  if (bindPanel) bindPanel.hidden = true;
  panel.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeTeamEditorPanel() {
  const panel = document.getElementById('teamEditorPanel');
  const mainView = document.getElementById('teamsMainView');
  if (!panel || !mainView) return;
  panel.hidden = true;
  panel.innerHTML = '';
  mainView.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   绑定已有队伍：内嵌面板
============================================================ */
async function openTeamBindPanel() {
  const panel = document.getElementById('teamBindPanel');
  const mainView = document.getElementById('teamsMainView');
  if (!panel || !mainView) return;

  mainView.hidden = true;
  panel.hidden = false;
  panel.innerHTML = '<div class="board__state" style="padding:60px 20px">加载学校列表中…</div>';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  /* 拉取队伍列表 */
  let teams = (__teamsListCache || []).slice();
  if (!teams.length) {
    try {
      const data = await fetchTeams();
      teams = data.teams || [];
      __teamsListCache = teams;
    } catch (err) {
      panel.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
      return;
    }
  }

  /* 拉取所有队伍 Logo */
  let logoMap = {};
  try {
    const ld = await fetchTeamLogos();
    (ld.teams || []).forEach(t => { if (t.short && t.logo) logoMap[t.short] = t.logo; });
  } catch {}

  teams.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  panel.innerHTML = `
    <div class="team-bind-card">
      <div class="team-bind-card__head">
        <h3 class="team-editor-card__title">绑定已有队伍 <em>TEAM</em></h3>
        <button class="btn btn--ghost btn--sm" id="tbBackBtn" type="button">← 返回</button>
      </div>
      <p class="tool-modal__sub">从下方选择你的学校，点击后自动绑定。绑定成功后可以立即填写队员信息（游戏 ID / CN / CN 简称）。</p>

      <div class="team-bind-search">
        <input type="search" id="tbSearch" placeholder="搜索学校名称或简称" autocomplete="off">
        <span class="team-bind-search__count" id="tbCount"></span>
      </div>

      <div class="team-bind-grid" id="tbGrid"></div>
    </div>
  `;

  const grid = panel.querySelector('#tbGrid');
  const search = panel.querySelector('#tbSearch');
  const count = panel.querySelector('#tbCount');

  const render = () => {
    const q = (search.value || '').trim().toLowerCase();
    const list = teams.filter(t => !q || (t.name || '').toLowerCase().includes(q) || (t.short || '').toLowerCase().includes(q));

    if (count) count.textContent = q ? `匹配 ${list.length} / ${teams.length} 所` : `共 ${teams.length} 所学校`;

    if (!list.length) {
      grid.innerHTML = '<div class="board__state" style="grid-column:1/-1">没有匹配的学校</div>';
      return;
    }

    grid.innerHTML = list.map(t => {
      const logoSrc = logoMap[t.short] || t.logo || `${TEAM_LOGO_DIR}loge_${t.short}${TEAM_LOGO_EXT}`;
      return `
        <div class="team-bind-item" data-bind-team="${sanitize(t.short)}" role="button" tabindex="0">
          <div class="team-bind-item__logo">
            <img src="${logoSrc}" alt="${sanitize(t.name)} logo" loading="lazy"
              onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2246%22 fill=%22%23182242%22 stroke=%22%23d4b47a%22 stroke-width=%222%22 stroke-dasharray=%226 6%22/><text x=%2250%22 y=%2264%22 font-size=%2240%22 font-weight=%22900%22 fill=%22%23d4b47a%22 text-anchor=%22middle%22 font-family=%22sans-serif%22>?</text></svg>'">
          </div>
          <div class="team-bind-item__name">${sanitize(t.name)}</div>
          <div class="team-bind-item__short">${sanitize(t.short)}</div>
          <button class="team-bind-item__btn" type="button">绑定此学校</button>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-bind-team]').forEach(card => {
      const bind = async () => {
        if (card.classList.contains('is-binding')) return;
        const school = card.dataset.bindTeam;
        card.classList.add('is-binding');
        const btn = card.querySelector('.team-bind-item__btn');
        const original = btn?.textContent;
        if (btn) { btn.disabled = true; btn.textContent = '绑定中…'; }
        try {
          await apiRequest('/api/team/school', {
            method: 'POST',
            body: JSON.stringify({ school })
          });
          showActionNotice('已绑定队伍：' + school);

          await refreshMySchool();

          /* 关闭绑定面板，回到我的队伍 */
          panel.hidden = true;
          panel.innerHTML = '';
          mainView.hidden = false;
          await renderTeamsByTab();

          /* 关键：自动打开「编辑队员」面板，让用户立即上传选手信息 */
          await openPlayerEditorPanel(school);

          if (window.app?.renderToolsPanel) window.app.renderToolsPanel();
        } catch (err) {
          showActionNotice(err.message, true);
          card.classList.remove('is-binding');
          if (btn) { btn.disabled = false; btn.textContent = original; }
        }
      };
      card.addEventListener('click', bind);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bind(); }
      });
    });
  };

  search.addEventListener('input', render);
  panel.querySelector('#tbBackBtn')?.addEventListener('click', () => {
    panel.hidden = true;
    panel.innerHTML = '';
    mainView.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  render();
}

/* ============================================================
   通用工具：图片压缩
============================================================ */
const PLAYER_POSITIONS = ['求生', '监管', '双边'];

function compressImage(file, maxSize = 300, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('请选择图片文件')); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * maxSize / width); width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * maxSize / height); height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(outputType, quality));
      };
      img.onerror = () => reject(new Error('图片解析失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function renderPlayerRowHtml(p, i, posOpts) {
  return `
    <div class="player-row" data-i="${i}">
      <div class="player-row__head">
        <span class="player-row__label">选手 ${i + 1}</span>
        <button type="button" class="player-row__del" data-del="${i}" aria-label="删除">✕</button>
      </div>
      <div class="tool-form__row player-row__grid">
        <div class="tool-field">
          <label>游戏 ID</label>
          <input type="text" class="pp-uid" maxlength="20" value="${sanitize(p.uid || '')}" placeholder="数字 ID" inputmode="numeric">
        </div>
        <div class="tool-field">
          <label>游戏 CN</label>
          <input type="text" class="pp-name" maxlength="20" value="${sanitize(p.name || '')}" placeholder="游戏内原名字">
        </div>
        <div class="tool-field">
          <label>CN 简称</label>
          <input type="text" class="pp-cnshort" maxlength="10" value="${sanitize(p.cn_short || '')}" placeholder="例如：阿轲">
        </div>
        <div class="tool-field">
          <label>位置</label>
          <select class="pp-pos">${posOpts}</select>
        </div>
      </div>
    </div>
  `;
}

function coachRowHtml(coachName) {
  return `
    <div class="player-row player-row--coach">
      <div class="player-row__head">
        <span class="player-row__label">教练（无需游戏 ID）</span>
      </div>
      <div class="tool-form__row">
        <div class="tool-field"><label>教练名字</label><input type="text" id="teCoachName" maxlength="20" value="${sanitize(coachName || '')}"></div>
      </div>
    </div>
  `;
}

function collectPlayersFromPanel(panel) {
  return [...panel.querySelectorAll('.player-row:not(.player-row--coach)')].map(row => ({
    name:     (row.querySelector('.pp-name')?.value || '').trim(),
    cn_short: (row.querySelector('.pp-cnshort')?.value || '').trim(),
    uid:      (row.querySelector('.pp-uid')?.value || '').trim(),
    position: row.querySelector('.pp-pos')?.value || '求生'
  }));
}

/* ============================================================
   创建队伍：内嵌面板
============================================================ */
let __createState = { pendingLogo: null };

async function openTeamEditorPanel(school) {
  const panel = document.getElementById('teamEditorPanel');
  if (!panel) return;

  __createState.pendingLogo = null;

  let players = [];
  let coachName = '';
  if (school) {
    try {
      const pd = await apiRequest('/api/team/players');
      const list = pd.players || [];
      players = list.filter(x => !x.is_coach).map(x => ({
        name: x.name, cn_short: x.cn_short || '', uid: x.uid || '', position: x.position || '求生'
      }));
      const c = list.find(x => x.is_coach);
      coachName = c ? c.name : '';
    } catch {}
  }
  if (!players.length) {
    players = [
      { name:'', cn_short:'', uid:'', position:'求生' }, { name:'', cn_short:'', uid:'', position:'求生' },
      { name:'', cn_short:'', uid:'', position:'求生' }, { name:'', cn_short:'', uid:'', position:'求生' },
      { name:'', cn_short:'', uid:'', position:'监管' }
    ];
  }
  const posOpts = PLAYER_POSITIONS.map(v => `<option value="${v}">${v}</option>`).join('');

  panel.innerHTML = `
    <div class="team-editor-card">
      <div class="team-editor-card__head">
        <h3 class="team-editor-card__title">创建我的队伍 <em>TEAM</em></h3>
        <button class="btn btn--ghost btn--sm team-editor-card__back" id="teBackBtn" type="button">← 返回队伍列表</button>
      </div>
      <p class="tool-modal__sub">填写学校信息、上传 Logo 并录入选手名单，保存后立即展示在队伍信息页。</p>

      <section class="tool-modal__section">
        <div class="tool-modal__section-head"><h4>学校信息</h4></div>
        <div class="tool-form">
          <div class="tool-form__row">
            <div class="tool-field">
              <label for="teName">学校 / 战队全称</label>
              <input type="text" id="teName" maxlength="30" placeholder="例如：北京建筑大学">
            </div>
            <div class="tool-field">
              <label for="teShort">学校简称（英文/拼音）</label>
              <input type="text" id="teShort" maxlength="20" placeholder="例如：bjjz">
            </div>
          </div>
          <div class="tool-field">
            <label for="teLogo">学校 Logo（建议方形，自动压缩到 300px）</label>
            <input type="file" id="teLogo" accept="image/*">
          </div>
          <div class="team-logo-preview" id="teLogoPreview" hidden>
            <div class="team-logo-preview__img" id="teLogoPreviewImg"></div>
            <div class="team-logo-preview__info">
              <b>预览</b>
              <span id="teLogoInfo">—</span>
            </div>
            <button class="team-logo-preview__clear" id="teLogoClear" type="button" aria-label="清除">✕</button>
          </div>
        </div>
      </section>

      <section class="tool-modal__section">
        <div class="tool-modal__section-head">
          <h4>选手名单</h4>
          <span class="tool-modal__count">可多行添加</span>
        </div>
        <div id="tePlayersArea">
          ${players.map((p, i) => renderPlayerRowHtml(p, i, posOpts)).join('')}
          ${coachRowHtml(coachName)}
        </div>
        <div class="tool-actions">
          <button class="btn btn--ghost btn--sm" id="teAddPlayer" type="button">+ 添加选手</button>
        </div>
      </section>

      <div class="tool-actions">
        <button class="btn btn--primary btn--sm" id="teSaveBtn" type="button">💾 保存</button>
        <button class="btn btn--ghost btn--sm" id="teCancelBtn" type="button">取消</button>
        <span class="appointment-form__message" id="teMessage" role="status" aria-live="polite"></span>
      </div>
    </div>
  `;

  showTeamEditorPanel();

  panel.querySelectorAll('.pp-pos').forEach((sel, i) => { if (players[i]) sel.value = players[i].position || '求生'; });

  const fileInput = panel.querySelector('#teLogo');
  const preview = panel.querySelector('#teLogoPreview');
  const previewImg = panel.querySelector('#teLogoPreviewImg');
  const previewInfo = panel.querySelector('#teLogoInfo');

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) { __createState.pendingLogo = null; return; }
    if (file.size > 5 * 1024 * 1024) { alert('图片过大（超过 5MB）'); fileInput.value = ''; return; }
    try {
      const dataUrl = await compressImage(file, 300, 0.78);
      __createState.pendingLogo = dataUrl;
      if (previewImg) previewImg.style.backgroundImage = `url(${dataUrl})`;
      if (previewInfo) previewInfo.textContent = `已选择 ${file.name}（压缩后 ${Math.round(dataUrl.length/1024)} KB）`;
      if (preview) preview.hidden = false;
    } catch (err) {
      alert('图片处理失败：' + err.message);
      fileInput.value = '';
    }
  });

  panel.querySelector('#teLogoClear')?.addEventListener('click', () => {
    __createState.pendingLogo = null;
    if (fileInput) fileInput.value = '';
    if (previewImg) previewImg.style.backgroundImage = '';
    if (preview) preview.hidden = true;
  });

  const rebuild = (list) => {
    const area = panel.querySelector('#tePlayersArea');
    const curCoach = panel.querySelector('#teCoachName')?.value || '';
    area.innerHTML = list.map((p, i) => renderPlayerRowHtml(p, i, posOpts)).join('') + coachRowHtml(curCoach);
    area.querySelectorAll('.pp-pos').forEach((sel, i) => { if (list[i]) sel.value = list[i].position || '求生'; });
    bindDelete();
  };

  const bindDelete = () => {
    panel.querySelectorAll('.player-row__del').forEach(btn => {
      btn.addEventListener('click', () => {
        const cur = collectPlayersFromPanel(panel);
        cur.splice(Number(btn.dataset.del), 1);
        rebuild(cur);
      });
    });
  };
  bindDelete();

  panel.querySelector('#teAddPlayer')?.addEventListener('click', () => {
    const cur = collectPlayersFromPanel(panel);
    cur.push({ name: '', cn_short: '', uid: '', position: '求生' });
    rebuild(cur);
  });

  panel.querySelector('#teBackBtn')?.addEventListener('click', () => closeTeamEditorPanel());
  panel.querySelector('#teCancelBtn')?.addEventListener('click', () => closeTeamEditorPanel());

  panel.querySelector('#teSaveBtn')?.addEventListener('click', async () => {
    const name = (panel.querySelector('#teName').value || '').trim();
    const short = (panel.querySelector('#teShort').value || '').trim().toLowerCase();
    if (!name) { showActionNotice('请填写学校全称', true); return; }
    if (!short) { showActionNotice('请填写学校简称', true); return; }
    if (!/^[a-z0-9_-]{1,20}$/.test(short)) {
      showActionNotice('简称只能是字母、数字、下划线、连字符', true); return;
    }
    const rows = collectPlayersFromPanel(panel).filter(r => r.name || r.uid || r.cn_short);
    for (const r of rows) {
      if (!r.name) { showActionNotice('选手名字（游戏 CN）不能为空', true); return; }
      if (!r.uid) { showActionNotice('选手游戏 ID 不能为空', true); return; }
    }

    const saveBtn = panel.querySelector('#teSaveBtn');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';
    const msg = panel.querySelector('#teMessage');

    try {
      const logoPayload = __createState.pendingLogo || null;

      await apiRequest('/api/team/create-school', {
        method: 'POST',
        body: JSON.stringify({ name, short, logo: logoPayload })
      });

      const coachName = (panel.querySelector('#teCoachName')?.value || '').trim();
      if (rows.length || coachName) {
        await apiRequest('/api/team/players', {
          method: 'POST',
          body: JSON.stringify({
            players: rows,
            coach: coachName ? { name: coachName } : null
          })
        });
      }

      showActionNotice('队伍已创建');
      closeTeamEditorPanel();
      invalidateTeams();
      await loadTeams();
      if (window.app?.renderToolsPanel) window.app.renderToolsPanel();
    } catch (err) {
      if (msg) msg.textContent = err.message;
      showActionNotice(err.message, true);
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });
}

/* ============================================================
   编辑选手：内嵌面板（学校信息只读）
============================================================ */
async function openPlayerEditorPanel(school) {
  const panel = document.getElementById('teamEditorPanel');
  if (!panel) return;

  const schoolInfo = __teamsListCache.find(t => t.short === school) || __myTeamInfo || {};
  const schoolName = schoolInfo.name || school;
  const schoolShort = schoolInfo.short || school;
  const schoolLogo = schoolInfo.logo || '';

  let players = [];
  let coachName = '';
  try {
    const pd = await apiRequest('/api/team/players');
    const list = pd.players || [];
    players = list.filter(x => !x.is_coach).map(x => ({
      name: x.name, cn_short: x.cn_short || '', uid: x.uid || '', position: x.position || '求生'
    }));
    const c = list.find(x => x.is_coach);
    coachName = c ? c.name : '';
  } catch {}

  if (!players.length) {
    players = [
      { name:'', cn_short:'', uid:'', position:'求生' }, { name:'', cn_short:'', uid:'', position:'求生' },
      { name:'', cn_short:'', uid:'', position:'求生' }, { name:'', cn_short:'', uid:'', position:'求生' },
      { name:'', cn_short:'', uid:'', position:'监管' }
    ];
  }
  const posOpts = PLAYER_POSITIONS.map(v => `<option value="${v}">${v}</option>`).join('');

  panel.innerHTML = `
    <div class="team-editor-card">
      <div class="team-editor-card__head">
        <h3 class="team-editor-card__title">编辑队伍选手 <em>TEAM</em></h3>
        <button class="btn btn--ghost btn--sm team-editor-card__back" id="teBackBtn" type="button">← 返回队伍列表</button>
      </div>
      <p class="tool-modal__sub">学校信息已绑定，只需维护选手名单即可。</p>

      <section class="tool-modal__section">
        <div class="tool-modal__section-head"><h4>学校信息（已绑定）</h4></div>
        <div class="school-readonly">
          ${schoolLogo ? `<img class="school-readonly__logo" src="${schoolLogo}" alt="${sanitize(schoolName)} logo">` : `<div class="school-readonly__logo school-readonly__logo--empty">?</div>`}
          <div class="school-readonly__info">
            <div class="school-readonly__name">${sanitize(schoolName)}</div>
            <div class="school-readonly__short">${sanitize(schoolShort)}</div>
          </div>
        </div>
      </section>

      <section class="tool-modal__section">
        <div class="tool-modal__section-head">
          <h4>选手名单</h4>
          <span class="tool-modal__count">可多行添加</span>
        </div>
        <div id="tePlayersArea">
          ${players.map((p, i) => renderPlayerRowHtml(p, i, posOpts)).join('')}
          ${coachRowHtml(coachName)}
        </div>
        <div class="tool-actions">
          <button class="btn btn--ghost btn--sm" id="teAddPlayer" type="button">+ 添加选手</button>
        </div>
      </section>

      <div class="tool-actions">
        <button class="btn btn--primary btn--sm" id="teSaveBtn" type="button">💾 保存名单</button>
        <button class="btn btn--ghost btn--sm" id="teCancelBtn" type="button">取消</button>
        <span class="appointment-form__message" id="teMessage" role="status" aria-live="polite"></span>
      </div>
    </div>
  `;

  showTeamEditorPanel();

  panel.querySelectorAll('.pp-pos').forEach((sel, i) => { if (players[i]) sel.value = players[i].position || '求生'; });

  const rebuild = (list) => {
    const area = panel.querySelector('#tePlayersArea');
    const curCoach = panel.querySelector('#teCoachName')?.value || '';
    area.innerHTML = list.map((p, i) => renderPlayerRowHtml(p, i, posOpts)).join('') + coachRowHtml(curCoach);
    area.querySelectorAll('.pp-pos').forEach((sel, i) => { if (list[i]) sel.value = list[i].position || '求生'; });
    bindDelete();
  };

  const bindDelete = () => {
    panel.querySelectorAll('.player-row__del').forEach(btn => {
      btn.addEventListener('click', () => {
        const cur = collectPlayersFromPanel(panel);
        cur.splice(Number(btn.dataset.del), 1);
        rebuild(cur);
      });
    });
  };
  bindDelete();

  panel.querySelector('#teAddPlayer')?.addEventListener('click', () => {
    const cur = collectPlayersFromPanel(panel);
    cur.push({ name: '', cn_short: '', uid: '', position: '求生' });
    rebuild(cur);
  });

  panel.querySelector('#teBackBtn')?.addEventListener('click', () => closeTeamEditorPanel());
  panel.querySelector('#teCancelBtn')?.addEventListener('click', () => closeTeamEditorPanel());

  panel.querySelector('#teSaveBtn')?.addEventListener('click', async () => {
    const rows = collectPlayersFromPanel(panel).filter(r => r.name || r.uid || r.cn_short);
    for (const r of rows) {
      if (!r.name) { showActionNotice('选手名字（游戏 CN）不能为空', true); return; }
      if (!r.uid) { showActionNotice('选手游戏 ID 不能为空', true); return; }
    }
    const coachName = (panel.querySelector('#teCoachName')?.value || '').trim();
    if (!rows.length && !coachName) { showActionNotice('请至少添加一名选手或教练', true); return; }

    const saveBtn = panel.querySelector('#teSaveBtn');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';
    const msg = panel.querySelector('#teMessage');

    try {
      await apiRequest('/api/team/players', {
        method: 'POST',
        body: JSON.stringify({
          players: rows,
          coach: coachName ? { name: coachName } : null
        })
      });
      showActionNotice('名单已保存');
      closeTeamEditorPanel();
      invalidateTeams();
      await loadTeams();
    } catch (err) {
      if (msg) msg.textContent = err.message;
      showActionNotice(err.message, true);
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });
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
            <li class="staff-name-row">
              <span class="staff-name-row__name">${sanitize(person.username || '未命名')}</span>
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
   赛事赛程
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
  return formatBeijing(value) || String(value);
}

function scoreText(appointment) {
  if (!appointment || !appointment.is_finished) return '';
  if (appointment.score_a == null || appointment.score_b == null) return '';
  return `${appointment.score_a} : ${appointment.score_b}`;
}

function parseRounds(raw) {
  if (!raw) return [];
  let arr;
  try { arr = JSON.parse(raw); } catch (e) { return []; }
  if (!Array.isArray(arr)) return [];
  return arr.map(r => {
    if (r && r.first && r.second) {
      return {
        first:  { a: Number(r.first.a)  || 0, b: Number(r.first.b)  || 0 },
        second: { a: Number(r.second.a) || 0, b: Number(r.second.b) || 0 }
      };
    }
    if (r && (r.a != null || r.b != null)) {
      return { first:  { a: Number(r.a) || 0, b: Number(r.b) || 0 }, second: { a: 0, b: 0 } };
    }
    return { first: { a: 0, b: 0 }, second: { a: 0, b: 0 } };
  });
}

function roundRowHtml(round, index) {
  const fa = round?.first?.a ?? 0;
  const fb = round?.first?.b ?? 0;
  const sa = round?.second?.a ?? 0;
  const sb = round?.second?.b ?? 0;
  return `
    <div class="match-result-round" data-round-index="${index}">
      <div class="match-result-round__head">
        <span class="match-result-round__label">第 ${index + 1} 局</span>
        <button class="match-result-round__del" type="button" aria-label="删除该局">✕</button>
      </div>
      <div class="match-result-round__row">
        <span class="match-result-round__phase">上半场</span>
        <input type="number" class="mrr-first-a" min="0" max="99" value="${fa}" inputmode="numeric">
        <span class="match-result-round__sep">:</span>
        <input type="number" class="mrr-first-b" min="0" max="99" value="${fb}" inputmode="numeric">
      </div>
      <div class="match-result-round__row">
        <span class="match-result-round__phase">下半场</span>
        <input type="number" class="mrr-second-a" min="0" max="99" value="${sa}" inputmode="numeric">
        <span class="match-result-round__sep">:</span>
        <input type="number" class="mrr-second-b" min="0" max="99" value="${sb}" inputmode="numeric">
      </div>
    </div>
  `;
}

function roundDisplayHtml(round, index) {
  const totalA = (round.first?.a || 0) + (round.second?.a || 0);
  const totalB = (round.first?.b || 0) + (round.second?.b || 0);
  return `
    <div class="match-round-row">
      <span class="match-round-row__label">第 ${index + 1} 局</span>
      <span class="match-round-row__phase">上半 <b>${round.first?.a ?? 0} : ${round.first?.b ?? 0}</b></span>
      <span class="match-round-row__phase">下半 <b>${round.second?.a ?? 0} : ${round.second?.b ?? 0}</b></span>
      <span class="match-round-row__total">总分 <b>${totalA} : ${totalB}</b></span>
    </div>
  `;
}

function bindRoundDelete(roundsBox) {
  roundsBox.querySelectorAll('.match-result-round').forEach(row => {
    const del = row.querySelector('.match-result-round__del');
    if (!del || del.dataset.bound === 'true') return;
    del.dataset.bound = 'true';
    del.addEventListener('click', () => {
      if (roundsBox.children.length <= 1) { showActionNotice('至少保留一局', true); return; }
      row.remove();
      [...roundsBox.children].forEach((r, i) => {
        r.dataset.roundIndex = i;
        const label = r.querySelector('.match-result-round__label');
        if (label) label.textContent = `第 ${i + 1} 局`;
      });
    });
  });
}

function bindRoundInputs(roundsBox, content) {
  const inputs = roundsBox.querySelectorAll('.match-result-round input');
  inputs.forEach(inp => {
    if (inp.dataset.bound === 'true') return;
    inp.dataset.bound = 'true';
    inp.addEventListener('input', () => refreshPreview(roundsBox, content));
  });
  refreshPreview(roundsBox, content);
}

function refreshPreview(roundsBox, content) {
  const rows = [...roundsBox.querySelectorAll('.match-result-round')];
  let totalA = 0, totalB = 0;
  for (const row of rows) {
    totalA += (Number(row.querySelector('.mrr-first-a').value)  || 0)
            + (Number(row.querySelector('.mrr-second-a').value) || 0);
    totalB += (Number(row.querySelector('.mrr-first-b').value)  || 0)
            + (Number(row.querySelector('.mrr-second-b').value) || 0);
  }
  const pA = content.querySelector('#previewScoreA');
  const pB = content.querySelector('#previewScoreB');
  if (pA) pA.textContent = totalA;
  if (pB) pB.textContent = totalB;
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

  const teamAName = (currentScheduleNameMap && currentScheduleNameMap[match.a]) || match.a || '队伍 A';
  const teamBName = (currentScheduleNameMap && currentScheduleNameMap[match.b]) || match.b || '队伍 B';

  const rounds = parseRounds(appointment?.rounds);
  const hasScore = appointment?.is_finished && appointment.score_a != null && appointment.score_b != null;

  const scoreHtml = hasScore ? `
    <div class="match-score-display">
      <div class="match-score-display__main">
        <span class="match-score-display__side">${sanitize(teamAName)}</span>
        <b class="match-score-display__num">${appointment.score_a}</b>
        <em class="match-score-display__sep">:</em>
        <b class="match-score-display__num">${appointment.score_b}</b>
        <span class="match-score-display__side">${sanitize(teamBName)}</span>
      </div>
      ${rounds.length ? `<div class="match-score-display__rounds">${rounds.map((r, i) => roundDisplayHtml(r, i)).join('')}</div>` : ''}
    </div>
  ` : '';

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

  const formDefaultRounds = rounds.length ? rounds : [
    { first: { a: 0, b: 0 }, second: { a: 0, b: 0 } },
    { first: { a: 0, b: 0 }, second: { a: 0, b: 0 } },
    { first: { a: 0, b: 0 }, second: { a: 0, b: 0 } }
  ];

  const renderResultForm = (submitLabel) => `
    <div class="match-result-form" id="matchResultForm" hidden>
      <div class="match-result-form__header">
        <span class="match-result-form__team-name">${sanitize(teamAName)}</span>
        <span class="match-result-form__vs">VS</span>
        <span class="match-result-form__team-name">${sanitize(teamBName)}</span>
      </div>
      <div class="match-result-form__rounds" id="resultRounds">
        ${formDefaultRounds.map((r, i) => roundRowHtml(r, i)).join('')}
      </div>
      <div class="match-result-form__preview" id="resultPreview">
        <span>大比分预览：</span>
        <b>${sanitize(teamAName)} <span id="previewScoreA">0</span></b>
        <em>:</em>
        <b><span id="previewScoreB">0</span> ${sanitize(teamBName)}</b>
      </div>
      <div class="match-result-form__actions">
        <button class="btn btn--ghost btn--sm" id="resultAddRound" type="button">+ 添加一局</button>
        <button class="btn btn--primary btn--sm" id="resultSubmitBtn" type="button">${submitLabel}</button>
      </div>
      <p class="draw-info" id="matchFinishMessage2" role="status" aria-live="polite"></p>
    </div>
  `;

  let finishAction = '';
  if (appointment && isJudge) {
    if (appointment.is_finished) {
      const toggleLabel = hasScore ? '📝 修改比分' : '📝 补录比分';
      const submitLabel = hasScore ? '✅ 保存比分' : '✅ 提交比分';
      finishAction = `
        <button class="btn btn--primary btn--sm" id="matchFinishToggleBtn" type="button">${toggleLabel}</button>
        <button class="btn btn--ghost btn--sm" id="matchFinishBtn" type="button">恢复为未完赛</button>
        ${renderResultForm(submitLabel)}
      `;
    } else {
      finishAction = `
        <button class="btn btn--primary btn--sm" id="matchFinishToggleBtn" type="button">📝 提交赛事比分</button>
        ${renderResultForm('✅ 提交比分并完赛')}
      `;
    }
  }

  content.innerHTML = `
    <h3 class="tool-modal__title" id="matchDetailsTitle">${sanitize(teamAName)} VS ${sanitize(teamBName)} <em>比赛详情</em></h3>
    <div class="match-detail-status ${appointment?.is_finished ? 'match-detail-status--finished' : appointment ? 'match-detail-status--scheduled' : ''}">${appointment?.is_finished ? '已完赛' : appointment ? '已约赛 · 未完赛' : '待约赛'}</div>
    ${scoreHtml}
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
      renderSchedule(currentScheduleMatches, document.getElementById('scheduleBoard'), currentScheduleTitle, currentScheduleLogoMap, currentScheduleNameMap, currentScheduleId, currentAppointments, currentTournament);
      const updated = currentAppointments.find(a => a.id === appointment.id);
      showMatchDetails(match, updated);
    } catch (err) {
      showActionNotice(mutationComplete ? '操作已成功，但赛程刷新失败' : err.message, true);
      const message = content.querySelector('#matchSignupMessage');
      if (message) message.textContent = mutationComplete ? '操作已成功，详情刷新失败。' : err.message;
      signupButton.disabled = false;
    }
  }));

  const finishBtn = content.querySelector('#matchFinishBtn');
  if (finishBtn) finishBtn.addEventListener('click', async () => {
    if (!confirm('确定要恢复为未完赛吗？已有的比分记录会被清空。')) return;
    finishBtn.disabled = true;
    let mutationComplete = false;
    try {
      await apiRequest(`/api/match-appointments/${appointment.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_finished: false })
      });
      mutationComplete = true;
      showActionNotice('比赛已恢复为未完赛，比分已清空');
      const data = await apiRequest(`/api/match-appointments?schedule_id=${currentScheduleId}`);
      currentAppointments = data.appointments || [];
      renderSchedule(currentScheduleMatches, document.getElementById('scheduleBoard'), currentScheduleTitle, currentScheduleLogoMap, currentScheduleNameMap, currentScheduleId, currentAppointments, currentTournament);
      showMatchDetails(match, currentAppointments.find(a => a.id === appointment.id));
    } catch (err) {
      showActionNotice(mutationComplete ? '状态已更新，但赛程刷新失败' : err.message, true);
      const message = content.querySelector('#matchFinishMessage2');
      if (message) message.textContent = err.message;
      finishBtn.disabled = false;
    }
  });

  const toggleBtn = content.querySelector('#matchFinishToggleBtn');
  const resultForm = content.querySelector('#matchResultForm');
  if (toggleBtn && resultForm) {
    toggleBtn.addEventListener('click', () => {
      resultForm.hidden = !resultForm.hidden;
      if (!resultForm.hidden) {
        const roundsBox = content.querySelector('#resultRounds');
        if (roundsBox) { bindRoundDelete(roundsBox); bindRoundInputs(roundsBox, content); }
      }
    });
  }

  const roundsBox = content.querySelector('#resultRounds');
  const addRoundBtn = content.querySelector('#resultAddRound');
  if (roundsBox) { bindRoundDelete(roundsBox); bindRoundInputs(roundsBox, content); }
  if (addRoundBtn && roundsBox) {
    addRoundBtn.addEventListener('click', () => {
      const idx = roundsBox.children.length;
      if (idx >= 9) { showActionNotice('最多 9 局', true); return; }
      roundsBox.insertAdjacentHTML('beforeend', roundRowHtml({ first: { a: 0, b: 0 }, second: { a: 0, b: 0 } }, idx));
      bindRoundDelete(roundsBox); bindRoundInputs(roundsBox, content);
    });
  }

  const submitBtn = content.querySelector('#resultSubmitBtn');
  if (submitBtn) submitBtn.addEventListener('click', async () => {
    const roundRows = [...content.querySelectorAll('.match-result-round')];
    if (!roundRows.length) return showActionNotice('请至少填写一局小比分', true);

    const rounds = roundRows.map(row => ({
      first:  { a: Number(row.querySelector('.mrr-first-a').value),  b: Number(row.querySelector('.mrr-first-b').value) },
      second: { a: Number(row.querySelector('.mrr-second-a').value), b: Number(row.querySelector('.mrr-second-b').value) }
    }));

    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      const vals = [r.first.a, r.first.b, r.second.a, r.second.b];
      if (!vals.every(n => Number.isInteger(n) && n >= 0 && n <= 99)) {
        return showActionNotice(`第 ${i + 1} 局比分必须是 0-99 的整数`, true);
      }
    }

    submitBtn.disabled = true;
    const original = submitBtn.textContent;
    submitBtn.textContent = '提交中…';
    let mutationComplete = false;
    try {
      await apiRequest(`/api/match-appointments/${appointment.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_finished: true, rounds })
      });
      mutationComplete = true;
      showActionNotice('比分已保存');
      const data = await apiRequest(`/api/match-appointments?schedule_id=${currentScheduleId}`);
      currentAppointments = data.appointments || [];
      renderSchedule(currentScheduleMatches, document.getElementById('scheduleBoard'), currentScheduleTitle, currentScheduleLogoMap, currentScheduleNameMap, currentScheduleId, currentAppointments, currentTournament);
      showMatchDetails(match, currentAppointments.find(a => a.id === appointment.id));
    } catch (err) {
      showActionNotice(mutationComplete ? '比分已保存，但刷新失败' : err.message, true);
      const message = content.querySelector('#matchFinishMessage2');
      if (message) message.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }
  });
}

let currentScheduleId = null;
let currentScheduleMatches = [];
let currentScheduleTitle = '';
let currentScheduleLogoMap = {};
let currentScheduleNameMap = {};
let currentAppointments = [];
let currentTournament = null;
let scheduleResizeHandler = null;
let scheduleLoadSequence = 0;

export function renderSchedule(list, container, title, logoMap, nameMap, scheduleId = null, appointments = [], tournament = null) {
  currentScheduleId = scheduleId;
  currentScheduleMatches = list || [];
  currentScheduleTitle = title || '';
  currentScheduleLogoMap = logoMap || {};
  currentScheduleNameMap = nameMap || {};
  currentAppointments = appointments;
  currentTournament = tournament;

  if (!list || !list.length) {
    if (scheduleResizeHandler) window.removeEventListener('resize', scheduleResizeHandler);
    scheduleResizeHandler = null;
    container.innerHTML = '<div class="board__state">赛程尚未发布</div>';
    container.setAttribute('aria-busy', 'false');
    return;
  }

  const appointmentByIndex = new Map(appointments.map(a => [a.match_index, a]));

  const statusPriority = appt => {
    if (appt?.is_finished) return 2;
    if (appt) return 0;
    return 1;
  };

  const sortItems = (a, b) => {
    const pa = statusPriority(a.appointment);
    const pb = statusPriority(b.appointment);
    if (pa !== pb) return pa - pb;
    const ta = a.appointment?.start_time ? new Date(a.appointment.start_time).getTime() : Infinity;
    const tb = b.appointment?.start_time ? new Date(b.appointment.start_time).getTime() : Infinity;
    return ta - tb || a.flatIndex - b.flatIndex;
  };

  const grouped = [];
  if (tournament && tournament.rounds && tournament.rounds.length) {
    let flatIndex = 0;
    tournament.rounds.forEach(r => {
      const roundMatches = r.matches.map((m, mi) => ({
        match: m,
        flatIndex: flatIndex + mi,
        roundIndex: r.index,
        roundName: r.name,
        appointment: appointmentByIndex.get(flatIndex + mi)
      }));
      roundMatches.sort(sortItems);
      grouped.push({ round: r, items: roundMatches });
      flatIndex += r.matches.length;
    });
  } else {
    const items = list.map((m, i) => ({
      match: m,
      flatIndex: i,
      roundIndex: 1,
      roundName: `${list.length * 2} 进 ${list.length}`,
      appointment: appointmentByIndex.get(i)
    }));
    items.sort(sortItems);
    grouped.push({ round: { index: 1, name: `${list.length * 2} 进 ${list.length}` }, items });
  }

  const overviewHtml = grouped.map(g => {
    const done = g.items.filter(it => it.appointment?.is_finished).length;
    const total = g.items.length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    return `
      <div class="schedule-overview__item ${done === total && total > 0 ? 'is-done' : ''}">
        <div class="schedule-overview__head">
          <span class="schedule-overview__index">第 ${g.round.index} 轮</span>
          <span class="schedule-overview__name">${sanitize(g.round.name || '')}</span>
        </div>
        <div class="schedule-overview__progress">
          <div class="schedule-overview__bar" style="width:${percent}%"></div>
        </div>
        <div class="schedule-overview__meta">${done} / ${total} 场已完赛</div>
      </div>
    `;
  }).join('');

  const INITIAL_LIMIT = 8;

  const roundsHtml = grouped.map(g => {
    const cards = g.items.map(({ match: p, flatIndex, appointment }, idx) => {
      const judgeCount = (appointment?.signups || []).filter(s => s.role === 'judge').length;
      const commentatorCount = (appointment?.signups || []).filter(s => s.role === 'commentator').length;
      const status = appointment?.is_finished ? 'finished' : appointment ? 'scheduled' : 'unbooked';
      const appointmentTime = appointment ? `<span class="schedule-card__time">${sanitize(formatMatchTime(appointment.start_time))}</span>` : '';
      const appointmentStaff = appointment ? `<span class="schedule-card__staff">裁判 ${judgeCount} · 解说 ${commentatorCount}</span>` : '';

      const score = scoreText(appointment);
      const finished = !!appointment?.is_finished;
      let centerMain;
      if (score) {
        centerMain = `<div class="schedule-card__score">${score}</div>`;
      } else if (finished) {
        centerMain = `<div class="schedule-card__score schedule-card__score--pending">比分待补录</div>`;
      } else {
        centerMain = `<div class="schedule-card__vs">VS</div>`;
      }

      const collapsed = idx >= INITIAL_LIMIT;
      return `
        <div class="schedule-card ${appointment?.is_finished ? 'schedule-card--finished' : ''}"
             role="button" tabindex="0"
             data-match-index="${flatIndex}"
             data-round-index="${g.round.index}"
             data-schedule-status="${status}"
             data-collapsed="${collapsed ? 'true' : 'false'}"
             data-team-search="${sanitize(`${p.a || ''} ${p.b || ''}`)}"
             ${collapsed ? 'hidden' : ''}
             aria-label="查看 ${sanitize(p.a || '轮空')} 对阵 ${sanitize(p.b || '轮空')} 详情">
          ${scheduleSideHtml(p.a, logoMap, nameMap)}
          <div class="schedule-card__center">
            <span class="schedule-card__state ${appointment?.is_finished ? 'schedule-card__state--finished' : appointment ? 'schedule-card__state--scheduled' : ''}">${appointment?.is_finished ? '已完赛' : appointment ? '已约赛 · 未完赛' : '待约赛'}</span>
            ${centerMain}
            ${appointmentTime}
            ${appointmentStaff}
          </div>
          ${scheduleSideHtml(p.b, logoMap, nameMap)}
        </div>
      `;
    }).join('');

    const hiddenCount = Math.max(0, g.items.length - INITIAL_LIMIT);
    const moreBtn = hiddenCount > 0
      ? `<button class="btn btn--ghost btn--sm schedule-round__more" type="button"
                 data-round="${g.round.index}" aria-expanded="false">
           显示更多（${hiddenCount} 场）
         </button>`
      : '';

    return `
      <section class="schedule-round" data-round="${g.round.index}" data-expanded="false">
        <div class="schedule-round__head">
          <span class="schedule-round__index">第 ${g.round.index} 轮</span>
          <h4 class="schedule-round__name">${sanitize(g.round.name || '')}</h4>
          <span class="schedule-round__count">${g.items.length} 场</span>
        </div>
        <div class="schedule-grid">${cards}</div>
        ${moreBtn}
      </section>
    `;
  }).join('');

  container.innerHTML = `
    <div class="schedule-board__head">
      <h3>${sanitize(title || '64 进 32 淘汰赛')}</h3>
      <span class="schedule-board__count" id="scheduleResultCount" aria-live="polite">${list.length} 场对阵</span>
    </div>

    ${tournament && tournament.totalRounds > 1 ? `
    <div class="schedule-overview">
      <div class="schedule-overview__title">
        <b>本次比赛赛程</b>
        <em>${tournament.typeLabel} · 共 ${tournament.totalRounds} 轮</em>
      </div>
      <div class="schedule-overview__grid">${overviewHtml}</div>
    </div>
    ` : ''}

    <div class="list-controls schedule-controls" role="search">
      <label class="list-controls__search"><span>搜索对阵</span><input id="scheduleSearch" type="search" placeholder="输入队伍名称或简称" autocomplete="off"></label>
      <label class="list-controls__filter"><span>比赛状态</span><select id="scheduleStatusFilter"><option value="all">全部状态</option><option value="unfinished">未完赛</option><option value="scheduled">已约赛 · 未完赛</option><option value="unbooked">待约赛</option><option value="finished">已完赛</option></select></label>
    </div>

    <div class="schedule-rounds">${roundsHtml}</div>

    <p class="schedule-no-results" id="scheduleNoResults" hidden>没有符合条件的对阵，请调整搜索内容或比赛状态。</p>
  `;

  container.querySelectorAll('[data-match-index]').forEach(card => {
    const open = () => {
      const idx = Number(card.dataset.matchIndex);
      showMatchDetails(list[idx], appointmentByIndex.get(idx));
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  container.querySelectorAll('.schedule-round__more').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.schedule-round');
      if (!section) return;
      const nextExpanded = section.dataset.expanded !== 'true';
      section.dataset.expanded = nextExpanded ? 'true' : 'false';
      btn.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');

      section.querySelectorAll('[data-collapsed="true"]').forEach(card => {
        card.hidden = !nextExpanded;
      });

      const hiddenCount = section.querySelectorAll('[data-collapsed="true"]').length;
      btn.textContent = nextExpanded ? '收起' : `显示更多（${hiddenCount} 场）`;
    });
  });

  const searchInput = container.querySelector('#scheduleSearch');
  const statusFilter = container.querySelector('#scheduleStatusFilter');
  const resultCount = container.querySelector('#scheduleResultCount');
  const noResults = container.querySelector('#scheduleNoResults');
  const allCards = [...container.querySelectorAll('[data-match-index]')];

  const updateScheduleFilters = () => {
    const query = (searchInput?.value || '').trim().toLocaleLowerCase();
    const status = statusFilter?.value || 'all';
    const isFiltering = !!(query || status !== 'all');
    let visible = 0;

    container.querySelectorAll('.schedule-round').forEach(section => {
      const expanded = section.dataset.expanded === 'true';
      const cards = [...section.querySelectorAll('[data-match-index]')];
      let sectionVisible = 0;

      cards.forEach(card => {
        const matchesText = !query || `${card.textContent} ${card.dataset.teamSearch || ''}`.toLocaleLowerCase().includes(query);
        const matchesStatus = status === 'all' || (status === 'unfinished' ? card.dataset.scheduleStatus !== 'finished' : card.dataset.scheduleStatus === status);
        const isMatch = matchesText && matchesStatus;

        if (isMatch) {
          const isCollapsed = card.dataset.collapsed === 'true';
          card.hidden = !isFiltering && !expanded && isCollapsed;
          sectionVisible++;
        } else {
          card.hidden = true;
        }
      });

      visible += sectionVisible;
      section.hidden = sectionVisible === 0;

      const moreBtn = section.querySelector('.schedule-round__more');
      if (moreBtn) {
        const totalCollapsed = cards.filter(c => c.dataset.collapsed === 'true').length;
        moreBtn.hidden = isFiltering || totalCollapsed === 0;
      }
    });

    if (resultCount) resultCount.textContent = isFiltering
      ? `匹配 ${visible} / ${allCards.length} 场`
      : `${allCards.length} 场对阵`;
    if (noResults) noResults.hidden = visible > 0;
  };

  searchInput?.addEventListener('input', updateScheduleFilters);
  statusFilter?.addEventListener('change', updateScheduleFilters);
  updateScheduleFilters();

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
    if (!s || !s.matches) {
      renderSchedule([], box, '', {}, {});
      return;
    }

    const tournament = parseTournament(s.matches);
    const flatMatches = tournament ? tournament.allMatches : (Array.isArray(s.matches) ? s.matches : []);

    renderSchedule(flatMatches, box, s.title, {}, {}, s.id, [], tournament);

    const appointmentData = await apiRequest(`/api/match-appointments?schedule_id=${s.id}`).catch(() => ({ appointments: [] }));
    if (loadSequence !== scheduleLoadSequence || !box.isConnected) return;
    const appointments = appointmentData.appointments || [];
    renderSchedule(flatMatches, box, s.title, {}, {}, s.id, appointments, tournament);

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
   首屏内容
============================================================ */
export function initContent() {
  loadAnnouncements();
  loadQAs();
  loadHomeSchedule();
  loadHomeResults();
}
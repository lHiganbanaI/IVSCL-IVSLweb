/* ============================================================
   网页功能面板 + 工具弹窗
============================================================ */

import {
  TOOLS_DEF, SECTION_LABELS, SECTION_ORDER, ROLE_LABELS
} from './config.js';
import { apiRequest, getCurrentUser } from './api.js';
import {
  sanitize, getInitialFromName,
  formatBeijing, beijingISOFromLocal, beijingLocalFromISO
} from './utils.js';
import { fetchTeams, invalidateTeams, showActionNotice } from './content.js';
import {
  TOURNAMENT_TYPES,
  TOURNAMENT_TYPE_LABELS,
  parseTournament,
  buildTournamentFromRaw,
  SingleElimination,
  DoubleElimination,
  GroupStage
} from './tournament.js';
import { openMyMatchesPage } from './my-matches.js';

/* 双保险：把入口挂到 window */
window.__openMyMatchesPage = window.__openMyMatchesPage || openMyMatchesPage;

const teamSchoolCache = new Map();
const teamSchoolRequests = new Map();

function userHasRole(role, allowed) {
  if (!allowed || !allowed.length) return true;
  return allowed.includes(role);
}

/* ============================================================
   面板渲染
============================================================ */
export function renderToolsPanel() {
  const introBox = document.getElementById('toolsIntro');
  const contentBox = document.getElementById('toolsContent');
  if (!introBox || !contentBox) return;

  const u = getCurrentUser();
  if (u?.role === 'team' && !teamSchoolCache.has(u.phone) && !teamSchoolRequests.has(u.phone)) {
    const request = apiRequest('/api/team/school')
      .then(data => { teamSchoolCache.set(u.phone, !!data.profile?.school); })
      .catch(() => { teamSchoolCache.set(u.phone, false); })
      .finally(() => {
        teamSchoolRequests.delete(u.phone);
        renderToolsPanel();
      });
    teamSchoolRequests.set(u.phone, request);
  }

  if (u) {
    introBox.innerHTML = `
      <div class="tools-intro">
        <div class="tools-intro__avatar">${sanitize(getInitialFromName(u.username))}</div>
        <div class="tools-intro__text">
          <div class="tools-intro__name">${sanitize(u.username)}</div>
          <div class="tools-intro__role" data-role="${u.role}">${ROLE_LABELS[u.role] || u.role}</div>
        </div>
        <div class="tools-intro__hint">
          当前身份可用的工具已在下方面板中展示<br>
          如需变更身份，请使用对应身份的激活码重新注册
        </div>
      </div>
    `;
  } else {
    introBox.innerHTML = `
      <div class="tools-intro">
        <div class="tools-intro__avatar tools-intro__avatar--guest">?</div>
        <div class="tools-intro__text">
          <div class="tools-intro__name">未登录</div>
          <div class="tools-intro__role">游客</div>
        </div>
        <div class="tools-intro__hint">
          登录后根据账号身份解锁更多工具<br>
          <button class="btn btn--primary btn--sm" id="toolsLoginBtn" style="margin-top:8px" type="button">登录 / 注册</button>
        </div>
      </div>
    `;
    const lb = document.getElementById('toolsLoginBtn');
    if (lb) lb.addEventListener('click', () => {
      document.getElementById('accountBtn')?.click();
    });
  }

  const sections = {};
  SECTION_ORDER.forEach(key => { sections[key] = []; });

  TOOLS_DEF.forEach(tool => {
    const allowed = !tool.roles || (u && userHasRole(u.role, tool.roles));
    const schoolRequiredBlocked = tool.requiresSchool && u?.role === 'team' && !teamSchoolCache.get(u.phone);
    if (allowed && !schoolRequiredBlocked && sections[tool.section]) {
      sections[tool.section].push(tool);
    }
  });

  let html = '';
  SECTION_ORDER.forEach(key => {
    const tools = sections[key];
    if (!tools.length) return;
    const info = SECTION_LABELS[key];
    if (!info) return;

    html += `
      <section class="tools-section">
        <div class="tools-section__head">
          <h3>${info.title}</h3>
          <em>${info.sub}</em>
        </div>
        <div class="tools-grid">
          ${tools.map(tool => `
            <button class="tool-card ${tool.className || ''}" data-tool-id="${tool.id}" type="button">
              <span class="tool-card__icon" aria-hidden="true">${tool.icon}</span>
              <span class="tool-card__body">
                <span class="tool-card__title">${tool.title}</span>
                <span class="tool-card__desc">${tool.desc}</span>
              </span>
              <span class="tool-card__arrow" aria-hidden="true">${tool.external ? '↗' : '→'}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  });

  if (!u) {
    html += `
      <div class="tools-locked">
        <div class="tools-locked__icon" aria-hidden="true">🔒</div>
        <div class="tools-locked__title">下方的区域请以后再来探索</div>
      </div>
    `;
  } else if (u.role === 'team' && !teamSchoolCache.get(u.phone)) {
    html += `
      <div class="tools-locked">
        <div class="tools-locked__title">请先绑定学校，约赛和队伍相关功能会在绑定后显示。</div>
      </div>
    `;
  }

  contentBox.innerHTML = html;

  contentBox.querySelectorAll('[data-tool-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.toolId;
      const tool = TOOLS_DEF.find(t => t.id === id);
      if (!tool) return;
      if (tool.external) {
        window.open(tool.external, '_blank', 'noopener');
        return;
      }
      if (id === 'teams') {
        document.querySelector('.tab[data-tab="teams"]')?.click();
        setTimeout(() => window.__showTeamsAdminView?.(), 300);
        return;
      }
      if (id === 'myMatches') {
        window.__openMyMatchesPage?.();
        return;
      }
      openToolModal(id);
    });
  });
}

/* ============================================================
   工具弹窗
============================================================ */
function initToolModalControl() {
  const mask = document.getElementById('toolModal');
  const closeB = document.getElementById('toolModalClose');
  if (!mask) return;

  let lastFocused = null;
  function openModal() {
    lastFocused = document.activeElement;
    mask.classList.add('is-open');
    mask.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const f = mask.querySelector('input, select, textarea, button:not([disabled])');
      if (f) f.focus();
    });
  }
  function close() {
    mask.classList.remove('is-open');
    mask.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }
  closeB.addEventListener('click', close);
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  document.addEventListener('keydown', e => {
    if (!mask.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  window.__toolModal = { openModal, close };
}

async function openToolModal(toolId) {
  const box = document.getElementById('toolModalContent');
  if (!box) return;

  const modalEl = document.querySelector('#toolModal .tool-modal');
  if (modalEl) {
    modalEl.classList.toggle('tool-modal--wide', toolId === 'matchesOverview');
  }

  if (toolId === 'matchesOverview') {
    box.innerHTML = '<div class="board__state">加载中…</div>';
    window.__toolModal.openModal();
    await loadMatchesOverviewTool(box);
  } else if (toolId === 'announcements') {
    box.innerHTML = '<div class="board__state">加载中…</div>';
    window.__toolModal.openModal();
    await loadAnnouncementsTool(box);
  } else if (toolId === 'draw') {
    box.innerHTML = renderDrawTool();
    window.__toolModal.openModal();
    bindDrawEvents();
    loadDrawResult();
  } else if (toolId === 'rooms') {
    box.innerHTML = '<div class="board__state">加载中…</div>';
    window.__toolModal.openModal();
    await loadRoomsTool(box);
  } else if (toolId === 'schedule') {
    box.innerHTML = '<div class="board__state">加载中…</div>';
    window.__toolModal.openModal();
    await loadScheduleTool(box);
  } else if (toolId === 'bindSchool') {
    box.innerHTML = '<div class="board__state">加载中…</div>';
    window.__toolModal.openModal();
    await loadBindSchoolTool(box);
  } else if (toolId === 'matchBooking') {
    box.innerHTML = '<div class="board__state">加载中…</div>';
    window.__toolModal.openModal();
    await loadMatchBookingTool(box);
  }
}

/* ============================================================
   管理员 · 比赛总览
============================================================ */
async function loadMatchesOverviewTool(box) {
  let data;
  try {
    data = await apiRequest('/api/admin/matches-overview');
  } catch (err) {
    box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    return;
  }

  if (!data || !data.schedule) {
    box.innerHTML = `
      <h3 class="tool-modal__title">比赛总览 <em>ADMIN</em></h3>
      <div class="tool-modal__info">当前没有已发布的赛程。</div>
    `;
    return;
  }

  const schedule = data.schedule;
  const matches = data.matches || [];

  box.innerHTML = `
    <h3 class="tool-modal__title">比赛总览 <em>ADMIN</em></h3>
    <p class="tool-modal__sub">
      ${sanitize(schedule.title || '赛程')} ·
      <b>${schedule.total_matches}</b> 场比赛 ·
      合并展示<b>约赛时间 / 比分 / 首发名单</b>
    </p>

    <div class="overview-toolbar">
      <input type="search" id="ovSearch" placeholder="搜索队伍名称或简称" autocomplete="off">
      <select id="ovFilter">
        <option value="all">全部比赛</option>
        <option value="booked">已约赛</option>
        <option value="finished">已完赛</option>
        <option value="unbooked">未约赛</option>
        <option value="lineup-missing">首发未齐</option>
      </select>
      <span class="overview-toolbar__count" id="ovCount"></span>
    </div>

    <div class="overview-list" id="ovList"></div>
  `;

  const list = box.querySelector('#ovList');
  const search = box.querySelector('#ovSearch');
  const filter = box.querySelector('#ovFilter');
  const countEl = box.querySelector('#ovCount');

  const renderCard = (m) => {
    const appt = m.appointment;
    const timeStr = appt && appt.start_time ? formatBeijing(appt.start_time) : '未约赛';
    const hasScore = !!(appt && appt.is_finished && appt.score_a != null && appt.score_b != null);
    const scoreStr = hasScore ? `${appt.score_a} : ${appt.score_b}` : '—';

    const statusText = appt
      ? (appt.is_finished ? '已完赛' : '已约赛')
      : '未约赛';
    const statusClass = appt
      ? (appt.is_finished ? 'is-finished' : 'is-booked')
      : 'is-unbooked';

    const lineupStatus = (ln) => ln ? '<span class="ov-lineup__status is-done">✓ 已提交</span>' : '<span class="ov-lineup__status is-pending">⚠ 未提交</span>';
    const playerLine = (p) => `${sanitize(p.name || '—')}${p.cn_short ? `（${sanitize(p.cn_short)}）` : ''}<em>${sanitize(p.uid || '')}</em>`;

    const renderLineup = (ln) => {
      if (!ln) {
        return `
          <div class="ov-lineup__empty">该校未提交首发名单</div>
        `;
      }
      return `
        <div class="ov-lineup__group">
          <span class="ov-lineup__group-title">求生者</span>
          <ul class="ov-lineup__players">
            ${(ln.survivors || []).map(p => `<li>${playerLine(p)}</li>`).join('') || '<li class="ov-lineup__none">—</li>'}
          </ul>
        </div>
        <div class="ov-lineup__group">
          <span class="ov-lineup__group-title">监管者</span>
          <ul class="ov-lineup__players">
            ${ln.hunter ? `<li>${playerLine(ln.hunter)}</li>` : '<li class="ov-lineup__none">—</li>'}
          </ul>
        </div>
        <div class="ov-lineup__meta">
          ${ln.updated_at ? `提交于 ${sanitize(formatBeijing(ln.updated_at))}` : ''}
          ${ln.submitted_by_name ? ` · 由 ${sanitize(ln.submitted_by_name)}` : ''}
        </div>
      `;
    };

    return `
      <article class="ov-match" data-search="${sanitize(`${m.team_a_name} ${m.team_a} ${m.team_b_name} ${m.team_b}`)}"
               data-status="${appt ? (appt.is_finished ? 'finished' : 'booked') : 'unbooked'}"
               data-lineup="${m.lineup_a && m.lineup_b ? 'full' : 'missing'}">
        <div class="ov-match__head">
          <span class="ov-match__round">
            ${m.round_index ? `第 ${m.round_index} 轮` : '赛程'}
            ${m.round_name ? ` · ${sanitize(m.round_name)}` : ''}
          </span>
          <span class="ov-match__status ${statusClass}">${statusText}</span>
          <span class="ov-match__index">#${m.match_index + 1}</span>
        </div>

        <div class="ov-match__vs">
          <div class="ov-match__team">
            ${m.team_a_logo ? `<img src="${m.team_a_logo}" alt="${sanitize(m.team_a_name)}">` : '<span class="ov-match__team-ph">?</span>'}
            <span class="ov-match__team-name">${sanitize(m.team_a_name)}</span>
          </div>
          <div class="ov-match__center">
            <div class="ov-match__score">${scoreStr}</div>
            <div class="ov-match__time">📅 ${sanitize(timeStr)}</div>
          </div>
          <div class="ov-match__team">
            ${m.team_b_logo ? `<img src="${m.team_b_logo}" alt="${sanitize(m.team_b_name)}">` : '<span class="ov-match__team-ph">?</span>'}
            <span class="ov-match__team-name">${sanitize(m.team_b_name)}</span>
          </div>
        </div>

        <div class="ov-lineups">
          <div class="ov-lineup">
            <div class="ov-lineup__head">
              <b>${sanitize(m.team_a_name)}</b>
              ${lineupStatus(m.lineup_a)}
            </div>
            ${renderLineup(m.lineup_a)}
          </div>
          <div class="ov-lineup">
            <div class="ov-lineup__head">
              <b>${sanitize(m.team_b_name)}</b>
              ${lineupStatus(m.lineup_b)}
            </div>
            ${renderLineup(m.lineup_b)}
          </div>
        </div>
      </article>
    `;
  };

  const update = () => {
    const q = (search.value || '').trim().toLowerCase();
    const f = filter.value;
    const cards = [...list.querySelectorAll('.ov-match')];
    let visible = 0;
    cards.forEach(card => {
      const text = card.dataset.search.toLowerCase();
      const status = card.dataset.status;
      const lineup = card.dataset.lineup;

      let matchFilter = true;
      if (f === 'booked') matchFilter = status === 'booked';
      else if (f === 'finished') matchFilter = status === 'finished';
      else if (f === 'unbooked') matchFilter = status === 'unbooked';
      else if (f === 'lineup-missing') matchFilter = lineup === 'missing';

      const matchSearch = !q || text.includes(q);
      const show = matchFilter && matchSearch;
      card.hidden = !show;
      if (show) visible++;
    });
    countEl.textContent = `显示 ${visible} / ${cards.length} 场`;
  };

  list.innerHTML = matches.map(renderCard).join('') || '<div class="board__state">暂无比赛</div>';
  search.addEventListener('input', update);
  filter.addEventListener('change', update);
  update();
}

/* ============================================================
   公告栏管理
============================================================ */
function todayDateStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function loadAnnouncementsTool(box) {
  let list = [];
  try {
    const data = await apiRequest('/api/announcements');
    list = data.announcements || [];
  } catch (err) {
    box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    return;
  }

  box.innerHTML = `
    <h3 class="tool-modal__title">公告栏管理 <em>ADMIN</em></h3>
    <p class="tool-modal__sub">新增或删除官方公告，支持置顶与选择日期。保存后主页公告栏立即更新。</p>

    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>新增公告</h4></div>
      <div class="tool-form">
        <div class="tool-form__row">
          <div class="tool-field">
            <label for="annTag">标签文字</label>
            <input type="text" id="annTag" placeholder="动态 / 报名 / 赛程…" maxlength="10" value="动态">
          </div>
          <div class="tool-field">
            <label for="annTagClass">标签样式</label>
            <select id="annTagClass">
              <option value="tag--event" selected>紫色（动态）</option>
              <option value="tag--notice">金色（公告）</option>
              <option value="tag--signup">青色（报名）</option>
              <option value="tag--hot">红色（热门）</option>
            </select>
          </div>
          <div class="tool-field">
            <label for="annTime">日期</label>
            <input type="date" id="annTime" value="${todayDateStr()}">
          </div>
        </div>

        <label class="ann-pinned-toggle" for="annPinned">
          <input type="checkbox" id="annPinned">
          <span class="ann-pinned-toggle__box"></span>
          <span class="ann-pinned-toggle__label">📌 置顶此公告</span>
        </label>

        <div class="tool-field">
          <label for="annText">正文内容（支持 &lt;b&gt; 加粗）</label>
          <textarea id="annText" placeholder="例如：本届赛事定于 2026 年 10 月 1 日开赛。"></textarea>
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn--primary btn--sm" id="annAddBtn" type="button">+ 添加公告</button>
      </div>
    </section>

    <section class="tool-modal__section">
      <div class="tool-modal__section-head">
        <h4>当前公告</h4>
        <span class="tool-modal__count" id="annCount">${list.length} 条</span>
      </div>
      <ul class="tool-list" id="annList"></ul>
    </section>
  `;

  renderAnnListBox(list);

  document.getElementById('annAddBtn').addEventListener('click', async () => {
    const tag = (document.getElementById('annTag').value || '').trim() || '动态';
    const tagClass = document.getElementById('annTagClass').value || 'tag--event';
    const time = (document.getElementById('annTime').value || '').trim() || todayDateStr();
    const text = (document.getElementById('annText').value || '').trim();
    const isPinned = document.getElementById('annPinned').checked;
    if (!text) { alert('正文不能为空'); return; }

    const btn = document.getElementById('annAddBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '添加中…';

    try {
      await apiRequest('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({ tag, tagClass, time, text, isPinned })
      });
      document.getElementById('annTag').value = '动态';
      document.getElementById('annText').value = '';
      document.getElementById('annPinned').checked = false;
      document.getElementById('annTime').value = todayDateStr();
      const data = await apiRequest('/api/announcements');
      renderAnnListBox(data.announcements || []);
      if (window.app?.loadAnnouncements) window.app.loadAnnouncements();
    } catch (err) {
      alert('添加失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}

function renderAnnListBox(list) {
  const ul = document.getElementById('annList');
  const cnt = document.getElementById('annCount');
  if (!ul) return;

  if (!list.length) {
    ul.innerHTML = '<li class="tool-list__empty">暂无公告</li>';
  } else {
    ul.innerHTML = list.map(item => `
      <li class="tool-list__item ${item.is_pinned ? 'is-pinned' : ''}">
        <div class="tool-list__body">
          <div class="tool-list__title">
            ${item.is_pinned ? '<span class="ann-pin-tag">📌 置顶</span>' : ''}
            <span class="msg__tag ${item.tag_class || 'tag--event'}" style="margin-right:8px">${sanitize(item.tag || '动态')}</span>
            ${sanitize(item.text || '')}
          </div>
          <div class="tool-list__meta">
            <span>📅 ${sanitize(item.time || '未设置')}</span>
          </div>
        </div>
        <div class="tool-list__actions">
          <button class="tool-list__pin ${item.is_pinned ? 'is-pinned' : ''}"
                  data-ann-pin="${item.id}" data-pinned="${item.is_pinned ? 1 : 0}"
                  aria-label="${item.is_pinned ? '取消置顶' : '置顶'}">📌</button>
          <button class="tool-list__remove" data-ann-remove="${item.id}" aria-label="删除">✕</button>
        </div>
      </li>
    `).join('');
  }
  if (cnt) cnt.textContent = list.length + ' 条';

  ul.querySelectorAll('[data-ann-pin]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.annPin;
      const isPinned = btn.dataset.pinned === '1';
      try {
        await apiRequest('/api/announcements/' + id + '/pin', {
          method: 'PATCH',
          body: JSON.stringify({ is_pinned: !isPinned })
        });
        const data = await apiRequest('/api/announcements');
        renderAnnListBox(data.announcements || []);
        if (window.app?.loadAnnouncements) window.app.loadAnnouncements();
      } catch (err) {
        alert('操作失败：' + err.message);
      }
    });
  });

  ul.querySelectorAll('[data-ann-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.annRemove;
      if (!confirm('确定要删除这条公告吗？')) return;
      try {
        await apiRequest('/api/announcements/' + id, { method: 'DELETE' });
        const data = await apiRequest('/api/announcements');
        renderAnnListBox(data.announcements || []);
        if (window.app?.loadAnnouncements) window.app.loadAnnouncements();
      } catch (err) {
        alert('删除失败：' + err.message);
      }
    });
  });
}

/* ============================================================
   赛事抽签
============================================================ */
function renderDrawTool() {
  return `
    <h3 class="tool-modal__title">赛事抽签 <em>ADMIN</em></h3>
    <p class="tool-modal__sub">从当前队伍列表中随机配对生成对阵表。</p>

    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>抽签操作</h4></div>
      <div class="tool-actions">
        <button class="btn btn--primary btn--sm" id="drawStartBtn" type="button">🎲 开始抽签</button>
        <button class="btn btn--ghost btn--sm" id="drawClearBtn" type="button">清空结果</button>
      </div>
      <p class="draw-info" id="drawInfo">加载中…</p>
      <div class="draw-result" id="drawResult"></div>
    </section>
  `;
}

async function loadDrawResult() {
  const box = document.getElementById('drawResult');
  const info = document.getElementById('drawInfo');
  if (!box || !info) return;

  try {
    const data = await apiRequest('/api/draws');
    const draw = data.draw;
    if (!draw) {
      box.innerHTML = '';
      info.textContent = '尚未抽签。点击「开始抽签」，会基于当前队伍列表随机配对。';
      return;
    }
    const pairs = JSON.parse(draw.pairs);
    info.innerHTML = `抽签时间：<b>${sanitize(draw.created_at || '')}</b> · 共 <b>${pairs.length}</b> 场对阵`;
    box.innerHTML = pairs.map(p => `
      <div class="draw-pair">
        <div class="draw-pair__side">${sanitize(p.a || '轮空')}</div>
        <div class="draw-pair__vs">VS</div>
        <div class="draw-pair__side">${sanitize(p.b || '轮空')}</div>
      </div>
    `).join('');
  } catch (err) {
    info.textContent = '加载失败：' + err.message;
  }
}

function bindDrawEvents() {
  document.getElementById('drawStartBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('drawStartBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '抽签中…';
    try {
      await apiRequest('/api/draws', { method: 'POST' });
      loadDrawResult();
    } catch (err) {
      alert('抽签失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
  document.getElementById('drawClearBtn')?.addEventListener('click', async () => {
    if (!confirm('确定要清空抽签结果吗？')) return;
    try {
      await apiRequest('/api/draws', { method: 'DELETE' });
      loadDrawResult();
    } catch (err) {
      alert('清空失败：' + err.message);
    }
  });
}

/* ============================================================
   比赛房间
============================================================ */
async function loadRoomsTool(box) {
  let list = [];
  try {
    const data = await apiRequest('/api/rooms');
    list = data.rooms || [];
  } catch (err) {
    box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    return;
  }

  let teams = [], nameMap = {};
  try {
    const td = await fetchTeams();
    teams = td.teams || [];
    teams.forEach(t => { nameMap[t.short] = t.name; });
  } catch (e) {}
  const teamOpts = teams.map(t => `<option value="${sanitize(t.short)}">${sanitize(t.name)}（${sanitize(t.short)}）</option>`).join('');

  let matches = [];
  try {
    const sd = await apiRequest('/api/schedule');
    const tn = sd.schedule ? parseTournament(sd.schedule.matches) : null;
    matches = tn ? tn.allMatches : [];
  } catch (e) {}

  const matchOpts = matches.map((m, i) => {
    const aName = nameMap[m.a] || m.a || '轮空';
    const bName = nameMap[m.b] || m.b || '轮空';
    return `<option value="${i}">第 ${i + 1} 场：${sanitize(aName)} VS ${sanitize(bName)}</option>`;
  }).join('');

  box.innerHTML = `
    <h3 class="tool-modal__title">比赛房间 <em>STAFF</em></h3>
    <p class="tool-modal__sub">创建比赛房间号与密码，填写比赛时间、对战双方与主客场，可查看双方选手名单。管理员与裁判均可操作。</p>

    ${matches.length ? `
    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>从赛程选择对阵</h4></div>
      <div class="tool-form">
        <div class="tool-field">
          <label for="roomMatchPick">选择已发布的赛程对阵（自动填充对战双方与场次说明）</label>
          <select id="roomMatchPick">
            <option value="">-- 手动选择队伍 --</option>
            ${matchOpts}
          </select>
        </div>
      </div>
    </section>
    ` : ''}

    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>新建房间</h4></div>
      <div class="tool-form">
        <div class="tool-form__row">
          <div class="tool-field">
            <label for="roomCode">房间号</label>
            <input type="text" id="roomCode" placeholder="例如：123456" maxlength="20">
          </div>
          <div class="tool-field">
            <label for="roomPassword">密码</label>
            <input type="text" id="roomPassword" placeholder="例如：8888" maxlength="20">
          </div>
        </div>
        <div class="tool-field">
          <label for="roomStart">比赛开始时间</label>
          <input type="datetime-local" id="roomStart">
        </div>
        <div class="tool-form__row">
          <div class="tool-field">
            <label for="roomTeamA">对战队伍 A</label>
            <select id="roomTeamA"><option value="">-- 选择队伍 --</option>${teamOpts}</select>
          </div>
          <div class="tool-field">
            <label for="roomTeamB">对战队伍 B</label>
            <select id="roomTeamB"><option value="">-- 选择队伍 --</option>${teamOpts}</select>
          </div>
          <div class="tool-field">
            <label for="roomHome">主客场</label>
            <select id="roomHome"><option value="A">A 主场</option><option value="B">B 主场</option><option value="N">中立场地</option></select>
          </div>
        </div>
        <div class="tool-field">
          <label for="roomTitle">场次说明</label>
          <input type="text" id="roomTitle" placeholder="例如：小组赛 A 组第一场" maxlength="40">
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn--primary btn--sm" id="roomAddBtn" type="button">+ 创建房间</button>
      </div>
    </section>

    <section class="tool-modal__section">
      <div class="tool-modal__section-head">
        <h4>房间列表</h4>
        <span class="tool-modal__count" id="roomCount">${list.length} 个</span>
      </div>
      <ul class="room-list" id="roomList"></ul>
    </section>
  `;

  renderRoomListBox(list, nameMap);

  const matchPick = document.getElementById('roomMatchPick');
  if (matchPick) {
    matchPick.addEventListener('change', () => {
      const idx = matchPick.value;
      if (idx === '') return;
      const m = matches[Number(idx)];
      if (!m) return;

      const aSel = document.getElementById('roomTeamA');
      const bSel = document.getElementById('roomTeamB');
      if (aSel) aSel.value = m.a || '';
      if (bSel) bSel.value = m.b || '';

      const titleInput = document.getElementById('roomTitle');
      if (titleInput && !titleInput.value.trim()) {
        const aName = nameMap[m.a] || m.a || '轮空';
        const bName = nameMap[m.b] || m.b || '轮空';
        titleInput.value = `第 ${Number(idx) + 1} 场 · ${aName} VS ${bName}`;
      }
    });
  }

  document.getElementById('roomAddBtn').addEventListener('click', async () => {
    const code = (document.getElementById('roomCode').value || '').trim();
    const password = (document.getElementById('roomPassword').value || '').trim();
    const title = (document.getElementById('roomTitle').value || '').trim();
    const start_time = beijingISOFromLocal(document.getElementById('roomStart').value || '');
    const team_a = (document.getElementById('roomTeamA').value || '').trim();
    const team_b = (document.getElementById('roomTeamB').value || '').trim();
    const home = (document.getElementById('roomHome').value || 'A');
    if (!code) { alert('房间号不能为空'); return; }

    const btn = document.getElementById('roomAddBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '创建中…';

    try {
      await apiRequest('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ code, password, title, start_time, team_a, team_b, home })
      });
      document.getElementById('roomCode').value = '';
      document.getElementById('roomPassword').value = '';
      document.getElementById('roomTitle').value = '';
      document.getElementById('roomStart').value = '';
      document.getElementById('roomTeamA').value = '';
      document.getElementById('roomTeamB').value = '';
      const data = await apiRequest('/api/rooms');
      renderRoomListBox(data.rooms || [], nameMap);
    } catch (err) {
      alert('创建失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}

function renderRoomListBox(list, nameMap) {
  nameMap = nameMap || {};
  const box = document.getElementById('roomList');
  const cnt = document.getElementById('roomCount');
  if (!box) return;

  if (!list.length) {
    box.innerHTML = '<li class="tool-list__empty">暂无房间</li>';
  } else {
    const fullName = (short) => nameMap[short] ? nameMap[short] + '（' + short + '）' : (short || '—');
    const fmtTime = (t) => {
      if (!t) return '';
      const s = formatBeijing(t);
      return s ? s.slice(5) : String(t);
    };
    const homeText = (r) => {
      if (!r.team_a || !r.team_b) return '';
      if (r.home === 'B') return fullName(r.team_b) + ' 主场';
      if (r.home === 'N') return '中立场地';
      return fullName(r.team_a) + ' 主场';
    };
    box.innerHTML = list.map(r => {
      const hasMatch = r.team_a && r.team_b;
      const timeStr = fmtTime(r.created_at);
      return `
        <li class="room-card">
          <div class="room-card__code">
            <em>房号</em>
            <b>${sanitize(r.code)}</b>
          </div>
          <div class="room-card__body">
            <div class="room-card__title">${sanitize(r.title || '未命名场次')}</div>
            <div class="room-card__meta">
              <span>密码 <b>${sanitize(r.password || '—')}</b></span>
              <span>创建者 <b>${sanitize(r.creator || '—')}</b></span>
              <span>${sanitize(timeStr)}</span>
            </div>
            ${hasMatch ? `
            <div class="room-card__match">
              <span class="room-card__start">开始 <b>${sanitize(fmtTime(r.start_time) || '待定')}</b></span>
              <span class="room-card__vs"><b>${sanitize(fullName(r.team_a))}</b><em>VS</em><b>${sanitize(fullName(r.team_b))}</b><i class="room-card__home">${sanitize(homeText(r))}</i></span>
            </div>` : ''}
          </div>
          <div class="room-card__actions">
            ${hasMatch ? `<button class="room-card__view" data-room-view="${r.id}">查看双方名单</button>` : ''}
            <button class="room-card__remove" data-room-remove="${r.id}" aria-label="删除">✕</button>
          </div>
          <div class="room-card__roster" id="roster-${r.id}" hidden></div>
        </li>
      `;
    }).join('');
  }
  if (cnt) cnt.textContent = list.length + ' 个';

  box.querySelectorAll('[data-room-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.roomRemove;
      if (!confirm('确定要删除这个房间吗？')) return;
      try {
        await apiRequest('/api/rooms/' + id, { method: 'DELETE' });
        const data = await apiRequest('/api/rooms');
        renderRoomListBox(data.rooms || [], nameMap);
      } catch (err) {
        alert('删除失败：' + err.message);
      }
    });
  });

  box.querySelectorAll('[data-room-view]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.roomView;
      const rosterEl = document.getElementById('roster-' + id);
      if (!rosterEl) return;
      const room = (list || []).find(r => String(r.id) === String(id));
      if (!room) return;
      if (!rosterEl.hidden) { rosterEl.hidden = true; btn.textContent = '查看双方名单'; return; }
      rosterEl.hidden = false;
      btn.textContent = '收起名单';
      rosterEl.innerHTML = '<div class="board__state">加载名单中…</div>';
      try {
        const [da, db] = await Promise.all([
          apiRequest('/api/team/players?school=' + encodeURIComponent(room.team_a)),
          apiRequest('/api/team/players?school=' + encodeURIComponent(room.team_b))
        ]);
        const fullA = nameMap[room.team_a] || room.team_a;
        const fullB = nameMap[room.team_b] || room.team_b;
        rosterEl.innerHTML =
          '<div class="room-roster__cols">' +
            '<div class="room-roster__col"><div class="room-roster__title">' + sanitize(fullA) + '（A 队）</div>' + renderPlayersList(da.players || [], room.team_a) + '</div>' +
            '<div class="room-roster__col"><div class="room-roster__title">' + sanitize(fullB) + '（B 队）</div>' + renderPlayersList(db.players || [], room.team_b) + '</div>' +
          '</div>';
      } catch (err) {
        rosterEl.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
      }
    });
  });
}

/* ============================================================
   添加赛程
============================================================ */
let __scheduleFormState = {
  type: 'single',
  parsed: null,
  raw: null
};

async function loadScheduleTool(box) {
  let published = null;
  try {
    const data = await apiRequest('/api/schedule');
    published = data.schedule || null;
  } catch (err) {
    box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    return;
  }

  __scheduleFormState.type = published?.type || 'single';
  __scheduleFormState.parsed = published ? parseTournament(published.matches) : null;
  __scheduleFormState.raw = null;

  box.innerHTML = `
    <h3 class="tool-modal__title">添加赛程 <em>ADMIN</em></h3>
    <p class="tool-modal__sub">支持单淘汰 / 双淘汰 / 小组赛。可上传 JSON，也可以手动填写队伍数自动生成骨架。</p>

    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>1. 选择赛制</h4></div>
      <div class="schedule-type-tabs" id="schedTypeTabs" role="tablist">
        <button class="schedule-type-tab ${__scheduleFormState.type === 'single' ? 'is-active' : ''}" data-type="single" type="button">
          <span class="schedule-type-tab__icon">🏆</span>
          <span class="schedule-type-tab__title">单淘汰</span>
          <span class="schedule-type-tab__sub">输一场即淘汰</span>
        </button>
        <button class="schedule-type-tab ${__scheduleFormState.type === 'double' ? 'is-active' : ''}" data-type="double" type="button">
          <span class="schedule-type-tab__icon">🔁</span>
          <span class="schedule-type-tab__title">双淘汰</span>
          <span class="schedule-type-tab__sub">胜者组 / 败者组</span>
        </button>
        <button class="schedule-type-tab ${__scheduleFormState.type === 'group' ? 'is-active' : ''}" data-type="group" type="button">
          <span class="schedule-type-tab__icon">👥</span>
          <span class="schedule-type-tab__title">小组赛</span>
          <span class="schedule-type-tab__sub">分组循环</span>
        </button>
      </div>
    </section>

    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>2. 填写赛程</h4></div>
      <div class="tool-form">
        <div class="tool-field">
          <label for="scheduleTitle">赛程标题</label>
          <input type="text" id="scheduleTitle" placeholder="例如：2026 联合赛季 · 64 进 32" maxlength="40" value="${published?.title || ''}">
        </div>

        <div class="tool-form__row">
          <div class="tool-field">
            <label for="scheduleTeamCount">参赛队伍数（自动生成轮次骨架）</label>
            <input type="number" id="scheduleTeamCount" min="2" max="512" step="1" placeholder="例如：64">
          </div>
          <div class="tool-field" style="justify-content:end">
            <button class="btn btn--ghost btn--sm" id="schedGenerateBtn" type="button">🪄 生成骨架</button>
          </div>
        </div>

        <div class="tool-field">
          <label for="scheduleFile">或上传 JSON 文件（自动识别赛制与轮次）</label>
          <input type="file" id="scheduleFile" accept=".json,application/json">
        </div>

        <p class="schedule-format-hint">
          <b>JSON 格式示例：</b><br>
          <code>{ "type": "single", "rounds": [ { "name": "64 进 32", "matches": [{ "a":"hlkz","b":"jczx" }] }, { "name": "32 进 16", "matches": [...] } ] }</code><br>
          也支持扁平数组 <code>[{ "a":"hlkz","b":"jczx","round":1 }, ...]</code>（带 round 自动分轮）或 <code>[{ "a":"hlkz","b":"jczx" }]</code>（视为第 1 轮）。
        </p>
      </div>

      <div class="tool-actions">
        <button class="btn btn--primary btn--sm" id="schedulePublishBtn" type="button">📤 发布赛程</button>
        <button class="btn btn--ghost btn--sm" id="scheduleClearBtn" type="button">清空赛程</button>
      </div>
      <p class="draw-info" id="scheduleMsg">未选择文件</p>
    </section>

    <section class="tool-modal__section">
      <div class="tool-modal__section-head">
        <h4>3. 赛程预览</h4>
        <span class="tool-modal__count" id="schedPreviewCount">—</span>
      </div>
      <div class="schedule-preview" id="schedPreview"></div>
    </section>

    <section class="tool-modal__section">
      <div class="tool-modal__section-head">
        <h4>已发布赛程</h4>
        <span class="tool-modal__count" id="scheduleCount">${published ? '已发布' : '未发布'}</span>
      </div>
      <div class="schedule-list" id="scheduleList"></div>
    </section>
  `;

  document.querySelectorAll('#schedTypeTabs .schedule-type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      __scheduleFormState.type = tab.dataset.type;
      document.querySelectorAll('#schedTypeTabs .schedule-type-tab').forEach(t => {
        t.classList.toggle('is-active', t === tab);
      });
    });
  });

  document.getElementById('schedGenerateBtn').addEventListener('click', () => {
    const n = Number(document.getElementById('scheduleTeamCount').value);
    if (!Number.isInteger(n) || n < 2) { alert('请输入有效队伍数（≥ 2）'); return; }

    let tournament;
    if (__scheduleFormState.type === 'double') {
      tournament = new DoubleElimination({ rounds: DoubleElimination.buildRounds(n) });
    } else if (__scheduleFormState.type === 'group') {
      const groupCount = Math.max(1, Math.min(8, Math.floor(n / 4)) || 1);
      const rounds = [];
      const perGroup = Math.ceil(n / groupCount);
      for (let g = 0; g < groupCount; g++) {
        const teams = Array.from({ length: perGroup }, (_, i) => `Group${g + 1}-${i + 1}`);
        const matches = [];
        for (let i = 0; i < teams.length; i++) {
          for (let j = i + 1; j < teams.length; j++) {
            matches.push({ a: teams[i], b: teams[j] });
          }
        }
        rounds.push({
          index: g + 1,
          name: `第 ${g + 1} 组`,
          fromCount: teams.length,
          toCount: 2,
          bracket: 'group',
          matches
        });
      }
      tournament = new GroupStage({
        rounds,
        groups: Array.from({ length: groupCount }, (_, i) => ({ name: `第 ${i + 1} 组` }))
      });
    } else {
      tournament = new SingleElimination({ rounds: SingleElimination.buildRounds(n) });
    }

    __scheduleFormState.parsed = tournament;
    renderSchedulePreview();
    document.getElementById('scheduleMsg').textContent = `✅ 已生成骨架，请填写对阵后点「发布赛程」`;
  });

  const fileInput = document.getElementById('scheduleFile');
  const msg = document.getElementById('scheduleMsg');

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) { __scheduleFormState.parsed = null; msg.textContent = '未选择文件'; renderSchedulePreview(); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target.result);
        const t = buildTournamentFromRaw(raw, '赛程');
        if (!t) throw new Error('无法识别赛程格式');
        __scheduleFormState.parsed = t;
        __scheduleFormState.raw = raw;
        if (raw && !Array.isArray(raw) && raw.type) {
          __scheduleFormState.type = raw.type;
          document.querySelectorAll('#schedTypeTabs .schedule-type-tab').forEach(tab => {
            tab.classList.toggle('is-active', tab.dataset.type === raw.type);
          });
        }
        if (raw && !Array.isArray(raw) && raw.title) {
          const titleInput = document.getElementById('scheduleTitle');
          if (!titleInput.value.trim()) titleInput.value = raw.title;
        }
        msg.textContent = `✅ 已解析：${t.typeLabel} · ${t.totalRounds} 轮 · ${t.allMatches.length} 场`;
        renderSchedulePreview();
      } catch (err) {
        __scheduleFormState.parsed = null;
        msg.textContent = '解析失败：' + err.message;
        renderSchedulePreview();
      }
    };
    reader.onerror = () => { __scheduleFormState.parsed = null; msg.textContent = '文件读取失败'; };
    reader.readAsText(file, 'utf-8');
  });

  document.getElementById('schedulePublishBtn').addEventListener('click', async () => {
    const t = __scheduleFormState.parsed;
    if (!t) { alert('请先上传 JSON 或生成骨架'); return; }

    for (const r of t.rounds) {
      for (const m of r.matches) {
        if (!m.a || !m.b) {
          alert(`第 ${r.index} 轮（${r.name}）存在空对阵，请补全`);
          return;
        }
      }
    }

    const btn = document.getElementById('schedulePublishBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '发布中…';

    try {
      const title = (document.getElementById('scheduleTitle').value || '').trim() || t.title || '赛程';
      const payload = {
        title,
        type: __scheduleFormState.type,
        matches: {
          type: __scheduleFormState.type,
          rounds: t.rounds.map(r => ({
            index: r.index,
            name: r.name,
            fromCount: r.fromCount,
            toCount: r.toCount,
            bracket: r.bracket,
            matches: r.matches.map(m => ({ a: m.a, b: m.b }))
          }))
        }
      };

      await apiRequest('/api/schedule', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      msg.textContent = '✅ 发布成功';
      showActionNotice('赛程已发布');
      const data = await apiRequest('/api/schedule');
      renderScheduleListBox(data.schedule);
      document.getElementById('scheduleCount').textContent = '已发布';
      if (window.app?.loadSchedule) window.app.loadSchedule();
    } catch (err) {
      alert('发布失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  document.getElementById('scheduleClearBtn').addEventListener('click', async () => {
    if (!confirm('确定要清空当前赛程吗？')) return;
    try {
      await apiRequest('/api/schedule', { method: 'DELETE' });
      __scheduleFormState.parsed = null;
      renderSchedulePreview();
      renderScheduleListBox(null);
      document.getElementById('scheduleCount').textContent = '未发布';
      document.getElementById('scheduleMsg').textContent = '已清空赛程。';
      if (window.app?.loadSchedule) window.app.loadSchedule();
    } catch (err) {
      alert('清空失败：' + err.message);
    }
  });

  renderScheduleListBox(published);
  renderSchedulePreview();
}

function renderSchedulePreview() {
  const box = document.getElementById('schedPreview');
  const count = document.getElementById('schedPreviewCount');
  if (!box) return;

  const t = __scheduleFormState.parsed;
  if (!t) {
    box.innerHTML = '<div class="tool-list__empty">尚未生成或上传赛程</div>';
    if (count) count.textContent = '—';
    return;
  }

  if (count) count.textContent = `${t.typeLabel} · ${t.totalRounds} 轮 · ${t.allMatches.length} 场`;

  box.innerHTML = t.rounds.map(r => `
    <div class="sched-preview-round">
      <div class="sched-preview-round__head">
        <span class="sched-preview-round__index">第 ${r.index} 轮</span>
        <span class="sched-preview-round__name">${sanitize(r.name)}</span>
        <span class="sched-preview-round__count">${r.matches.length} 场</span>
      </div>
      <div class="sched-preview-round__list">
        ${r.matches.map((m, i) => `
          <div class="sched-preview-pair">
            <span class="sched-preview-pair__no">${i + 1}</span>
            <span class="sched-preview-pair__team">${sanitize(m.a || '待定')}</span>
            <span class="sched-preview-pair__vs">VS</span>
            <span class="sched-preview-pair__team">${sanitize(m.b || '待定')}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderScheduleListBox(schedule) {
  const box = document.getElementById('scheduleList');
  if (!box) return;

  if (!schedule || !schedule.matches) {
    box.innerHTML = '<div class="tool-list__empty">尚未发布赛程</div>';
    return;
  }

  const t = parseTournament(schedule.matches);
  if (!t) {
    box.innerHTML = '<div class="tool-list__empty">赛程数据异常</div>';
    return;
  }

  box.innerHTML = `
    <div class="schedule-list__head">
      ${sanitize(schedule.title || '赛程')}
      <span class="schedule-list__type">${t.typeLabel}</span>
      <span class="schedule-list__meta">${t.totalRounds} 轮 · ${t.allMatches.length} 场</span>
    </div>
    <div class="schedule-list__rounds">
      ${t.rounds.map(r => `
        <div class="schedule-list__round">
          <div class="schedule-list__round-title">
            第 ${r.index} 轮 · ${sanitize(r.name)} · ${r.matches.length} 场
          </div>
          <div class="schedule-list__grid">
            ${r.matches.map((p, i) => `
              <div class="schedule-list__pair">
                <span class="schedule-list__no">${String(i + 1).padStart(2, '0')}</span>
                <span class="schedule-list__team">${sanitize(p.a || '轮空')}</span>
                <span class="schedule-list__vs">VS</span>
                <span class="schedule-list__team">${sanitize(p.b || '轮空')}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ============================================================
   约赛
============================================================ */
async function loadMatchBookingTool(box) {
  const user = getCurrentUser();
  const isAdmin = user?.role === 'admin';
  if (!user || (user.role !== 'team' && !isAdmin)) {
    box.innerHTML = '<div class="tool-modal__info">请使用管理员或队长账号登录后约赛。</div>';
    return;
  }

  let profile, schedule, teams = [], appointments = [];
  try {
    const [profileData, scheduleData, teamData] = await Promise.all([
      isAdmin ? Promise.resolve({}) : apiRequest('/api/team/school'),
      apiRequest('/api/schedule'),
      fetchTeams().catch(() => ({ teams: [] }))
    ]);
    profile = profileData.profile;
    schedule = scheduleData.schedule;
    teams = teamData.teams || [];
    if (schedule) {
      const appointmentData = await apiRequest(`/api/match-appointments?schedule_id=${schedule.id}`);
      appointments = appointmentData.appointments || [];
    }
  } catch (err) {
    box.innerHTML = `<div class="board__state">加载失败：${sanitize(err.message)}</div>`;
    return;
  }

  if (!isAdmin && !profile?.school) {
    box.innerHTML = '<h3 class="tool-modal__title">约赛 <em>TEAM</em></h3><div class="tool-modal__info">请先在"绑定学校"中绑定自己的学校，再提交比赛时间。</div>';
    return;
  }
  if (!schedule || !schedule.matches) {
    box.innerHTML = '<h3 class="tool-modal__title">约赛 <em>TEAM</em></h3><div class="tool-modal__info">当前还没有已发布的比赛赛程。</div>';
    return;
  }

  const tournament = parseTournament(schedule.matches);
  const flatMatches = tournament ? tournament.allMatches : (Array.isArray(schedule.matches) ? schedule.matches : []);

  if (!flatMatches.length) {
    box.innerHTML = '<h3 class="tool-modal__title">约赛 <em>TEAM</em></h3><div class="tool-modal__info">当前还没有已发布的比赛赛程。</div>';
    return;
  }

  const school = profile?.school || null;
  const teamNames = Object.fromEntries(teams.map(team => [team.short, team.name || team.short]));
  const choices = flatMatches.map((match, index) => ({ match, index }))
    .filter(({ match }) => !!match.a && !!match.b && (isAdmin || match.a === school || match.b === school));
  if (!choices.length) {
    box.innerHTML = `<h3 class="tool-modal__title">约赛 <em>TEAM</em></h3><div class="tool-modal__info">当前赛程中${isAdmin ? '没有可约的对阵' : `没有 ${sanitize(school)} 所在的对阵`}。</div>`;
    return;
  }
  const appointmentByIndex = new Map(appointments.map(item => [item.match_index, item]));
  box.innerHTML = `
    <h3 class="tool-modal__title">约赛 <em>TEAM</em></h3>
    <p class="tool-modal__sub">${isAdmin ? '管理员可为任意对阵提交比赛时间。' : `已锁定绑定学校：<b>${sanitize(teamNames[school] || school)}</b>。这里只显示本校所在的对阵。`}</p>
    <form class="appointment-form" id="matchBookingForm">
      <label>选择对阵<select id="bookingMatch" required>${choices.map(({ match, index }) => `<option value="${index}">第 ${index + 1} 场：${sanitize(teamNames[match.a] || match.a)} VS ${sanitize(teamNames[match.b] || match.b)}${appointmentByIndex.has(index) ? '（已约赛）' : ''}</option>`).join('')}</select></label>
      ${isAdmin ? '<label>关联学校<select id="bookingSchool" required></select></label>' : ''}
      <label>比赛时间<input id="bookingTime" type="datetime-local" required></label>
      <label>补充信息（选填）<input id="bookingNotes" type="text" maxlength="500" placeholder="地点或其他安排"></label>
      <button class="btn btn--primary btn--sm" type="submit">提交比赛时间</button>
      <span class="appointment-form__message" id="bookingMessage" role="status" aria-live="polite"></span>
    </form>
  `;

  const matchSelect = box.querySelector('#bookingMatch');
  const syncFields = () => {
    const matchIndex = Number(matchSelect.value);
    const appointment = appointmentByIndex.get(matchIndex);
    const selected = flatMatches[matchIndex];
    const schoolSelect = box.querySelector('#bookingSchool');
    if (schoolSelect && selected) {
      const choicesHtml = [selected.a, selected.b].map(short => `<option value="${sanitize(short)}">${sanitize(teamNames[short] || short)}</option>`).join('');
      schoolSelect.innerHTML = choicesHtml;
      schoolSelect.value = appointment?.booked_by_school && [selected.a, selected.b].includes(appointment.booked_by_school)
        ? appointment.booked_by_school
        : selected.a;
    }
    const timeInput = box.querySelector('#bookingTime');
    const notesInput = box.querySelector('#bookingNotes');
    if (!appointment) { timeInput.value = ''; notesInput.value = ''; return; }
    timeInput.value = beijingLocalFromISO(appointment.start_time);
    notesInput.value = appointment.notes || '';
  };
  matchSelect.addEventListener('change', syncFields);
  syncFields();

  box.querySelector('#matchBookingForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = box.querySelector('#matchBookingForm button[type="submit"]');
    if (button.disabled) return;
    const message = box.querySelector('#bookingMessage');
    button.disabled = true;
    message.textContent = '正在提交…';
    let mutationComplete = false;
    try {
      await apiRequest('/api/match-appointments', {
        method: 'POST',
        body: JSON.stringify({
          schedule_id: schedule.id,
          match_index: Number(matchSelect.value),
          ...(isAdmin ? { booked_by_school: box.querySelector('#bookingSchool').value } : {}),
          start_time: beijingISOFromLocal(box.querySelector('#bookingTime').value),
          notes: box.querySelector('#bookingNotes').value
        })
      });
      mutationComplete = true;
      message.textContent = '比赛时间已提交';
      showActionNotice('比赛时间已成功提交');
      if (window.app?.loadSchedule) await window.app.loadSchedule();
      await loadMatchBookingTool(box);
    } catch (err) {
      message.textContent = mutationComplete ? '预约已成功提交，但页面刷新失败，请重新打开约赛查看。' : err.message;
      showActionNotice(mutationComplete ? '预约已提交，但页面刷新失败' : err.message, true);
      button.disabled = false;
    }
  });
}

/* ============================================================
   绑定学校
============================================================ */
async function loadBindSchoolTool(box) {
  const u = getCurrentUser();
  const isAdmin = u && u.role === 'admin';

  let schools = [];
  let current = null;
  try {
    const [t, p] = await Promise.all([
      fetchTeams().catch(() => ({ teams: [] })),
      apiRequest('/api/team/school').catch(() => ({}))
    ]);
    schools = (t.teams || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    current = p.profile || null;
  } catch (err) {
    box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    return;
  }

  const optHtml = schools.map(s =>
    `<option value="${sanitize(s.short)}" ${current && current.school === s.short ? 'selected' : ''}>${sanitize(s.name)}（${sanitize(s.short)}）</option>`
  ).join('');

  box.innerHTML = `
    <h3 class="tool-modal__title">绑定学校 <em>TEAM</em></h3>
    <p class="tool-modal__sub">选择你的队伍学校并绑定。绑定后即可在「队伍信息 → 我的队伍」维护选手名单。</p>
    ${current ? `<div class="tool-modal__info">当前已绑定：<b>${sanitize(current.school)}</b></div>` : ''}
    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>选择学校</h4></div>
      <div class="tool-form">
        <div class="tool-field">
          <label for="bindSchoolSelect">学校</label>
          <select id="bindSchoolSelect">${optHtml}</select>
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn--primary btn--sm" id="bindSchoolBtn" type="button">${current ? '更新绑定' : '绑定学校'}</button>
      </div>
      <p class="draw-info" id="bindSchoolMsg"></p>
    </section>
  `;

  document.getElementById('bindSchoolBtn').addEventListener('click', async () => {
    const school = document.getElementById('bindSchoolSelect').value;
    if (!school) { alert('请先选择学校'); return; }
    const btn = document.getElementById('bindSchoolBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '绑定中…';
    try {
      await apiRequest('/api/team/school', { method: 'POST', body: JSON.stringify({ school }) });
      const msg = document.getElementById('bindSchoolMsg');
      msg.innerHTML = '✅ 已绑定学校：<b>' + sanitize(school) + '</b>，现在可以去「队伍信息 → 我的队伍」维护选手名单。';
      const currentUser = getCurrentUser();
      if (currentUser?.role === 'team') teamSchoolCache.set(currentUser.phone, true);
      if (window.app?.renderToolsPanel) window.app.renderToolsPanel();
    } catch (err) {
      alert('绑定失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

/* ============================================================
   通用的选手列表渲染
============================================================ */
function renderPlayersList(list, school) {
  if (!list || !list.length) {
    return '<div class="tool-list__empty">' + (school ? '该校尚未提交名单' : '尚未有任何队伍提交名单') + '</div>';
  }
  const players = list.filter(x => !x.is_coach);
  const coach = list.find(x => x.is_coach);
  return `
    <div class="tool-modal__info">${school ? '学校：<b>' + sanitize(school) + '</b>' : '全部学校'} · 选手 ${players.length} 人</div>
    <ul class="tool-list" style="list-style:none;padding:0">
      ${players.map(p => `
        <li class="tool-list__item">
          <div class="tool-list__body">
            <div class="tool-list__title">
              ${sanitize(p.name)}
              ${p.cn_short ? `<span style="color:var(--muted);font-weight:700">（${sanitize(p.cn_short)}）</span>` : ''}
              <span class="msg__tag">${sanitize(p.position || '')}</span>
            </div>
            <div class="tool-list__meta">
              <span>🎮 ID ${sanitize(p.uid || '—')}</span>
              ${school ? '' : '<span>🏫 ' + sanitize(p.school) + '</span>'}
            </div>
          </div>
        </li>
      `).join('')}
      ${coach ? `<li class="tool-list__item"><div class="tool-list__body"><div class="tool-list__title">🧑‍🏫 教练：${sanitize(coach.name)}</div></div></li>` : ''}
    </ul>
  `;
}

/* ============================================================
   初始化
============================================================ */
export function initTools() {
  initToolModalControl();
}
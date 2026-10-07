/* ============================================================
   我的 · 个人中心（我的信息 / 我的战队 / 我的比赛）
============================================================ */
import { apiRequest, getCurrentUser } from './api.js';
import { sanitize } from './utils.js';
import { ROLE_LABELS } from './config.js?v=20261006-27';
import { getCachedAvatar } from './auth.js?v=20261006-27';
import { fetchTeams, mountToolInto } from './content.js?v=20261006-27';
import { parseTournament } from './tournament.js';
import { openMyMatchesPage } from './my-matches.js?v=20261006-27';
import { renderKingTimeline } from './king.js?v=20261006-27';

export async function renderMinePage() {
  const box = document.getElementById('mineContent');
  if (!box) return;
  box.innerHTML = '<div class="board__state" style="padding:60px 20px">加载中…</div>';

  const u = getCurrentUser();
  if (!u) {
    box.innerHTML = `
      <div class="mine-empty">
        <div class="mine-empty__icon">🔐</div>
        <div class="mine-empty__title">请先登录</div>
        <div class="mine-empty__desc">登录后这里会展示你的信息、战队与相关比赛</div>
        <button class="btn btn--primary btn--sm" id="mineLoginBtn" type="button">去登录</button>
      </div>`;
    document.getElementById('mineLoginBtn')?.addEventListener('click', () => {
      document.getElementById('accountBtn')?.click();
    });
    return;
  }

  const avatar = getCachedAvatar();

  /* 队伍基础信息（名称 / logo） */
  let teamMap = {};
  try {
    const td = await fetchTeams();
    (td.teams || []).forEach(t => { teamMap[t.short] = t; });
  } catch (e) {}

  /* 我的战队（队长） */
  let school = null, playerCount = 0;
  if (u.role === 'team') {
    try {
      const sp = await apiRequest('/api/team/school');
      school = sp.profile?.school || null;
    } catch (e) {}
    try {
      const pd = await apiRequest('/api/team/players');
      playerCount = (pd.players || []).filter(p => !p.is_coach).length;
    } catch (e) {}
  }

  /* 相关比赛统计 */
  let relatedCount = 0, scheduleTitle = '当前赛程';
  try {
    const sd = await apiRequest('/api/schedule');
    const schedule = sd.schedule;
    if (schedule && schedule.matches) {
      scheduleTitle = schedule.title || '当前赛程';
      const tournament = parseTournament(schedule.matches);
      const flat = tournament ? tournament.allMatches : (Array.isArray(schedule.matches) ? schedule.matches : []);
      const appt = await apiRequest('/api/match-appointments?schedule_id=' + schedule.id).catch(() => ({ appointments: [] }));
      const appointments = appt.appointments || [];
      if (u.role === 'team' && school) {
        relatedCount = flat.filter(m => m.a === school || m.b === school).length;
      } else if (u.role === 'admin') {
        relatedCount = flat.length;
      } else {
        relatedCount = flat.filter(m => m.a && m.b).length;
      }
      const _ = appointments; // 保留约赛引用（后续可用于展示已约/已完赛）
      void _;
    }
  } catch (e) {}

  const schoolName = school ? (teamMap[school]?.name || school) : '';
  const schoolLogo = school ? (teamMap[school]?.logo || '') : '';

  box.innerHTML = `
    <div class="mine-grid">
      <div class="mine-card">
        <div class="mine-card__head"><h3>我的信息</h3><em>PROFILE</em></div>
        <div class="mine-me">
          <div class="mine-avatar">${avatar ? `<img src="${avatar}" alt="">` : (u.username ? sanitize(u.username[0]) : '?')}</div>
          <div class="mine-me__info">
            <div class="mine-me__name">${sanitize(u.username || '')}</div>
            <div class="mine-me__phone">${sanitize((u.phone || '').replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'))}</div>
            <span class="mine-me__role" data-role="${sanitize(u.role)}">${ROLE_LABELS[u.role] || u.role}</span>
          </div>
        </div>
        ${['admin', 'beta'].includes(u.role) ? `
          <div class="mine-card__actions">
            <button class="btn btn--ghost btn--sm" id="mineUploadAvatar" type="button">上传头像</button>
          </div>` : ''}
      </div>

      <div class="mine-card">
        <div class="mine-card__head"><h3>我的战队</h3><em>TEAM</em></div>
        ${school ? `
          <div class="mine-team">
            <div class="mine-team__logo">${schoolLogo ? `<img src="${schoolLogo}" alt="">` : '🏫'}</div>
            <div class="mine-team__info">
              <div class="mine-team__name">${sanitize(schoolName)}</div>
              <div class="mine-team__meta">已登记选手 <b>${playerCount}</b> 人</div>
            </div>
          </div>
          <div class="mine-card__actions">
            <button class="btn btn--ghost btn--sm" data-goto-tab="teams" type="button">查看队伍信息</button>
          </div>` : `
          <div class="mine-inline-empty">${u.role === 'team' ? '尚未绑定战队' : '非队长账号，无战队信息'}</div>
          ${u.role === 'team' ? `
            <div class="mine-card__actions">
              <button class="btn btn--primary btn--sm" data-goto-tab="teams" type="button">去绑定战队</button>
            </div>` : ''}`}
      </div>

      <div class="mine-card">
        <div class="mine-card__head"><h3>我的比赛</h3><em>MATCHES</em></div>
        <div class="mine-matches">
          <div class="mine-matches__title">${sanitize(scheduleTitle)}</div>
          <div class="mine-matches__meta">与你相关的比赛 <b>${relatedCount}</b> 场</div>
        </div>
        <div class="mine-card__actions">
          <button class="btn btn--primary btn--sm" id="mineOpenMatches" type="button">查看我的比赛</button>
        </div>
      </div>

      ${u.role === 'admin' ? `
      <div class="mine-card mine-card--admin">
        <div class="mine-card__head"><h3>公告管理</h3><em>ANNOUNCE</em></div>
        <div class="mine-inline-empty" style="padding:6px 0">新增或删除官方公告，支持置顶与日期</div>
        <div class="mine-card__actions">
          <button class="btn btn--primary btn--sm" id="mineAnnounceBtn" type="button">进入公告管理</button>
        </div>
        <div id="mineAnnounceBox"></div>
      </div>` : ''}
    </div>

    <div class="mine-changelog" id="mineChangelog">
      <button class="mine-changelog__toggle" type="button" aria-expanded="false">
        <span class="mine-changelog__tt">网站更新</span><em>CHANGELOG</em>
        <span class="mine-changelog__arrow" aria-hidden="true">▸</span>
      </button>
      <div id="mineTimeline" hidden></div>
    </div>
  `;

  /* 绑定跳转 */
  box.querySelectorAll('[data-goto-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('.tab[data-tab="' + btn.dataset.gotoTab + '"]')?.click();
    });
  });
  const openBtn = box.querySelector('#mineOpenMatches');
  if (openBtn) openBtn.addEventListener('click', () => openMyMatchesPage());
  const upBtn = box.querySelector('#mineUploadAvatar');
  if (upBtn) upBtn.addEventListener('click', () => {
    document.getElementById('accountBtn')?.click();
    setTimeout(() => document.getElementById('profileUploadAvatar')?.click(), 350);
  });
  const annBtn = box.querySelector('#mineAnnounceBtn');
  if (annBtn) annBtn.addEventListener('click', () => mountToolInto('announcements', 'mineAnnounceBox'));

  /* 网站更新日志（置于最底部，默认折叠，点击标题展开） */
  const changelog = box.querySelector('#mineChangelog');
  const timeline = box.querySelector('#mineTimeline');
  changelog?.querySelector('.mine-changelog__toggle')?.addEventListener('click', () => {
    const open = changelog.classList.toggle('is-open');
    const toggle = changelog.querySelector('.mine-changelog__toggle');
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
    if (timeline) timeline.hidden = !open;
  });
  renderKingTimeline('mineTimeline');
}

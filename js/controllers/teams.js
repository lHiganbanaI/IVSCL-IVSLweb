/* ============================================================
   队伍控制器 · TeamsController
   列表 / 我的队伍 / 管理员管理 / 绑定 / 创建 / 编辑选手
   @file js/controllers/teams.js
============================================================ */
import { apiRequest, getCurrentUser } from '../api.js';
import { sanitize } from '../utils.js';
import { TEAM_LOGO_DIR, TEAM_LOGO_EXT } from '../config.js?v=20261006-29';
import { store } from '../store.js';
import { showActionNotice, showAlert } from '../ui-toast.js';
import {
  canVote, hydrateVoteButtons, compressImage, PLAYER_POSITIONS,
  renderPlayerRowHtml, coachRowHtml, collectPlayersFromPanel
} from './shared.js';

export class TeamsController {
  constructor() {
    this.cache = [];
    this.mySchool = null;
    this.myTeamInfo = null;
    this.tab = 'all';
    this.tabsBound = false;
    this.adminViewsBound = false;
    this.createState = { pendingLogo: null };
  }

  render(list, container, opts = {}) {
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
      const logoSrc = item.logo ? item.logo : `${TEAM_LOGO_DIR}loge_${short}${TEAM_LOGO_EXT}`;
      return `
        <div class="team-card" data-team-card-short="${short}">
          ${editMode ? `<button class="team-card__edit" data-team-edit="${short}" type="button" aria-label="编辑队员">✏️ 编辑队员</button>` : ''}
          <div class="team-card__logo-wrap">
            <img class="team-card__logo" src="${logoSrc}" alt="${name} logo" loading="lazy"
              onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2246%22 fill=%22%23182242%22 stroke=%22%23d4b47a%22 stroke-width=%222%22 stroke-dasharray=%226 6%22/><text x=%2250%22 y=%2264%22 font-size=%2240%22 font-weight=%22900%22 fill=%22%23d4b47a%22 text-anchor=%22middle%22 font-family=%22sans-serif%22>?</text></svg>'">
          </div>
          <h3 class="team-card__name">${name}</h3>
          <span class="team-card__short">${short}</span>
          ${editMode ? '' : (canVote() ? `<button class="vote-btn team-card__vote" data-vote-target="team" data-vote-key="${short}" type="button" aria-label="为 ${name} 打 Call">🔥 0</button>` : '')}
        </div>
      `;
    }).join('');

    if (!editMode) hydrateVoteButtons(container);

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
          this.openPlayerEditorPanel(btn.dataset.teamEdit);
        });
      });
    }
    container.setAttribute('aria-busy', 'false');
  }

  async refreshMySchool() {
    const user = getCurrentUser();
    this.mySchool = null;
    this.myTeamInfo = null;
    if (user?.role === 'team') {
      try {
        const d = await store.loadMySchool().catch(() => ({}));
        this.mySchool = d.profile?.school || null;
      } catch {}
      if (this.mySchool) {
        try {
          const td = await store.loadTeamsFull().catch(() => ({}));
          const found = (td.teams || []).find(t => t.short === this.mySchool);
          if (found) this.myTeamInfo = found;
        } catch {}
      }
    }
  }

  updateChrome() {
    const user = getCurrentUser();
    const mineTab = document.querySelector('[data-teams-tab="mine"]');
    const adminActions = document.getElementById('teamsAdminActions');
    if (mineTab) mineTab.hidden = !(user?.role === 'team');
    if (adminActions) {
      if (user?.role === 'admin') {
        adminActions.innerHTML = `<button class="btn btn--ghost btn--sm" id="adminManageTeamsBtn" type="button">🛡️ 管理队伍</button>`;
        const btn = document.getElementById('adminManageTeamsBtn');
        btn?.addEventListener('click', () => this.showAdminView());
      } else {
        adminActions.innerHTML = '';
      }
    }
    if (this.tab === 'mine' && user?.role !== 'team') {
      this.tab = 'all';
      document.querySelectorAll('[data-teams-tab]').forEach(b => {
        b.classList.toggle('is-active', b.dataset.teamsTab === 'all');
      });
    }
  }

  bindTabs() {
    if (this.tabsBound) return;
    this.tabsBound = true;
    document.querySelectorAll('[data-teams-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.teamsTab;
        document.querySelectorAll('[data-teams-tab]').forEach(b => {
          b.classList.toggle('is-active', b === btn);
        });
        this.renderByTab();
      });
    });
  }

  async renderByTab() {
    const grid = document.getElementById('teamsGrid');
    const searchBar = document.getElementById('teamsSearchBar');
    const mineEmpty = document.getElementById('myTeamEmpty');
    if (!grid) return;

    if (this.tab === 'mine') {
      if (searchBar) searchBar.hidden = true;
      if (!this.mySchool) {
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
          document.getElementById('bindTeamBtn')?.addEventListener('click', () => this.openBindPanel());
          document.getElementById('createMyTeamBtn')?.addEventListener('click', () => this.openEditorPanel(null));
        }
        return;
      }
      if (mineEmpty) mineEmpty.hidden = true;
      grid.hidden = false;
      const mine = this.cache.filter(t => t.short === this.mySchool);
      this.render(mine, grid, { editMode: true });
    } else {
      if (searchBar) searchBar.hidden = false;
      if (mineEmpty) mineEmpty.hidden = true;
      grid.hidden = false;
      this.render(this.cache, grid, { editMode: false });
    }
  }

  async load() {
    const box = document.getElementById('teamsGrid');
    if (!box) return;
    await this.refreshMySchool();
    this.updateChrome();
    this.bindTabs();
    this.bindAdminViews();

    try {
      const data = await store.fetchTeams();
      this.cache = data.teams || [];
      await this.renderByTab();

      store.fetchTeamLogos().then(result => {
        if (!box.isConnected) return;
        const logos = new Map((result.teams || []).map(team => [team.short, team.logo]));
        this.cache.forEach(t => {
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

  /* ---------------- 管理员视图 ---------------- */
  bindAdminViews() {
    if (this.adminViewsBound) return;
    this.adminViewsBound = true;
    document.getElementById('teamsAdminBackBtn')?.addEventListener('click', () => this.hideAdminView());
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
      search.addEventListener('input', () => this.renderAdminList());
    }
  }

  showAdminView() {
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
    this.renderAdminList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  hideAdminView() {
    const main = document.getElementById('teamsMainView');
    const adminView = document.getElementById('teamsAdminView');
    const detailView = document.getElementById('teamsAdminDetailView');
    if (!main || !adminView) return;
    adminView.hidden = true;
    if (detailView) detailView.hidden = true;
    main.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  renderAdminList() {
    const grid = document.getElementById('teamsAdminGrid');
    const count = document.getElementById('teamsAdminCount');
    const search = document.getElementById('teamsAdminSearch');
    if (!grid) return;
    const query = (search?.value || '').trim().toLowerCase();
    const filtered = this.cache.filter(t => {
      if (!query) return true;
      return (t.name || '').toLowerCase().includes(query) || (t.short || '').toLowerCase().includes(query);
    });
    if (count) {
      count.textContent = query
        ? `匹配 ${filtered.length} / ${this.cache.length} 支`
        : `共 ${this.cache.length} 支队伍`;
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
      const open = () => this.showAdminDetail(card.dataset.adminTeam);
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  async showAdminDetail(school) {
    const adminView = document.getElementById('teamsAdminView');
    const detailView = document.getElementById('teamsAdminDetailView');
    const detailContent = document.getElementById('teamsAdminDetailContent');
    if (!adminView || !detailView || !detailContent) return;

    const schoolInfo = this.cache.find(t => t.short === school) || {};
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
      const pd = await store.loadPlayers(school);
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

  /* ---------------- 内嵌面板开关 ---------------- */
  showEditorPanel() {
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

  closeEditorPanel() {
    const panel = document.getElementById('teamEditorPanel');
    const mainView = document.getElementById('teamsMainView');
    if (!panel || !mainView) return;
    panel.hidden = true;
    panel.innerHTML = '';
    mainView.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- 绑定已有队伍 ---------------- */
  async openBindPanel() {
    const panel = document.getElementById('teamBindPanel');
    const mainView = document.getElementById('teamsMainView');
    if (!panel || !mainView) return;
    mainView.hidden = true;
    panel.hidden = false;
    panel.innerHTML = '<div class="board__state" style="padding:60px 20px">加载学校列表中…</div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    let teams = (this.cache || []).slice();
    if (!teams.length) {
      try {
        const data = await store.fetchTeams();
        teams = data.teams || [];
        this.cache = teams;
      } catch (err) {
        panel.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
        return;
      }
    }
    let logoMap = {};
    try {
      const ld = await store.fetchTeamLogos();
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
            await apiRequest('/api/team/school', { method: 'POST', body: JSON.stringify({ school }) });
            showActionNotice('已绑定队伍：' + school);
            await this.refreshMySchool();
            panel.hidden = true;
            panel.innerHTML = '';
            mainView.hidden = false;
            await this.renderByTab();
            await this.openPlayerEditorPanel(school);
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

  posOpts() {
    return PLAYER_POSITIONS.map(v => `<option value="${v}">${v}</option>`).join('');
  }

  /* ---------------- 创建队伍 ---------------- */
  async openEditorPanel(school) {
    const panel = document.getElementById('teamEditorPanel');
    if (!panel) return;
    this.createState.pendingLogo = null;

    let players = [];
    let coachName = '';
    if (school) {
      try {
        const pd = await store.loadPlayers();
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
    const posOpts = this.posOpts();

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
    this.showEditorPanel();
    panel.querySelectorAll('.pp-pos').forEach((sel, i) => { if (players[i]) sel.value = players[i].position || '求生'; });

    const fileInput = panel.querySelector('#teLogo');
    const preview = panel.querySelector('#teLogoPreview');
    const previewImg = panel.querySelector('#teLogoPreviewImg');
    const previewInfo = panel.querySelector('#teLogoInfo');

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) { this.createState.pendingLogo = null; return; }
      if (file.size > 5 * 1024 * 1024) { showAlert('图片过大（超过 5MB）'); fileInput.value = ''; return; }
      try {
        const dataUrl = await compressImage(file, 300, 0.78);
        this.createState.pendingLogo = dataUrl;
        if (previewImg) previewImg.style.backgroundImage = `url(${dataUrl})`;
        if (previewInfo) previewInfo.textContent = `已选择 ${file.name}（压缩后 ${Math.round(dataUrl.length/1024)} KB）`;
        if (preview) preview.hidden = false;
      } catch (err) {
        showAlert('图片处理失败：' + err.message);
        fileInput.value = '';
      }
    });
    panel.querySelector('#teLogoClear')?.addEventListener('click', () => {
      this.createState.pendingLogo = null;
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
    panel.querySelector('#teBackBtn')?.addEventListener('click', () => this.closeEditorPanel());
    panel.querySelector('#teCancelBtn')?.addEventListener('click', () => this.closeEditorPanel());
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
        const logoPayload = this.createState.pendingLogo || null;
        await apiRequest('/api/team/create-school', { method: 'POST', body: JSON.stringify({ name, short, logo: logoPayload }) });
        const coachName = (panel.querySelector('#teCoachName')?.value || '').trim();
        if (rows.length || coachName) {
          await apiRequest('/api/team/players', {
            method: 'POST',
            body: JSON.stringify({ players: rows, coach: coachName ? { name: coachName } : null })
          });
        }
        showActionNotice('队伍已创建');
        this.closeEditorPanel();
        store.invalidateTeams();
        await this.load();
        if (window.app?.renderToolsPanel) window.app.renderToolsPanel();
      } catch (err) {
        if (msg) msg.textContent = err.message;
        showActionNotice(err.message, true);
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    });
  }

  /* ---------------- 编辑选手 ---------------- */
  async openPlayerEditorPanel(school) {
    const panel = document.getElementById('teamEditorPanel');
    if (!panel) return;

    const schoolInfo = this.cache.find(t => t.short === school) || this.myTeamInfo || {};
    const schoolName = schoolInfo.name || school;
    const schoolShort = schoolInfo.short || school;
    const schoolLogo = schoolInfo.logo || '';

    let players = [];
    let coachName = '';
    try {
      const pd = await store.loadPlayers();
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
    const posOpts = this.posOpts();

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
    this.showEditorPanel();
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
    panel.querySelector('#teBackBtn')?.addEventListener('click', () => this.closeEditorPanel());
    panel.querySelector('#teCancelBtn')?.addEventListener('click', () => this.closeEditorPanel());
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
          body: JSON.stringify({ players: rows, coach: coachName ? { name: coachName } : null })
        });
        showActionNotice('名单已保存');
        this.closeEditorPanel();
        store.invalidateTeams();
        await this.load();
      } catch (err) {
        if (msg) msg.textContent = err.message;
        showActionNotice(err.message, true);
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    });
  }
}

export const teamsController = new TeamsController();
/* 兼容旧全局调用（导播 / 其他文件可能引用） */
window.__showTeamsAdminView = () => teamsController.showAdminView();

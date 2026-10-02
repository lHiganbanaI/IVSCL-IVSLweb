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
        <div class="tools-locked__title">请先绑定学校，约赛和选手名单等队伍功能会在绑定后显示。</div>
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

  if (toolId === 'announcements') {
    box.innerHTML = '<div class="board__state">加载中…</div>';
    window.__toolModal.openModal();
    await loadAnnouncementsTool(box);
  } else if (toolId === 'teams') {
    box.innerHTML = '<div class="board__state">加载中…</div>';
    window.__toolModal.openModal();
    await loadTeamsTool(box);
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
  } else if (toolId === 'teamPlayers') {
    box.innerHTML = '<div class="board__state">加载中…</div>';
    window.__toolModal.openModal();
    await loadTeamPlayersTool(box);
  } else if (toolId === 'matchBooking') {
    box.innerHTML = '<div class="board__state">加载中…</div>';
    window.__toolModal.openModal();
    await loadMatchBookingTool(box);
  }
}

/* ============================================================
   图片压缩工具
============================================================ */
function compressImage(file, maxSize = 300, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > height && width > maxSize) {
          height = Math.round(height * maxSize / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * maxSize / height);
          height = maxSize;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(outputType, quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('图片解析失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   队伍管理
============================================================ */
let __currentTeams = [];
let __pendingLogo = null;

async function loadTeamsTool(box) {
  let list = [];
  try {
    // 管理界面需要显示上传的 logo；公共页面使用不含图片的轻量接口。
    const data = await apiRequest('/api/teams');
    list = data.teams || [];
  } catch (err) {
    box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    return;
  }

  __currentTeams = list;
  __pendingLogo = null;

  box.innerHTML = `
    <h3 class="tool-modal__title">队伍管理 <em>ADMIN</em></h3>
    <p class="tool-modal__sub">上传学校 logo、填写名称与简称即可创建队伍。修改后队伍信息页会立即更新。</p>

    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>新增队伍</h4></div>
      <div class="tool-form">
        <div class="tool-form__row">
          <div class="tool-field">
            <label for="teamName">学校 / 战队全称</label>
            <input type="text" id="teamName" placeholder="例如：进才中学" maxlength="30">
          </div>
          <div class="tool-field">
            <label for="teamShort">学校简称（英文/拼音）</label>
            <input type="text" id="teamShort" placeholder="例如：jczx" maxlength="20">
          </div>
        </div>

        <div class="tool-field">
          <label for="teamLogo">学校 Logo（建议方形，自动压缩到 300px）</label>
          <input type="file" id="teamLogo" accept="image/*">
        </div>

        <div class="team-logo-preview" id="teamLogoPreview" hidden>
          <div class="team-logo-preview__img" id="teamLogoPreviewImg"></div>
          <div class="team-logo-preview__info">
            <b>预览</b>
            <span id="teamLogoInfo">—</span>
          </div>
          <button class="team-logo-preview__clear" id="teamLogoClear" type="button" aria-label="清除">✕</button>
        </div>
      </div>

      <div class="tool-actions">
        <button class="btn btn--primary btn--sm" id="teamAddBtn" type="button">+ 添加队伍</button>
      </div>
    </section>

    <section class="tool-modal__section">
      <div class="tool-modal__section-head">
        <h4>当前队伍</h4>
        <span class="tool-modal__count" id="teamCount">${list.length} 支</span>
      </div>
      <ul class="tool-list" id="teamList"></ul>
    </section>
  `;

  renderTeamListBox(list);
  bindTeamFormEvents();
}

function bindTeamFormEvents() {
  const fileInput = document.getElementById('teamLogo');
  const preview = document.getElementById('teamLogoPreview');
  const previewImg = document.getElementById('teamLogoPreviewImg');
  const previewInfo = document.getElementById('teamLogoInfo');
  const clearBtn = document.getElementById('teamLogoClear');

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      __pendingLogo = null;
      if (preview) preview.hidden = true;
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('图片过大（超过 5MB），请换一张');
      fileInput.value = '';
      return;
    }

    try {
      const dataUrl = await compressImage(file, 300, 0.78);
      __pendingLogo = dataUrl;

      if (previewImg) previewImg.style.backgroundImage = `url(${dataUrl})`;
      if (previewInfo) {
        const kb = Math.round(dataUrl.length / 1024);
        previewInfo.textContent = `已选择 ${file.name}（压缩后 ${kb} KB）`;
      }
      if (preview) preview.hidden = false;
    } catch (err) {
      alert('图片处理失败：' + err.message);
      fileInput.value = '';
    }
  });

  clearBtn?.addEventListener('click', () => {
    __pendingLogo = null;
    if (fileInput) fileInput.value = '';
    if (preview) preview.hidden = true;
  });

  document.getElementById('teamAddBtn')?.addEventListener('click', async () => {
    const name = (document.getElementById('teamName').value || '').trim();
    const short = (document.getElementById('teamShort').value || '').trim();
    if (!name || !short) { alert('名称和简称都不能为空'); return; }

    const btn = document.getElementById('teamAddBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = __pendingLogo ? '上传中…' : '添加中…';

    try {
      const data = await apiRequest('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name,
          short,
          logo: __pendingLogo || null
        })
      });

      /* 重置表单 */
      document.getElementById('teamName').value = '';
      document.getElementById('teamShort').value = '';
      if (fileInput) fileInput.value = '';
      if (preview) preview.hidden = true;
      __pendingLogo = null;

      /* 直接插到本地列表，不重新请求 */
      if (data.team) {
        __currentTeams.unshift(data.team);
        renderTeamListBox(__currentTeams);
      }
      invalidateTeams();                        /* 清缓存，其他页面下次拉最新 */
      if (window.app?.loadTeams) window.app.loadTeams();
    } catch (err) {
      alert('添加失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}

function renderTeamListBox(list) {
  const ul = document.getElementById('teamList');
  const cnt = document.getElementById('teamCount');
  if (!ul) return;
  if (!list.length) {
    ul.innerHTML = '<li class="tool-list__empty">暂无队伍</li>';
  } else {
    ul.innerHTML = list.map(item => {
      const thumb = item.logo
        ? `<span class="tool-list__thumb" style="background-image:url(${item.logo})"></span>`
        : `<span class="tool-list__thumb tool-list__thumb--empty">?</span>`;

      return `
        <li class="tool-list__item">
          ${thumb}
          <div class="tool-list__body">
            <div class="tool-list__title">${sanitize(item.name)}</div>
            <div class="tool-list__meta">
              <span>🔖 ${sanitize(item.short || '')}</span>
              ${item.logo ? '' : '<span style="color:#ffb3c0">⚠ 未上传 logo</span>'}
            </div>
          </div>
          <button class="tool-list__remove" data-team-remove="${item.id}" aria-label="删除">✕</button>
        </li>
      `;
    }).join('');
  }
  if (cnt) cnt.textContent = list.length + ' 支';

  ul.querySelectorAll('[data-team-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.teamRemove;
      if (!confirm('确定要删除这支队伍吗？')) return;
      try {
        await apiRequest('/api/teams/' + id, { method: 'DELETE' });
        /* 本地列表直接删掉，不重新请求 */
        __currentTeams = __currentTeams.filter(t => String(t.id) !== String(id));
        renderTeamListBox(__currentTeams);
        invalidateTeams();                      /* 清缓存 */
        if (window.app?.loadTeams) window.app.loadTeams();
      } catch (err) {
        alert('删除失败：' + err.message);
      }
    });
  });
}

/* ============================================================
   公告栏管理
============================================================ */
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
    <p class="tool-modal__sub">新增或删除官方公告，保存后主页公告栏会立即更新。</p>

    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>新增公告</h4></div>
      <div class="tool-form">
        <div class="tool-form__row">
          <div class="tool-field">
            <label for="annTag">标签文字</label>
            <input type="text" id="annTag" placeholder="例如：置顶 / 报名 / 动态" maxlength="10">
          </div>
          <div class="tool-field">
            <label for="annTagClass">标签样式</label>
            <select id="annTagClass">
              <option value="tag--notice">金色（公告）</option>
              <option value="tag--signup">青色（报名）</option>
              <option value="tag--event">紫色（动态）</option>
              <option value="tag--hot">红色（热门）</option>
            </select>
          </div>
          <div class="tool-field">
            <label for="annTime">时间</label>
            <input type="text" id="annTime" placeholder="今天 / 06-10" value="今天">
          </div>
        </div>
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
    const tag = (document.getElementById('annTag').value || '').trim() || '公告';
    const tagClass = document.getElementById('annTagClass').value || 'tag--notice';
    const time = (document.getElementById('annTime').value || '').trim() || '今天';
    const text = (document.getElementById('annText').value || '').trim();
    if (!text) { alert('正文不能为空'); return; }

    const btn = document.getElementById('annAddBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '添加中…';

    try {
      await apiRequest('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({ tag, tagClass, time, text })
      });
      document.getElementById('annTag').value = '';
      document.getElementById('annText').value = '';
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
      <li class="tool-list__item">
        <div class="tool-list__body">
          <div class="tool-list__title">
            <span class="msg__tag ${item.tag_class || 'tag--notice'}" style="margin-right:8px">${sanitize(item.tag || '公告')}</span>
            ${sanitize(item.text || '')}
          </div>
          <div class="tool-list__meta">
            <span>🕐 ${sanitize(item.time || '')}</span>
          </div>
        </div>
        <button class="tool-list__remove" data-ann-remove="${item.id}" aria-label="删除">✕</button>
      </li>
    `).join('');
  }
  if (cnt) cnt.textContent = list.length + ' 条';

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

  /* 队伍列表（用于选择对战双方 + 显示全称）—— 复用缓存 */
  let teams = [], nameMap = {};
  try {
    const td = await fetchTeams();
    teams = td.teams || [];
    teams.forEach(t => { nameMap[t.short] = t.name; });
  } catch (e) {}
  const teamOpts = teams.map(t => `<option value="${sanitize(t.short)}">${sanitize(t.name)}（${sanitize(t.short)}）</option>`).join('');

  /* 拉取已发布的赛程，用于快速选取已知对阵 */
  let matches = [];
  try {
    const sd = await apiRequest('/api/schedule');
    matches = (sd.schedule && sd.schedule.matches) || [];
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

  /* 从赛程下拉框：一键填充对战双方 + 场次说明 */
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

      /* 若场次说明为空，自动填充「第 N 场 · A VS B」 */
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
    /* 统一转为带 +08:00 的 ISO 字符串，避免后端按 UTC 解析 */
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
    /* 统一按北京时间显示，输出 "MM-DD HH:mm" 紧凑样式 */
    const fmtTime = (t) => {
      if (!t) return '';
      const s = formatBeijing(t);   // "2026-10-02 20:30"
      return s ? s.slice(5) : String(t); // "10-02 20:30"
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
   添加赛程（上传 JSON 对阵表）
============================================================ */
async function loadScheduleTool(box) {
  let published = null;
  try {
    const data = await apiRequest('/api/schedule');
    published = data.schedule || null;
  } catch (err) {
    box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    return;
  }

  box.innerHTML = `
    <h3 class="tool-modal__title">添加赛程 <em>ADMIN</em></h3>
    <p class="tool-modal__sub">上传包含对阵的 JSON 文件，64 进 32 淘汰赛将立即发布到「比赛赛程」页。每场对阵为两个队伍简称。</p>

    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>上传对阵表</h4></div>
      <div class="tool-form">
        <div class="tool-field">
          <label for="scheduleTitle">赛程标题</label>
          <input type="text" id="scheduleTitle" placeholder="例如：64 进 32 淘汰赛" maxlength="30" value="64 进 32 淘汰赛">
        </div>
        <div class="tool-field">
          <label for="scheduleFile">JSON 文件（队伍简称对阵）</label>
          <input type="file" id="scheduleFile" accept=".json,application/json">
        </div>
        <p class="schedule-format-hint">
          <b>JSON 格式示例：</b>
          <code>{ "title":"64 进 32 淘汰赛", "matches":[ { "a":"hlkz", "b":"jczx" }, { "a":"hx", "b":"rest1" } ] }</code>
          也支持 <code>{ "matches":[ ["hlkz","jczx"], ... ] }</code> 或扁平数组 <code>["hlkz","jczx", ...]</code>（两两一组）。队伍 Logo 自动按简称匹配。
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
        <h4>已发布赛程</h4>
        <span class="tool-modal__count" id="scheduleCount">${published && published.matches ? published.matches.length : 0} 场</span>
      </div>
      <div class="schedule-list" id="scheduleList"></div>
    </section>
  `;

  renderScheduleListBox(published);

  const fileInput = document.getElementById('scheduleFile');
  const msg = document.getElementById('scheduleMsg');
  let parsedFile = null;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) { parsedFile = null; msg.textContent = '未选择文件'; return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        parsedFile = parseScheduleJson(e.target.result);
        msg.textContent = `已解析：${parsedFile.matches.length} 场对阵，标题「${parsedFile.title}」。点击「发布赛程」即可生效。`;
      } catch (err) {
        parsedFile = null;
        msg.textContent = '解析失败：' + err.message;
      }
    };
    reader.onerror = () => { parsedFile = null; msg.textContent = '文件读取失败'; };
    reader.readAsText(file, 'utf-8');
  });

  document.getElementById('schedulePublishBtn').addEventListener('click', async () => {
    if (!parsedFile) { alert('请先选择并解析有效的 JSON 文件'); return; }
    const btn = document.getElementById('schedulePublishBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '发布中…';
    try {
      const title = (document.getElementById('scheduleTitle').value || '').trim() || parsedFile.title;
      await apiRequest('/api/schedule', {
        method: 'POST',
        body: JSON.stringify({ title, matches: parsedFile.matches })
      });
      msg.textContent = '✅ 发布成功，比赛赛程页已更新。';
      const data = await apiRequest('/api/schedule');
      renderScheduleListBox(data.schedule);
      document.getElementById('scheduleCount').textContent = data.schedule.matches.length + ' 场';
      if (window.app?.loadSchedule) window.app.loadSchedule();
    } catch (err) {
      alert('发布失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  document.getElementById('scheduleClearBtn').addEventListener('click', async () => {
    if (!confirm('确定要清空当前赛程吗？比赛赛程页将显示「赛程尚未发布」。')) return;
    try {
      await apiRequest('/api/schedule', { method: 'DELETE' });
      renderScheduleListBox(null);
      document.getElementById('scheduleCount').textContent = '0 场';
      document.getElementById('scheduleMsg').textContent = '已清空赛程。';
      if (window.app?.loadSchedule) window.app.loadSchedule();
    } catch (err) {
      alert('清空失败：' + err.message);
    }
  });
}

/* 解析上传的赛程 JSON，兼容多种格式 */
function parseScheduleJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('不是合法的 JSON 文本');
  }

  let title = '';
  let raw = null;

  if (Array.isArray(data)) {
    raw = data;
  } else if (data && typeof data === 'object') {
    title = String(data.title || data.round || '').trim();
    if (Array.isArray(data.matches)) raw = data.matches;
    else if (Array.isArray(data.groups)) raw = data.groups;
    else if (Array.isArray(data.pairs)) raw = data.pairs;
  }

  if (!Array.isArray(raw)) throw new Error('JSON 中找不到对阵数组（matches / groups / pairs）');

  const matches = [];
  raw.forEach(m => {
    if (Array.isArray(m)) {
      matches.push({ a: String(m[0] || '').trim(), b: String(m[1] || '').trim() });
    } else if (typeof m === 'string') {
      matches.push({ a: m.trim(), b: '' });
    } else if (m && typeof m === 'object') {
      matches.push({
        a: String(m.a ?? m.home ?? m.t1 ?? m.team1 ?? '').trim(),
        b: String(m.b ?? m.away ?? m.t2 ?? m.team2 ?? '').trim()
      });
    }
  });

  if (matches.some(p => !p.b)) {
    const flat = matches.map(p => p.a);
    const paired = [];
    for (let i = 0; i < flat.length; i += 2) {
      paired.push({ a: flat[i] || '', b: flat[i + 1] || '' });
    }
    matches.length = 0;
    matches.push(...paired);
  }

  const cleaned = matches.filter(p => p.a || p.b);
  if (!cleaned.length) throw new Error('没有解析到任何对阵');

  return { title: title || '64 进 32 淘汰赛', matches: cleaned };
}

function renderScheduleListBox(schedule) {
  const box = document.getElementById('scheduleList');
  if (!box) return;
  const list = schedule && schedule.matches ? schedule.matches : [];
  if (!list.length) {
    box.innerHTML = '<div class="tool-list__empty">尚未发布赛程</div>';
    return;
  }
  box.innerHTML = `
    <div class="schedule-list__head">${sanitize(schedule.title || '64 进 32 淘汰赛')}</div>
    <div class="schedule-list__grid">
      ${list.map((p, i) => `
        <div class="schedule-list__pair">
          <span class="schedule-list__no">${String(i + 1).padStart(2, '0')}</span>
          <span class="schedule-list__team">${sanitize(p.a || '轮空')}</span>
          <span class="schedule-list__vs">VS</span>
          <span class="schedule-list__team">${sanitize(p.b || '轮空')}</span>
        </div>
      `).join('')}
    </div>
  `;
}

/* ============================================================
   约赛（已绑定学校的队长）
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
    box.innerHTML = '<h3 class="tool-modal__title">约赛 <em>TEAM</em></h3><div class="tool-modal__info">请先在“绑定学校”中绑定自己的学校，再提交比赛时间。</div>';
    return;
  }
  if (!schedule?.matches?.length) {
    box.innerHTML = '<h3 class="tool-modal__title">约赛 <em>TEAM</em></h3><div class="tool-modal__info">当前还没有已发布的比赛赛程。</div>';
    return;
  }

  const school = profile?.school || null;
  const teamNames = Object.fromEntries(teams.map(team => [team.short, team.name || team.short]));
  const choices = schedule.matches.map((match, index) => ({ match, index }))
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
    const selected = schedule.matches[matchIndex];
    const schoolSelect = box.querySelector('#bookingSchool');
    if (schoolSelect && selected) {
      const choices = [selected.a, selected.b].map(short => `<option value="${sanitize(short)}">${sanitize(teamNames[short] || short)}</option>`).join('');
      schoolSelect.innerHTML = choices;
      schoolSelect.value = appointment?.booked_by_school && [selected.a, selected.b].includes(appointment.booked_by_school)
        ? appointment.booked_by_school
        : selected.a;
    }
    const timeInput = box.querySelector('#bookingTime');
    const notesInput = box.querySelector('#bookingNotes');
    if (!appointment) { timeInput.value = ''; notesInput.value = ''; return; }
    /* 回显：把存储的 ISO 时间转成北京时间，填入 datetime-local */
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
          /* 提交：把 datetime-local 值标上 +08:00，避免后端按 UTC 解析 */
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
   绑定学校（队伍队长）
============================================================ */
async function loadBindSchoolTool(box) {
  const u = getCurrentUser();
  const isAdmin = u && u.role === 'admin';

  /* 拉取学校列表 + 当前绑定 —— 学校列表复用缓存 */
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
    <p class="tool-modal__sub">选择你的队伍学校并绑定。绑定后才能提交选手名单。</p>
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
      msg.innerHTML = '✅ 已绑定学校：<b>' + sanitize(school) + '</b>，现在可以去「提交选手名单」。';
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
   提交选手名单（队伍队长 / 管理员查看）
============================================================ */
const PLAYER_POSITIONS = ['求生', '监管', '双边'];

async function loadTeamPlayersTool(box) {
  const u = getCurrentUser();
  const isAdmin = u && u.role === 'admin';
  let currentSchool = null;

  try {
    const p = await apiRequest('/api/team/school').catch(() => ({}));
    currentSchool = (p.profile && p.profile.school) || null;
  } catch (e) {}

  /* 管理员：拉取学校列表用于查看任意学校 —— 复用缓存 */
  let schools = [];
  if (isAdmin) {
    try { schools = (await fetchTeams()).teams || []; } catch (e) {}
  }

  const posOpts = PLAYER_POSITIONS.map(v => `<option value="${v}">${v}</option>`).join('');

  box.innerHTML = `
    <h3 class="tool-modal__title">选手名单 <em>TEAM</em></h3>
    <p class="tool-modal__sub">${isAdmin ? '管理员可查看各学校已提交的名单。' : '提交你的队伍选手：选手填 uid+名字+位置（求生/监管/双边），教练只需名字。'}</p>

    ${isAdmin ? `
      <section class="tool-modal__section">
        <div class="tool-modal__section-head"><h4>查看某学校名单</h4></div>
        <div class="tool-form">
          <div class="tool-field">
            <label for="adminViewSchool">选择学校</label>
            <select id="adminViewSchool">
              <option value="">-- 全部学校 --</option>
              ${schools.map(s => `<option value="${sanitize(s.short)}">${sanitize(s.name)}</option>`).join('')}
            </select>
          </div>
        </div>
      </section>
    ` : (currentSchool ? `<div class="tool-modal__info">当前学校：<b>${sanitize(currentSchool)}</b></div>` : '<div class="tool-modal__info" style="color:#ffb3c0">⚠ 尚未绑定学校，请先在「绑定学校」中绑定。</div>')}

    ${!isAdmin && !currentSchool ? '' : `
    <section class="tool-modal__section">
      <div class="tool-modal__section-head">
        <h4>${isAdmin ? '名单列表' : '提交名单'}</h4>
        ${isAdmin ? '' : '<span class="tool-modal__count">可多行添加选手</span>'}
      </div>
      <div id="playersEditArea"></div>
    </section>
    `}
  `;

  if (isAdmin) {
    const viewSel = document.getElementById('adminViewSchool');
    const area = document.getElementById('playersEditArea');
    const loadList = async () => {
      const school = viewSel.value;
      try {
        const q = school ? '?school=' + encodeURIComponent(school) : '';
        const data = await apiRequest('/api/team/players' + q);
        area.innerHTML = renderPlayersList(data.players || [], data.school || null);
      } catch (err) {
        area.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
      }
    };
    viewSel.addEventListener('change', loadList);
    loadList();
    return;
  }

  /* 队长：提交表单 */
  const area = document.getElementById('playersEditArea');
  const getRows = () => area.querySelectorAll('.player-row');
  const renderEdit = (rows) => {
    const list = rows.map((r, i) => `
      <div class="player-row" data-i="${i}">
        <div class="player-row__head">
          <span class="player-row__label">选手 ${i + 1}</span>
          <button type="button" class="player-row__del" data-del="${i}" aria-label="删除">✕</button>
        </div>
        <div class="tool-form__row">
          <div class="tool-field"><label>名字</label><input type="text" class="pp-name" maxlength="20" value="${sanitize(r.name || '')}"></div>
          <div class="tool-field"><label>UID</label><input type="text" class="pp-uid" maxlength="20" value="${sanitize(r.uid || '')}"></div>
          <div class="tool-field"><label>位置</label><select class="pp-pos">${posOpts}</select></div>
        </div>
      </div>
    `).join('');
    const coachHtml = `
      <div class="player-row player-row--coach">
        <div class="player-row__head">
          <span class="player-row__label">教练（无需 UID）</span>
        </div>
        <div class="tool-form__row">
          <div class="tool-field"><label>教练名字</label><input type="text" id="coachName" maxlength="20" value="${sanitize(rows.length ? '' : '')}"></div>
        </div>
      </div>`;
    area.innerHTML = list + coachHtml;
    /* 回填位置选中 */
    area.querySelectorAll('.pp-pos').forEach((sel, i) => { if (rows[i]) sel.value = rows[i].position || '求生'; });
    /* 教练回填 */
    const coachEl = document.getElementById('coachName');
    /* 行删除 */
    area.querySelectorAll('.player-row__del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.del);
        const cur = collectRows();
        cur.splice(idx, 1);
        renderEdit(cur);
      });
    });
  };
  const collectRows = () => {
    return Array.from(getRows()).map(row => ({
      name: (row.querySelector('.pp-name')?.value || '').trim(),
      uid: (row.querySelector('.pp-uid')?.value || '').trim(),
      position: row.querySelector('.pp-pos')?.value || '求生'
    }));
  };

  /* 默认：4 求生 + 1 监管 */
  const defaultRows = () => [
    { name:'', uid:'', position:'求生' }, { name:'', uid:'', position:'求生' },
    { name:'', uid:'', position:'求生' }, { name:'', uid:'', position:'求生' },
    { name:'', uid:'', position:'监管' }
  ];
  /* 初始：加载当前已提交名单填充；无则用默认行 */
  if (currentSchool) {
    try {
      const d = await apiRequest('/api/team/players');
      const list = (d.players || []).filter(x => !x.is_coach).map(x => ({ name: x.name, uid: x.uid || '', position: x.position || '求生' }));
      const coach = (d.players || []).find(x => x.is_coach);
      area.innerHTML = '';
      renderEdit(list.length ? list : defaultRows());
      if (coach) document.getElementById('coachName').value = coach.name || '';
    } catch (e) { renderEdit(defaultRows()); }
  } else {
    renderEdit(defaultRows());
  }

  area.insertAdjacentHTML('afterend', `
    <div class="tool-actions">
      <button class="btn btn--ghost btn--sm" id="addPlayerBtn" type="button">+ 添加选手</button>
      <button class="btn btn--primary btn--sm" id="savePlayersBtn" type="button">💾 提交名单</button>
    </div>
    <p class="draw-info" id="playersMsg"></p>
  `);

  document.getElementById('addPlayerBtn').addEventListener('click', () => {
    const cur = collectRows();
    cur.push({ name: '', uid: '', position: '求生' });
    renderEdit(cur);
  });

  document.getElementById('savePlayersBtn').addEventListener('click', async () => {
    const rows = collectRows().filter(r => r.name || r.uid);
    const coachName = (document.getElementById('coachName')?.value || '').trim();
    if (!rows.length && !coachName) { alert('请至少添加一名选手或教练'); return; }
    for (const r of rows) {
      if (!r.name) { alert('选手名字不能为空'); return; }
      if (!r.uid) { alert('选手 UID 不能为空'); return; }
    }
    const btn = document.getElementById('savePlayersBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '提交中…';
    try {
      const data = await apiRequest('/api/team/players', {
        method: 'POST',
        body: JSON.stringify({ players: rows, coach: coachName ? { name: coachName } : null })
      });
      const msg = document.getElementById('playersMsg');
      msg.innerHTML = '✅ 已提交：选手 ' + data.players + ' 人' + (data.coach ? '，教练 ' + sanitize(data.coach) : '') + '。';
    } catch (err) {
      alert('提交失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

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
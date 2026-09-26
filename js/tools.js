/* ============================================================
   网页功能面板 + 工具弹窗
============================================================ */

import {
  TOOLS_DEF, SECTION_LABELS, SECTION_ORDER, ROLE_LABELS
} from './config.js';
import { apiRequest, getCurrentUser } from './api.js';
import { sanitize, getInitialFromName } from './utils.js';

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
    if (allowed && sections[tool.section]) {
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

  box.innerHTML = `
    <h3 class="tool-modal__title">比赛房间 <em>STAFF</em></h3>
    <p class="tool-modal__sub">创建比赛房间号与密码，供选手进入。管理员与裁判均可查看。</p>

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

  renderRoomListBox(list);

  document.getElementById('roomAddBtn').addEventListener('click', async () => {
    const code = (document.getElementById('roomCode').value || '').trim();
    const password = (document.getElementById('roomPassword').value || '').trim();
    const title = (document.getElementById('roomTitle').value || '').trim();
    if (!code) { alert('房间号不能为空'); return; }

    const btn = document.getElementById('roomAddBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '创建中…';

    try {
      await apiRequest('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ code, password, title })
      });
      document.getElementById('roomCode').value = '';
      document.getElementById('roomPassword').value = '';
      document.getElementById('roomTitle').value = '';
      const data = await apiRequest('/api/rooms');
      renderRoomListBox(data.rooms || []);
    } catch (err) {
      alert('创建失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}

function renderRoomListBox(list) {
  const box = document.getElementById('roomList');
  const cnt = document.getElementById('roomCount');
  if (!box) return;

  if (!list.length) {
    box.innerHTML = '<li class="tool-list__empty">暂无房间</li>';
  } else {
    box.innerHTML = list.map(r => {
      const timeStr = r.created_at
        ? new Date(r.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';
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
          </div>
          <button class="room-card__remove" data-room-remove="${r.id}" aria-label="删除">✕</button>
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
        renderRoomListBox(data.rooms || []);
      } catch (err) {
        alert('删除失败：' + err.message);
      }
    });
  });
}

/* ============================================================
   初始化
============================================================ */
export function initTools() {
  initToolModalControl();
}
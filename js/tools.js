/* ============================================================
   网页功能面板 + 工具弹窗
============================================================ */

import {
  TOOLS_DEF, SECTION_LABELS, SECTION_ORDER, ROLE_LABELS
} from './config.js?v=20261006-29';
import { apiRequest, getCurrentUser } from './api.js';
import {
  sanitize, getInitialFromName,
  formatBeijing, beijingISOFromLocal, beijingLocalFromISO
} from './utils.js';
import { fetchTeams, invalidateTeams, showActionNotice, showMatchDetails } from './content.js?v=20261006-29';
import {
  TOURNAMENT_TYPES,
  TOURNAMENT_TYPE_LABELS,
  parseTournament,
  buildTournamentFromRaw,
  SingleElimination,
  DoubleElimination,
  GroupStage
} from './tournament.js';
import { openMyMatchesPage } from './my-matches.js?v=20261006-29';

/* 双保险：把入口挂到 window */
window.__openMyMatchesPage = window.__openMyMatchesPage || openMyMatchesPage;

const teamSchoolCache = new Map();
const teamSchoolRequests = new Map();

/* ============================================================
   工具注册表 · ToolsRegistry
   每个工具以 (box) => Promise 的 loader 形式注册，mount 时按 id 分发。
   新增工具只需 register 一次，mountTool / openToolInline 无需改动（开闭原则）。
============================================================ */
export class ToolsRegistry {
  constructor() { this.tools = new Map(); }
  register(toolId, loader) { this.tools.set(toolId, loader); }
  has(toolId) { return this.tools.has(toolId); }
  async mount(toolId, box) {
    if (!box) return;
    box.innerHTML = '<div class="board__state">加载中…</div>';
    const loader = this.tools.get(toolId);
    if (!loader) { box.innerHTML = '<div class="tool-modal__info">该工具暂不可用。</div>'; return; }
    await loader(box);
  }
}

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
      if (id === 'myMatches') {
        window.__openMyMatchesPage?.();
        return;
      }
      openToolInline(id);
    });
  });
}

/* ============================================================
   工具挂载：把单个工具渲染进任意容器（供各 tab 内嵌复用）
============================================================ */
export async function mountTool(toolId, box) {
  await toolsRegistry.mount(toolId, box);
}

/* ============================================================
   工具内嵌工作区（点击工具卡后在此渲染，替代弹窗）
============================================================ */
async function openToolInline(toolId) {
  const contentBox = document.getElementById('toolsContent');
  if (!contentBox) return;

  contentBox.innerHTML = `
    <div class="tools-workspace">
      <div class="tools-workspace__bar">
        <button class="btn btn--ghost btn--sm tools-workspace__back" id="toolsBack" type="button">← 返回工具列表</button>
      </div>
      <div id="toolsWorkspaceBox" class="tools-workspace__box">
        <div class="board__state">加载中…</div>
      </div>
    </div>
  `;
  const box = document.getElementById('toolsWorkspaceBox');
  const back = document.getElementById('toolsBack');
  if (back) back.addEventListener('click', () => renderToolsPanel());
  window.scrollTo({ top: 0, behavior: 'smooth' });

  await toolsRegistry.mount(toolId, box);
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
   赛事竞猜（仅绝版内测人与管理员）
============================================================ */
async function loadGuessTool(box) {
  const u = getCurrentUser();
  if (!u || !['admin', 'beta'].includes(u.role)) {
    box.innerHTML = '<div class="tool-modal__info">仅绝版内测人与管理员可用。</div>';
    return;
  }

  let schedule = null, nameMap = {};
  try {
    const sd = await apiRequest('/api/schedule');
    schedule = sd.schedule;
    const td = await fetchTeams().catch(() => ({ teams: [] }));
    (td.teams || []).forEach(t => { nameMap[t.short] = t.name; });
  } catch (err) {
    box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    return;
  }
  if (!schedule || !schedule.id) {
    box.innerHTML = '<h3 class="tool-modal__title">赛事竞猜 <em>BETA</em></h3><div class="tool-modal__info">尚未发布赛程，暂无竞猜。</div>';
    return;
  }

  let mine = { matches: [] };
  try { mine = await apiRequest('/api/guesses/mine?schedule_id=' + schedule.id); } catch (e) {}
  let lb = { leaderboard: [] };
  try { lb = await apiRequest('/api/guesses/leaderboard?schedule_id=' + schedule.id); } catch (e) {}
  let champ = null;
  try { champ = await apiRequest('/api/guesses/champion/mine?schedule_id=' + schedule.id); } catch (e) {}

  box.innerHTML = `
    <h3 class="tool-modal__title">赛事竞猜 <em>BETA</em></h3>
    <p class="tool-modal__sub">${sanitize(schedule.title || '当前赛程')} · 对已约赛的每场比赛预测胜方，比完按比分自动结算；另可预测本届冠军。</p>
    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>我的竞猜</h4><span class="tool-modal__count">个人战绩</span></div>
      <div id="myGuessBox">加载中…</div>
    </section>
    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>🏆 冠军竞猜</h4><span class="tool-modal__count">预测本届冠军</span></div>
      <div id="champBlock">加载中…</div>
    </section>
    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>对阵预测</h4><span class="tool-modal__count" id="guessCount">${(mine.matches || []).length} 场</span></div>
      <div class="guess-list" id="guessList"></div>
    </section>
    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>积分榜</h4></div>
      <ul class="tool-list" id="guessBoard"></ul>
    </section>
  `;

  renderMyGuess(box, mine.matches || [], nameMap);
  renderChampionBlock(box, champ, nameMap, schedule.id);
  renderGuessList(box, mine.matches || [], nameMap, schedule.id);
  renderGuessBoard(box, lb.leaderboard || []);
}

function renderMyGuess(box, matches, nameMap) {
  const el = box.querySelector('#myGuessBox');
  if (!el) return;
  const nm = (s) => nameMap[s] || s || '轮空';
  const mine = matches.filter(m => m.pick);
  const settled = mine.filter(m => m.is_finished);
  const correct = settled.filter(m => m.correct).length;
  const pending = mine.length - settled.length;
  const rate = settled.length ? Math.round((correct / settled.length) * 100) : null;

  if (!mine.length) {
    el.innerHTML = `
      <div class="guess-stats">
        <div class="guess-stats__item"><b>0</b><span>已参与</span></div>
        <div class="guess-stats__item"><b>0</b><span>猜中</span></div>
        <div class="guess-stats__item"><b>—</b><span>正确率</span></div>
      </div>
      <p class="tool-modal__info">你还没有提交竞猜，去下方「对阵预测」选一场吧。</p>
    `;
    return;
  }

  el.innerHTML = `
    <div class="guess-stats">
      <div class="guess-stats__item"><b>${mine.length}</b><span>已参与</span></div>
      <div class="guess-stats__item is-hit"><b>${correct}</b><span>猜中</span></div>
      <div class="guess-stats__item"><b>${pending}</b><span>待结算</span></div>
      <div class="guess-stats__item"><b>${rate === null ? '—' : rate + '%'}</b><span>正确率</span></div>
    </div>
    <ul class="my-guess">
      ${mine.map(m => `
        <li class="my-guess__row">
          <div class="my-guess__match">第 ${m.match_index + 1} 场</div>
          <div class="my-guess__vs">${sanitize(nm(m.team_a))} <em>VS</em> ${sanitize(nm(m.team_b))}</div>
          <div class="my-guess__pick">我选 <b>${sanitize(nm(m.pick))}</b></div>
          <div class="my-guess__status">
            ${m.is_finished
              ? (m.correct ? '<span class="guess-status is-correct">✓ 猜中</span>' : '<span class="guess-status is-wrong">✗ 未中</span>')
              : '<span class="guess-status is-pending">待结算</span>'}
          </div>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderChampionBlock(box, champ, nameMap, scheduleId) {
  const block = box.querySelector('#champBlock');
  if (!block) return;
  const settled = !!champ?.settled;
  const champion = champ?.champion || null;
  const myPick = champ?.pick || '';
  const teams = Object.keys(nameMap);
  const championName = champion ? (nameMap[champion] || champion) : '';

  let html;
  if (settled) {
    html = `
      <div class="champ-result">
        <div class="champ-result__line">🏆 本届冠军：<b>${sanitize(championName)}</b></div>
        <div class="champ-result__mine ${champ.correct ? 'is-correct' : 'is-wrong'}">
          ${myPick ? `你预测：${sanitize(nameMap[myPick] || myPick)} · ${champ.correct ? '✓ 猜中冠军' : '✗ 未中'}` : '你未参与冠军竞猜'}
        </div>
      </div>
    `;
  } else {
    html = `
      <div class="champ-form">
        <select id="champPick">
          <option value="">请选择预测的冠军队伍</option>
          ${teams.map(s => `<option value="${sanitize(s)}" ${myPick === s ? 'selected' : ''}>${sanitize(nameMap[s])}</option>`).join('')}
        </select>
        <button class="btn btn--primary btn--sm" id="champSave" type="button">${myPick ? '更新预测' : '提交'}</button>
      </div>
    `;
  }
  block.innerHTML = html;

  const save = block.querySelector('#champSave');
  if (save) {
    save.addEventListener('click', async () => {
      const pick = block.querySelector('#champPick').value;
      if (!pick) { showActionNotice('请选择预测的冠军队伍', true); return; }
      const orig = save.textContent;
      save.disabled = true;
      save.textContent = '提交中…';
      try {
        await apiRequest('/api/guesses/champion', { method: 'POST', body: JSON.stringify({ schedule_id: scheduleId, pick }) });
        showActionNotice('冠军预测已提交');
        await loadGuessTool(box);
      } catch (err) {
        showActionNotice(err.message || '提交失败', true);
        save.disabled = false;
        save.textContent = orig;
      }
    });
  }
}

function renderGuessList(box, matches, nameMap, scheduleId) {
  const list = box.querySelector('#guessList');
  const nm = (s) => nameMap[s] || s || '轮空';
  list.innerHTML = matches.map(m => {
    const aName = nm(m.team_a), bName = nm(m.team_b);
    const finished = m.is_finished;
    const booked = !!m.is_booked;
    const started = booked && !!m.start_time && new Date(m.start_time).getTime() <= Date.now();
    const scoreStr = finished ? `${m.score_a}:${m.score_b}` : '';
    const statusTag = finished
      ? (m.correct ? '<span class="guess-status is-correct">✓ 猜中</span>' : '<span class="guess-status is-wrong">✗ 未中</span>')
      : (booked && !started
          ? '<span class="guess-status is-open">已约赛 · 待开赛</span>'
          : booked ? '<span class="guess-status is-closed">已开赛 · 预测截止</span>' : '<span class="guess-status is-locked">待约赛</span>');
    const lockedText = booked ? '该场比赛已开始，预测已截止' : '该场尚未约赛，暂不能预测';
    return `
      <div class="guess-row">
        <div class="guess-row__vs">
          <b>${sanitize(aName)}</b><em>VS</em><b>${sanitize(bName)}</b>
          ${finished ? `<span class="guess-row__score">${sanitize(scoreStr)}</span>` : ''}
        </div>
        <div class="guess-row__pick">
          ${finished ? statusTag : (booked && !started ? `
            <label><input type="radio" name="guess_${m.match_index}" value="${sanitize(m.team_a)}" ${m.pick === m.team_a ? 'checked' : ''}> ${sanitize(aName)}</label>
            <label><input type="radio" name="guess_${m.match_index}" value="${sanitize(m.team_b)}" ${m.pick === m.team_b ? 'checked' : ''}> ${sanitize(bName)}</label>
            <button class="btn btn--primary btn--sm" data-guess-save="${m.match_index}" type="button">提交</button>
          ` : `<span class="guess-row__locked">${lockedText}</span>`)}
        </div>
      </div>
    `;
  }).join('') || '<div class="tool-list__empty">暂无对阵</div>';

  list.querySelectorAll('[data-guess-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mi = btn.dataset.guessSave;
      const sel = list.querySelector(`input[name="guess_${mi}"]:checked`);
      if (!sel) { showActionNotice('请先选择预测的队伍', true); return; }
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = '提交中…';
      try {
        await apiRequest('/api/guesses', {
          method: 'POST',
          body: JSON.stringify({ schedule_id: scheduleId, match_index: Number(mi), pick: sel.value })
        });
        showActionNotice('竞猜已提交');
        await loadGuessTool(box);
      } catch (err) {
        showActionNotice(err.message || '提交失败', true);
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
  });
}

/* 后台管理（仅管理员）：比分补录 + 竞猜结算 + 队伍管理入口 */
async function loadAdminHub(box) {
  const u = getCurrentUser();
  if (!u || u.role !== 'admin') {
    box.innerHTML = '<div class="tool-modal__info">仅管理员可用。</div>';
    return;
  }

  let schedule = null, appointments = [], nameMap = {}, lb = { leaderboard: [] };
  try {
    const sd = await apiRequest('/api/schedule');
    schedule = sd.schedule;
    if (!schedule || !schedule.matches) {
      box.innerHTML = '<div class="tool-modal__info">尚未发布赛程。</div>';
      return;
    }
    const appt = await apiRequest('/api/match-appointments?schedule_id=' + schedule.id).catch(() => ({ appointments: [] }));
    appointments = appt.appointments || [];
    const td = await fetchTeams().catch(() => ({ teams: [] }));
    (td.teams || []).forEach(t => { nameMap[t.short] = t.name; });
    lb = await apiRequest('/api/guesses/leaderboard?schedule_id=' + schedule.id).catch(() => ({ leaderboard: [] }));
  } catch (err) {
    box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    return;
  }

  const flatMatches = [];
  if (Array.isArray(schedule.matches)) flatMatches.push(...schedule.matches);
  else if (schedule.matches.rounds) schedule.matches.rounds.forEach(r => (r.matches || []).forEach(m => flatMatches.push(m)));
  const appointmentByIndex = new Map(appointments.map(a => [a.match_index, a]));

  const matchRows = flatMatches.map((m, i) => {
    const appt = appointmentByIndex.get(i);
    const aName = nameMap[m.a] || m.a || '轮空', bName = nameMap[m.b] || m.b || '轮空';
    const st = appt?.is_finished ? '已完赛' : appt ? '已约赛' : '待约赛';
    const sc = appt?.is_finished ? `${appt.score_a}:${appt.score_b}` : '—';
    return `<button class="adm-row" data-adm-match="${i}" type="button">
      <span class="adm-row__a">${sanitize(aName)}</span>
      <em class="adm-row__score">${sanitize(sc)}</em>
      <span class="adm-row__b">${sanitize(bName)}</span>
      <i class="adm-row__state">${st} ›</i>
    </button>`;
  }).join('') || '<div class="tool-list__empty">暂无对阵</div>';

  const board = lb.leaderboard || [];
  const lbHtml = board.length
    ? board.map((p, i) => `<li class="tool-list__item"><div class="tool-list__body"><div class="tool-list__title">#${i + 1} ${sanitize(p.username)}</div><div class="tool-list__meta"><span>猜中 <b>${p.correct}</b> / ${p.total} 场</span></div></div></li>`).join('')
    : '<li class="tool-list__empty">暂无竞猜记录</li>';

  box.innerHTML = `
    <h3 class="tool-modal__title">后台管理 <em>ADMIN</em></h3>
    <p class="tool-modal__sub">比分补录、竞猜结算与队伍管理集中入口。</p>
    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>比分补录</h4><span class="tool-modal__count">${flatMatches.length} 场</span></div>
      <div class="adm-list">${matchRows}</div>
      <p class="tool-modal__hint">点击某场补录比分，弹出该场详情（管理员可录入局比分）。</p>
    </section>
    <section class="tool-modal__section">
      <div class="tool-modal__section-head"><h4>竞猜结算</h4></div>
      <ul class="tool-list">${lbHtml}</ul>
    </section>
    <section class="tool-modal__section">
      <button class="btn btn--ghost btn--sm" id="admGoTeams" type="button">前往队伍管理 →</button>
    </section>
  `;

  box.querySelectorAll('[data-adm-match]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.admMatch);
      showMatchDetails(flatMatches[idx], appointmentByIndex.get(idx));
    });
  });
  const gt = box.querySelector('#admGoTeams');
  if (gt) gt.addEventListener('click', () => {
    document.querySelector('.tab[data-tab="teams"]')?.click();

  });
}

function renderGuessBoard(box, board) {
  const ul = box.querySelector('#guessBoard');
  if (!ul) return;
  if (!board.length) {
    ul.innerHTML = '<li class="tool-list__empty">暂无竞猜记录</li>';
    return;
  }
  ul.innerHTML = board.map((p, i) => `
    <li class="tool-list__item">
      <div class="tool-list__body">
        <div class="tool-list__title">#${i + 1} ${sanitize(p.username)}</div>
        <div class="tool-list__meta"><span>猜中 <b>${p.correct}</b> / ${p.total} 场</span></div>
      </div>
    </li>
  `).join('');
}

/* ============================================================
   初始化
============================================================ */
export function initTools() {
  // 工具已改为内嵌渲染（openToolInline），无需初始化弹窗
}

/* ============================================================
   工具注册（注册表模式）：mountTool / openToolInline 按 id 分发
============================================================ */
const toolsRegistry = new ToolsRegistry();
toolsRegistry.register('announcements', loadAnnouncementsTool);
toolsRegistry.register('draw', async (box) => { box.innerHTML = renderDrawTool(); bindDrawEvents(); loadDrawResult(); });
toolsRegistry.register('schedule', loadScheduleTool);
toolsRegistry.register('bindSchool', loadBindSchoolTool);
toolsRegistry.register('matchBooking', loadMatchBookingTool);
toolsRegistry.register('guess', loadGuessTool);
toolsRegistry.register('adminHub', loadAdminHub);

/* 兼容：暴露注册表，便于外部按需注册新工具 */
export { toolsRegistry };

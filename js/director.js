/* ============================================================
   导播页面 · 独立 HTML（面向 OBS 浏览器源）
   支持类型（?type=）：
   - cover      封面（默认）：双方 Logo + 名字
   - scoreboard 比分板：双方队伍 + 比分 + 状态（每 30s 自动刷新）
   - lineup     首发名单：双方求生/监管
   - staff      解说席：解说 + 裁判
   - next       下一场预告（每 30s 自动刷新）
   - countdown  倒计时（每秒更新）
   透明叠加（OBS 用）：加 &bg=transparent 使背景透明，仅叠加画面
   ============================================================ */

import { API_BASE } from './config.js';

/* ============ 配置 ============ */
const COVER_IMAGE = 'assets/director/cover.jpg';
const TEAM_LOGO_DIR = 'assets/loge/school/';
const TEAM_LOGO_EXT = '.jpg';
const REFRESH_MS = 30000;              // 比分 / 下一场自动刷新间隔
const COUNTDOWN_STEP_MS = 1000;        // 倒计时更新间隔
/* ============================ */

const app = document.getElementById('directorApp');
if (!app) {
  throw new Error('director.js 需要 #directorApp 容器');
}
const params = new URLSearchParams(location.search);
const scheduleId = params.get('schedule');
const matchIndex = params.get('match');
const type = (params.get('type') || 'cover').toLowerCase();
const isTransparent = params.get('bg') === 'transparent';

const TYPES = [
  { key: 'starting', name: '🏁 封面 · 即将开始', desc: '开场等待画面（绿幕=宣传片位）' },
  { key: 'staff',    name: '🎙️ 解说席',       desc: '解说头像 + 名单' }
];

let _refreshTimer = null;

const FIXED_URL_TYPES = ['starting', 'staff'];   /* 固定 URL 画面：不传 schedule/match 时自动取当前场次 */
if ((scheduleId && matchIndex !== null) || FIXED_URL_TYPES.includes(type)) {
  document.body.classList.toggle('is-transparent', isTransparent);
  renderOverlay(type, scheduleId !== null ? Number(scheduleId) : null, matchIndex !== null ? Number(matchIndex) : null);
} else {
  /* ---- 导播选择列表 ---- */
  renderList();
}

/* ============================================================
   列表页（OBS 画面选择器 · 两步：先选比赛 → 再选画面类型）
============================================================ */
async function renderList() {
  const baseUrl = location.origin + location.pathname.replace(/[^/]*$/, '');

  app.innerHTML = `
    <div class="dr-list">
      <header class="dr-list__head">
        <h1>🎬 导播画面 · OBS</h1>
        <p>先选择比赛，再生成该场的 OBS 画面</p>
      </header>

      <div class="dr-guide">
        <div class="dr-guide__title">OBS 使用步骤</div>
        <ol class="dr-guide__steps">
          <li>下方点击选择一场已约赛的比赛。</li>
          <li>在比赛页点击画面类型旁的「复制」。</li>
          <li>OBS → 来源 → <b>＋</b> → <b>浏览器</b> → 粘贴链接，宽度 1920、高度 1080。</li>
          <li>做字幕/比分叠加时，勾选浏览器的<b>「透明背景」</b>（或用页面开关让链接自带 <code>&amp;bg=transparent</code>）。</li>
          <li>比分板、下一场、倒计时会自动刷新，无需手动操作。</li>
        </ol>
      </div>

      <div class="dr-list__content" id="drListContent">
        <div class="dr-state">加载中…</div>
      </div>
    </div>
  `;

  const content = document.getElementById('drListContent');

  try {
    const [schedRes, teamRes, logoRes] = await Promise.all([
      fetch(API_BASE + '/api/schedule').then(r => r.json()),
      fetch(API_BASE + '/api/teams?basic=1').then(r => r.json()),
      fetch(API_BASE + '/api/team-logos').then(r => r.json()).catch(() => ({ teams: [] }))
    ]);

    const schedule = schedRes.schedule;
    if (!schedule || !schedule.matches) {
      content.innerHTML = '<div class="dr-state">当前没有已发布的赛程</div>';
      return;
    }

    const apptRes = await fetch(API_BASE + '/api/match-appointments?schedule_id=' + schedule.id).then(r => r.json());
    const appointments = apptRes.appointments || [];

    const teamMap = {};
    (teamRes.teams || []).forEach(t => { teamMap[t.short] = t; });
    const logoMap = {};
    (logoRes.teams || []).forEach(t => { if (t.short && t.logo) logoMap[t.short] = t.logo; });

    const flatMatches = [];
    if (Array.isArray(schedule.matches)) {
      schedule.matches.forEach((m, i) => flatMatches.push({ match: m, index: i }));
    } else if (schedule.matches.rounds) {
      let idx = 0;
      schedule.matches.rounds.forEach(r => {
        (r.matches || []).forEach(m => {
          flatMatches.push({ match: m, index: idx, roundIndex: r.index, roundName: r.name });
          idx++;
        });
      });
    }

    /* 仅展示「已约赛且未完赛」的比赛 */
    const booked = flatMatches.filter(fm => appointments.some(a => a.match_index === fm.index && !a.is_finished));
    if (!booked.length) {
      content.innerHTML = '<div class="dr-state">当前没有已约赛且未完赛的比赛</div>';
      return;
    }

    /* ---- 状态一：比赛选择 ---- */
    content.innerHTML = `
      <div class="dr-list__info">共 <b>${booked.length}</b> 场已约赛未完赛比赛 · 点击选择一场</div>
      <input class="dr-search" id="drSearch" type="text" placeholder="搜索学校 / 队名…" autocomplete="off">
      <div class="dr-list__grid">
        ${booked.map(({ match, index, roundIndex, roundName }) => {
          const appt = appointments.find(a => a.match_index === index);
          const aName = (teamMap[match.a] || {}).name || match.a;
          const bName = (teamMap[match.b] || {}).name || match.b;
          const timeStr = appt?.start_time ? formatTime(appt.start_time) : '时间待定';

          return `
            <div class="dr-card dr-card--pick" data-pick="${index}" data-name="${escapeHtml((aName + ' ' + bName).toLowerCase())}" role="button" tabindex="0">
              <div class="dr-card__head">
                <span class="dr-card__round">${roundIndex ? `第 ${roundIndex} 轮` : '赛程'} ${roundName ? '· ' + roundName : ''}</span>
                <span class="dr-card__time">${timeStr}</span>
              </div>
              <div class="dr-card__vs">
                <div class="dr-card__team">
                  <img src="${logoMap[match.a] || (teamMap[match.a] || {}).logo || (TEAM_LOGO_DIR + 'loge_' + match.a + TEAM_LOGO_EXT)}" onerror="this.style.visibility='hidden'">
                  <span>${escapeHtml(aName)}</span>
                </div>
                <em>VS</em>
                <div class="dr-card__team">
                  <img src="${logoMap[match.b] || (teamMap[match.b] || {}).logo || (TEAM_LOGO_DIR + 'loge_' + match.b + TEAM_LOGO_EXT)}" onerror="this.style.visibility='hidden'">
                  <span>${escapeHtml(bName)}</span>
                </div>
              </div>
              <div class="dr-card__pick-btn">🎬 生成画面</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    /* 搜索过滤卡片 */
    const searchInput = content.querySelector('#drSearch');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        content.querySelectorAll('.dr-card--pick').forEach(card => {
          card.style.display = q ? (card.dataset.name && card.dataset.name.includes(q) ? '' : 'none') : '';
        });
      });
    }

    content.querySelectorAll('[data-pick]').forEach(card => {
      card.addEventListener('click', () => {
        const index = Number(card.dataset.pick);
        showMatchTypes(schedule, appointments, teamMap, logoMap, baseUrl, index);
      });
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
  } catch (err) {
    content.innerHTML = '<div class="dr-state">加载失败：' + escapeHtml(err.message) + '</div>';
  }
}

/* ============================================================
   状态二：选中比赛 → 该场的画面类型列表
============================================================ */
function showMatchTypes(schedule, appointments, teamMap, logoMap, baseUrl, matchIndex) {
  const flatMatches = [];
  if (Array.isArray(schedule.matches)) {
    schedule.matches.forEach((m, i) => flatMatches.push({ match: m, index: i }));
  } else if (schedule.matches.rounds) {
    let idx = 0;
    schedule.matches.rounds.forEach(r => {
      (r.matches || []).forEach(m => {
        flatMatches.push({ match: m, index: idx, roundIndex: r.index, roundName: r.name });
        idx++;
      });
    });
  }
  const item = flatMatches.find(fm => fm.index === matchIndex);
  if (!item) return;

  const { match, index, roundIndex, roundName } = item;
  const appt = appointments.find(a => a.match_index === index);
  const aName = (teamMap[match.a] || {}).name || match.a;
  const bName = (teamMap[match.b] || {}).name || match.b;
  const timeStr = appt?.start_time ? formatTime(appt.start_time) : '时间待定';

  app.innerHTML = `
    <div class="dr-list">
      <header class="dr-list__head dr-list__head--back">
        <button class="dr-btn dr-btn--ghost" id="drBack" type="button">← 返回比赛列表</button>
        <h1><span class="dr-head-team">${escapeHtml(aName)}</span> <span class="dr-head-vs">VS</span> <span class="dr-head-team">${escapeHtml(bName)}</span></h1>
        <p>${roundIndex ? `第 ${roundIndex} 轮 · ` : ''}${timeStr} · 选择画面类型，复制链接到 OBS</p>
      </header>

      <div class="dr-toolbar">
        <label class="dr-toggle">
          <input type="checkbox" id="drTransparent">
          <span class="dr-toggle__track" aria-hidden="true"></span>
          <span class="dr-toggle__label">透明背景（叠加到直播画面上）</span>
        </label>
        <span class="dr-toolbar__hint">开启后链接自动带 <code>&amp;bg=transparent</code></span>
      </div>

      <div class="dr-list__content">
        <div class="dr-card">
          <div class="dr-card__types">
            ${TYPES.map(t => {
              const u = `${baseUrl}director.html?schedule=${schedule.id}&match=${index}&type=${t.key}`;
              return `
                <div class="dr-card__type-row" data-raw="${escapeHtml(u)}">
                  <span class="dr-card__type-name">${t.name}</span>
                  <span class="dr-card__type-desc">${t.desc}</span>
                  <input type="text" readonly value="${escapeHtml(u)}" onclick="this.select()">
                  <button class="dr-btn dr-btn--ghost dr-btn--tiny" data-action="copy">复制</button>
                  <button class="dr-btn dr-btn--ghost dr-btn--tiny" data-action="open">预览</button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  /* 返回 */
  document.getElementById('drBack').addEventListener('click', renderList);

  /* 透明开关：重算所有链接 */
  const transparent = document.getElementById('drTransparent');
  const refreshUrls = () => {
    document.querySelectorAll('.dr-card__type-row').forEach(row => {
      const input = row.querySelector('input');
      const raw = row.dataset.raw;
      input.value = transparent.checked ? raw + '&bg=transparent' : raw;
    });
  };
  transparent.addEventListener('change', refreshUrls);

  /* 复制 / 预览 */
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.dr-card__type-row');
      const input = row.querySelector('input');
      const action = btn.dataset.action;
      if (action === 'open') {
        window.open(input.value, '_blank');
      } else if (action === 'copy') {
        const ok = await copyText(input.value);
        const t = btn.textContent;
        btn.textContent = ok ? '✓ 已复制' : '复制失败';
        setTimeout(() => btn.textContent = t, 1400);
      }
    });
  });
}

/* ============================================================
   通用：加载比赛数据
============================================================ */
async function loadMatchData(scheduleId, matchIndex) {
  const [schedRes, apptRes, teamRes, logoRes] = await Promise.all([
    fetch(API_BASE + '/api/schedule').then(r => r.json()),
    fetch(API_BASE + '/api/match-appointments?schedule_id=' + (scheduleId != null ? scheduleId : '')).then(r => r.json()),
    fetch(API_BASE + '/api/teams?basic=1').then(r => r.json()),
    fetch(API_BASE + '/api/team-logos').then(r => r.json()).catch(() => ({ teams: [] }))
  ]);

  const schedule = schedRes.schedule;
  if (!schedule) throw new Error('赛程不存在');

  const flatMatches = [];
  if (Array.isArray(schedule.matches)) {
    schedule.matches.forEach(m => flatMatches.push(m));
  } else if (schedule.matches.rounds) {
    schedule.matches.rounds.forEach(r => (r.matches || []).forEach(m => flatMatches.push(m)));
  }
  if (!flatMatches.length) throw new Error('赛程中没有任何对阵');

  const appointments = apptRes.appointments || [];
  const apptByIndex = new Map(appointments.map(a => [a.match_index, a]));

  /* 未指定场次（固定 URL）时：自动取「当前」场次
     优先未完赛且有约赛的，否则取第一场 */
  let realIndex = matchIndex;
  if (realIndex === null) {
    const auto = flatMatches.findIndex((m, i) => {
      const a = apptByIndex.get(i);
      return a && !a.is_finished;
    });
    realIndex = auto >= 0 ? auto : 0;
  }

  const match = flatMatches[realIndex];
  if (!match) throw new Error('对阵不存在');

  const appt = apptByIndex.get(realIndex) || null;

  const teamMap = {};
  (teamRes.teams || []).forEach(t => { teamMap[t.short] = t; });
  const logoMap = {};
  (logoRes.teams || []).forEach(t => { if (t.short && t.logo) logoMap[t.short] = t.logo; });

  const aName = (teamMap[match.a] || {}).name || match.a;
  const bName = (teamMap[match.b] || {}).name || match.b;
  const aLogo = logoMap[match.a] || (teamMap[match.a] || {}).logo || (TEAM_LOGO_DIR + 'loge_' + match.a + TEAM_LOGO_EXT);
  const bLogo = logoMap[match.b] || (teamMap[match.b] || {}).logo || (TEAM_LOGO_DIR + 'loge_' + match.b + TEAM_LOGO_EXT);

  return { schedule, match, matchIndex: realIndex, appt, aName, bName, aLogo, bLogo, flatMatches };
}

/* ============================================================
   Overlay 路由
============================================================ */
async function renderOverlay(type, scheduleId, matchIndex) {
  app.innerHTML = `<div class="dr-stage dr-stage--loading"><div class="dr-stage__loading">加载中…</div></div>`;

  clearInterval(_refreshTimer); /* 清除旧画面定时器 */

  try {
    const data = await loadMatchData(scheduleId, matchIndex);

    const setRefresh = (fn, ms) => {
      _refreshTimer = setInterval(async () => {
        try {
          const d = await loadMatchData(scheduleId, matchIndex);
          fn(d);
        } catch (e) { /* 静默，下一轮再试 */ }
      }, ms);
    };

    if (type === 'starting') { renderStarting(data); return; }
    if (type === 'cover') { renderCover(data); return; }
    if (type === 'scoreboard') {
      renderScoreboard(data);
      setRefresh(d => renderScoreboard(d, true), REFRESH_MS);
      return;
    }
    if (type === 'lineup') { renderLineup(data); return; }
    if (type === 'staff') { renderStaff(data); return; }
    if (type === 'next') {
      renderNext(data);
      setRefresh(d => renderNext(d, true), REFRESH_MS);
      return;
    }
    if (type === 'countdown') { renderCountdown(data); return; }

    renderCover(data);
  } catch (err) {
    app.innerHTML = `
      <div class="dr-stage">
        <div class="dr-stage__error">
          <div class="dr-stage__error-title">加载失败</div>
          <div class="dr-stage__error-desc">${escapeHtml(err.message)}</div>
          <a href="director.html" class="dr-btn dr-btn--ghost" style="margin-top:16px;">← 返回列表</a>
        </div>
      </div>
    `;
  }
}

/* 画面右下角：OBS 类型角标（仅叠加时显示"透明"提示） */
function obsTag(typeKey, transparentHint = false) {
  const t = TYPES.find(x => x.key === typeKey);
  return `
    <div class="dr-obs-tag">
      ${t ? t.name : typeKey}
      ${isTransparent || transparentHint ? ' · <span class="dr-obs-tag__alpha">透明叠加</span>' : ''}
    </div>
  `;
}

/* ============================================================
   1. 即将开始（开场等待画面，整图 + 绿幕宣传片位 + 对阵队名）
   用法：OBS 中对本源加「色度键」滤镜抠掉右下角绿色，
        下方再叠一个宣传片视频源（对齐绿幕区域）。
============================================================ */
function renderStarting({ aName, bName }) {
  app.innerHTML = `
    <div class="dr-stage dr-stage--starting">
      <img class="dr-starting__bg" src="assets/director/starting.jpg" alt="即将开始">
      <span class="dr-starting__team dr-starting__team--a" data-lk="team-a">${escapeHtml(shortName(aName))}</span>
      <span class="dr-starting__team dr-starting__team--b" data-lk="team-b">${escapeHtml(shortName(bName))}</span>
      ${obsTag('starting')}
      ${backBtnHtml()}
    </div>
  `;
  applyLayout('starting');
}

/* ============================================================
   2. 封面
============================================================ */
function renderCover({ aName, bName, aLogo, bLogo }) {
  app.innerHTML = `
    <div class="dr-stage dr-stage--cover">
      <img class="dr-stage__cover" src="${COVER_IMAGE}" alt="" onerror="this.style.display='none'">
      <div class="dr-stage__team dr-stage__team--a">
        <img class="dr-stage__logo" src="${aLogo}" onerror="this.style.visibility='hidden'">
        <div class="dr-stage__name">${escapeHtml(aName)}</div>
      </div>
      <div class="dr-stage__team dr-stage__team--b">
        <img class="dr-stage__logo" src="${bLogo}" onerror="this.style.visibility='hidden'">
        <div class="dr-stage__name">${escapeHtml(bName)}</div>
      </div>
      ${obsTag('cover')}
      ${backBtnHtml()}
    </div>
  `;
}

/* ============================================================
   2. 比分板（30s 自动刷新）
============================================================ */
function renderScoreboard({ aName, bName, aLogo, bLogo, appt }, isRefresh = false) {
  const sa = appt?.score_a;
  const sb = appt?.score_b;
  const hasScore = appt?.is_finished && sa != null && sb != null;
  const status = appt?.is_finished ? '已完赛' : appt ? '进行中' : '待约赛';
  const statusClass = appt?.is_finished ? 'is-finished' : appt ? 'is-live' : 'is-pending';

  const rounds = appt?.rounds ? safeParse(appt.rounds) : null;

  const html = `
    <div class="dr-stage dr-stage--sb">
      <div class="dr-sb">
        <div class="dr-sb__team">
          <img class="dr-sb__logo" src="${aLogo}" onerror="this.style.visibility='hidden'">
          <div class="dr-sb__name">${escapeHtml(aName)}</div>
        </div>

        <div class="dr-sb__center">
          <div class="dr-sb__status ${statusClass}">${status}</div>
          <div class="dr-sb__score">
            <span class="dr-sb__num">${hasScore ? sa : '–'}</span>
            <em>:</em>
            <span class="dr-sb__num">${hasScore ? sb : '–'}</span>
          </div>
          ${rounds && rounds.length ? `
            <div class="dr-sb__rounds">
              ${rounds.map((r, i) => {
                const ta = (r.first?.a || 0) + (r.second?.a || 0);
                const tb = (r.first?.b || 0) + (r.second?.b || 0);
                return `<span class="dr-sb__round-pill">第 ${i + 1} 局 <b>${ta}:${tb}</b></span>`;
              }).join('')}
            </div>
          ` : ''}
        </div>

        <div class="dr-sb__team">
          <img class="dr-sb__logo" src="${bLogo}" onerror="this.style.visibility='hidden'">
          <div class="dr-sb__name">${escapeHtml(bName)}</div>
        </div>
      </div>
      ${obsTag('scoreboard')}
      ${backBtnHtml()}
    </div>
  `;

  if (isRefresh) {
    app.querySelector('.dr-sb').innerHTML = app.querySelector('.dr-sb').innerHTML; /* 保留外壳避免闪烁 */
    app.querySelector('.dr-sb').outerHTML = app.querySelector('.dr-sb').outerHTML;
  }
  app.innerHTML = html;
}

/* ============================================================
   3. 首发名单
============================================================ */
function renderLineup({ schedule, match, matchIndex, aName, bName, aLogo, bLogo }) {
  app.innerHTML = `
    <div class="dr-stage dr-stage--lineup">
      <div class="dr-lu-state">加载首发…</div>
      ${backBtnHtml()}
    </div>
  `;

  const loadLineups = fetch(API_BASE + '/api/match-lineups?schedule_id=' + schedule.id).then(r => r.json());

  loadLineups.then(data => {
    const lineups = data.lineups || [];
    const lineupA = lineups.find(l => l.match_index === matchIndex && l.school === match.a);
    const lineupB = lineups.find(l => l.match_index === matchIndex && l.school === match.b);

    Promise.all([
      fetch(API_BASE + '/api/team/players?school=' + encodeURIComponent(match.a)).then(r => r.json()).catch(() => ({ players: [] })),
      fetch(API_BASE + '/api/team/players?school=' + encodeURIComponent(match.b)).then(r => r.json()).catch(() => ({ players: [] }))
    ]).then(([pa, pb]) => {
      const playersA = pa.players || [];
      const playersB = pb.players || [];

      const formatLineup = (lineup, players) => {
        if (!lineup) return '<div class="dr-lu__pending">尚未提交首发</div>';
        let starters;
        try { starters = JSON.parse(lineup.starters); } catch { return '<div class="dr-lu__pending">数据异常</div>'; }
        const nameMap = new Map(players.map(p => [Number(p.id), p]));
        const pick = (id) => {
          const p = nameMap.get(Number(id));
          return p ? `${escapeHtml(p.name)}${p.cn_short ? `（${escapeHtml(p.cn_short)}）` : ''}` : '未知';
        };
        const survivors = (starters.survivors || []).map(pick);
        const hunter = starters.hunter ? pick(starters.hunter) : '—';
        return `
          <div class="dr-lu__group">
            <div class="dr-lu__group-title">求生者</div>
            <ul class="dr-lu__players">${survivors.map(n => `<li>${n}</li>`).join('')}</ul>
          </div>
          <div class="dr-lu__group">
            <div class="dr-lu__group-title">监管者</div>
            <ul class="dr-lu__players"><li>${hunter}</li></ul>
          </div>
        `;
      };

      app.innerHTML = `
        <div class="dr-stage dr-stage--lineup">
          <div class="dr-lu">
            <div class="dr-lu__side">
              <div class="dr-lu__team">
                <img src="${aLogo}" onerror="this.style.visibility='hidden'">
                <span>${escapeHtml(aName)}</span>
              </div>
              ${formatLineup(lineupA, playersA)}
            </div>
            <div class="dr-lu__divider">VS</div>
            <div class="dr-lu__side">
              <div class="dr-lu__team">
                <img src="${bLogo}" onerror="this.style.visibility='hidden'">
                <span>${escapeHtml(bName)}</span>
              </div>
              ${formatLineup(lineupB, playersB)}
            </div>
          </div>
          ${obsTag('lineup')}
          ${backBtnHtml()}
        </div>
      `;
    });
  }).catch(err => {
    app.innerHTML = `<div class="dr-stage"><div class="dr-stage__error"><div class="dr-stage__error-title">加载失败</div><div class="dr-stage__error-desc">${escapeHtml(err.message)}</div></div></div>`;
  });
}

/* ============================================================
   4. 解说席（解说.jpg 模板背景 + 中心框左右头像/名单）
   参考效果：解说左右分列（头像 + 下方名字），裁判单独一行
   头像可选：&avatars=图1url,图2url（解说）、&judge_av=url（裁判）
============================================================ */
async function renderStaff({ appt }) {
  const q = new URLSearchParams(location.search);
  const avatars = (q.get('avatars') || '').split(',').map(s => s.trim()).filter(Boolean);
  const judgeAv = (q.get('judge_av') || '').trim();

  const signups = appt?.signups || [];
  const commentators = signups.filter(s => s.role === 'commentator');

  /* 从主站账号头像联动（用户名 → 头像），作为 URL 参数之外的兜底 */
  const avatarByName = {};
  try {
    const res = await fetch(API_BASE + '/api/staff');
    const j = await res.json();
    (j.staff || []).forEach(s => {
      if (s.username && s.avatar) avatarByName[s.username] = s.avatar;
    });
  } catch (e) { /* 头像兜底失败时回退首字母 */ }

  const person = (s, av) => {
    const src = av || avatarByName[s.username] || '';
    return `
      <div class="dr-staff__person">
        ${src
          ? `<img class="dr-staff__avatar" src="${src}" alt="" onerror="this.style.display='none'">`
          : `<div class="dr-staff__avatar dr-staff__avatar--ph">${escapeHtml((s.username || '解')[0])}</div>`}
        <span class="dr-staff__pname">${escapeHtml(s.username)}</span>
      </div>
    `;
  };

  const commRow = commentators.length
    ? `<div class="dr-staff__row" data-lk="comm">${commentators.map((s, i) => person(s, avatars[i])).join('')}</div>`
    : '<div class="dr-staff__row" data-lk="comm"><div class="dr-staff__empty">解说待定</div></div>';

  app.innerHTML = `
    <div class="dr-stage dr-stage--staff">
      <img class="dr-staff__bg" src="assets/director/staff-bg.jpg" alt="解说席">
      ${commRow}
      ${obsTag('staff')}
      ${backBtnHtml()}
    </div>
  `;
  applyLayout('staff');
  /* 应用解说头像大小（编辑器滑块保存的值，单位 vh） */
  try {
    const m = JSON.parse(localStorage.getItem('directorLayout') || 'null');
    const av = m && m.staff && m.staff.av;
    if (av) app.querySelector('.dr-stage--staff').style.setProperty('--dr-av', av + 'vh');
  } catch {}
}

/* ============================================================
   5. 下一场预告（30s 自动刷新）
============================================================ */
function renderNext({ schedule, matchIndex, flatMatches }) {
  const apptPromise = fetch(API_BASE + '/api/match-appointments?schedule_id=' + schedule.id).then(r => r.json());

  apptPromise.then(apptData => {
    const appts = apptData.appointments || [];
    const apptByIndex = new Map(appts.map(a => [a.match_index, a]));

    const next = flatMatches
      .map((m, i) => ({ match: m, index: i, appt: apptByIndex.get(i) }))
      .filter(x => x.index !== matchIndex && x.match.a && x.match.b && !x.appt?.is_finished && x.appt?.start_time)
      .sort((a, b) => new Date(a.appt.start_time) - new Date(b.appt.start_time))[0];

    if (!next) {
      app.innerHTML = `
        <div class="dr-stage dr-stage--next">
          <div class="dr-next">
            <div class="dr-next__title">下一场预告</div>
            <div class="dr-next__empty">暂无下一场比赛</div>
          </div>
          ${obsTag('next')}
          ${backBtnHtml()}
        </div>
      `;
      return;
    }

    fetch(API_BASE + '/api/teams?basic=1').then(r => r.json()).then(td => {
      const nameMap = {};
      (td.teams || []).forEach(t => { nameMap[t.short] = t.name || t.short; });
      const aName = nameMap[next.match.a] || next.match.a;
      const bName = nameMap[next.match.b] || next.match.b;
      const timeStr = formatTime(next.appt.start_time);

      app.innerHTML = `
        <div class="dr-stage dr-stage--next">
          <div class="dr-next">
            <div class="dr-next__title">下一场预告</div>
            <div class="dr-next__time">${escapeHtml(timeStr)}</div>
            <div class="dr-next__vs">
              <span>${escapeHtml(aName)}</span>
              <em>VS</em>
              <span>${escapeHtml(bName)}</span>
            </div>
          </div>
          ${obsTag('next')}
          ${backBtnHtml()}
        </div>
      `;
    });
  });
}

/* ============================================================
   6. 倒计时（每秒更新）
============================================================ */
function renderCountdown({ aName, bName, appt }) {
  const targetTime = appt?.start_time ? new Date(appt.start_time).getTime() : 0;
  const isFinished = !!appt?.is_finished;

  app.innerHTML = `
    <div class="dr-stage dr-stage--countdown">
      <div class="dr-cd">
        <div class="dr-cd__title">${isFinished ? '比赛已结束' : '距开赛'}</div>
        <div class="dr-cd__timer" id="drCdTimer">--:--:--</div>
        <div class="dr-cd__vs">
          <span>${escapeHtml(aName)}</span>
          <em>VS</em>
          <span>${escapeHtml(bName)}</span>
        </div>
      </div>
      ${obsTag('countdown')}
      ${backBtnHtml()}
    </div>
  `;

  const timerEl = document.getElementById('drCdTimer');
  if (!timerEl) return;

  function update() {
    if (!targetTime || isFinished) {
      timerEl.textContent = isFinished ? 'END' : '待定';
      return;
    }
    const diff = targetTime - Date.now();
    if (diff <= 0) {
      timerEl.textContent = '00:00:00';
      return;
    }
    const totalSec = Math.floor(diff / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = n => String(n).padStart(2, '0');
    timerEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  update();
  setInterval(update, COUNTDOWN_STEP_MS);
}

/* ============================================================
   布局应用：读取 localStorage 中拖拽编辑器保存的自定义位置
   localStorage['directorLayout'] = { 类型: { data-lk: {x,y} } }
============================================================ */
function applyLayout(type) {
  if (typeof localStorage === 'undefined') return;
  let layout = null;
  try { layout = JSON.parse(localStorage.getItem('directorLayout') || 'null'); } catch {}
  const m = layout && layout[type];
  if (!m) return;
  app.querySelectorAll('[data-lk]').forEach(el => {
    const p = m[el.dataset.lk];
    if (!p) return;
    if (p.x != null) el.style.left = p.x + '%';
    if (p.y != null) el.style.top = p.y + '%';
  });
}

/* ============================================================
   工具
============================================================ */
/* 去掉队名末尾的「大学」两个字，如 上海XX大学 → 上海XX */
function shortName(name) {
  return String(name || '').replace(/大学$/, '');
}

function backBtnHtml() {
  return `<div class="dr-stage__toolbar"><a href="director.html" class="dr-stage__back">← 返回列表</a></div>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[<>&"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;'
  }[c]));
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}`;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/* ============================================================
   我的比赛（独立页面）
   筛选规则：
   - 队伍队长：自己队伍参与的对阵
   - 裁判 / 解说：自己报名过的比赛
   - 管理员：全部比赛
   - 无相关内容 → "暂时没有与我相关的比赛"
============================================================ */

import { apiRequest, getCurrentUser } from './api.js';
import { sanitize, formatBeijing } from './utils.js';
import { parseTournament } from './tournament.js';
import { fetchTeams, showActionNotice } from './content.js';

let __prevActivePanel = null;

/* ============================================================
   打开 / 关闭页面
============================================================ */
export async function openMyMatchesPage() {
  const page = document.getElementById('myMatchesPage');
  if (!page) {
    console.error('[我的比赛] #myMatchesPage 不存在，请检查 index.html');
    return;
  }

  const activePanel = document.querySelector('.panel.is-active');
  if (activePanel) __prevActivePanel = activePanel.dataset.panel;

  document.querySelectorAll('.panel').forEach(p => p.classList.remove('is-active'));
  page.hidden = false;
  document.body.style.overflow = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  await renderMyMatches();
}

function closeMyMatchesPage() {
  const page = document.getElementById('myMatchesPage');
  if (!page) return;
  page.hidden = true;
  const target = __prevActivePanel || 'home';
  const panel = document.querySelector(`.panel[data-panel="${target}"]`);
  if (panel) panel.classList.add('is-active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   主渲染
============================================================ */
async function renderMyMatches() {
  const content = document.getElementById('myMatchesContent');
  if (!content) return;

  content.innerHTML = '<div class="board__state" style="padding:60px 20px">加载中…</div>';

  const user = getCurrentUser();

  /* 未登录 */
  if (!user) {
    content.innerHTML = `
      <div class="my-matches-empty">
        <div class="my-matches-empty__icon">🔒</div>
        <div class="my-matches-empty__title">请先登录</div>
        <div class="my-matches-empty__desc">登录后可以查看与你相关的比赛</div>
        <button class="btn btn--primary btn--sm" id="myMatchesLoginBtn" type="button">去登录</button>
      </div>
    `;
    document.getElementById('myMatchesLoginBtn')?.addEventListener('click', () => {
      closeMyMatchesPage();
      setTimeout(() => document.getElementById('accountBtn')?.click(), 200);
    });
    return;
  }

  /* 拉取赛程 + 队伍绑定 */
  let schedule = null;
  let mySchool = null;

  try {
    const tasks = [apiRequest('/api/schedule').catch(() => ({}))];
    if (user.role === 'team') {
      tasks.push(apiRequest('/api/team/school').catch(() => ({})));
    }
    const results = await Promise.all(tasks);
    schedule = results[0].schedule;
    if (user.role === 'team') mySchool = results[1].profile?.school || null;
  } catch (err) {
    content.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    return;
  }

  /* 没有赛程 */
  if (!schedule || !schedule.matches) {
    content.innerHTML = `
      <div class="my-matches-empty">
        <div class="my-matches-empty__icon">📭</div>
        <div class="my-matches-empty__title">暂时没有与我相关的比赛</div>
        <div class="my-matches-empty__desc">管理员尚未发布赛程</div>
      </div>
    `;
    return;
  }

  /* 拉取约赛记录 + 首发记录 */
  const [appointmentData, lineupData] = await Promise.all([
    apiRequest(`/api/match-appointments?schedule_id=${schedule.id}`).catch(() => ({ appointments: [] })),
    apiRequest(`/api/match-lineups?schedule_id=${schedule.id}`).catch(() => ({ lineups: [] }))
  ]);
  const appointments = appointmentData.appointments || [];
  const lineups = lineupData.lineups || [];

  /* 扁平化对阵 */
  const tournament = parseTournament(schedule.matches);
  const flatMatches = tournament ? tournament.allMatches : (Array.isArray(schedule.matches) ? schedule.matches : []);

  /* 队伍名称 */
  const teamNames = {};
  try {
    const td = await fetchTeams();
    (td.teams || []).forEach(t => { teamNames[t.short] = t.name || t.short; });
  } catch {}

  /* 队伍绑定检查 */
  if (user.role === 'team' && !mySchool) {
    content.innerHTML = `
      <div class="my-matches-empty">
        <div class="my-matches-empty__icon">🏫</div>
        <div class="my-matches-empty__title">尚未绑定队伍</div>
        <div class="my-matches-empty__desc">请先到「队伍信息 → 我的队伍」绑定学校，才能看到相关比赛</div>
      </div>
    `;
    return;
  }

  /* ============================================================
     筛选与用户相关的比赛
  ============================================================ */
  const related = flatMatches
    .map((m, i) => ({
      match: m,
      index: i,
      appointment: appointments.find(a => a.match_index === i),
      roundIndex: m.roundIndex,
      roundName: m.roundName
    }))
    .filter(item => {
      if (!item.match.a || !item.match.b) return false;

      /* 队长：自己队伍参与的对阵 */
      if (user.role === 'team') {
        return item.match.a === mySchool || item.match.b === mySchool;
      }

      /* 管理员：全部 */
      if (user.role === 'admin') return true;

      /* 裁判 / 解说：自己报名过的比赛 */
      if (user.role === 'judge' || user.role === 'commentator') {
        const signups = item.appointment?.signups || [];
        return signups.some(s => s.is_mine);
      }

      return false;
    });

  /* 无相关比赛 */
  if (!related.length) {
    content.innerHTML = `
      <div class="my-matches-empty">
        <div class="my-matches-empty__icon">📭</div>
        <div class="my-matches-empty__title">暂时没有与我相关的比赛</div>
        <div class="my-matches-empty__desc">${emptyHint(user.role)}</div>
      </div>
    `;
    document.getElementById('myMatchesBackBtn')?.addEventListener('click', closeMyMatchesPage, { once: true });
    return;
  }

  /* ============================================================
     拉取选手名单（队长需要自己队伍；其他人需要双方）
  ============================================================ */
  const needSchools = new Set();
  related.forEach(item => {
    needSchools.add(item.match.a);
    needSchools.add(item.match.b);
  });

  const playersMap = {};
  if (user.role === 'team' && mySchool) {
    try {
      const pd = await apiRequest('/api/team/players');
      playersMap[mySchool] = (pd.players || []).filter(p => !p.is_coach);
    } catch { playersMap[mySchool] = []; }
  } else {
    await Promise.all([...needSchools].map(async (s) => {
      try {
        const pd = await apiRequest('/api/team/players?school=' + encodeURIComponent(s));
        playersMap[s] = (pd.players || []).filter(p => !p.is_coach);
      } catch { playersMap[s] = []; }
    }));
  }

  /* 首发 map */
  const lineupMap = new Map();
  lineups.forEach(l => lineupMap.set(`${l.match_index}-${l.school}`, l));

  /* ============================================================
     渲染
  ============================================================ */
  if (user.role === 'team' && mySchool) {
    /* 队长视角 */
    const submittedCount = related.filter(item => lineupMap.has(`${item.index}-${mySchool}`)).length;
    content.innerHTML = `
      <div class="my-matches-summary">
        共 <b>${related.length}</b> 场相关比赛 · 已提交首发 <b>${submittedCount}</b> 场
      </div>
      <div class="my-matches-list">
        ${related.map(item => renderTeamCard(item, mySchool, teamNames, playersMap[mySchool] || [], lineupMap.get(`${item.index}-${mySchool}`))).join('')}
      </div>
    `;
    bindTeamSubmit(content, schedule.id);
  } else {
    /* 裁判 / 解说 / 管理员视角 */
    const roleHint = user.role === 'judge' ? '裁判' : user.role === 'commentator' ? '解说' : '管理员';
    const titleHint = user.role === 'admin' ? `共 ${related.length} 场比赛` : `已报名 ${related.length} 场比赛`;
    content.innerHTML = `
      <div class="my-matches-summary">
        ${titleHint} · ${roleHint}视角
      </div>
      <div class="my-matches-list">
        ${related.map(item => renderViewCard(item, teamNames, playersMap, lineupMap)).join('')}
      </div>
    `;
  }

  document.getElementById('myMatchesBackBtn')?.addEventListener('click', closeMyMatchesPage, { once: true });
}

function emptyHint(role) {
  if (role === 'team') return '赛程中暂无你队伍参与的对阵';
  if (role === 'judge') return '你还没有在比赛详情里报名裁判';
  if (role === 'commentator') return '你还没有在比赛详情里报名解说';
  return '暂无数据';
}

/* ============================================================
   队长卡片 · 可编辑首发
============================================================ */
function renderTeamCard(item, mySchool, teamNames, players, lineup) {
  const aName = teamNames[item.match.a] || item.match.a;
  const bName = teamNames[item.match.b] || item.match.b;
  const mySide = item.match.a === mySchool ? 'a' : 'b';

  let starters = { survivors: [null, null, null, null], hunter: null };
  let submitted = false;
  let submittedAt = '';
  if (lineup) {
    try {
      const s = JSON.parse(lineup.starters);
      if (Array.isArray(s.survivors) && s.survivors.length === 4) starters.survivors = s.survivors;
      starters.hunter = s.hunter;
      submitted = true;
      submittedAt = lineup.updated_at ? formatBeijing(lineup.updated_at) : '';
    } catch {}
  }

  const survivors = players.filter(p => p.position === '求生' || p.position === '双边');
  const hunters = players.filter(p => p.position === '监管' || p.position === '双边');

  const survivorOpts = (selectedId) => `
    <option value="">-- 选择 --</option>
    ${survivors.map(p => `<option value="${p.id}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${sanitize(p.name)}${p.cn_short ? '（' + sanitize(p.cn_short) + '）' : ''}</option>`).join('')}
  `;
  const hunterOpts = (selectedId) => `
    <option value="">-- 选择 --</option>
    ${hunters.map(p => `<option value="${p.id}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${sanitize(p.name)}${p.cn_short ? '（' + sanitize(p.cn_short) + '）' : ''}</option>`).join('')}
  `;

  const timeStr = item.appointment?.start_time ? formatBeijing(item.appointment.start_time) : '待定';
  const status = item.appointment?.is_finished ? '已完赛' : item.appointment ? '已约赛' : '待约赛';
  const roundLabel = item.roundIndex ? `第 ${item.roundIndex} 轮 · ${item.roundName}` : '';

  return `
    <article class="my-match-card" data-match-index="${item.index}">
      <div class="my-match-card__head">
        <span class="my-match-card__round">${sanitize(roundLabel)}</span>
        <span class="my-match-card__status ${item.appointment?.is_finished ? 'is-finished' : item.appointment ? 'is-scheduled' : ''}">${status} · ${sanitize(timeStr)}</span>
      </div>
      <div class="my-match-card__vs">
        <span class="my-match-card__team ${mySide === 'a' ? 'is-mine' : ''}">${sanitize(aName)}</span>
        <em>VS</em>
        <span class="my-match-card__team ${mySide === 'b' ? 'is-mine' : ''}">${sanitize(bName)}</span>
      </div>

      ${players.length ? `
        <div class="my-match-lineup">
          <div class="my-match-lineup__title">
            <span>我的首发</span>
            ${submitted
              ? `<span class="my-match-lineup__meta">已提交 · ${sanitize(submittedAt)}</span>`
              : '<span class="my-match-lineup__meta my-match-lineup__meta--pending">未提交</span>'}
          </div>

          <div class="lineup-grid">
            <div class="lineup-slot">
              <label>求生者 1</label>
              <select class="lineup-survivor">${survivorOpts(starters.survivors[0])}</select>
            </div>
            <div class="lineup-slot">
              <label>求生者 2</label>
              <select class="lineup-survivor">${survivorOpts(starters.survivors[1])}</select>
            </div>
            <div class="lineup-slot">
              <label>求生者 3</label>
              <select class="lineup-survivor">${survivorOpts(starters.survivors[2])}</select>
            </div>
            <div class="lineup-slot">
              <label>求生者 4</label>
              <select class="lineup-survivor">${survivorOpts(starters.survivors[3])}</select>
            </div>
            <div class="lineup-slot lineup-slot--hunter">
              <label>监管者</label>
              <select class="lineup-hunter">${hunterOpts(starters.hunter)}</select>
            </div>
          </div>

          <div class="lineup-actions">
            <button class="btn btn--primary btn--sm lineup-submit" type="button">${submitted ? '更新首发' : '提交首发'}</button>
            <span class="lineup-msg" role="status" aria-live="polite"></span>
          </div>
        </div>
      ` : `
        <div class="my-match-lineup my-match-lineup--empty">
          尚未提交选手名单，请先到「队伍信息 → 我的队伍」提交选手名单
        </div>
      `}
    </article>
  `;
}

/* ============================================================
   裁判 / 解说 / 管理员卡片 · 只读
============================================================ */
function renderViewCard(item, teamNames, playersMap, lineupMap) {
  const aName = teamNames[item.match.a] || item.match.a;
  const bName = teamNames[item.match.b] || item.match.b;
  const timeStr = item.appointment?.start_time ? formatBeijing(item.appointment.start_time) : '待定';
  const status = item.appointment?.is_finished ? '已完赛' : item.appointment ? '已约赛' : '待约赛';
  const roundLabel = item.roundIndex ? `第 ${item.roundIndex} 轮 · ${item.roundName}` : '';

  const lineupA = lineupMap.get(`${item.index}-${item.match.a}`);
  const lineupB = lineupMap.get(`${item.index}-${item.match.b}`);

  const formatLineup = (lineup, school) => {
    if (!lineup) return '<span class="lineup-view__pending">⚠ 未提交</span>';
    try {
      const s = JSON.parse(lineup.starters);
      const players = playersMap[school] || [];
      const nameMap = new Map(players.map(p => [p.id, p]));
      const survivors = (s.survivors || []).map(id => {
        const p = nameMap.get(Number(id));
        return p ? sanitize(p.name) + (p.cn_short ? `（${sanitize(p.cn_short)}）` : '') : '未知';
      });
      const hunter = nameMap.get(Number(s.hunter));
      const hunterStr = hunter ? sanitize(hunter.name) + (hunter.cn_short ? `（${sanitize(hunter.cn_short)}）` : '') : '未知';
      return `
        <div class="lineup-view__row"><span>求生者</span><b>${survivors.join('、') || '—'}</b></div>
        <div class="lineup-view__row"><span>监管者</span><b>${hunterStr}</b></div>
      `;
    } catch { return '<span class="lineup-view__pending">⚠ 数据异常</span>'; }
  };

  return `
    <article class="my-match-card">
      <div class="my-match-card__head">
        <span class="my-match-card__round">${sanitize(roundLabel)}</span>
        <span class="my-match-card__status ${item.appointment?.is_finished ? 'is-finished' : item.appointment ? 'is-scheduled' : ''}">${status} · ${sanitize(timeStr)}</span>
      </div>
      <div class="my-match-card__vs">
        <span class="my-match-card__team">${sanitize(aName)}</span>
        <em>VS</em>
        <span class="my-match-card__team">${sanitize(bName)}</span>
      </div>

      <div class="lineup-view-grid">
        <div class="lineup-view">
          <div class="lineup-view__title">${sanitize(aName)} 首发</div>
          ${formatLineup(lineupA, item.match.a)}
        </div>
        <div class="lineup-view">
          <div class="lineup-view__title">${sanitize(bName)} 首发</div>
          ${formatLineup(lineupB, item.match.b)}
        </div>
      </div>
    </article>
  `;
}

/* ============================================================
   队长提交事件
============================================================ */
function bindTeamSubmit(content, scheduleId) {
  content.querySelectorAll('.my-match-card').forEach(card => {
    const submitBtn = card.querySelector('.lineup-submit');
    if (!submitBtn) return;
    const matchIndex = Number(card.dataset.matchIndex);
    const msg = card.querySelector('.lineup-msg');

    submitBtn.addEventListener('click', async () => {
      const survivors = [...card.querySelectorAll('.lineup-survivor')].map(s => s.value);
      const hunter = card.querySelector('.lineup-hunter').value;

      if (survivors.some(v => !v)) { showActionNotice('请选择 4 名求生者', true); if (msg) msg.textContent = '请选择完整的 4 名求生者'; return; }
      if (!hunter) { showActionNotice('请选择 1 名监管者', true); if (msg) msg.textContent = '请选择监管者'; return; }

      const allIds = [...survivors.map(Number), Number(hunter)];
      if (new Set(allIds).size !== allIds.length) {
        showActionNotice('不能重复选择同一位选手', true);
        if (msg) msg.textContent = '不能重复选择同一位选手';
        return;
      }

      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = '提交中…';
      if (msg) msg.textContent = '';

      try {
        await apiRequest('/api/match-lineups', {
          method: 'POST',
          body: JSON.stringify({
            schedule_id: scheduleId,
            match_index: matchIndex,
            starters: {
              survivors: survivors.map(Number),
              hunter: Number(hunter)
            }
          })
        });
        showActionNotice('首发已提交');
        if (msg) msg.textContent = '✅ 已提交';
        submitBtn.textContent = '更新首发';
      } catch (err) {
        showActionNotice(err.message, true);
        if (msg) msg.textContent = err.message;
        submitBtn.textContent = originalText;
      } finally {
        submitBtn.disabled = false;
      }
    });
  });
}

/* ============================================================
   双保险：自己挂到 window，避免 main.js 未更新
============================================================ */
window.__openMyMatchesPage = openMyMatchesPage;
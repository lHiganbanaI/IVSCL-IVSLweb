/* ============================================================
   首发名单公开页
   - 支持 ?schedule=X 查看指定赛程
   - 支持 ?team=XXX 只看某队
   - 支持 ?match=N 只看某场
============================================================ */

import { API_BASE, TEAM_LOGO_DIR, TEAM_LOGO_EXT } from './config.js';

const params = new URLSearchParams(location.search);
const filterSchedule = params.get('schedule');
const filterTeam = params.get('team');
const filterMatch = params.get('match');
const isSingleMatch = filterMatch !== null && filterSchedule;

const content = document.getElementById('luContent');
const search = document.getElementById('luSearch');
const filterSel = document.getElementById('luFilter');
const countEl = document.getElementById('luCount');
const titleEl = document.getElementById('luTitle');
const subEl = document.getElementById('luSub');

init();

async function init() {
  try {
    const [schedRes, teamRes] = await Promise.all([
      fetch(API_BASE + '/api/schedule').then(r => r.json()),
      fetch(API_BASE + '/api/teams?basic=1').then(r => r.json())
    ]);

    const schedule = schedRes.schedule;
    if (!schedule || !schedule.matches) {
      content.innerHTML = '<div class="lu-state">暂无赛程</div>';
      return;
    }

    const [apptRes, lineupRes, staffRes] = await Promise.all([
      fetch(API_BASE + `/api/match-appointments?schedule_id=${schedule.id}`).then(r => r.json()),
      fetch(API_BASE + `/api/match-lineups?schedule_id=${schedule.id}`).then(r => r.json()),
      fetch(API_BASE + '/api/staff').then(r => r.json()).catch(() => ({ staff: [] }))
    ]);

    const appointments = apptRes.appointments || [];
    const lineups = lineupRes.lineups || [];

    const teamMap = {};
    (teamRes.teams || []).forEach(t => { teamMap[t.short] = t; });

    /* 扁平化 */
    const flatMatches = [];
    if (Array.isArray(schedule.matches)) {
      schedule.matches.forEach((m, i) => flatMatches.push({ match: m, index: i, roundIndex: null, roundName: '' }));
    } else if (schedule.matches.rounds) {
      let idx = 0;
      schedule.matches.rounds.forEach(r => {
        (r.matches || []).forEach(m => {
          flatMatches.push({ match: m, index: idx, roundIndex: r.index, roundName: r.name });
          idx++;
        });
      });
    }

    /* 只显示已约赛的，或指定单场 */
    let display = [];
    if (isSingleMatch) {
      const target = flatMatches.find(m => m.index === Number(filterMatch));
      if (target) display = [target];
    } else {
      display = flatMatches.filter(m => appointments.some(a => a.match_index === m.index));
      if (filterTeam) {
        display = display.filter(m => m.match.a === filterTeam || m.match.b === filterTeam);
      }
    }

    if (!display.length) {
      content.innerHTML = '<div class="lu-state">暂时没有可展示的比赛</div>';
      return;
    }

    /* 收集需要的学校 */
    const schools = new Set();
    display.forEach(m => { schools.add(m.match.a); schools.add(m.match.b); });
    const schoolList = [...schools];

    /* 批量拉选手 */
    const playerResults = await Promise.all(
      schoolList.map(s => fetch(API_BASE + '/api/team/players?school=' + encodeURIComponent(s))
        .then(r => r.json()).catch(() => ({ players: [] })))
    );
    const playersMap = {};
    schoolList.forEach((s, i) => { playersMap[s] = playerResults[i].players || []; });

    /* 渲染 */
    const lineupByKey = new Map(lineups.map(l => [`${l.match_index}-${l.school}`, l]));
    const apptByIndex = new Map(appointments.map(a => [a.match_index, a]));

    content.innerHTML = display.map(item => renderCard(item, teamMap, playersMap, lineupByKey, apptByIndex)).join('');

    /* 单场模式：隐藏工具栏，改变标题 */
    if (isSingleMatch) {
      document.querySelector('.lu-toolbar').hidden = true;
      const m = display[0];
      const aName = (teamMap[m.match.a] || {}).name || m.match.a;
      const bName = (teamMap[m.match.b] || {}).name || m.match.b;
      titleEl.textContent = `${aName} VS ${bName}`;
      subEl.textContent = '首发名单 · 解说席';
      document.title = `${aName} VS ${bName} · 首发名单`;
    } else {
      bindFilters(display.length);
    }

  } catch (err) {
    content.innerHTML = '<div class="lu-state">加载失败：' + escapeHtml(err.message) + '</div>';
  }
}

function bindFilters(totalCount) {
  const cards = [...content.querySelectorAll('.lu-card')];
  const update = () => {
    const q = (search.value || '').trim().toLowerCase();
    const f = filterSel.value;
    let visible = 0;

    cards.forEach(card => {
      const text = (card.dataset.search || '').toLowerCase();
      const hasLineup = card.dataset.hasLineup === '1';
      const isFinished = card.dataset.finished === '1';
      const isBooked = card.dataset.booked === '1';

      let matchFilter = true;
      if (f === 'booked') matchFilter = isBooked;
      else if (f === 'finished') matchFilter = isFinished;
      else if (f === 'has-lineup') matchFilter = hasLineup;
      else if (f === 'missing-lineup') matchFilter = !hasLineup;

      const matchSearch = !q || text.includes(q);
      const show = matchFilter && matchSearch;
      card.hidden = !show;
      if (show) visible++;
    });

    countEl.textContent = `显示 ${visible} / ${cards.length} 场`;
  };
  search.addEventListener('input', update);
  filterSel.addEventListener('change', update);
  update();
}

function renderCard(item, teamMap, playersMap, lineupByKey, apptByIndex) {
  const m = item.match;
  const a = m.a, b = m.b;
  const aName = (teamMap[a] || {}).name || a;
  const bName = (teamMap[b] || {}).name || b;
  const aLogo = (teamMap[a] || {}).logo || (TEAM_LOGO_DIR + 'loge_' + a + TEAM_LOGO_EXT);
  const bLogo = (teamMap[b] || {}).logo || (TEAM_LOGO_DIR + 'loge_' + b + TEAM_LOGO_EXT);

  const appt = apptByIndex.get(item.index);
  const lineupA = lineupByKey.get(`${item.index}-${a}`);
  const lineupB = lineupByKey.get(`${item.index}-${b}`);

  const hasLineup = !!(lineupA && lineupB);
  const isBooked = !!appt;
  const isFinished = !!appt?.is_finished;

  const timeStr = appt?.start_time ? formatTime(appt.start_time) : '待定';
  const statusText = isFinished ? '已完赛' : isBooked ? '已约赛' : '待约赛';
  const statusClass = isFinished ? 'is-finished' : isBooked ? 'is-scheduled' : '';

  const rounds = appt?.rounds ? safeParse(appt.rounds) : null;
  const scoreHtml = isFinished && appt.score_a != null && appt.score_b != null
    ? `<div class="lu-score"><span>${appt.score_a}</span><em>:</em><span>${appt.score_b}</span></div>`
    : '';

  const signups = appt?.signups || [];
  const judges = signups.filter(s => s.role === 'judge');
  const commentators = signups.filter(s => s.role === 'commentator');

  const formatLineup = (lineup, players) => {
    if (!lineup) return '<div class="lu-side__pending">⚠ 未提交</div>';
    let starters;
    try { starters = JSON.parse(lineup.starters); } catch { return '<div class="lu-side__pending">⚠ 数据异常</div>'; }
    const nameMap = new Map(players.map(p => [Number(p.id), p]));
    const pick = (id) => {
      const p = nameMap.get(Number(id));
      if (!p) return '未知';
      return `${escapeHtml(p.name)}${p.cn_short ? `（${escapeHtml(p.cn_short)}）` : ''}`;
    };
    const survivors = (starters.survivors || []).map(pick);
    const hunter = starters.hunter ? pick(starters.hunter) : '—';
    return `
      <div class="lu-side__group">
        <span class="lu-side__label">求生者</span>
        <ul class="lu-side__list">${survivors.map(n => `<li>${n}</li>`).join('')}</ul>
      </div>
      <div class="lu-side__group">
        <span class="lu-side__label">监管者</span>
        <ul class="lu-side__list"><li>${hunter}</li></ul>
      </div>
    `;
  };

  const searchText = `${aName} ${bName} ${a} ${b}`;
  const lineupNames = [];
  [lineupA, lineupB].forEach(l => {
    if (!l) return;
    try {
      const s = JSON.parse(l.starters);
      lineupNames.push(...(s.survivors || []));
      if (s.hunter) lineupNames.push(s.hunter);
    } catch {}
  });
  const fullSearch = searchText + ' ' + lineupNames.map(id => {
    const p = [...(playersMap[a] || []), ...(playersMap[b] || [])].find(x => Number(x.id) === Number(id));
    return p ? p.name : '';
  }).join(' ');

  return `
    <article class="lu-card"
             data-search="${escapeHtml(fullSearch)}"
             data-has-lineup="${hasLineup ? '1' : '0'}"
             data-booked="${isBooked ? '1' : '0'}"
             data-finished="${isFinished ? '1' : '0'}">
      <div class="lu-card__head">
        <span class="lu-card__round">${item.roundIndex ? `第 ${item.roundIndex} 轮` : '赛程'} ${item.roundName ? '· ' + escapeHtml(item.roundName) : ''}</span>
        <span class="lu-card__status ${statusClass}">${statusText} · ${escapeHtml(timeStr)}</span>
      </div>

      <div class="lu-card__vs">
        <div class="lu-card__team">
          <img src="${aLogo}" onerror="this.style.visibility='hidden'">
          <span>${escapeHtml(aName)}</span>
        </div>
        ${scoreHtml || '<div class="lu-card__vs-mark">VS</div>'}
        <div class="lu-card__team">
          <img src="${bLogo}" onerror="this.style.visibility='hidden'">
          <span>${escapeHtml(bName)}</span>
        </div>
      </div>

      <div class="lu-card__body">
        <div class="lu-side">
          <div class="lu-side__head">
            <img src="${aLogo}" onerror="this.style.visibility='hidden'">
            <span>${escapeHtml(aName)}</span>
          </div>
          ${formatLineup(lineupA, playersMap[a] || [])}
        </div>
        <div class="lu-side">
          <div class="lu-side__head">
            <img src="${bLogo}" onerror="this.style.visibility='hidden'">
            <span>${escapeHtml(bName)}</span>
          </div>
          ${formatLineup(lineupB, playersMap[b] || [])}
        </div>
      </div>

      <div class="lu-card__staff">
        <div class="lu-staff">
          <span class="lu-staff__label">🎙️ 解说</span>
          ${commentators.length
            ? commentators.map(c => `<span class="lu-staff__name">${escapeHtml(c.username)}</span>`).join('')
            : '<span class="lu-staff__empty">未登记</span>'}
        </div>
        <div class="lu-staff">
          <span class="lu-staff__label">⚖️ 裁判</span>
          ${judges.length
            ? judges.map(c => `<span class="lu-staff__name">${escapeHtml(c.username)}</span>`).join('')
            : '<span class="lu-staff__empty">未登记</span>'}
        </div>
      </div>
    </article>
  `;
}

/* ============ 工具 ============ */
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
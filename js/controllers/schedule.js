/* ============================================================
   赛程控制器 · ScheduleController
   赛程加载 / 渲染 / 比赛详情弹窗 / 比分补录 / 报名
   @file js/controllers/schedule.js
============================================================ */
import { apiRequest, getCurrentUser } from '../api.js';
import { sanitize } from '../utils.js';
import { store } from '../store.js';
import { showActionNotice } from '../ui-toast.js';
import { shareUrl, buildMatchShareUrl } from '../share.js';
import { parseTournament } from '../tournament.js';
import {
  scheduleSideHtml, formatMatchTime, scoreText,
  parseRounds, roundRowHtml, roundDisplayHtml,
  bindRoundDelete, bindRoundInputs, ensureMatchDetailsModal
} from './shared.js';

export class ScheduleController {
  constructor() {
    this.scheduleId = null;
    this.matches = [];
    this.title = '';
    this.logoMap = {};
    this.nameMap = {};
    this.appointments = [];
    this.tournament = null;
    this.resizeHandler = null;
    this.loadSequence = 0;
  }

  /* ---------------- 比赛详情弹窗 ---------------- */
  showMatchDetails(match, appointment) {
    const mask = ensureMatchDetailsModal();
    const content = mask.querySelector('.match-details-content');
    const user = getCurrentUser();
    const signups = appointment?.signups || [];
    const mySignups = signups.filter(s => s.is_mine);
    const time = appointment?.start_time ? formatMatchTime(appointment.start_time) : '队伍尚未约定时间';

    const teamAName = (this.nameMap && this.nameMap[match.a]) || match.a || '队伍 A';
    const teamBName = (this.nameMap && this.nameMap[match.b]) || match.b || '队伍 B';

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
      <h3 class="tool-modal__title" id="matchDetailsTitle">
        ${sanitize(teamAName)} VS ${sanitize(teamBName)} <em>比赛详情</em>
        <button class="btn btn--ghost btn--sm match-share-btn" id="matchShareBtn" type="button" style="margin-left:auto" aria-label="分享">📤 分享</button>
      </h3>
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

    /* 分享按钮 */
    const shareBtn = content.querySelector('#matchShareBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        const idx = appointment ? appointment.match_index : (this.matches.indexOf(match));
        const url = buildMatchShareUrl(this.scheduleId, idx);
        shareUrl(url, `${teamAName} VS ${teamBName}`, '查看比赛详情与首发名单');
      });
    }

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
        const data = await store.loadAppointments(this.scheduleId);
        this.appointments = data.appointments || [];
        this.renderSchedule(this.matches, document.getElementById('scheduleBoard'), this.title, this.logoMap, this.nameMap, this.scheduleId, this.appointments, this.tournament);
        const updated = this.appointments.find(a => a.id === appointment.id);
        this.showMatchDetails(match, updated);
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
        const data = await store.loadAppointments(this.scheduleId);
        this.appointments = data.appointments || [];
        this.renderSchedule(this.matches, document.getElementById('scheduleBoard'), this.title, this.logoMap, this.nameMap, this.scheduleId, this.appointments, this.tournament);
        this.showMatchDetails(match, this.appointments.find(a => a.id === appointment.id));
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
          if (roundsBox) { bindRoundDelete(roundsBox, showActionNotice); bindRoundInputs(roundsBox, content); }
        }
      });
    }

    const roundsBox = content.querySelector('#resultRounds');
    const addRoundBtn = content.querySelector('#resultAddRound');
    if (roundsBox) { bindRoundDelete(roundsBox, showActionNotice); bindRoundInputs(roundsBox, content); }
    if (addRoundBtn && roundsBox) {
      addRoundBtn.addEventListener('click', () => {
        const idx = roundsBox.children.length;
        if (idx >= 9) { showActionNotice('最多 9 局', true); return; }
        roundsBox.insertAdjacentHTML('beforeend', roundRowHtml({ first: { a: 0, b: 0 }, second: { a: 0, b: 0 } }, idx));
        bindRoundDelete(roundsBox, showActionNotice); bindRoundInputs(roundsBox, content);
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
        const data = await store.loadAppointments(this.scheduleId);
        this.appointments = data.appointments || [];
        this.renderSchedule(this.matches, document.getElementById('scheduleBoard'), this.title, this.logoMap, this.nameMap, this.scheduleId, this.appointments, this.tournament);
        this.showMatchDetails(match, this.appointments.find(a => a.id === appointment.id));
      } catch (err) {
        showActionNotice(mutationComplete ? '比分已保存，但刷新失败' : err.message, true);
        const message = content.querySelector('#matchFinishMessage2');
        if (message) message.textContent = err.message;
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      }
    });
  }

  /* ---------------- 渲染赛程 ---------------- */
  renderSchedule(list, container, title, logoMap, nameMap, scheduleId = null, appointments = [], tournament = null) {
    this.scheduleId = scheduleId;
    this.matches = list || [];
    this.title = title || '';
    this.logoMap = logoMap || {};
    this.nameMap = nameMap || {};
    this.appointments = appointments;
    this.tournament = tournament;

    if (!list || !list.length) {
      if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
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
          match: m, flatIndex: flatIndex + mi, roundIndex: r.index, roundName: r.name,
          appointment: appointmentByIndex.get(flatIndex + mi)
        }));
        roundMatches.sort(sortItems);
        grouped.push({ round: r, items: roundMatches });
        flatIndex += r.matches.length;
      });
    } else {
      const items = list.map((m, i) => ({
        match: m, flatIndex: i, roundIndex: 1, roundName: `${list.length * 2} 进 ${list.length}`,
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
        const decided = finished && appointment.score_a != null && appointment.score_b != null && appointment.score_a !== appointment.score_b;
        const winA = decided && appointment.score_a > appointment.score_b;
        const winB = decided && appointment.score_b > appointment.score_a;
        let centerMain;
        if (score) {
          if (decided) {
            centerMain = `<div class="schedule-card__score">
              <b class="${winA ? 'is-win' : ''}">${appointment.score_a}</b>
              <span>:</span>
              <b class="${winB ? 'is-win' : ''}">${appointment.score_b}</b>
            </div>`;
          } else {
            centerMain = `<div class="schedule-card__score">${score}</div>`;
          }
        } else if (finished) {
          centerMain = `<div class="schedule-card__score schedule-card__score--pending">比分待补录</div>`;
        } else {
          centerMain = `<div class="schedule-card__vs">VS</div>`;
        }
        const collapsed = idx >= INITIAL_LIMIT;
        const _nm = (s) => nameMap[s] || s || '轮空';
        const lineTextHtml = finished && appointment.score_a != null && appointment.score_b != null
          ? `<div class="schedule-card__line">${sanitize(decided
              ? (appointment.score_a > appointment.score_b
                  ? `${_nm(p.a)} 以 ${appointment.score_a}:${appointment.score_b} 战胜 ${_nm(p.b)}`
                  : `${_nm(p.b)} 以 ${appointment.score_b}:${appointment.score_a} 战胜 ${_nm(p.a)}`)
              : `${_nm(p.a)} 与 ${_nm(p.b)} 战成 ${appointment.score_a}:${appointment.score_b} 平手`)}</div>`
          : '';
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
            <button class="schedule-card__share" data-match-share="${flatIndex}" type="button" aria-label="分享">📤</button>
            ${scheduleSideHtml(p.a, logoMap, nameMap, winA)}
            <div class="schedule-card__center">
              <span class="schedule-card__state ${appointment?.is_finished ? 'schedule-card__state--finished' : appointment ? 'schedule-card__state--scheduled' : ''}">${appointment?.is_finished ? '已完赛' : appointment ? '已约赛 · 未完赛' : '待约赛'}</span>
              ${centerMain}
              ${lineTextHtml}
              ${appointmentTime}
              ${appointmentStaff}
            </div>
            ${scheduleSideHtml(p.b, logoMap, nameMap, winB)}
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

      const isFirstRound = g.round.index === 1;
      return `
        <section class="schedule-round" data-round="${g.round.index}" data-collapsed="${isFirstRound ? 'true' : 'false'}">
          <div class="schedule-round__head">
            <span class="schedule-round__index">第 ${g.round.index} 轮</span>
            <h4 class="schedule-round__name">${sanitize(g.round.name || '')}</h4>
            <span class="schedule-round__count">${g.items.length} 场</span>
            <button class="schedule-round__toggle" type="button" aria-expanded="${isFirstRound ? 'false' : 'true'}">
              ${isFirstRound ? '展开' : '收起'}
            </button>
          </div>
          <div class="schedule-round__body" ${isFirstRound ? 'hidden' : ''}>
            <div class="schedule-grid">${cards}</div>
            ${moreBtn}
          </div>
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

    container.querySelectorAll('[data-match-share]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.matchShare);
        const m = list[idx];
        const url = buildMatchShareUrl(this.scheduleId, idx);
        const aName = (this.nameMap && this.nameMap[m.a]) || m.a;
        const bName = (this.nameMap && this.nameMap[m.b]) || m.b;
        shareUrl(url, `${aName} VS ${bName}`, '查看比赛详情与首发名单');
      });
    });
    container.querySelectorAll('[data-match-index]').forEach(card => {
      const open = () => {
        const idx = Number(card.dataset.matchIndex);
        this.showMatchDetails(list[idx], appointmentByIndex.get(idx));
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

    /* 整轮折叠（如 64 进 32 默认收起，32 进 16 展开） */
    container.querySelectorAll('.schedule-round').forEach(section => {
      const toggle = section.querySelector('.schedule-round__toggle');
      const body = section.querySelector('.schedule-round__body');
      if (!toggle || !body) return;
      const applyCollapse = (next) => {
        section.dataset.collapsed = next ? 'true' : 'false';
        body.hidden = next;
        toggle.setAttribute('aria-expanded', next ? 'false' : 'true');
        toggle.textContent = next ? '展开' : '收起';
      };
      toggle.addEventListener('click', () => {
        applyCollapse(section.dataset.collapsed !== 'true');
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
        /* 搜索/筛选命中时，自动展开被整轮折叠的轮次（如默认收起的 64 进 32） */
        if (sectionVisible > 0 && isFiltering) {
          const body = section.querySelector('.schedule-round__body');
          const toggle = section.querySelector('.schedule-round__toggle');
          if (body && body.hidden) {
            body.hidden = false;
            section.dataset.collapsed = 'false';
            if (toggle) { toggle.setAttribute('aria-expanded', 'true'); toggle.textContent = '收起'; }
          }
        }
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

  /* ---------------- 加载赛程 ---------------- */
  async load() {
    const box = document.getElementById('scheduleBoard');
    if (!box) return;
    const loadSequence = ++this.loadSequence;

    try {
      const data = await store.loadSchedule();
      if (loadSequence !== this.loadSequence || !box.isConnected) return;
      const s = data.schedule;
      if (!s || !s.matches) {
        this.renderSchedule([], box, '', {}, {});
        return;
      }
      const tournament = parseTournament(s.matches);
      const flatMatches = tournament ? tournament.allMatches : (Array.isArray(s.matches) ? s.matches : []);
      this.renderSchedule(flatMatches, box, s.title, {}, {}, s.id, [], tournament);

      const appointmentData = await store.loadAppointments(s.id).catch(() => ({ appointments: [] }));
      if (loadSequence !== this.loadSequence || !box.isConnected) return;
      const appointments = appointmentData.appointments || [];
      this.renderSchedule(flatMatches, box, s.title, {}, {}, s.id, appointments, tournament);

      let nameMap = {};
      let logoMap = {};
      const applyTeamDisplay = () => {
        if (loadSequence !== this.loadSequence || !box.isConnected || this.scheduleId !== s.id) return;
        this.nameMap = nameMap;
        this.logoMap = logoMap;
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
      store.fetchTeamsFull().then(teamData => {
        (teamData.teams || []).forEach(team => {
          if (!team.short) return;
          nameMap[team.short] = team.name || team.short;
          if (team.logo) logoMap[team.short] = team.logo;
        });
        applyTeamDisplay();
      }).catch(() => {});
      store.fetchTeamLogos().then(logoData => {
        (logoData.teams || []).forEach(team => { if (team.short && team.logo) logoMap[team.short] = team.logo; });
        applyTeamDisplay();
      }).catch(() => {});
    } catch (err) {
      if (loadSequence !== this.loadSequence) return;
      console.warn('[比赛赛程] 加载失败：', err.message);
      box.innerHTML = '<div class="board__state">加载失败：' + sanitize(err.message) + '</div>';
    }
    box.setAttribute('aria-busy', 'false');
    this.renderScheduleAdmin();
  }

  /* ---------------- 赛程管理功能区 ---------------- */
  renderScheduleAdmin() {
    const box = document.getElementById('scheduleAdmin');
    if (!box) return;
    const u = getCurrentUser();
    const isAdmin = u?.role === 'admin';
    const isTeam = u?.role === 'team';
    if (!isAdmin && !isTeam) { box.innerHTML = ''; return; }

    const buttons = [];
    if (isAdmin) {
      buttons.push(
        { id: 'schedule', icon: '🗓️', t: '添加赛程', d: '发布单/双淘汰或小组赛赛程' },
        { id: 'draw', icon: '🎲', t: '赛事抽签', d: '为参赛队伍随机生成对阵表' },
        { id: 'matchBooking', icon: '🗓️', t: '约赛管理', d: '查看/提交比赛时间' },
        { id: 'adminHub', icon: '🛠️', t: '后台管理', d: '比分补录、竞猜结算与队伍管理' }
      );
    }
    if (isTeam) {
      buttons.push({ id: 'matchBooking', icon: '🗓️', t: '约赛', d: '为对阵选择并提交比赛时间' });
    }

    box.innerHTML = `
      <div class="schedule-admin">
        <div class="schedule-admin__head">
          <h3>赛程管理</h3><em>${isAdmin ? 'ADMIN' : 'TEAM'}</em>
        </div>
        <div class="schedule-admin__grid">
          ${buttons.map(b => `
            <button class="tool-card" data-admin-tool="${b.id}" type="button">
              <span class="tool-card__icon" aria-hidden="true">${b.icon}</span>
              <span class="tool-card__body">
                <span class="tool-card__title">${b.t}</span>
                <span class="tool-card__desc">${b.d}</span>
              </span>
              <span class="tool-card__arrow" aria-hidden="true">→</span>
            </button>`).join('')}
        </div>
        <div id="scheduleAdminBox" class="schedule-admin__box"></div>
      </div>`;

    box.querySelectorAll('[data-admin-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.mountToolInto(btn.dataset.adminTool, 'scheduleAdminBox');
        btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });
  }

  async mountToolInto(toolId, boxId) {
    const box = document.getElementById(boxId);
    if (!box) return;
    try {
      const mod = await import('../tools.js?v=20261006-29');
      if (mod.mountTool) mod.mountTool(toolId, box);
    } catch (err) {
      console.warn('[工具挂载] 失败：', err.message);
      box.innerHTML = '<div class="board__state">工具加载失败</div>';
    }
  }
}

export const scheduleController = new ScheduleController();
/* 兼容旧全局 / 跨文件引用 */
window.__showMatchDetails = (match, appointment) => scheduleController.showMatchDetails(match, appointment);

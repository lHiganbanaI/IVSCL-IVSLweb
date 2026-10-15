/* ============================================================
   主页赛事动态 · 论坛帖子流 FeedController
   约赛 / 完赛战报 / 主办公告 自动汇成帖子列表
   @file js/controllers/feed.js
============================================================ */
import { sanitize } from '../utils.js';
import { store } from '../store.js';
import { homeController } from './home.js';
import { qaController } from './qa.js';

/* ISO → "MM-DD HH:mm" */
function fmtTime(input) {
  if (!input) return '';
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export class FeedController {
  constructor() {
    this.board = '[data-board="feed"]';
  }

  /* 约赛 → 帖子 */
  _apptToPost(a, flatMatches, nameMap) {
    const m = flatMatches[a.match_index];
    if (!m || !m.a || !m.b) return null;
    const aName = nameMap[m.a] || m.a;
    const bName = nameMap[m.b] || m.b;
    const roundName = m.roundName || '';
    const timeStr = a.start_time ? fmtTime(a.start_time) : '待定时间';
    const ts = a.start_time ? new Date(a.start_time).getTime() : 0;
    return {
      kind: 'appt',
      tag: '⚔️ 约赛',
      title: roundName ? `${roundName} · ${aName} VS ${bName}` : `${aName} VS ${bName}`,
      body: `已约赛 · ${timeStr}`,
      ts
    };
  }

  /* 完赛 → 战报帖 */
  _resultToPost(a, flatMatches, nameMap) {
    const m = flatMatches[a.match_index];
    if (!m || !m.a || !m.b) return null;
    if (a.score_a == null || a.score_b == null) return null;
    const aName = nameMap[m.a] || m.a;
    const bName = nameMap[m.b] || m.b;
    const roundName = m.roundName || '';
    const sa = a.score_a, sb = a.score_b;
    const winner = sa > sb ? aName : bName;
    const ts = a.finished_time ? new Date(a.finished_time).getTime()
             : a.updated_at ? new Date(a.updated_at).getTime() : Date.now();
    return {
      kind: 'result',
      tag: '🏆 战报',
      title: roundName ? `${roundName} · ${aName} VS ${bName}` : `${aName} VS ${bName}`,
      body: `比分 ${sa} : ${sb} · ${winner} 晋级`,
      ts
    };
  }

  /* 公告 → 帖子 */
  _annToPost(it) {
    const ts = it.time ? new Date(it.time).getTime() : 0;
    return {
      kind: 'official',
      tag: `📢 ${sanitize(it.tag || '公告')}`,
      title: sanitize(it.text || '').slice(0, 60),
      body: sanitize(it.text || ''),
      ts,
      pinned: !!it.is_pinned
    };
  }

  async load() {
    const box = document.querySelector(this.board);
    if (!box) return;

    let posts = [];
    try {
      const [annData, ctx] = await Promise.all([
        store.loadAnnouncements().catch(() => ({ announcements: [] })),
        homeController.fetchContext()
      ]);
      const anns = annData.announcements || [];
      const { appointments, flatMatches, nameMap } = ctx;

      /* 公告 */
      anns.forEach(it => { const p = this._annToPost(it); if (p) posts.push(p); });

      /* 约赛 + 完赛 */
      appointments.forEach(a => {
        if (!a) return;
        if (a.is_finished) {
          const p = this._resultToPost(a, flatMatches, nameMap);
          if (p) posts.push(p);
        } else {
          const p = this._apptToPost(a, flatMatches, nameMap);
          if (p) posts.push(p);
        }
      });

      /* 置顶在前，其余按时间倒序 */
      posts.sort((x, y) => {
        if (x.pinned && !y.pinned) return -1;
        if (!x.pinned && y.pinned) return 1;
        return (y.ts || 0) - (x.ts || 0);
      });
    } catch (err) {
      box.innerHTML = `<li class="board__state">加载失败：${sanitize(err.message || '')}</li>`;
      return;
    }

    if (!posts.length) {
      box.innerHTML = '<li class="board__state">暂无动态，约赛和公告会第一时间在这里出现</li>';
    } else {
      box.innerHTML = posts.map(p => `
        <article class="feed-post feed-post--${p.kind}">
          <header class="feed-post__head">
            <span class="feed-post__tag">${p.tag}</span>
            <time class="feed-post__time">${p.ts ? fmtTime(new Date(p.ts).toISOString()) : ''}</time>
            ${p.pinned ? '<span class="feed-post__pin">📌</span>' : ''}
          </header>
          <h4 class="feed-post__title">${p.title}</h4>
          ${p.body && p.body !== p.title ? `<p class="feed-post__body">${p.body}</p>` : ''}
        </article>
      `).join('');
    }
    box.setAttribute('aria-busy', 'false');

    /* Q&A 折叠交互 */
    const toggle = document.getElementById('chatQaToggle');
    const qaList = document.querySelector('.chat__qa-list');
    if (toggle && qaList && !toggle.__bound) {
      toggle.__bound = true;
      toggle.addEventListener('click', () => {
        const open = qaList.hasAttribute('hidden');
        if (open) { qaList.removeAttribute('hidden'); toggle.classList.add('is-open'); }
        else { qaList.setAttribute('hidden', ''); toggle.classList.remove('is-open'); }
      });
    }
    qaController.load();
  }
}

export const feedController = new FeedController();

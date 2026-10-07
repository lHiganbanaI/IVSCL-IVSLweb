/* ============================================================
   公告控制器 · AnnouncementsController
   @file js/controllers/announcements.js
============================================================ */
import { sanitize, formatTime } from '../utils.js';
import { store } from '../store.js';

export class AnnouncementsController {
  constructor() { this.board = '[data-board="announcements"]'; }

  render(list, container) {
    if (!list || !list.length) {
      container.innerHTML = '<li class="board__state">暂无公告</li>';
      return 0;
    }
    container.innerHTML = list.map(item => {
      const tag      = sanitize(item.tag || '动态');
      const tagClass = item.tag_class || 'tag--event';
      const time     = formatTime(item.time);
      const text     = sanitize(item.text || '');
      const pinned   = !!item.is_pinned;
      return `
        <li class="${pinned ? 'is-pinned' : ''}">
          <div class="msg__top">
            ${pinned ? '<span class="msg__pin" aria-hidden="true">📌</span>' : ''}
            <span class="msg__tag ${tagClass}">${tag}</span>
            ${pinned ? '<span class="msg__tag msg__tag--pin">置顶</span>' : ''}
            ${time ? `<span class="msg__time">${sanitize(time)}</span>` : ''}
          </div>
          <p class="msg__text">${text}</p>
        </li>
      `;
    }).join('');
    return list.length;
  }

  async load() {
    const box = document.querySelector(this.board);
    const cnt = document.querySelector('[data-count="announcements"]');
    if (!box) return;
    try {
      const data = await store.loadAnnouncements();
      const list = data.announcements || [];
      const n = this.render(list, box);
      if (cnt) cnt.textContent = n + ' 条';
    } catch (err) {
      console.warn('[公告栏] 加载失败：', err.message);
      box.innerHTML = '<li class="board__state">加载失败：' + sanitize(err.message) + '</li>';
    }
    box.setAttribute('aria-busy', 'false');
  }
}

export const announcementsController = new AnnouncementsController();

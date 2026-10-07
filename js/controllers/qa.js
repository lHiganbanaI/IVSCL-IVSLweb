/* ============================================================
   Q&A 控制器 · QAController
   @file js/controllers/qa.js
============================================================ */
import { sanitize } from '../utils.js';
import { DEFAULT_QAS } from '../config.js?v=20261006-27';

export class QAController {
  constructor() { this.board = '[data-board="qas"]'; }

  render(list, container) {
    if (!list || !list.length) {
      container.innerHTML = '<li class="board__state">暂无 Q&amp;A</li>';
      return 0;
    }
    container.innerHTML = list.map((item, i) => {
      const question = sanitize(item.question || '');
      const answer   = sanitize(item.answer || '');
      const id       = 'qa-' + i;
      return `
        <li class="qa-item" data-qa>
          <button class="qa-item__q" type="button" aria-expanded="false" aria-controls="${id}">
            <span class="qa-item__mark" aria-hidden="true">Q</span>
            <span class="qa-item__text">${question}</span>
            <span class="qa-item__arrow" aria-hidden="true">▾</span>
          </button>
          <div class="qa-item__a" id="${id}" role="region">
            <div class="qa-item__a-inner">
              <span class="qa-a-mark">A：</span>${answer}
            </div>
          </div>
        </li>
      `;
    }).join('');

    container.querySelectorAll('.qa-item').forEach(item => {
      const btn = item.querySelector('.qa-item__q');
      btn.addEventListener('click', () => {
        const isOpen = item.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    });
    return list.length;
  }

  async load() {
    const box = document.querySelector(this.board);
    const cnt = document.querySelector('[data-count="qas"]');
    if (!box) return;
    let list = null;
    try {
      const res = await fetch('data/qas.json');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.qas)) list = data.qas;
      }
    } catch (e) {}
    if (!list || !list.length) list = DEFAULT_QAS;
    const n = this.render(list, box);
    if (cnt) cnt.textContent = n + ' 条';
    box.setAttribute('aria-busy', 'false');
  }
}

export const qaController = new QAController();

/* ============================================================
   通用工具函数
============================================================ */

export function sanitize(str) {
  return String(str)
    .replace(/&(?!amp;|lt;|gt;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
    .replace(/<(?!\/?b\b|\/?br\b)[^>]*>/gi, m =>
      m.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

export function formatTime(input) {
  if (!input) return '';
  const raw = String(input).trim();
  if (!raw) return '';
  if (raw === '今天' || raw === '昨天') return raw;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let date = null;

  let m = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m) date = new Date(+m[1], +m[2] - 1, +m[3]);
  if (!date) {
    m = raw.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
    if (m) date = new Date(now.getFullYear(), +m[1] - 1, +m[2]);
  }
  if (!date) {
    m = raw.match(/^(\d{1,2})[-\/](\d{1,2})$/);
    if (m) date = new Date(now.getFullYear(), +m[1] - 1, +m[2]);
  }
  if (!date || isNaN(date.getTime())) return raw;

  const diff = Math.round((today - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return (date.getMonth() + 1) + '月' + date.getDate() + '日';
}

export function getInitial(name) {
  if (!name) return '·';
  const clean = String(name).replace(/老师$/, '').trim();
  if (!clean) return '·';
  const first = clean.charAt(0);
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase();
  return first;
}

export function getInitialFromName(name) {
  if (!name) return '·';
  const first = String(name).charAt(0);
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase();
  return first;
}

export function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-show');
}

export function hideError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.classList.remove('is-show');
}
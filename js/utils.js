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

/* ============================================================
   北京时间工具（全站统一 UTC+8）
   —— 提交/显示两端都走这里，避免出现 8 小时偏差
============================================================ */
export const BJ_OFFSET_MINUTES = 8 * 60;

/**
 * 把任意时间输入解析为 Date 对象
 * - 带 Z 或 ±HH:MM 的按原样解析
 * - "2026-10-02T20:30" / "2026-10-02 20:30" 这类无时区字符串按北京时间解析
 */
function toBeijingDate(input) {
  if (input instanceof Date) return input;
  if (typeof input === 'number') return new Date(input);

  const raw = String(input || '').trim();
  if (!raw) return new Date(NaN);

  // 已带时区标记，交给原生解析
  if (/[zZ]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw)) {
    return new Date(raw);
  }

  // 无时区 → 按北京时间 (UTC+8) 解析
  const m = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, Y, Mo, D, h, mi, s] = m;
    return new Date(Date.UTC(+Y, +Mo - 1, +D, +h - 8, +mi, +(s || 0)));
  }
  return new Date(raw);
}

/**
 * 把时间格式化为北京时间字符串
 * @param {number|string|Date} input
 * @param {boolean} withSeconds 是否带秒
 * @returns {string} "2026-10-02 20:30" 或 "2026-10-02 20:30:15"
 */
export function formatBeijing(input, withSeconds = false) {
  const d = toBeijingDate(input);
  if (isNaN(d.getTime())) return '';

  const bj = new Date(d.getTime() + BJ_OFFSET_MINUTES * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  const Y  = bj.getUTCFullYear();
  const M  = pad(bj.getUTCMonth() + 1);
  const D  = pad(bj.getUTCDate());
  const h  = pad(bj.getUTCHours());
  const mi = pad(bj.getUTCMinutes());
  const s  = pad(bj.getUTCSeconds());

  return withSeconds ? `${Y}-${M}-${D} ${h}:${mi}:${s}` : `${Y}-${M}-${D} ${h}:${mi}`;
}

/**
 * datetime-local 输入框的值 → 带 +08:00 的 ISO 字符串
 * 例如 "2026-10-02T20:30" → "2026-10-02T20:30:00+08:00"
 */
export function beijingISOFromLocal(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return raw; // 不是标准格式，交给后端处理
  const [, Y, Mo, D, h, mi, s] = m;
  return `${Y}-${Mo}-${D}T${h}:${mi}:${s || '00'}+08:00`;
}

/**
 * 存储的 ISO 字符串 → datetime-local 输入框的值（北京时间）
 * 例如 "2026-10-02T12:30:00.000Z" → "2026-10-02T20:30"
 */
export function beijingLocalFromISO(input) {
  const d = toBeijingDate(input);
  if (isNaN(d.getTime())) return '';
  const bj = new Date(d.getTime() + BJ_OFFSET_MINUTES * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())}T${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}`;
}
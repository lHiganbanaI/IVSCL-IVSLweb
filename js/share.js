/* ============================================================
   分享工具
============================================================ */

import { showActionNotice } from './ui-toast.js';

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  /* fallback */
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

export async function shareUrl(url, title = '', text = '') {
  if (navigator.share) {
    try {
      await navigator.share({ url, title, text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const ok = await copyToClipboard(url);
  if (ok) showActionNotice('链接已复制，可粘贴分享');
  else prompt('复制此链接分享：', url);
}

/* 生成比赛分享 URL */
export function buildMatchShareUrl(scheduleId, matchIndex) {
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  return `${base}lineups.html?schedule=${scheduleId}&match=${matchIndex}`;
}

/* 生成队伍分享 URL */
export function buildTeamShareUrl(short) {
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  return `${base}lineups.html?team=${encodeURIComponent(short)}`;
}

/* 给按钮绑定分享 */
export function bindShareButton(el, getUrl) {
  if (!el || el.dataset.shareBound === 'true') return;
  el.dataset.shareBound = 'true';
  el.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const { url, title, text } = getUrl();
    await shareUrl(url, title, text);
  });
}
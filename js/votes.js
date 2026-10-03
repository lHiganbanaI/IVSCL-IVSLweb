/* ============================================================
   打 Call 投票模块
============================================================ */

import { apiRequest, getCurrentUser } from './api.js';

/* 缓存 */
let __votesCache = null;
let __votesPromise = null;

export function invalidateVotes() {
  __votesCache = null;
  __votesPromise = null;
}

export async function fetchVotes() {
  if (__votesCache) return __votesCache;
  if (!__votesPromise) {
    __votesPromise = apiRequest('/api/votes/summary').then(data => {
      __votesCache = data || { teams: {}, staff: {}, mine: { team: [], staff: [] } };
      return __votesCache;
    }).catch(err => {
      __votesPromise = null;
      throw err;
    });
  }
  return __votesPromise;
}

export function voteCount(data, type, key) {
  if (!data) return 0;
  const map = type === 'team' ? data.teams : data.staff;
  return (map && map[key]) || 0;
}

export function hasVoted(data, type, key) {
  if (!data) return false;
  const mine = data.mine || {};
  const list = type === 'team' ? mine.team : mine.staff;
  return Array.isArray(list) && list.includes(key);
}

/* 本地轻提示 */
function notify(msg, isError = false) {
  if (typeof window !== 'undefined' && typeof window.app?.showActionNotice === 'function') {
    window.app.showActionNotice(msg, isError);
    return;
  }
  let el = document.getElementById('voteNotice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'voteNotice';
    el.className = 'action-notice';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('action-notice--error', isError);
  el.classList.add('is-visible');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('is-visible'), 3000);
}

/**
 * 投票 / 取消投票
 */
export async function toggleVote(targetType, targetKey, btnEl = null) {
  const user = getCurrentUser();
  if (!user) {
    notify('请先登录后再投票', true);
    return null;
  }

  if (btnEl) {
    btnEl.disabled = true;
    btnEl.classList.add('is-loading');
  }

  try {
    const data = await apiRequest('/api/votes/toggle', {
      method: 'POST',
      body: JSON.stringify({ target_type: targetType, target_key: targetKey })
    });
    invalidateVotes();
    notify(data.voted ? '已为他打 Call 🔥' : '已取消打 Call');
    return data;
  } catch (err) {
    notify(err.message || '投票失败', true);
    return null;
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.classList.remove('is-loading');
    }
  }
}

/**
 * 绑定投票按钮点击事件
 */
export function bindVoteButton(btnEl, targetType, targetKey, onUpdate) {
  if (!btnEl || btnEl.dataset.voteBound === 'true') return;
  btnEl.dataset.voteBound = 'true';
  btnEl.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const res = await toggleVote(targetType, targetKey, btnEl);
    if (res && typeof onUpdate === 'function') {
      onUpdate(res, btnEl);
    }
  });
}
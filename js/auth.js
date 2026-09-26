/* ============================================================
   账号系统：登录、注册、登出、按钮渲染
============================================================ */

import { ROLE_LABELS } from './config.js';
import { apiRequest, getCurrentUser, setToken } from './api.js';
import { showError, hideError, getInitialFromName } from './utils.js';

/* 由 main.js 注入的回调（登录状态变化时刷新工具面板） */
let onAuthChange = null;
export function setAuthChangeCallback(fn) {
  onAuthChange = fn;
}

export function renderAccountButton() {
  const iconEl = document.getElementById('accountBtnIcon');
  const textEl = document.getElementById('accountBtnText');
  const roleEl = document.getElementById('accountBtnRole');
  if (!iconEl || !textEl || !roleEl) return;

  const u = getCurrentUser();
  if (u) {
    textEl.textContent = u.username || '已登录';
    roleEl.textContent = ROLE_LABELS[u.role] || u.role;
    roleEl.dataset.role = u.role;
    roleEl.hidden = false;
  } else {
    textEl.textContent = '登录 / 注册';
    roleEl.hidden = true;
  }
}

export function renderAccountModal() {
  const profileBox = document.getElementById('accountProfile');
  const authBox    = document.getElementById('accountAuth');
  if (!profileBox || !authBox) return;

  const u = getCurrentUser();
  if (u) {
    document.getElementById('profileAvatar').textContent = getInitialFromName(u.username);
    document.getElementById('profileName').textContent   = u.username || '—';
    document.getElementById('profilePhone').textContent  = u.phone
      ? u.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
      : '—';
    const roleEl = document.getElementById('profileRole');
    roleEl.textContent = ROLE_LABELS[u.role] || u.role;
    roleEl.dataset.role = u.role;
    profileBox.hidden = false;
    authBox.hidden    = true;
  } else {
    profileBox.hidden = true;
    authBox.hidden    = false;
    ['loginPhone','loginPassword','regPhone','regUsername','regPassword','regConfirm','regCode'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    hideError('loginError');
    hideError('registerError');
  }
}

function notifyAuthChange() {
  renderAccountButton();
  renderAccountModal();
  if (typeof onAuthChange === 'function') onAuthChange();
}

/* ============================================================
   弹窗控制
============================================================ */
function initModal() {
  const modal  = document.getElementById('accountModal');
  const btn    = document.getElementById('accountBtn');
  const closeB = document.getElementById('accountModalClose');
  if (!modal || !btn) return;

  let lastFocused = null;
  function open() {
    lastFocused = document.activeElement;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    renderAccountModal();
    requestAnimationFrame(() => {
      const f = modal.querySelector('input:not([hidden]), button:not([disabled])');
      if (f) f.focus();
    });
  }
  function close() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }
  btn.addEventListener('click', open);
  closeB.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => {
    if (!modal.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
}

/* ============================================================
   标签切换
============================================================ */
function initTabs() {
  const tabs = document.querySelectorAll('.account-tab');
  const loginForm = document.getElementById('loginForm');
  const regForm   = document.getElementById('registerForm');
  if (!tabs.length || !loginForm || !regForm) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.toggle('is-active', t === tab));
      const name = tab.dataset.accountTab;
      if (name === 'login') { loginForm.hidden = false; regForm.hidden = true; }
      else { loginForm.hidden = true; regForm.hidden = false; }
      hideError('loginError');
      hideError('registerError');
    });
  });
}

/* ============================================================
   登录
============================================================ */
function initLogin() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    hideError('loginError');

    const phone = (document.getElementById('loginPhone').value || '').trim();
    const pwd   = (document.getElementById('loginPassword').value || '');

    if (!/^1\d{10}$/.test(phone)) { showError('loginError', '请输入 11 位手机号。'); return; }
    if (!pwd) { showError('loginError', '请输入密码。'); return; }

    const submitBtn = form.querySelector('.account-form__submit');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '登录中…';

    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password: pwd })
      });
      setToken(data.token);
      notifyAuthChange();
    } catch (err) {
      showError('loginError', err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

/* ============================================================
   注册
============================================================ */
function initRegister() {
  const form = document.getElementById('registerForm');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    hideError('registerError');

    const phone    = (document.getElementById('regPhone').value || '').trim();
    const username = (document.getElementById('regUsername').value || '').trim();
    const pwd      = (document.getElementById('regPassword').value || '');
    const confirm  = (document.getElementById('regConfirm').value || '');
    const codeIn   = (document.getElementById('regCode').value || '').trim();

    if (!/^1\d{10}$/.test(phone)) { showError('registerError', '请输入 11 位手机号。'); return; }
    if (!username) { showError('registerError', '请输入账号名称。'); return; }
    if (username.length > 16) { showError('registerError', '账号名称最多 16 个字符。'); return; }
    if (pwd.length < 6) { showError('registerError', '密码至少 6 位。'); return; }
    if (pwd !== confirm) { showError('registerError', '两次输入的密码不一致。'); return; }
    if (!codeIn) { showError('registerError', '请输入激活码。'); return; }

    const submitBtn = form.querySelector('.account-form__submit');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '注册中…';

    try {
      const data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ phone, username, password: pwd, inviteCode: codeIn })
      });
      setToken(data.token);
      notifyAuthChange();
    } catch (err) {
      showError('registerError', err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

/* ============================================================
   登出
============================================================ */
function initLogout() {
  const btn = document.getElementById('profileLogout');
  if (!btn) return;
  btn.addEventListener('click', () => {
    setToken('');
    notifyAuthChange();
  });
}

/* ============================================================
   初始化
============================================================ */
export function initAuth() {
  initModal();
  initTabs();
  initLogin();
  initRegister();
  initLogout();
  renderAccountButton();
}
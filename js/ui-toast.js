/* ============================================================
   UI 提示工具：toast 通知 + 弹窗（alert / confirm）
   依赖方：content.js / tools.js / my-matches.js / share.js
   说明：此文件此前缺失，导致主站 ES Module 加载链断裂。
   现补回，自带内联样式，不依赖全局 CSS。
============================================================ */

/* ============ Toast 轻提示 ============ */
let __noticeEl = null;
let __noticeTimer = null;

/**
 * 轻提示
 * @param {string} message 文案
 * @param {boolean} isError 是否为错误提示（红色边框）
 */
export function showActionNotice(message, isError = false) {
  if (typeof document === 'undefined') return;
  if (!__noticeEl) {
    __noticeEl = document.createElement('div');
    __noticeEl.id = 'actionNotice';
    __noticeEl.setAttribute('role', 'status');
    __noticeEl.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:28px',
      'transform:translateX(-50%) translateY(16px)',
      'background:rgba(16,26,48,.97)',
      'color:#eef3fb',
      'padding:12px 22px',
      'border-radius:10px',
      'font-size:14px',
      'line-height:1.5',
      'border:1px solid rgba(127,184,255,.5)',
      'box-shadow:0 10px 34px rgba(0,0,0,.55)',
      'z-index:99999',
      'max-width:86vw',
      'opacity:0',
      'transition:opacity .22s ease, transform .22s ease',
      'pointer-events:none',
      'font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif'
    ].join(';');
    document.body.appendChild(__noticeEl);
  }

  __noticeEl.textContent = String(message || '');
  __noticeEl.style.borderColor = isError ? 'rgba(235,110,110,.75)' : 'rgba(127,184,255,.5)';
  __noticeEl.style.color = isError ? '#ffdcdc' : '#eef3fb';
  __noticeEl.style.opacity = '1';
  __noticeEl.style.transform = 'translateX(-50%) translateY(0)';

  clearTimeout(__noticeTimer);
  __noticeTimer = setTimeout(() => {
    __noticeEl.style.opacity = '0';
    __noticeEl.style.transform = 'translateX(-50%) translateY(16px)';
  }, 2600);
}

/* ============ 弹窗（alert / confirm） ============ */
let __modalEl = null;
let __modalResolve = null;

const _BASE_FONT = 'system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';

function ensureModal() {
  if (__modalEl) return __modalEl;

  const mask = document.createElement('div');
  mask.style.cssText = [
    'position:fixed', 'inset:0',
    'background:rgba(4,8,18,.62)',
    'z-index:100000',
    'display:flex', 'align-items:center', 'justify-content:center',
    'backdrop-filter:blur(2px)',
    'font-family:' + _BASE_FONT
  ].join(';');

  const box = document.createElement('div');
  box.style.cssText = [
    'background:#101b34',
    'border:1px solid rgba(127,184,255,.42)',
    'border-radius:12px',
    'padding:22px 26px',
    'max-width:360px',
    'width:86vw',
    'color:#eef3fb',
    'box-shadow:0 20px 60px rgba(0,0,0,.6)'
  ].join(';');

  const msg = document.createElement('div');
  msg.style.cssText = 'font-size:15px;line-height:1.6;margin-bottom:18px;word-break:break-word;';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

  box.append(msg, actions);
  mask.appendChild(box);
  document.body.appendChild(mask);

  __modalEl = { mask, box, msg, actions };
  return __modalEl;
}

function closeModal(val) {
  if (!__modalEl) return;
  __modalEl.mask.remove();
  __modalEl = null;
  if (typeof __modalResolve === 'function') {
    const resolve = __modalResolve;
    __modalResolve = null;
    resolve(val);
  }
}

function makeBtn(label, primary, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.type = 'button';
  b.style.cssText = [
    'padding:8px 18px',
    'border-radius:8px',
    'font-size:14px',
    'cursor:pointer',
    'font-family:inherit',
    primary
      ? 'background:#7fb8ff;color:#0a1228;border:none;font-weight:600;'
      : 'background:transparent;color:#cfe2ff;border:1px solid rgba(127,184,255,.5);'
  ].join(';');
  b.addEventListener('click', onClick);
  return b;
}

/**
 * 阻塞式提示（仅确定按钮）
 * @param {string} message
 * @returns {Promise<void>}
 */
export function showAlert(message) {
  const m = ensureModal();
  m.msg.textContent = String(message || '');
  m.actions.innerHTML = '';
  m.actions.appendChild(makeBtn('确定', true, () => closeModal(null)));
  return new Promise(resolve => { __modalResolve = resolve; });
}

/**
 * 确认弹窗
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function showConfirm(message) {
  const m = ensureModal();
  m.msg.textContent = String(message || '');
  m.actions.innerHTML = '';
  m.actions.appendChild(makeBtn('取消', false, () => closeModal(false)));
  m.actions.appendChild(makeBtn('确定', true, () => closeModal(true)));
  return new Promise(resolve => { __modalResolve = resolve; });
}

/* ESC 关闭弹窗（默认取消） */
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && __modalEl) closeModal(false);
  });
}

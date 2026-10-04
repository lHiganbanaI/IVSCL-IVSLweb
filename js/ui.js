/* ============================================================
   UI 交互：标签页、报名弹窗、滚动渐显、图片放大
============================================================ */

export const VALID_TABS = ['home', 'about', 'teams', 'schedule', 'tools', 'king'];

let onTabChange = null;

export function setTabChangeCallback(fn) {
  onTabChange = fn;
}

export function activate(name) {
  if (!VALID_TABS.includes(name)) name = 'home';
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  /* 关闭独立页面 */
  const myMatchesPage = document.getElementById('myMatchesPage');
  if (myMatchesPage) myMatchesPage.hidden = true;

  tabs.forEach(t => {
    const isActive = t.dataset.tab === name;
    t.classList.toggle('is-active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  panels.forEach(p => p.classList.toggle('is-active', p.dataset.panel === name));

  if (typeof onTabChange === 'function') onTabChange(name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   报名弹窗
============================================================ */
function initSignupModal() {
  const mask   = document.getElementById('signupModal');
  const closeB = document.getElementById('modalClose');
  if (!mask) return;

  let lastFocused = null;
  const getFocusables = () => Array.from(mask.querySelectorAll(
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  ));

  function open() {
    lastFocused = document.activeElement;
    mask.classList.add('is-open');
    mask.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const f = getFocusables();
      (f[0] || mask).focus();
    });
  }
  function close() {
    mask.classList.remove('is-open');
    mask.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  ['signupBtn', 'signupBtn2', 'signupBtn3'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', open);
  });

  closeB.addEventListener('click', close);
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  document.addEventListener('keydown', e => {
    if (!mask.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      const f = getFocusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

/* ============================================================
   滚动渐显
============================================================ */
function initRevealOnScroll() {
  const items = document.querySelectorAll('.reveal, .reveal-stagger');
  if (!items.length) return;
  if (!('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  items.forEach(el => io.observe(el));
}

/* ============================================================
   图片放大
============================================================ */
function initLightbox() {
  const box   = document.getElementById('lightbox');
  const img   = document.getElementById('lightboxImg');
  const close = document.getElementById('lightboxClose');
  if (!box || !img) return;

  let lastFocused = null;
  function open(src, alt) {
    lastFocused = document.activeElement;
    img.src = src;
    img.alt = alt || '';
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => close.focus());
  }
  function hide() {
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(() => { if (!box.classList.contains('is-open')) img.src = ''; }, 300);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }
  document.addEventListener('click', e => {
    const target = e.target.closest('img[data-zoom]');
    if (target) {
      e.stopPropagation();
      open(target.src, target.alt || target.dataset.zoom);
    }
  });
  close.addEventListener('click', hide);
  box.addEventListener('click', e => { if (e.target === box) hide(); });
  document.addEventListener('keydown', e => {
    if (box.classList.contains('is-open') && e.key === 'Escape') {
      e.preventDefault();
      hide();
    }
  });
}

/* ============================================================
   初始化
============================================================ */
export function initUI() {
  const tabs = document.querySelectorAll('.tab');

  tabs.forEach(t => {
    t.addEventListener('click', () => {
      activate(t.dataset.tab);
      history.replaceState(null, '', '#' + t.dataset.tab);
    });
  });

  document.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      activate(el.dataset.goto);
      history.replaceState(null, '', '#' + el.dataset.goto);
    });
  });

  const hash = location.hash.replace('#', '');
  if (VALID_TABS.includes(hash)) activate(hash);

  initSignupModal();
  initRevealOnScroll();
  initLightbox();
}
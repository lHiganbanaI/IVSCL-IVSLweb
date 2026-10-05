/* ============================================================
   页面切换转场模块（面向对象 · 独立可复用）
   ------------------------------------------------------------
   把「标签页 / 面板切换 + 转场动画」从 ui.js 抽出，封装为
   TabTransition 类。支持 fade / slide 两种动画，动画类型可在
   运行时切换，支持切换回调与 hash 同步。

   用法：
     import { TabTransition } from './transitions.js';
     const nav = new TabTransition({ animation: 'slide' });
     nav.onSwitch = (name) => { ... };          // 切换回调
     nav.bindTo({ hash: true });                // 绑定 .tab / [data-goto] 点击
     nav.activate('teams');                     // 程序化切换
============================================================ */

const VALID_ANIMATIONS = ['fade', 'slide'];

export class TabTransition {
  /**
   * @param {object}  opts
   * @param {string}  opts.animation  默认转场动画：'fade' | 'slide'
   * @param {string}  opts.activeClass 激活态 class，默认 'is-active'
   * @param {boolean} opts.autoHash    初始化时自动读取 location.hash，默认 true
   */
  constructor({ animation = 'fade', activeClass = 'is-active', autoHash = true } = {}) {
    this.animation = VALID_ANIMATIONS.includes(animation) ? animation : 'fade';
    this.activeClass = activeClass;
    this.tabs = Array.from(document.querySelectorAll('.tab'));
    this.panels = Array.from(document.querySelectorAll('.panel'));
    this.onSwitch = null;                 // 切换回调：fn(name)
    this._current = this._detectInitial(autoHash);
    this._prepare();
  }

  /** 当前激活的标签名 */
  get active() { return this._current; }

  /** 标签页名集合 */
  get names() { return this.tabs.map(t => t.dataset.tab); }

  /** 是否存在该标签 */
  has(name) { return this.tabs.some(t => t.dataset.tab === name); }

  /* ---- 内部：识别初始标签 ---- */
  _detectInitial(autoHash) {
    const activeTab = this.tabs.find(t => t.classList.contains(this.activeClass));
    if (activeTab) return activeTab.dataset.tab;
    if (autoHash) {
      const hash = (location.hash || '').replace('#', '');
      if (this.has(hash)) return hash;
    }
    return this.tabs.length ? this.tabs[0].dataset.tab : null;
  }

  /* ---- 内部：给面板打上动画类型标记（供 CSS 区分） ---- */
  _prepare() {
    this.panels.forEach(p => { p.dataset.anim = this.animation; });
  }

  /** 切换转场动画类型（fade / slide），立即生效 */
  setAnimation(type) {
    if (VALID_ANIMATIONS.includes(type)) this.animation = type;
    this.panels.forEach(p => { p.dataset.anim = this.animation; });
  }

  /**
   * 切换到指定标签
   * @param {string} name 标签名
   * @param {object} opts
   * @param {Function} [opts.onSwitch] 本次切换回调 fn(name)
   * @returns {string|null} 实际激活的标签名（非法输入返回当前值）
   */
  activate(name, { onSwitch = null } = {}) {
    if (!this.has(name)) return this._current;

    /* 关闭独立页面（我的比赛等全屏页） */
    const myMatches = document.getElementById('myMatchesPage');
    if (myMatches) myMatches.hidden = true;

    this.tabs.forEach(t => {
      const isActive = t.dataset.tab === name;
      t.classList.toggle(this.activeClass, isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    /* 重放转场动画（即使面板已激活也可再次播放） */
    this.panels.forEach(p => {
      const isActive = p.dataset.panel === name;
      p.classList.toggle(this.activeClass, isActive);
      if (isActive && this.animation !== 'none') {
        p.classList.remove('anim-in');
        void p.offsetWidth;               /* 强制回流，让动画可重复 */
        p.classList.add('anim-in');
      }
    });

    this._current = name;
    if (typeof onSwitch === 'function') onSwitch(name);
    if (typeof this.onSwitch === 'function') this.onSwitch(name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return name;
  }

  /**
   * 绑定页面上已有的 .tab 按钮与 [data-goto] 元素
   * @param {object} opts
   * @param {boolean} [opts.hash=true] 点击时同步地址栏 hash
   */
  bindTo({ hash = true } = {}) {
    this.tabs.forEach(t => {
      t.addEventListener('click', () => {
        this.activate(t.dataset.tab);
        if (hash) history.replaceState(null, '', '#' + t.dataset.tab);
      });
    });
    document.querySelectorAll('[data-goto]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        this.activate(el.dataset.goto);
        if (hash) history.replaceState(null, '', '#' + el.dataset.goto);
      });
    });
    return this;
  }
}

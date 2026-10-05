/* ============================================================
   导播画面 · 拖拽定位编辑器
   作用：拖拽调整封面/解说席画面中各元素的位置，
        保存到 localStorage['directorLayout']，
        director.js 渲染时自动套用（applyLayout）。
   坐标：left/top 为元素中心相对画布宽高的百分比。
============================================================ */

/* 每个画面可拖拽元素 + 默认位置（与 director.css 默认值一致） */
const ELEMENTS = {
  starting: [
    { key: 'team-a', label: '队名 A',   type: 'team', text: '上海XX大学', dft: { x: 55, y: 40 } },
    { key: 'team-b', label: '队名 B',   type: 'team', text: '北京XX大学', dft: { x: 83, y: 40 } }
  ],
  staff: [
    { key: 'comm',  label: '解说行', type: 'row', dft: { x: 50, y: 47 },
      people: [ { icon: '🎙️', name: '解说·阿杰' }, { icon: '🎙️', name: '解说·小北' } ] }
  ]
};

const BG = { starting: 'assets/director/starting.jpg', staff: 'assets/director/staff-bg.jpg' };

let currentType = 'starting';
let layout = load();

const canvas = document.getElementById('edCanvas');
const coordEl = document.getElementById('edCoord');
const typeSel = document.getElementById('edType');
const saveBtn = document.getElementById('edSave');
const resetBtn = document.getElementById('edReset');
const avWrap = document.getElementById('edAvWrap');
const avSlider = document.getElementById('edAv');
const avVal = document.getElementById('edAvVal');
const AV_DFT = 12;   /* 解说头像默认大小 vh */

/* 头像大小 vh → 画布内像素（画布高度按比例换算，保证比例与 OBS 一致） */
function setEdAv(av) {
  const h = canvas.getBoundingClientRect().height || 720;
  canvas.style.setProperty('--ed-av', (av / 100 * h) + 'px');
}

function load() {
  try { return JSON.parse(localStorage.getItem('directorLayout') || 'null'); }
  catch { return null; }
}
function persist() { localStorage.setItem('directorLayout', JSON.stringify(layout)); }

function getPos(key) {
  const m = layout && layout[currentType];
  const p = m && m[key];
  return p || ELEMENTS[currentType].find(e => e.key === key).dft;
}

function buildNode(conf) {
  const el = document.createElement('div');
  el.className = 'ed-node';
  el.dataset.key = conf.key;
  el.dataset.type = conf.type;

  if (conf.type === 'team') {
    el.classList.add('ed-node--team');
    el.textContent = conf.text;
  } else if (conf.type === 'row') {
    el.classList.add('ed-node--row');
    if (conf.judge) el.classList.add('is-judge');
    conf.people.forEach(p => {
      const person = document.createElement('div');
      person.className = 'ed-person';
      person.innerHTML = `
        <div class="ed-avatar">${p.icon}</div>
        <span class="ed-pname">${p.name}</span>`;
      el.appendChild(person);
    });
  }

  const pos = getPos(conf.key);
  el.style.left = pos.x + '%';
  el.style.top = pos.y + '%';
  return el;
}

function renderCanvas() {
  canvas.innerHTML = '';

  /* 背景图 */
  const bg = document.createElement('img');
  bg.className = 'ed-canvas__bg';
  bg.src = BG[currentType];
  bg.alt = '';
  canvas.appendChild(bg);

  /* 参考网格 */
  const grid = document.createElement('div');
  grid.className = 'ed-grid';
  canvas.appendChild(grid);

  /* 图例 */
  const legend = document.createElement('div');
  legend.className = 'ed-legend';
  legend.textContent = '画布 1280×720（OBS 16:9）· 坐标 %';
  canvas.appendChild(legend);

  /* 可拖元素 */
  ELEMENTS[currentType].forEach(conf => canvas.appendChild(buildNode(conf)));

  /* 解说席：显示头像大小滑块并套用已存值 */
  if (currentType === 'staff') {
    const m = layout && layout.staff;
    const av = (m && m.av) || AV_DFT;
    avSlider.value = av;
    avVal.textContent = av + 'vh';
    setEdAv(av);
    avWrap.style.display = 'flex';
  } else {
    avWrap.style.display = 'none';
  }

  attachDrag();
  coordEl.textContent = '拖动元素，实时显示坐标';
}

/* ---------- 拖拽 ---------- */
function attachDrag() {
  const nodes = canvas.querySelectorAll('.ed-node');
  nodes.forEach(node => {
    node.addEventListener('pointerdown', onDown);
    node.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  });
}

function onDown(e) {
  e.preventDefault();
  const node = e.currentTarget;
  const key = node.dataset.key;
  const label = ELEMENTS[currentType].find(x => x.key === key).label;
  const rect = canvas.getBoundingClientRect();
  const move = (ev) => {
    const x = Math.min(100, Math.max(0, (ev.clientX - rect.left) / rect.width * 100));
    const y = Math.min(100, Math.max(0, (ev.clientY - rect.top) / rect.height * 100));
    node.style.left = x + '%';
    node.style.top = y + '%';
    coordEl.textContent = `${label} → X ${x.toFixed(1)}%  Y ${y.toFixed(1)}%`;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  try { node.setPointerCapture(e.pointerId); } catch {}
}

/* ---------- 保存 / 重置 ---------- */
saveBtn.addEventListener('click', () => {
  if (!layout) layout = {};
  layout[currentType] = layout[currentType] || {};
  canvas.querySelectorAll('.ed-node').forEach(node => {
    layout[currentType][node.dataset.key] = {
      x: parseFloat(node.style.left),
      y: parseFloat(node.style.top)
    };
  });
  if (currentType === 'staff') layout.staff.av = parseFloat(avSlider.value);
  persist();
  const old = saveBtn.textContent;
  saveBtn.textContent = '✓ 已保存';
  setTimeout(() => saveBtn.textContent = old, 1400);
});

resetBtn.addEventListener('click', () => {
  if (layout && layout[currentType]) delete layout[currentType];
  persist();
  renderCanvas();
});

/* 头像大小滑块实时预览 */
avSlider.addEventListener('input', () => {
  const av = parseFloat(avSlider.value);
  avVal.textContent = av + 'vh';
  setEdAv(av);
});

/* 切换画面类型 */
typeSel.addEventListener('change', () => {
  currentType = typeSel.value;
  renderCanvas();
});

renderCanvas();

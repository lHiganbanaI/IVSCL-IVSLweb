/* ============================================================
   共享渲染 / 工具 helper（跨领域复用，无 UI 状态）
   @file js/controllers/shared.js
============================================================ */
import { apiRequest, getCurrentUser } from '../api.js';
import { sanitize, formatBeijing } from '../utils.js';
import { TEAM_LOGO_DIR, TEAM_LOGO_EXT } from '../config.js?v=20261006-29';
import { fetchVotes, voteCount, hasVoted, bindVoteButton } from '../votes.js';

/* ---------------- 图片压缩（队伍 logo / 头像共用） ---------------- */
export const PLAYER_POSITIONS = ['求生', '监管', '双边'];

export function compressImage(file, maxSize = 300, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('请选择图片文件')); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * maxSize / width); width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * maxSize / height); height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(outputType, quality));
      };
      img.onerror = () => reject(new Error('图片解析失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/* ---------------- 打 Call 按钮统一填充（队伍卡片 / 工作人员行共用） ---------------- */
let __votesData = null;
export const canVote = () => ['admin', 'beta'].includes(getCurrentUser()?.role);

export async function hydrateVoteButtons(container) {
  const btns = container.querySelectorAll('.vote-btn[data-vote-target]');
  if (!btns.length) return;
  let data = null;
  try { data = await fetchVotes(); } catch { /* 忽略，按钮仍可点击 */ }
  if (data) __votesData = data;
  btns.forEach(btn => {
    const type = btn.dataset.voteTarget;
    const key = btn.dataset.voteKey;
    if (data) {
      const count = voteCount(data, type, key);
      btn.dataset.voteCount = String(count);
      btn.textContent = `🔥 ${count}`;
      btn.classList.toggle('is-active', hasVoted(data, type, key));
    }
    bindVoteButton(btn, type, key, (res, el) => {
      el.dataset.voteCount = String(res.count);
      el.textContent = `🔥 ${res.count}`;
      el.classList.toggle('is-active', res.voted);
      if (__votesData) {
        const map = type === 'team' ? __votesData.teams : __votesData.staff;
        if (map) map[key] = res.count;
        __votesData.mine = __votesData.mine || { team: [], staff: [] };
        const arr = type === 'team' ? __votesData.mine.team : __votesData.mine.staff;
        const i = arr.indexOf(key);
        if (res.voted) { if (i < 0) arr.push(key); }
        else if (i >= 0) arr.splice(i, 1);
      }
    });
  });
}

export function clearVotesCache() {
  __votesData = null;
}

/* ---------------- 选手编辑行 helper ---------------- */
export function renderPlayerRowHtml(p, i, posOpts) {
  return `
    <div class="player-row" data-i="${i}">
      <div class="player-row__head">
        <span class="player-row__label">选手 ${i + 1}</span>
        <button type="button" class="player-row__del" data-del="${i}" aria-label="删除">✕</button>
      </div>
      <div class="tool-form__row player-row__grid">
        <div class="tool-field">
          <label>游戏 ID</label>
          <input type="text" class="pp-uid" maxlength="20" value="${sanitize(p.uid || '')}" placeholder="数字 ID" inputmode="numeric">
        </div>
        <div class="tool-field">
          <label>游戏 CN</label>
          <input type="text" class="pp-name" maxlength="20" value="${sanitize(p.name || '')}" placeholder="游戏内原名字">
        </div>
        <div class="tool-field">
          <label>CN 简称</label>
          <input type="text" class="pp-cnshort" maxlength="10" value="${sanitize(p.cn_short || '')}" placeholder="例如：阿轲">
        </div>
        <div class="tool-field">
          <label>位置</label>
          <select class="pp-pos">${posOpts}</select>
        </div>
      </div>
    </div>
  `;
}

export function coachRowHtml(coachName) {
  return `
    <div class="player-row player-row--coach">
      <div class="player-row__head">
        <span class="player-row__label">教练（无需游戏 ID）</span>
      </div>
      <div class="tool-form__row">
        <div class="tool-field"><label>教练名字</label><input type="text" id="teCoachName" maxlength="20" value="${sanitize(coachName || '')}"></div>
      </div>
    </div>
  `;
}

export function collectPlayersFromPanel(panel) {
  return [...panel.querySelectorAll('.player-row:not(.player-row--coach)')].map(row => ({
    name:     (row.querySelector('.pp-name')?.value || '').trim(),
    cn_short: (row.querySelector('.pp-cnshort')?.value || '').trim(),
    uid:      (row.querySelector('.pp-uid')?.value || '').trim(),
    position: row.querySelector('.pp-pos')?.value || '求生'
  }));
}

/* ---------------- 赛程 / 比分展示 helper ---------------- */
const FALLBACK_SVG = (color = '%23182242', stroke = '%23d4b47a') =>
  `data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2246%22 fill=%22${color}%22 stroke=%22${stroke}%22 stroke-width=%222%22 stroke-dasharray=%226 6%22/><text x=%2250%22 y=%2264%22 font-size=%2240%22 font-weight=%22900%22 fill=%22${stroke}%22 text-anchor=%22middle%22 font-family=%22sans-serif%22>?</text></svg>`;

export function teamLogoSrc(short, logoMap) {
  if (logoMap && logoMap[short]) return logoMap[short];
  return `${TEAM_LOGO_DIR}loge_${sanitize(short || '')}${TEAM_LOGO_EXT}`;
}

export function scheduleSideHtml(short, logoMap, nameMap, win = false) {
  const shortSafe = sanitize(short || '轮空');
  const name = sanitize(nameMap && nameMap[short] ? nameMap[short] : (short || '轮空'));
  const src = teamLogoSrc(short, logoMap);
  return `
    <div class="schedule-card__side ${win ? 'schedule-card__side--win' : ''}" data-schedule-team-short="${shortSafe}">
      <img class="schedule-card__logo" src="${src}" alt="${name} logo" loading="lazy"
        onerror="this.onerror=null;this.src='${FALLBACK_SVG()}'">
      <span class="schedule-card__name">${name}</span>
      ${win ? '<i class="schedule-card__winbadge" aria-label="胜方">胜</i>' : ''}
    </div>
  `;
}

export function formatMatchTime(value) {
  if (!value) return '';
  return formatBeijing(value) || String(value);
}

export function scoreText(appointment) {
  if (!appointment || !appointment.is_finished) return '';
  if (appointment.score_a == null || appointment.score_b == null) return '';
  return `${appointment.score_a} : ${appointment.score_b}`;
}

/* ---------------- 比赛比分表单（多局小比分） ---------------- */
export function parseRounds(raw) {
  if (!raw) return [];
  let arr;
  try { arr = JSON.parse(raw); } catch (e) { return []; }
  if (!Array.isArray(arr)) return [];
  return arr.map(r => {
    if (r && r.first && r.second) {
      return {
        first:  { a: Number(r.first.a)  || 0, b: Number(r.first.b)  || 0 },
        second: { a: Number(r.second.a) || 0, b: Number(r.second.b) || 0 }
      };
    }
    if (r && (r.a != null || r.b != null)) {
      return { first:  { a: Number(r.a) || 0, b: Number(r.b) || 0 }, second: { a: 0, b: 0 } };
    }
    return { first: { a: 0, b: 0 }, second: { a: 0, b: 0 } };
  });
}

export function roundRowHtml(round, index) {
  const fa = round?.first?.a ?? 0;
  const fb = round?.first?.b ?? 0;
  const sa = round?.second?.a ?? 0;
  const sb = round?.second?.b ?? 0;
  return `
    <div class="match-result-round" data-round-index="${index}">
      <div class="match-result-round__head">
        <span class="match-result-round__label">第 ${index + 1} 局</span>
        <button class="match-result-round__del" type="button" aria-label="删除该局">✕</button>
      </div>
      <div class="match-result-round__row">
        <span class="match-result-round__phase">上半场</span>
        <input type="number" class="mrr-first-a" min="0" max="99" value="${fa}" inputmode="numeric">
        <span class="match-result-round__sep">:</span>
        <input type="number" class="mrr-first-b" min="0" max="99" value="${fb}" inputmode="numeric">
      </div>
      <div class="match-result-round__row">
        <span class="match-result-round__phase">下半场</span>
        <input type="number" class="mrr-second-a" min="0" max="99" value="${sa}" inputmode="numeric">
        <span class="match-result-round__sep">:</span>
        <input type="number" class="mrr-second-b" min="0" max="99" value="${sb}" inputmode="numeric">
      </div>
    </div>
  `;
}

export function roundDisplayHtml(round, index) {
  const totalA = (round.first?.a || 0) + (round.second?.a || 0);
  const totalB = (round.first?.b || 0) + (round.second?.b || 0);
  return `
    <div class="match-round-row">
      <span class="match-round-row__label">第 ${index + 1} 局</span>
      <span class="match-round-row__phase">上半 <b>${round.first?.a ?? 0} : ${round.first?.b ?? 0}</b></span>
      <span class="match-round-row__phase">下半 <b>${round.second?.a ?? 0} : ${round.second?.b ?? 0}</b></span>
      <span class="match-round-row__total">总分 <b>${totalA} : ${totalB}</b></span>
    </div>
  `;
}

export function bindRoundDelete(roundsBox, toast) {
  roundsBox.querySelectorAll('.match-result-round').forEach(row => {
    const del = row.querySelector('.match-result-round__del');
    if (!del || del.dataset.bound === 'true') return;
    del.dataset.bound = 'true';
    del.addEventListener('click', () => {
      if (roundsBox.children.length <= 1) { toast?.('至少保留一局', true); return; }
      row.remove();
      [...roundsBox.children].forEach((r, i) => {
        r.dataset.roundIndex = i;
        const label = r.querySelector('.match-result-round__label');
        if (label) label.textContent = `第 ${i + 1} 局`;
      });
    });
  });
}

export function bindRoundInputs(roundsBox, content) {
  const inputs = roundsBox.querySelectorAll('.match-result-round input');
  inputs.forEach(inp => {
    if (inp.dataset.bound === 'true') return;
    inp.dataset.bound = 'true';
    inp.addEventListener('input', () => refreshPreview(roundsBox, content));
  });
  refreshPreview(roundsBox, content);
}

export function refreshPreview(roundsBox, content) {
  const rows = [...roundsBox.querySelectorAll('.match-result-round')];
  let totalA = 0, totalB = 0;
  for (const row of rows) {
    totalA += (Number(row.querySelector('.mrr-first-a').value)  || 0)
            + (Number(row.querySelector('.mrr-second-a').value) || 0);
    totalB += (Number(row.querySelector('.mrr-first-b').value)  || 0)
            + (Number(row.querySelector('.mrr-second-b').value) || 0);
  }
  const pA = content.querySelector('#previewScoreA');
  const pB = content.querySelector('#previewScoreB');
  if (pA) pA.textContent = totalA;
  if (pB) pB.textContent = totalB;
}

export function ensureMatchDetailsModal() {
  let mask = document.getElementById('matchDetailsModal');
  if (mask) return mask;
  mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.id = 'matchDetailsModal';
  mask.setAttribute('aria-hidden', 'true');
  mask.innerHTML = '<div class="modal tool-modal" role="dialog" aria-modal="true" aria-labelledby="matchDetailsTitle"><button class="modal__close" type="button" aria-label="关闭">×</button><div class="match-details-content"></div></div>';
  document.body.appendChild(mask);
  const close = () => {
    mask.classList.remove('is-open');
    mask.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };
  mask.querySelector('.modal__close').addEventListener('click', close);
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && mask.classList.contains('is-open')) close(); });
  return mask;
}

/* 兼容：teamLogoSrc 曾以 logo 参数名暴露，供内部使用 */
export { apiRequest };

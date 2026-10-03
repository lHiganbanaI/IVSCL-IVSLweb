/* ============================================================
   赛事赛制模型（面向对象）
   —— 单淘汰 / 双淘汰 / 小组赛
   设计目标：
   1. 每种赛制用独立的类描述，共享基类 Tournament
   2. Round 描述单个轮次（含队伍数、对阵、胜者）
   3. 支持从旧数据（扁平数组）自动升级
   4. 自动识别"第几轮"
============================================================ */

/* ---------- 常量 ---------- */
export const TOURNAMENT_TYPES = {
  SINGLE: 'single',
  DOUBLE: 'double',
  GROUP:  'group'
};

export const TOURNAMENT_TYPE_LABELS = {
  single: '单淘汰',
  double: '双淘汰',
  group:  '小组赛'
};

/* ============================================================
   Round —— 一个轮次
============================================================ */
export class Round {
  constructor({ index = 1, name = '', fromCount = 0, toCount = 0, matches = [], bracket = 'main' }) {
    this.index     = index;       // 轮次序号，从 1 开始
    this.name      = name;        // 显示名："64 进 32"、"半决赛"
    this.fromCount = fromCount;   // 本轮开打队伍数
    this.toCount   = toCount;     // 本轮结束剩余队伍数
    this.matches   = matches;     // [{ a, b, winner?, scoreA?, scoreB? }]
    this.bracket   = bracket;     // main | winner | loser | final | group
  }

  get matchCount() { return this.matches.length; }

  get isComplete() {
    if (!this.matches.length) return false;
    return this.matches.every(m => m.winner === 'a' || m.winner === 'b');
  }

  toJSON() {
    return {
      index: this.index,
      name: this.name,
      fromCount: this.fromCount,
      toCount: this.toCount,
      bracket: this.bracket,
      matches: this.matches
    };
  }

  static fromJSON(o) {
    return new Round({
      index: Number(o.index) || 1,
      name: String(o.name || ''),
      fromCount: Number(o.fromCount) || 0,
      toCount: Number(o.toCount) || 0,
      bracket: o.bracket || 'main',
      matches: Array.isArray(o.matches) ? o.matches : []
    });
  }
}

/* ============================================================
   Tournament —— 赛制基类
============================================================ */
export class Tournament {
  constructor({ title = '', type = 'single', rounds = [] } = {}) {
    this.title = title;
    this.type  = type;
    this.rounds = rounds;
  }

  get typeLabel() {
    return TOURNAMENT_TYPE_LABELS[this.type] || this.type;
  }

  get totalRounds() { return this.rounds.length; }

  /** 当前正在进行的轮次（第一个没打完的） */
  get currentRound() {
    return this.rounds.find(r => !r.isComplete) || this.rounds[this.rounds.length - 1] || null;
  }

  /** 全部对阵的扁平化列表 */
  get allMatches() {
    const list = [];
    this.rounds.forEach(round => {
      round.matches.forEach((m, mi) => {
        list.push({ ...m, roundIndex: round.index, roundName: round.name, matchIndex: mi });
      });
    });
    return list;
  }

  /** 当前轮次序号（用于"第几轮"识别） */
  get currentRoundIndex() {
    return this.currentRound ? this.currentRound.index : 0;
  }

  toJSON() {
    return {
      title: this.title,
      type: this.type,
      rounds: this.rounds.map(r => r.toJSON())
    };
  }

  /* ============================================================
     工厂：从任意历史格式恢复
     - 旧格式：[{a, b}, ...] → 单淘汰第 1 轮
     - 中格式：[{a, b, round: 1}, ...] → 按 round 分组
     - 新格式：{type, rounds:[...]}
  ============================================================ */
  static fromJSON(raw) {
    if (!raw) return null;

    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { return null; }
    }

    /* 旧格式：纯数组，无 round 字段 → 单淘汰第一轮 */
    if (Array.isArray(raw)) {
      const hasRound = raw.some(m => m && typeof m === 'object' && m.round != null);

      if (!hasRound) {
        const matches = raw.map(m => ({
          a: String(m?.a || '').trim(),
          b: String(m?.b || '').trim()
        }));
        const fromCount = matches.length * 2;
        const round = new Round({
          index: 1,
          name: inferRoundName(fromCount, matches.length),
          fromCount,
          toCount: matches.length,
          matches,
          bracket: 'main'
        });
        return new SingleElimination({ rounds: [round] });
      }

      /* 中格式：按 round 分组 */
      const grouped = new Map();
      raw.forEach(m => {
        const r = Number(m.round) || 1;
        if (!grouped.has(r)) grouped.set(r, []);
        grouped.get(r).push({ a: String(m.a || '').trim(), b: String(m.b || '').trim() });
      });
      const sortedKeys = [...grouped.keys()].sort((a, b) => a - b);
      const rounds = sortedKeys.map((key, i) => {
        const matches = grouped.get(key);
        const fromCount = matches.length * 2;
        return new Round({
          index: i + 1,
          name: inferRoundName(fromCount, matches.length),
          fromCount,
          toCount: matches.length,
          matches,
          bracket: 'main'
        });
      });
      return new SingleElimination({ rounds });
    }

    /* 新格式：结构化对象 */
    if (raw && typeof raw === 'object' && Array.isArray(raw.rounds)) {
      const rounds = raw.rounds.map(r => Round.fromJSON(r));
      switch (raw.type) {
        case 'double': return new DoubleElimination({ title: raw.title, rounds });
        case 'group':  return new GroupStage({ title: raw.title, rounds, groups: raw.groups || [] });
        default:       return new SingleElimination({ title: raw.title, rounds });
      }
    }

    return null;
  }
}

/* ============================================================
   SingleElimination —— 单淘汰
============================================================ */
export class SingleElimination extends Tournament {
  constructor(opts = {}) {
    super({ ...opts, type: 'single' });
  }

  /**
   * 根据队伍数自动生成轮次骨架
   * @param {number} teamCount
   */
  static buildRounds(teamCount) {
    const rounds = [];
    let remaining = Math.max(2, Number(teamCount) || 2);
    let index = 1;
    while (remaining > 1) {
      const next = Math.ceil(remaining / 2);
      rounds.push(new Round({
        index,
        name: inferRoundName(remaining, next),
        fromCount: remaining,
        toCount: next,
        matches: Array.from({ length: next }, () => ({ a: '', b: '' })),
        bracket: 'main'
      }));
      remaining = next;
      index++;
    }
    return rounds;
  }
}

/* ============================================================
   DoubleElimination —— 双淘汰
   结构：胜者组 R1..Rn + 败者组 R1..R(n-1) + 总决赛
============================================================ */
export class DoubleElimination extends Tournament {
  constructor(opts = {}) {
    super({ ...opts, type: 'double' });
  }

  get winnerRounds() { return this.rounds.filter(r => r.bracket === 'winner'); }
  get loserRounds()  { return this.rounds.filter(r => r.bracket === 'loser');  }
  get finalRound()   { return this.rounds.find(r => r.bracket === 'final') || null; }

  /**
   * 双淘汰骨架（按队伍数生成）
   * 说明：双淘汰结构较复杂，这里给出标准骨架，具体对阵靠管理员上传
   */
  static buildRounds(teamCount) {
    const teamCountSafe = Math.max(2, Number(teamCount) || 2);
    const rounds = [];
    let remaining = teamCountSafe;
    let wi = 1;
    // 胜者组
    while (remaining > 1) {
      const next = Math.ceil(remaining / 2);
      rounds.push(new Round({
        index: wi,
        name: `胜者组 ${remaining} 进 ${next}`,
        fromCount: remaining,
        toCount: next,
        bracket: 'winner',
        matches: Array.from({ length: next }, () => ({ a: '', b: '' }))
      }));
      remaining = next;
      wi++;
    }
    // 败者组（简化：和胜者组轮数对应，实际结构由上传数据填充）
    let li = 1;
    let loserRemaining = Math.ceil(teamCountSafe / 2);
    while (loserRemaining > 1) {
      const next = Math.ceil(loserRemaining / 2);
      rounds.push(new Round({
        index: 100 + li,
        name: `败者组 ${loserRemaining} 进 ${next}`,
        fromCount: loserRemaining,
        toCount: next,
        bracket: 'loser',
        matches: Array.from({ length: next }, () => ({ a: '', b: '' }))
      }));
      loserRemaining = next;
      li++;
    }
    // 总决赛
    rounds.push(new Round({
      index: 999,
      name: '总决赛',
      fromCount: 2,
      toCount: 1,
      bracket: 'final',
      matches: [{ a: '', b: '' }]
    }));
    return rounds;
  }
}

/* ============================================================
   GroupStage —— 小组赛
   结构：rounds 里每个小组一组对阵，再额外挂"出线赛"
============================================================ */
export class GroupStage extends Tournament {
  constructor(opts = {}) {
    super({ ...opts, type: 'group' });
    this.groups = opts.groups || [];  // [{ name, teams: string[] }]
  }

  get groupCount() { return this.groups.length; }

  toJSON() {
    return {
      ...super.toJSON(),
      groups: this.groups
    };
  }
}

/* ============================================================
   工具函数
============================================================ */

/**
 * 推断轮次显示名
 */
export function inferRoundName(fromCount, toCount) {
  if (fromCount === 2 && toCount === 1) return '总决赛';
  if (fromCount === 4 && toCount === 2) return '半决赛';
  if (fromCount === 8 && toCount === 4) return '四分之一决赛';
  return `${fromCount} 进 ${toCount}`;
}

/**
 * 从队伍数推算"第几轮"
 */
export function inferRoundIndexFromCount(fromCount) {
  if (fromCount === 2) return 'F';   // 决赛
  if (fromCount === 4) return 'SF';  // 半决赛
  if (fromCount === 8) return 'QF';  // 四分之一
  return fromCount;
}

/**
 * 从原始数据（管理员上传）自动构建 Tournament
 * 支持：
 * - 扁平数组（无 round）         → 单淘汰第 1 轮
 * - 扁平数组（带 round）         → 按 round 分组
 * - 结构化对象 {type, rounds}   → 直接用
 * - 结构化对象 {title, matches} → 视为单淘汰第 1 轮
 */
export function buildTournamentFromRaw(raw, fallbackTitle = '赛程') {
  if (!raw) return null;

  // 结构化：{ type, rounds: [...] }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.rounds)) {
    return Tournament.fromJSON(raw);
  }

  // 结构化：{ title, matches: [...] }
  if (raw && typeof raw === 'object' && Array.isArray(raw.matches)) {
    const t = Tournament.fromJSON(raw.matches);
    if (t) t.title = raw.title || t.title;
    return t;
  }

  // 数组
  if (Array.isArray(raw)) {
    const t = Tournament.fromJSON(raw);
    if (t) t.title = fallbackTitle;
    return t;
  }

  return null;
}

/**
 * 工厂：创建指定类型
 */
export function createTournament(type, opts = {}) {
  switch (type) {
    case 'double': return new DoubleElimination(opts);
    case 'group':  return new GroupStage(opts);
    default:       return new SingleElimination(opts);
  }
}
/**
 * 解析赛程数据为 Tournament 对象
 * - 入参可能是：数组 / {type, rounds} / {title, matches} / JSON 字符串
 * - 出参：Tournament 实例，或 null
 *
 * 这个函数是 buildTournamentFromRaw 的别名，主要给 content.js 和 tools.js 使用
 */
export function parseTournament(raw) {
  if (!raw) return null;

  /* 字符串自动 JSON.parse */
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }

  /* 数组 → 走 fromJSON */
  if (Array.isArray(raw)) {
    return Tournament.fromJSON(raw);
  }

  /* 结构化对象 */
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.rounds)) {
      return Tournament.fromJSON(raw);
    }
    if (Array.isArray(raw.matches)) {
      const t = Tournament.fromJSON(raw.matches);
      if (t) t.title = raw.title || t.title;
      return t;
    }
  }

  return null;
}
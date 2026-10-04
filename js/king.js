/* ============================================================
   我是皇帝 · 更新日志
============================================================ */

const CHANGELOG = [
  {
    date: '2026-10-04',
    version: 'v1.6',
    title: '首发与总览',
    items: [
      '新增「我的比赛」独立页面：队长可以为自己队伍的比赛提交首发（4 求生 + 1 监管）',
      '裁判、解说、管理员可查看双方已提交的首发名单',
      '新增管理员「比赛总览」工具：约赛时间、比分、首发名单合并展示',
      '新增「我是皇帝」更新日志页面'
    ]
  },
  {
    date: '2026-10-03',
    version: 'v1.5',
    title: '赛程与队伍升级',
    items: [
      '赛程发布支持单淘汰 / 双淘汰 / 小组赛，自动识别轮次',
      '赛程信息页按轮次分组，每轮默认显示 8 场、其余折叠',
      '赛程卡片排序：已约赛 → 待约赛 → 已完赛',
      '新增「我的队伍」绑定已有队伍功能（含校徽/名称/简称自动带入）',
      '队伍编辑新增「游戏 ID / 游戏 CN / CN 简称 / 位置」四列',
      '管理员队伍管理改为完整页面，支持查看各校详情'
    ]
  },
  {
    date: '2026-10-02',
    version: 'v1.4',
    title: '比分与时间',
    items: [
      '比赛完赛改为提交「大比分 + 每局上下半场小比分」',
      '赛程卡片支持显示大比分与比分待补录状态',
      '全站时间统一按北京时间 (UTC+8) 处理',
      '公告栏新增置顶功能'
    ]
  },
  {
    date: '2026-10-01',
    version: 'v1.3',
    title: '公告与主页',
    items: [
      '主页新增「今日赛程」「最新战报」板块',
      '公告栏默认「动态」标签，支持日期选择器',
      '去除已过期的倒计时 / 报名板块'
    ]
  },
  {
    date: '2026-09-30',
    version: 'v1.2',
    title: '账号与工具',
    items: [
      '账号系统仅保留四种角色：管理员 / 队伍队长 / 裁判 / 解说',
      '网页功能按身份解锁对应工具',
      '约赛时间修复时区问题'
    ]
  },
  {
    date: '2026-09-28',
    version: 'v1.1',
    title: '基础功能',
    items: [
      '约赛系统上线：队长为比赛选择时间',
      '裁判 / 解说可以报名比赛',
      '比赛房间号管理'
    ]
  },
  {
    date: '2026-09-25',
    version: 'v1.0',
    title: '网站上线',
    items: [
      'IVSCL & IVSL 联合官网首版发布',
      '赛事相关页：赛事介绍 / 历届冠亚军 / 特别鸣谢',
      '队伍信息页、赛程信息页'
    ]
  }
];

export function renderKingTimeline() {
  const box = document.getElementById('kingTimeline');
  if (!box) return;

  box.innerHTML = CHANGELOG.map((log, i) => `
    <div class="king-log ${i === 0 ? 'is-latest' : ''}">
      <div class="king-log__line" aria-hidden="true"></div>
      <div class="king-log__dot" aria-hidden="true"></div>
      <div class="king-log__card">
        <div class="king-log__head">
          <span class="king-log__date">${log.date}</span>
          <span class="king-log__version">${log.version}</span>
          ${i === 0 ? '<span class="king-log__badge">最新</span>' : ''}
        </div>
        <h3 class="king-log__title">${log.title}</h3>
        <ul class="king-log__list">
          ${log.items.map(it => `<li>${it}</li>`).join('')}
        </ul>
      </div>
    </div>
  `).join('');
}
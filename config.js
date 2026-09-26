/* ============================================================
   全局配置
============================================================ */

export const API_BASE = 'https://ivscl-api.ivscl-api.workers.dev';

export const TOKEN_KEY = 'ivscl_token';

export const TEAM_LOGO_DIR = 'assets/loge/school/';
export const TEAM_LOGO_EXT = '.jpg';

export const HISTORY_LOGO_DIR = 'assets/loge/school/';
export const HISTORY_LOGO_EXT = '.jpg';

export const ROLE_LABELS = {
  admin: '管理员',
  team:  '参赛队伍',
  judge: '裁判',
  staff: '工作人员',
  press: '媒体',
  fan:   '观众'
};

export const THANKS_SUB_MAP = {
  '代理': 'AGENT',
  '解说': 'COMMENTATOR',
  '裁判': 'REFEREE',
  '合作': 'PARTNER',
  '工作人员': 'STAFF'
};

export const DEFAULT_QAS = [
  { question: "什么时候开赛？", answer: "本届赛事定于 2026 年 10 月 1 日开赛，具体赛程将在报名结束后公布。" },
  { question: "如何报名参赛？", answer: "点击主页左侧「立即报名」按钮，查看报名方式与截止时间。" },
  { question: "队伍信息什么时候公布？", answer: "报名截止后统一公布全部参赛战队与选手名单。" },
  { question: "有哪些比赛项目？", answer: "具体比赛项目将在报名结束后的赛程公告中一并公布。" }
];

export const DEFAULT_HISTORY = [
  { event: "IVSL 25年 · 夏季赛", champion: { name: "进才中学", short: "jczx" }, runnerUp: { name: "华理科中", short: "hlkz" } },
  { event: "IVSL 25年 · 冬季赛", champion: { name: "进才中学", short: "jczx" }, runnerUp: { name: "华理科中", short: "hlkz" } },
  { event: "IVSCL 26年 · 夏季赛", champion: { name: "HX", short: "hx" }, runnerUp: { name: "RES.T1", short: "rest1" } },
  { event: "IVSCL 26年 · 秋季赛", upcoming: true }
];

export const DEFAULT_THANKS = [
  {
    category: "代理", icon: "🎯",
    members: [
      { name: "咸鱼老师",   avatar: "xianyu"   },
      { name: "残响老师",   avatar: "canxiang" },
      { name: "cherry老师", avatar: "cherry"   }
    ]
  },
  {
    category: "解说", icon: "🎙",
    members: [
      { name: "多兰老师", avatar: "duolan" },
      { name: "三笔老师", avatar: "sanbi"  }
    ]
  },
  {
    category: "裁判", icon: "⚖️",
    members: [
      { name: "Eremos老师",    avatar: "eremos" },
      { name: "夏末の晨曦老师", avatar: "xiamo"  }
    ]
  },
  {
    category: "合作", icon: "🤝",
    members: [
      { name: "idvevent第五人格bp软件", avatar: "idvevent" }
    ]
  }
];

/* ============================================================
   页面功能工具定义
   顺序：公共 → 裁判 → 解说 → 管理员
============================================================ */
export const TOOLS_DEF = [
  {
    id: 'bilibili',
    section: 'public',
    icon: '📺',
    title: 'B 站官号',
    desc: '跳转到 IVSCL & IVSL 官方 B 站主页',
    external: 'https://space.bilibili.com/563096834',
    className: 'tool-card--external'
  },
  {
    id: 'rooms',
    section: 'referee',
    icon: '🏠',
    title: '比赛房间',
    desc: '创建和查看比赛房间号，供裁判与管理员使用',
    roles: ['admin', 'judge']
  },
  {
    id: 'announcements',
    section: 'admin',
    icon: '📢',
    title: '公告栏管理',
    desc: '新增或删除官方公告，修改后立即生效',
    roles: ['admin']
  },
  {
    id: 'teams',
    section: 'admin',
    icon: '🛡️',
    title: '队伍管理',
    desc: '报名期间增加或减少参赛队伍',
    roles: ['admin']
  },
  {
    id: 'draw',
    section: 'admin',
    icon: '🎲',
    title: '赛事抽签',
    desc: '为当前参赛队伍随机生成对阵表',
    roles: ['admin']
  }
];

/* 分区信息（显示用的标题） */
export const SECTION_LABELS = {
  public:      { title: '公共工具', sub: 'PUBLIC' },
  referee:     { title: '裁判工具', sub: 'REFEREE' },
  commentator: { title: '解说工具', sub: 'COMMENTATOR' },
  admin:       { title: '管理员工具', sub: 'ADMIN' }
};

/* 分区显示顺序 */
export const SECTION_ORDER = ['public', 'referee', 'commentator', 'admin'];
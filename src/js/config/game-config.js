// ============================================
// 游戏核心配置
// ============================================

// 天干映射：根据元素索引返回对应的天干文字
export const STEMS_MAP = [
  { yang: '甲', yin: '乙' }, // 木 (0)
  { yang: '丙', yin: '丁' }, // 火 (1)
  { yang: '戊', yin: '己' }, // 土 (2)
  { yang: '庚', yin: '辛' }, // 金 (3)
  { yang: '壬', yin: '癸' }  // 水 (4)
];

// 天干数据映射（用于中心天干生成）
export const STEMS_LIST = [
  { name: '甲', color: '#2dcc70', element: 0 }, { name: '乙', color: '#2dcc70', element: 0 }, // 木
  { name: '丙', color: '#ff6b6b', element: 1 }, { name: '丁', color: '#ff6b6b', element: 1 }, // 火
  { name: '戊', color: '#f4a460', element: 2 }, { name: '己', color: '#f4a460', element: 2 }, // 土
  { name: '庚', color: '#e6ebf0', element: 3 }, { name: '辛', color: '#e6ebf0', element: 3 }, // 金
  { name: '壬', color: '#4a90e2', element: 4 }, { name: '癸', color: '#4a90e2', element: 4 }  // 水
];

// 元素颜色配置
export const ELEMENTS_DATA = [
  { cy: '#2dcc70', ci: '#1e8e4e' }, // 木
  { cy: '#ff6b6b', ci: '#c85555' }, // 火
  { cy: '#f4a460', ci: '#c8824b' }, // 土
  { cy: '#e6ebf0', ci: '#d4d8dc' }, // 金
  { cy: '#4a90e2', ci: '#3c73b4' }  // 水
];

// 五行相生相克规则：{s: 相生, k: 相克}
// 木(0) -> 火(1) -> 土(2) -> 金(3) -> 水(4) -> 木(0)
export const RULES = {
  0: { s: 1, k: 2 }, // 木：相生火，相克土
  1: { s: 2, k: 3 }, // 火：相生土，相克金
  2: { s: 3, k: 4 }, // 土：相生金，相克水
  3: { s: 4, k: 0 }, // 金：相生水，相克木
  4: { s: 0, k: 1 }  // 水：相生木，相克火
};

// ============================================
// 气运积分体系 v4 - 行为 + 状态双轨制
// ============================================
// 核心设计：
// 1. 单次得分 = 行为分 + 状态分
// 2. 加持有持续分红，道损有持续亏损（对称设计）
// 3. 核心目的是五行归元（点亮），加持/道损是辅助
// ============================================

export const POINTS_CONFIG = {
  // 【行为分】执行动作的基础分（与状态变化无关）
  ACTION: {
    AUTO: 0,           // 自动吸纳
    CONVERT: 50,       // 调息：阴阳互转
    TRANS: 30,         // 化：流转到生属性
    ATK: 40,           // 破：攻击克属性
    BURST: 100,        // 强化
    BURST_ATK: 80      // 强破
  },

  // 【状态分】节点状态变化的分数（独立于行为类型）
  STATE_CHANGE: {
    // 己方状态提升（正向）
    REPAIR_DMG: { yang: 200, yin: 200 },    // -1 → 0 修复道损
    LIGHT_UP: 100,                           // 0 → 1 点亮
    BLESSING: 200,                           // 1 → 2 加持（归一）

    // 敌方状态破坏（攻击）
    CAUSE_DMG: { yang: 120, yin: 100 },     // 0 → -1 致道损
    BREAK_LIGHT: { yang: 80, yin: 60 },     // 1 → 0 破点亮
    WEAKEN: 80                               // 2 → 1 削弱加持
  },

  // 【回合结算】持续状态的正负反馈
  PASSIVE: {
    UNITY_DIVIDEND: 50,    // 加持分红：每个归一状态(2,2)每回合 +50
    DAMAGE_PENALTY: -40    // 道损亏损：每个道损每回合 -40（与加持对称）
  },

  // 【游戏结算】最终惩罚（兜底，双重惩罚）
  PENALTY: {
    UNREPAIRED_DMG: -100   // 游戏结束时每个道损额外扣分
  },

  // 稀有度乘数（用于计算稀有行为的加成）
  RARITY_MULTIPLIER: 1.5
};

// 游戏配置常量
export const GAME_CONFIG = {
  MAX_TURNS: 60,
  AI_THINK_DELAY: 300,        // AI 思考延迟
  STEM_MANIFEST_DURATION: 500  // 天干显示持续时间
};

// ============================================
// 系统配置常量（集中管理魔法数字）
// ============================================

// 时间配置（毫秒）
export const TIMING = {
  // 动画持续时间
  ANIMATION: {
    SHORT: 300,
    MEDIUM: 600,
    LONG: 1200,
    EXTRA_LONG: 2500
  },

  // 网络轮询间隔
  POLLING: {
    ROOM: 2000,
    RECONNECT_MONITOR: 10000
  },

  // 延迟时间
  DELAY: {
    URL_CHECK: 500,
    STATE_SYNC: 100,
    TURN_SUMMARY: 2000
  }
};

// UI尺寸配置
export const DIMENSIONS = {
  // 节点尺寸
  NODE: {
    STEM_RADIUS: 50,
    STEM_SPACING: 72, // 天干间隔角度 (360/5)
    CENTER_SIZE: 60
  },

  // 视口相关
  VIEWPORT: {
    STEM_SIZE_RATIO: 0.06,
    STEM_SIZE_MAX: 60
  }
};

// 颜色配置
export const COLORS = {
  // 玩家颜色
  P1: {
    PRIMARY: '#ff6b6b',
    SECONDARY: '#ee5a5a'
  },
  P2: {
    PRIMARY: '#4ecdc4',
    SECONDARY: '#3dbdb5'
  },

  // 元素颜色（与 ELEMENTS_DATA 对应）
  ELEMENTS: {
    WOOD: '#2dcc70',
    FIRE: '#ff6b6b',
    EARTH: '#f4a460',
    METAL: '#e6ebf0',
    WATER: '#4a90e2'
  },

  // UI颜色
  UI: {
    SUCCESS: '#52c41a',
    WARNING: '#faad14',
    ERROR: '#f5222d',
    INFO: '#1890ff'
  }
};

// 游戏规则配置
export const RULES_CONFIG = {
  // 重连配置
  RECONNECTION: {
    MAX_RETRIES: 10,
    BASE_DELAY: 1000,
    MAX_DELAY: 30000,
    JITTER_RATIO: 0.25
  },

  // PVP同步
  PVP: {
    STATE_SYNC_INTERVAL: 100,
    TIMEOUT: 10000
  },

  // AI配置
  AI: {
    THINKING_TIME: {
      MIN: 800,
      MAX: 1500
    },
    EXPLORATION_DEPTH: 3
  }
};

// 操作类型名称映射
export const ACTION_NAMES = {
  'CONVERT': '调息',
  'ATK': '破',
  'TRANS': '化',
  'BURST_ATK': '强-破',
  'BURST': '强-化'
};

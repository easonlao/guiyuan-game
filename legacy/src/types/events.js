// ============================================
// 游戏事件类型定义
// ============================================

// 游戏核心事件
export const GAME_EVENTS = {
  STATE_CHANGED: 'game:state-changed',
  STATE_RESET: 'game:state-reset',
  ROLL: 'game:roll',
  SELECT: 'game:select',
  USE_SKILL: 'game:use-skill',
  SCORE_CHANGE: 'game:score-change',
  VICTORY: 'game:victory',
  DRAW: 'game:draw'
};

// UI 事件
export const UI_EVENTS = {
  STATE_CHANGED: 'ui:state-changed',
  STATE_RESET: 'ui:state-reset',
  RENDER: 'ui:render',
  TOGGLE_MENU: 'ui:toggle-menu',
  SHOW_OVERLAY: 'ui:show-overlay',
  HIDE_OVERLAY: 'ui:hide-overlay'
};

// 动画事件
export const ANIMATION_EVENTS = {
  PARTICLE_BURST: 'anim:particle-burst',
  PARTICLE_FLOW: 'anim:particle-flow',
  PARTICLE_SPIRAL: 'anim:particle-spiral',
  TRANSITION_START: 'anim:transition-start',
  TRANSITION_END: 'anim:transition-end'
};

// 输入事件
export const INPUT_EVENTS = {
  MENU_ACTION: 'input:menu-action',
  CARD_CLICK: 'input:card-click',
  TOUCH: 'input:touch',
  KEYBOARD: 'input:keyboard'
};

// 玩家事件
export const PLAYER_EVENTS = {
  LOGIN: 'player:login',
  LOGOUT: 'player:logout',
  PROFILE_UPDATED: 'player:profile-updated',
  PLAYER_JOINED: 'net:player-joined'
};

// 排行榜事件
export const LEADERBOARD_EVENTS = {
  REFRESH: 'leaderboard:refresh',
  UPDATED: 'leaderboard:updated'
};

// ============================================
// 权威服务器事件（新增）
// ============================================

// 命令事件
export const COMMAND_EVENTS = {
  SUBMIT: 'COMMAND:submit',         // 提交命令
  CONFIRMED: 'COMMAND:confirmed',   // 命令已确认
  REJECTED: 'COMMAND:rejected',     // 命令被拒绝
  EXECUTE: 'COMMAND:execute',       // 执行命令
  TIMEOUT: 'COMMAND:timeout'        // 命令超时
};

// 状态同步事件
export const STATE_EVENTS = {
  SYNC: 'STATE:sync',                      // 状态同步
  SNAPSHOT_APPLIED: 'STATE:snapshot-applied',  // 快照已应用
  CONFLICT: 'STATE:conflict'               // 状态冲突
};

// 重连事件
export const RECONNECT_EVENTS = {
  DISCONNECTED: 'RECONNECT:disconnected',  // 已断线
  SUCCESS: 'RECONNECT:success',            // 重连成功
  FAILED: 'RECONNECT:failed'               // 重连失败
};

// ============================================
// 事件类型定义
// ============================================
// 职责：
// - 定义所有事件的类型和结构
// - 提供类型检查和验证
// ============================================

// ==================== 输入事件 ====================
export const INPUT_EVENTS = {
  MENU_ACTION: 'input:menu-action',
  CARD_CLICK: 'input:card-click',
  TOUCH: 'input:touch',
  KEYBOARD: 'input:keyboard'
};

// ==================== 游戏事件 ====================
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

// ==================== UI 事件 ====================
export const UI_EVENTS = {
  STATE_CHANGED: 'ui:state-changed',
  STATE_RESET: 'ui:state-reset',
  RENDER: 'ui:render',
  TOGGLE_MENU: 'ui:toggle-menu',
  SHOW_OVERLAY: 'ui:show-overlay',
  HIDE_OVERLAY: 'ui:hide-overlay'
};

// ==================== 动画事件 ====================
export const ANIMATION_EVENTS = {
  PARTICLE_BURST: 'anim:particle-burst',
  PARTICLE_FLOW: 'anim:particle-flow',
  PARTICLE_SPIRAL: 'anim:particle-spiral',
  TRANSITION_START: 'anim:transition-start',
  TRANSITION_END: 'anim:transition-end'
};

// ==================== 网络事件 ====================
export const NETWORK_EVENTS = {
  CONNECT: 'net:connect',
  DISCONNECT: 'net:disconnect',
  STATE_SYNC: 'net:state-sync',
  PLAYER_JOINED: 'net:player-joined',
  PLAYER_LEFT: 'net:player-left'
};

// ==================== 玩家事件 ====================
export const PLAYER_EVENTS = {
  LOGIN: 'player:login',
  LOGOUT: 'player:logout',
  PROFILE_UPDATED: 'player:profile-updated'
};

// ==================== 排行榜事件 ====================
export const LEADERBOARD_EVENTS = {
  REFRESH: 'leaderboard:refresh',
  UPDATED: 'leaderboard:updated'
};

export default {
  INPUT: INPUT_EVENTS,
  GAME: GAME_EVENTS,
  UI: UI_EVENTS,
  ANIMATION: ANIMATION_EVENTS,
  NETWORK: NETWORK_EVENTS,
  PLAYER: PLAYER_EVENTS,
  LEADERBOARD: LEADERBOARD_EVENTS
};

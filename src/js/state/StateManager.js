// ============================================
// 状态管理系统
// ============================================
// @file 状态管理器
// @description 管理游戏全局状态，提供不可变状态更新
// @author 归元奕团队
// @created 2026-01-01
//
// 职责：
// - 管理游戏状态（不可变数据）
// - 提供状态查询和更新接口
// - 自动触发 UI 更新
// ============================================

import EventBus from '../bus/EventBus.js';
import { GAME_EVENTS } from '../types/events.js';
import { POINTS_CONFIG } from '../config/game-config.js';
import { deepMerge, updatePath as updatePathUtil, shallowCopy } from './ImmutableState.js';

/**
 * @typedef {Object} GameState
 * @property {string} phase - 当前游戏阶段 ('HOME'|'INITIATIVE'|'STEM_GENERATION'|'DECISION'|'GAME_END')
 * @property {string|null} myRole - 当前玩家的角色 ('P1'|'P2'|null)
 * @property {number} gameMode - 游戏模式 (0: PvP, 1: PvAI, 2: AIvAI)
 * @property {number} turnCount - 当前回合数
 * @property {number} maxTurns - 最大回合数
 * @property {string} currentPlayer - 当前玩家 ('P1'|'P2')
 * @property {boolean} isExtraTurn - 是否是额外机会回合
 * @property {Object} players - 玩家状态
 * @property {Object} nodeStates - 节点状态存储
 * @property {Object|null} currentStem - 当前生成的天干
 * @property {Object} turnScoreChanges - 本回合积分变化
 * @property {Object|null} lastAction - 上一步操作记录
 * @property {boolean} pendingSettlement - 是否有待显示的结算效果
 * @property {Object} actionStats - 行为统计
 * @property {Object} actionScores - 行为得分统计
 * @property {Object} stateStats - 状态统计
 * @property {Object} stateScores - 状态得分统计
 * @property {Object} passiveStats - 被动统计
 * @property {Object} passiveScores - 被动得分统计
 */

/**
 * @typedef {Object} PlayerState
 * @property {string} id - 玩家ID ('P1'|'P2')
 * @property {number} score - 当前分数
 * @property {boolean} burstBonus - 是否有额外机会
 * @property {string} type - 玩家类型 ('HUMAN'|'AI')
 */

// 稀有度概率配置
const ACTION_PROBABILITY = {
  'AUTO': 1.0, 'ATK': 0.518, 'TRANS': 0.243,
  'CONVERT': 0.167, 'BURST': 0.035, 'BURST_ATK': 0.036
};

const initialState = {
  // 游戏阶段: 'HOME', 'INITIATIVE', 'STEM_GENERATION', 'DECISION', 'GAME_END'
  phase: 'HOME',

  // 当前玩家的角色（用于 PVP 镜像显示）: 'P1' | 'P2' | null
  myRole: null,

  // 游戏模式: 0: PvP, 1: PvAI, 2: AIvAI
  gameMode: 1,

  // 回合信息
  turnCount: 0,
  maxTurns: 60,
  currentPlayer: 'P1', // 'P1' 或 'P2'
  isExtraTurn: false, // 当前是否是额外机会回合（强化/强破后）

  // 玩家状态
  players: {
    P1: { 
      id: 'P1',
      score: 0, 
      burstBonus: true, // 额外机会
      type: 'HUMAN'     // 'HUMAN' or 'AI'
    },
    P2: { 
      id: 'P2',
      score: 0, 
      burstBonus: true, 
      type: 'AI'
    }
  },

  // 节点状态存储
  // Key格式: `${playerId}-${elementIndex}` (例如 "P1-0" 代表P1的木属性节点)
  // Value: { yang: 0, yin: 0 }  (-1:道损, 0:虚空, 1:点亮, 2:加持)
  nodeStates: {},

  // 回合内临时数据
  currentStem: null, // 当前生成的天干 { name: '甲', element: 0, color: ... }
  turnScoreChanges: { P1: 0, P2: 0 }, // 本回合积分变化
  lastAction: null, // 上一步操作记录
  pendingSettlement: false, // 是否有待显示的结算效果（用于控制天干生成延迟）

  // 【分层统计】- 用于游戏结束界面展示
  // 1. 行为统计：记录执行的动作
  actionStats: {
    P1: { '调息': 0, '化': 0, '破': 0, '强化': 0, '强破': 0 },
    P2: { '调息': 0, '化': 0, '破': 0, '强化': 0, '强破': 0 }
  },
  actionScores: {
    P1: { '调息': 0, '化': 0, '破': 0, '强化': 0, '强破': 0 },
    P2: { '调息': 0, '化': 0, '破': 0, '强化': 0, '强破': 0 }
  },

  // 2. 状态统计：记录状态变化
  stateStats: {
    P1: {
      '点亮': 0, '修复道损': 0, '加持': 0,
      '致阳道损': 0, '致阴道损': 0, '破阳点亮': 0, '破阴点亮': 0, '削弱加持': 0
    },
    P2: {
      '点亮': 0, '修复道损': 0, '加持': 0,
      '致阳道损': 0, '致阴道损': 0, '破阳点亮': 0, '破阴点亮': 0, '削弱加持': 0
    }
  },
  stateScores: {
    P1: {
      '点亮': 0, '修复道损': 0, '加持': 0,
      '致阳道损': 0, '致阴道损': 0, '破阳点亮': 0, '破阴点亮': 0, '削弱加持': 0
    },
    P2: {
      '点亮': 0, '修复道损': 0, '加持': 0,
      '致阳道损': 0, '致阴道损': 0, '破阳点亮': 0, '破阴点亮': 0, '削弱加持': 0
    }
  },

  // 3. 被动统计：记录回合结算
  passiveStats: {
    P1: { '天道分红': 0, '道损亏损': 0, '最终道损惩罚': 0 },
    P2: { '天道分红': 0, '道损亏损': 0, '最终道损惩罚': 0 }
  },
  passiveScores: {
    P1: { '天道分红': 0, '道损亏损': 0, '最终道损惩罚': 0 },
    P2: { '天道分红': 0, '道损亏损': 0, '最终道损惩罚': 0 }
  }
};

// 初始化节点状态
function initNodeStates() {
  const states = {};
  ['P1', 'P2'].forEach(player => {
    for (let i = 0; i < 5; i++) {
      states[`${player}-${i}`] = { yang: 0, yin: 0 };
    }
  });
  return states;
}

// 填充初始节点状态
initialState.nodeStates = initNodeStates();

let state = shallowCopy(initialState);

const StateManager = {
  /**
   * 获取当前状态（返回副本）
   * @returns {GameState} 当前游戏状态的只读副本
   */
  getState() {
    return shallowCopy(state);
  },

  /**
   * 获取特定节点的状态
   * @param {string} playerId 'P1' | 'P2'
   * @param {number} elementIndex 0-4
   */
  getNodeState(playerId, elementIndex) {
    const key = `${playerId}-${elementIndex}`;
    return state.nodeStates[key] || { yang: 0, yin: 0 };
  },

  /**
   * 更新状态
   * @param {Partial<GameState>} updates - 状态更新
   * @param {boolean} [silent=false] - 是否静默更新（不触发事件）
   * @returns {GameState} 更新后的状态
   * @fires GAME_EVENTS.STATE_CHANGED
   */
  update(updates, silent = false) {
    const oldState = state;

    // 使用高效的不可变更新
    state = deepMerge(state, updates);

    if (!silent) {
      EventBus.emit(GAME_EVENTS.STATE_CHANGED, {
        old: oldState,
        new: state,
        updates
      });
    }

    return state;
  },

  /**
   * 更新嵌套路径（使用点分隔的路径）
   * @param {string} path - 点分隔的路径（如 'players.P1.score'）
   * @param {*} value - 新值
   * @param {boolean} [silent=false] - 是否静默更新
   * @returns {GameState} 更新后的状态
   * @fires GAME_EVENTS.STATE_CHANGED
   */
  updatePath(path, value, silent = false) {
    const oldState = state;
    state = updatePathUtil(state, path, value);

    if (!silent) {
      EventBus.emit(GAME_EVENTS.STATE_CHANGED, {
        old: oldState,
        new: state,
        path,
        value
      });
    }

    return state;
  },

  /**
   * 更新单个节点状态
   */
  updateNodeState(playerId, elementIndex, isYang, newState) {
    const key = `${playerId}-${elementIndex}`;
    const currentNodeState = state.nodeStates[key] || { yang: 0, yin: 0 };
    
    const updatedNodeState = {
      ...currentNodeState,
      [isYang ? 'yang' : 'yin']: newState
    };

    const updates = {
      nodeStates: {
        ...state.nodeStates,
        [key]: updatedNodeState
      }
    };

    this.update(updates);
    
    // 触发特定节点的更新事件，方便渲染器只更新该节点
    EventBus.emit('game:node-changed', {
      playerId,
      elementIndex,
      isYang,
      newState,
      fullState: updatedNodeState
    });
  },

  /**
   * 增加分数
   * @param {string} playerId - 玩家ID
   * @param {number} amount - 分数
   * @param {string} reason - 得分原因
   * @param {string} actionType - 行为类型（用于稀有度计算）
   */
  addScore(playerId, amount, reason = '', actionType = null) {
    if (amount === 0) return;

    const currentScore = state.players[playerId].score;
    const currentTurnChange = state.turnScoreChanges[playerId];

    const updates = {
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId],
          score: currentScore + amount
        }
      },
      turnScoreChanges: {
        ...state.turnScoreChanges,
        [playerId]: currentTurnChange + amount
      }
    };

    this.update(updates);

    // 根据原因记录到对应的统计类别
    this._recordScoreByReason(playerId, reason, actionType, amount);

    EventBus.emit(GAME_EVENTS.SCORE_CHANGE, {
      playerId,
      amount,
      reason,
      totalScore: currentScore + amount
    });
  },

  /**
   * 根据得分原因记录统计（支持"动作·状态"格式拆分）
   * @param {string} playerId - 玩家ID
   * @param {string} reason - 得分原因
   * @param {string} actionType - 动作类型
   * @param {number} amount - 分数
   * @private
   */
  _recordScoreByReason(playerId, reason, actionType, amount) {
    const cleanReason = this._extractCleanReason(reason);

    // 被动类：直接记录
    if (['DIVIDEND', 'DAMAGE_PENALTY', 'FINAL_PENALTY'].includes(actionType)) {
      this._recordStat(playerId, 'passive', cleanReason, amount);
      return;
    }

    // 检查是否为组合格式："动作·状态"
    if (cleanReason.includes('·')) {
      const [actionName, stateName] = cleanReason.split('·');

      // 分别计算行为分和状态分（按配置比例拆分）
      const actionScore = this._calculateActionScore(actionType);
      const stateScore = this._calculateStateScore(actionName, stateName);

      // 记录行为统计
      if (actionScore > 0 && state.actionStats[playerId][actionName] !== undefined) {
        state.actionStats[playerId][actionName]++;
        state.actionScores[playerId][actionName] += this._applyRarityBonus(actionScore, actionType);
      }

      // 记录状态统计
      if (stateScore > 0 && state.stateStats[playerId][stateName] !== undefined) {
        state.stateStats[playerId][stateName]++;
        state.stateScores[playerId][stateName] += this._applyRarityBonus(stateScore, actionType);
      }
    } else {
      // 非组合格式，按原逻辑判断
      const statType = this._classifyStatType(actionType, cleanReason);
      this._recordStat(playerId, statType, cleanReason, amount);
    }
  },

  /**
   * 计算行为分
   * @private
   */
  _calculateActionScore(actionType) {
    return POINTS_CONFIG?.ACTION?.[actionType] || 0;
  },

  /**
   * 计算状态分
   * @private
   */
  _calculateStateScore(actionName, stateName) {
    const stateChange = POINTS_CONFIG?.STATE_CHANGE;
    if (!stateChange) return 0;

    // 根据状态名称返回对应分数
    if (stateName === '点亮') return stateChange.LIGHT_UP || 0;
    if (stateName === '加持') return stateChange.BLESSING || 0;
    if (stateName === '修复道损') return stateChange.REPAIR_DMG?.yang || 0;
    if (stateName === '致阳道损') return stateChange.CAUSE_DMG?.yang || 0;
    if (stateName === '致阴道损') return stateChange.CAUSE_DMG?.yin || 0;
    if (stateName === '破阳点亮') return stateChange.BREAK_LIGHT?.yang || 0;
    if (stateName === '破阴点亮') return stateChange.BREAK_LIGHT?.yin || 0;
    if (stateName === '削弱加持') return stateChange.WEAKEN || 0;

    return 0;
  },

  /**
   * 应用稀有度加成
   * @private
   */
  _applyRarityBonus(score, actionType) {
    const prob = ACTION_PROBABILITY[actionType] || 0.5;
    const rarityBonus = score * (1 - prob) * (POINTS_CONFIG?.RARITY_MULTIPLIER || 1.5);
    return Math.round(score + rarityBonus);
  },

  /**
   * 判断统计类型（行为/状态/被动）
   * @param {string} actionType - 动作类型
   * @param {string} reason - 得分原因
   * @returns {string} - 'action' | 'state' | 'passive'
   * @private
   */
  _classifyStatType(actionType, reason) {
    // 被动类：回合结算
    if (['DIVIDEND', 'DAMAGE_PENALTY', 'FINAL_PENALTY'].includes(actionType)) {
      return 'passive';
    }
    // 状态类：根据 reason 判断
    if (['点亮', '修复道损', '加持', '致阳道损', '致阴道损', '破阳点亮', '破阴点亮', '削弱加持'].includes(reason)) {
      return 'state';
    }
    // 默认行为类
    return 'action';
  },

  /**
   * 记录统计到对应的类别
   * @param {string} playerId - 玩家ID
   * @param {string} statType - 统计类型 ('action' | 'state' | 'passive')
   * @param {string} cleanReason - 清理后的原因
   * @param {number} amount - 分数
   * @private
   */
  _recordStat(playerId, statType, cleanReason, amount) {
    let stats, scores;

    switch (statType) {
      case 'state':
        stats = state.stateStats;
        scores = state.stateScores;
        break;
      case 'passive':
        stats = state.passiveStats;
        scores = state.passiveScores;
        break;
      default:
        stats = state.actionStats;
        scores = state.actionScores;
    }

    if (stats[playerId][cleanReason] !== undefined) {
      stats[playerId][cleanReason]++;
      scores[playerId][cleanReason] += amount;
    }
  },

  /**
   * 提取纯净的原因名称（去除括号中的额外信息）
   * @param {string} reason - 原始原因
   * @returns {string}
   * @private
   */
  _extractCleanReason(reason) {
    // 匹配括号前的内容，例如 "天道分红(3)" → "天道分红"
    const match = reason.match(/^([^(]+)/);
    return match ? match[1].trim() : reason;
  },

  /**
   * 切换玩家
   * @param {string} [nextPlayer] - 可选的下一个玩家，如果不提供则自动切换
   * @param {boolean} [isExtraTurn] - 是否是额外机会回合
   */
  switchPlayer(nextPlayer, isExtraTurn = false) {
    // 如果没有提供 nextPlayer，则自动切换
    if (nextPlayer === undefined) {
      nextPlayer = state.currentPlayer === 'P1' ? 'P2' : 'P1';
    }

    // 重置回合临时数据（包括清除旧天干）
    const updates = {
      currentPlayer: nextPlayer,
      isExtraTurn: isExtraTurn,
      turnScoreChanges: { P1: 0, P2: 0 },
      currentStem: null  // 清除旧天干，准备下一回合
    };

    // 如果切换回来的玩家还有 burstBonus (重置逻辑在业务层控制，这里只是状态容器)
    // 原逻辑：burstBonusAvailable[targetPlayer] = true;
    // 这里我们假设业务层会在适当时候调用 resetBurstBonus

    this.update(updates);
  },

  /**
   * 重置游戏
   */
  reset() {
    state = shallowCopy(initialState);
    // 重新生成新的节点状态引用
    state.nodeStates = initNodeStates();

    EventBus.emit(GAME_EVENTS.STATE_RESET, state);
  },

  /**
   * 设置游戏模式并初始化玩家类型
   */
  setGameMode(mode) {
    let p1Type = 'HUMAN';
    let p2Type = 'AI'; // Default PvAI

    if (mode === 0) { // PvP
      p2Type = 'HUMAN';
    } else if (mode === 2) { // AIvAI
      p1Type = 'AI';
      p2Type = 'AI';
    }

    const updates = {
      gameMode: mode,
      players: {
        P1: { ...state.players.P1, type: p1Type },
        P2: { ...state.players.P2, type: p2Type }
      }
    };

    this.update(updates);
  },

  /**
   * 记录行为统计（已废弃，统计现在由 addScore 自动处理）
   * @deprecated
   */
  recordAction(playerId, actionType) {
    // 静默记录日志，不再修改统计数据
  },

  /**
   * 获取行为统计
   */
  getActionStats(playerId) {
    return state.actionStats[playerId];
  },

  /**
   * 获取状态统计
   */
  getStateStats(playerId) {
    return state.stateStats[playerId];
  },

  /**
   * 获取被动统计
   */
  getPassiveStats(playerId) {
    return state.passiveStats[playerId];
  },

  /**
   * 获取行为得分统计
   */
  getActionScores(playerId) {
    return state.actionScores[playerId];
  },

  /**
   * 获取状态得分统计
   */
  getStateScores(playerId) {
    return state.stateScores[playerId];
  },

  /**
   * 获取被动得分统计
   */
  getPassiveScores(playerId) {
    return state.passiveScores[playerId];
  },

  /**
   * 设置当前玩家的角色（用于 PVP 镜像显示）
   * @param {string} role - 'P1' | 'P2' | null
   */
  setMyRole(role) {
    state.myRole = role;
  },

  /**
   * 获取当前玩家的角色
   * @returns {string|null} - 'P1' | 'P2' | null
   */
  getMyRole() {
    return state.myRole;
  },

  /**
   * 获取所有统计（分层结构）
   */
  getAllStats() {
    return {
      action: state.actionStats,
      state: state.stateStats,
      passive: state.passiveStats
    };
  },

  /**
   * 获取所有得分（分层结构）
   */
  getAllScores() {
    return {
      action: state.actionScores,
      state: state.stateScores,
      passive: state.passiveScores
    };
  }
};

export default StateManager;
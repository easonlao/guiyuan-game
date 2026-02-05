// ============================================
// 主机权威执行器
// ============================================
// 职责：
// - P1（主机）的权威逻辑模块
// - 所有随机性操作的统一入口
// - 提供可测试的确定性随机
// ============================================

import { STEMS_LIST } from '../config/game-config.js';

const AuthorityExecutor = {
  // 当前玩家是否是主机
  _isHost: false,
  // 上一回合是否执行了强化/强破（触发额外机会）
  _burstExtraPlayer: null,

  /**
   * 初始化
   */
  init() {
    console.log('[AuthorityExecutor] 初始化');
  },

  /**
   * 设置为主机
   */
  setAsHost() {
    this._isHost = true;
    console.log('[AuthorityExecutor] 设置为主机');
  },

  /**
   * 重置主机状态
   */
  reset() {
    this._isHost = false;
    this._burstExtraPlayer = null;
    console.log('[AuthorityExecutor] 重置');
  },

  /**
   * 检查是否是主机
   * @returns {boolean}
   */
  isHost() {
    return this._isHost;
  },

  /**
   * 设置强化/强破玩家（触发额外机会）
   * @param {string} playerId - 玩家ID
   * @param {boolean} isExtraTurn - 是否是额外机会回合中执行的
   */
  setLastBurstAction(playerId, isExtraTurn = false) {
    // 只有非额外机会回合中执行的强化/强破才给予额外机会
    if (!isExtraTurn) {
      this._burstExtraPlayer = playerId;
      console.log('[AUTHORITY] 设置强化玩家:', playerId, '下回合保持当前玩家');
    } else {
      console.log('[AUTHORITY] 额外机会回合中的强化/强破，不再给予额外机会');
    }
  },

  /**
   * 生成天干（只有主机）
   * @returns {Object} { stem, seed }
   */
  generateStem() {
    if (!this._isHost) {
      console.warn('[AuthorityExecutor] 非主机，无法生成天干');
      return null;
    }

    const seed = Math.floor(Math.random() * STEMS_LIST.length);
    const stem = STEMS_LIST[seed];

    console.log('[AUTHORITY] Host generated stem:', stem.name, 'seed:', seed);
    return { stem, seed };
  },

  /**
   * 判定先手（只有主机）
   * @returns {Object} { firstPlayer, firstStem }
   */
  determineInitiative() {
    if (!this._isHost) {
      console.warn('[AuthorityExecutor] 非主机，无法判定先手');
      return null;
    }

    const firstPlayer = Math.random() > 0.5 ? 'P1' : 'P2';
    const firstStemIndex = Math.floor(Math.random() * STEMS_LIST.length);
    const firstStem = STEMS_LIST[firstStemIndex];

    console.log('[AUTHORITY] Host determined initiative:', firstPlayer, 'firstStem:', firstStem.name);

    return { firstPlayer, firstStem };
  },

  /**
   * 计算下个回合（主机和单机模式）
   * @param {string} currentPlayer - 当前玩家
   * @param {boolean} isExtraTurn - 当前是否是额外机会回合
   * @returns {Object} { nextPlayer, nextIsExtraTurn }
   */
  calculateNextPlayer(currentPlayer, isExtraTurn = false) {
    // 单机模式和 PvP 主机都可以计算下个玩家
    // 只有 PvP 客户端才不能调用此方法
    if (!this._isHost && typeof window !== 'undefined' && window.SimplifiedPVPManager && window.SimplifiedPVPManager.isEnabled) {
      console.warn('[AuthorityExecutor] PvP 客户端，无法计算下个回合');
      return null;
    }

    let nextPlayer;
    let nextIsExtraTurn = false;

    if (isExtraTurn) {
      // 当前是额外机会回合，下回合正常切换玩家
      nextPlayer = currentPlayer === 'P1' ? 'P2' : 'P1';
      console.log('[AUTHORITY] 额外机会结束，正常切换玩家:', currentPlayer, '→', nextPlayer);
    } else if (this._burstExtraPlayer === currentPlayer) {
      // 上回合执行了强化/强破，这回合是额外机会
      nextPlayer = currentPlayer;
      nextIsExtraTurn = true;
      // 清除标志（但下一回合会检查 isExtraTurn，所以不会再次给予额外机会）
      this._burstExtraPlayer = null;
      console.log('[AUTHORITY] 强化额外行动:', currentPlayer, '→', nextPlayer);
    } else {
      // 正常切换玩家
      nextPlayer = currentPlayer === 'P1' ? 'P2' : 'P1';
      console.log('[AUTHORITY] 正常切换玩家:', currentPlayer, '→', nextPlayer);
    }

    return { nextPlayer, nextIsExtraTurn };
  },

  /**
   * 确认操作（只有主机）
   * @param {Object} action - 操作对象
   * @returns {Object} { confirmed, action }
   */
  confirmAction(action) {
    if (!this._isHost) {
      console.warn('[AuthorityExecutor] 非主机，无法确认操作');
      return { confirmed: false, action: null };
    }

    // TODO: 添加操作验证逻辑
    console.log('[AUTHORITY] Host confirmed action:', action.type);

    return { confirmed: true, action };
  }
};

export default AuthorityExecutor;

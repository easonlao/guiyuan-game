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
  },

  /**
   * 设置为主机
   */
  setAsHost() {
    this._isHost = true;
  },

  /**
   * 重置主机状态
   */
  reset() {
    this._isHost = false;
    this._burstExtraPlayer = null;
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
    } else {
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
    } else if (this._burstExtraPlayer === currentPlayer) {
      // 上回合执行了强化/强破，这回合是额外机会
      nextPlayer = currentPlayer;
      nextIsExtraTurn = true;
      // 清除标志（但下一回合会检查 isExtraTurn，所以不会再次给予额外机会）
      this._burstExtraPlayer = null;
    } else {
      // 正常切换玩家
      nextPlayer = currentPlayer === 'P1' ? 'P2' : 'P1';
    }

    return { nextPlayer, nextIsExtraTurn };
  },

  /**
   * 确认操作（只有主机）
   * @param {Object} action - 操作对象
   * @returns {Object} { confirmed, action }
   *
   * 注意：操作验证功能为未来增强项
   * 可能的验证内容：
   * - 验证操作是否在当前玩家回合
   * - 验证操作参数是否合法
   * - 验证节点状态是否允许该操作
   *
   * 当前版本：所有验证由 GameEngine 处理
   */
  confirmAction(action) {
    if (!this._isHost) {
      console.warn('[AuthorityExecutor] 非主机，无法确认操作');
      return { confirmed: false, action: null };
    }

    // 当前版本直接确认，具体验证在 GameEngine 中进行

    return { confirmed: true, action };
  }
};

export default AuthorityExecutor;

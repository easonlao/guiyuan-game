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
   * 计算下个回合（只有主机）
   * @param {string} currentPlayer - 当前玩家
   * @returns {Object} { nextPlayer }
   */
  calculateNextPlayer(currentPlayer) {
    if (!this._isHost) {
      console.warn('[AuthorityExecutor] 非主机，无法计算下个回合');
      return null;
    }

    const nextPlayer = currentPlayer === 'P1' ? 'P2' : 'P1';

    console.log('[AUTHORITY] Host calculated next player:', currentPlayer, '→', nextPlayer);

    return { nextPlayer };
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

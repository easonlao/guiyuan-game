// ============================================
// 天干显示效果控制器
// ============================================
// 职责：
// - 触发天干显示动画
// - 管理天干元素状态转换
// - 发送天干检查事件
// ============================================

import EventBus from '../../bus/EventBus.js';
import StateManager from '../../state/StateManager.js';
import { GAME_CONFIG } from '../../config/game-config.js';

const StemManifestation = {
  /**
   * 触发天干显示效果
   * @param {HTMLElement} stemEl - 天干元素
   * @param {Object} stem - 天干对象
   * @param {string} playerId - 玩家ID
   * @param {Object} animatingNodes - 动画中的节点映射
   */
  triggerManifestation(stemEl, stem, playerId, animatingNodes) {
    stemEl.style.transition = 'all 0.1s ease-in';
    stemEl.style.transform = 'translate(-50%, -50%) scale(0.1)';

    setTimeout(() => {
      this._applyStemDisplay(stemEl, stem);
      this._cleanupAnimationLock(playerId, stem, animatingNodes);
      this._emitCheckRequest(stem, playerId);
    }, 100);
  },

  /**
   * 应用天干显示样式
   * @param {HTMLElement} stemEl - 天干元素
   * @param {Object} stem - 天干对象
   * @private
   */
  _applyStemDisplay(stemEl, stem) {
    stemEl.style.background = 'transparent';
    stemEl.style.width = 'auto';
    stemEl.style.height = 'auto';
    stemEl.innerText = stem.name;
    stemEl.style.color = stem.color;
    stemEl.style.textShadow = `0 0 20px ${stem.color}, 2px 2px 0px #000`;

    stemEl.style.transition = 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.5)';
    stemEl.style.transform = 'translate(-50%, -50%) scale(1.3)';
    stemEl.style.opacity = '1';
  },

  /**
   * 清理动画锁
   * @param {string} playerId - 玩家ID
   * @param {Object} stem - 天干对象
   * @param {Object} animatingNodes - 动画中的节点映射
   * @private
   */
  _cleanupAnimationLock(playerId, stem, animatingNodes) {
    const nodeKey = `${playerId}-${stem.element}`;
    if (animatingNodes[nodeKey]) {
      delete animatingNodes[nodeKey];
    }
  },

  /**
   * 发送天干检查请求
   * @param {Object} stem - 天干对象
   * @param {string} playerId - 玩家ID
   * @private
   */
  _emitCheckRequest(stem, playerId) {
    setTimeout(() => {
      // 获取最新的状态，确保 playerId 是当前回合玩家
      const state = StateManager.getState();
      const currentPlayer = state.currentPlayer;

      // 只有当前回合玩家才触发检查请求
      if (playerId !== currentPlayer) {
        return;
      }

      EventBus.emit('ui:request-stem-check', { stem, playerId });
    }, GAME_CONFIG.STEM_MANIFEST_DURATION);
  }
};

export default StemManifestation;

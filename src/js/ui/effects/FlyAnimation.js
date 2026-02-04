// ============================================
// 飞行动画控制器（主协调器）
// ============================================
// 职责：
// - 协调第一段和第二段飞行动画
// - 管理飞行序列
// - 处理飞行完成后的状态刷新
// ============================================

import FirstFlight from './FirstFlight.js';
import SecondFlight from './SecondFlight.js';
import NodeRenderer from '../board/NodeRenderer.js';

console.log('[FlyAnimation] SecondFlight imported:', SecondFlight);
console.log('[FlyAnimation] typeof SecondFlight:', typeof SecondFlight);
console.log('[FlyAnimation] SecondFlight.playSecondaryFlight:', typeof SecondFlight?.playSecondaryFlight);

const FlyAnimation = {
  /**
   * 处理完整的飞行动画序列
   * @param {Object} data - 飞行数据 {stem, playerId, actionType, secondaryTarget}
   * @param {Function} flushPendingState - 刷新待处理状态的回调
   * @param {Object} animatingNodes - 动画中的节点映射
   * @param {Function} updateNodeStyle - 更新样式的回调
   */
  handleFlyAction(data, flushPendingState, animatingNodes, updateNodeStyle) {
    console.log('[FlyAnimation] ========== handleFlyAction ==========');
    console.log('[FlyAnimation] data:', data);
    console.log('[FlyAnimation] secondaryTarget:', data.secondaryTarget);
    const { stem, playerId, actionType, secondaryTarget } = data;
    const starEl = document.getElementById(`${playerId.toLowerCase()}-star`);
    const container = starEl?.querySelector('.pentagram-container');

    console.log('[FlyAnimation] starEl:', !!starEl, 'container:', !!container);
    if (!container) {
      console.error('[FlyAnimation] container not found!');
      return;
    }

    FirstFlight.handleFirstFlight(stem, playerId, container, () => {
      console.log('[FlyAnimation] FirstFlight 完成');
      this._onFirstFlightComplete(stem, playerId, actionType, secondaryTarget, flushPendingState, animatingNodes, updateNodeStyle);
    });
  },

  /**
   * 第一段飞行完成后的处理
   * @param {Object} stem - 天干对象
   * @param {string} playerId - 玩家ID
   * @param {string} actionType - 动作类型
   * @param {Object} secondaryTarget - 次要目标
   * @param {Function} flushPendingState - 刷新状态回调
   * @param {Object} animatingNodes - 动画中的节点映射
   * @param {Function} updateNodeStyle - 更新样式的回调
   * @private
   */
  _onFirstFlightComplete(stem, playerId, actionType, secondaryTarget, flushPendingState, animatingNodes, updateNodeStyle) {
    if (secondaryTarget) {
      NodeRenderer.flushPendingState(playerId, stem.element, animatingNodes, updateNodeStyle);
      const starEl = document.getElementById(`${playerId.toLowerCase()}-star`);
      const myNode = starEl?.querySelector(`.node[data-index="${stem.element}"]`);
      if (myNode) {
        SecondFlight.playSecondFlight(stem, myNode, secondaryTarget, actionType, animatingNodes, updateNodeStyle);
      }
    } else {
      NodeRenderer.flushPendingState(playerId, stem.element, animatingNodes, updateNodeStyle);
    }
  },

  /**
   * 播放二段飞行（暴露给外部调用）
   * @param {Object} stem - 天干对象
   * @param {HTMLElement} startNode - 起始节点
   * @param {Object} targetInfo - 目标信息
   * @param {string} actionType - 动作类型
   * @param {Object} animatingNodes - 动画中的节点映射
   * @param {Function} updateNodeStyle - 更新样式的回调
   */
  playSecondaryFlight(stem, startNode, targetInfo, actionType, animatingNodes = null, updateNodeStyle = null) {
    SecondFlight.playSecondFlight(stem, startNode, targetInfo, actionType, animatingNodes, updateNodeStyle);
  }
};

export default FlyAnimation;

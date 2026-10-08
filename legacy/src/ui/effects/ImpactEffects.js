// ============================================
// 撞击效果控制器
// ============================================
// 职责：
// - 触发节点撞击动画
// - 刷新待处理的状态更新
// ============================================

import NodeRenderer from '../board/NodeRenderer.js';

const ImpactEffects = {
  /**
   * 解析节点撞击
   * @param {HTMLElement} nodeEl - 节点元素
   * @param {string} playerId - 玩家ID
   * @param {number} elementIndex - 五行索引
   * @param {Object} animatingNodes - 动画中的节点映射
   */
  resolveNodeImpact(nodeEl, playerId, elementIndex, animatingNodes) {
    if (!nodeEl) return;

    nodeEl.classList.remove('node-impact');
    void nodeEl.offsetWidth;
    nodeEl.classList.add('node-impact');

    NodeRenderer.flushPendingState(playerId, elementIndex, animatingNodes, () => {});
  }
};

export default ImpactEffects;

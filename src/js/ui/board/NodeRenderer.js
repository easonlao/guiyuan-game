// ============================================
// 节点渲染器
// ============================================
// 职责：
// - 处理节点状态变化
// - 管理动画中的节点锁定
// - 应用待处理的状态更新
// ============================================

const NodeRenderer = {
  /**
   * 处理节点变化
   * @param {Object} data - 变化数据 {playerId, elementIndex, isYang, fullState}
   * @param {Object} animatingNodes - 动画中的节点映射
   * @param {Function} updateNodeStyle - 更新样式的回调
   */
  handleNodeChange(data, animatingNodes, updateNodeStyle) {
    const { playerId, elementIndex, isYang, fullState } = data;
    const key = `${playerId}-${elementIndex}`;
    const starEl = document.getElementById(`${playerId.toLowerCase()}-star`);
    if (!starEl) return;

    const nodeEl = starEl.querySelector(`.node[data-index="${elementIndex}"]`);
    if (!nodeEl) return;

    if (animatingNodes[key]) {
      animatingNodes[key].pendingState = fullState;
      const maskClass = isYang ? 'masked-yang' : 'masked-yin';
      nodeEl.classList.add(maskClass);
      return;
    }

    updateNodeStyle(nodeEl, fullState, elementIndex);
  },

  /**
   * 锁定节点（防止动画期间状态更新）
   * @param {Object} data - {playerId, elementIndex}
   * @param {Object} animatingNodes - 动画中的节点映射
   */
  lockNode(data, animatingNodes) {
    const key = `${data.playerId}-${data.elementIndex}`;
    if (!animatingNodes[key]) {
      animatingNodes[key] = { pendingState: null };
    }
  },

  /**
   * 刷新待处理的状态
   * @param {string} playerId - 玩家ID
   * @param {number} elementIndex - 五行索引
   * @param {Object} animatingNodes - 动画中的节点映射
   * @param {Function} updateNodeStyle - 更新样式的回调
   */
  flushPendingState(playerId, elementIndex, animatingNodes, updateNodeStyle) {
    const key = `${playerId}-${elementIndex}`;
    const lockData = animatingNodes[key];

    if (!lockData || !lockData.pendingState) {
      delete animatingNodes[key];
      return;
    }

    const nodeEl = document.getElementById(`${playerId.toLowerCase()}-star`)?.querySelector(`.node[data-index="${elementIndex}"]`);
    if (nodeEl) {
      this._applyStateImmediately(nodeEl, lockData.pendingState, elementIndex, updateNodeStyle);
    }

    delete animatingNodes[key];
  },

  /**
   * 立即应用状态（无过渡动画）
   * @param {HTMLElement} nodeEl - 节点元素
   * @param {Object} state - 节点状态
   * @param {number} elementIndex - 五行索引
   * @param {Function} updateNodeStyle - 更新样式的回调
   * @private
   */
  _applyStateImmediately(nodeEl, state, elementIndex, updateNodeStyle) {
    const parts = nodeEl.querySelectorAll('.yang-body, .yang-head, .yin-head');
    parts.forEach(el => el.style.transition = 'none');
    nodeEl.style.transition = 'none';
    nodeEl.classList.add('no-transition');
    nodeEl.classList.remove('masked-yang', 'masked-yin');
    updateNodeStyle(nodeEl, state, elementIndex);
    void nodeEl.offsetWidth;

    requestAnimationFrame(() => {
      nodeEl.classList.remove('no-transition');
      parts.forEach(el => el.style.transition = '');
      nodeEl.style.transition = '';
    });
  }
};

export default NodeRenderer;

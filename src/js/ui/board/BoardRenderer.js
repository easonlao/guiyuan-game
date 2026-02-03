// ============================================
// 棋盘渲染器（主控制器）
// ============================================
// 职责：
// - 渲染棋盘和节点状态
// - 管理棋盘转场动画
// - 更新节点样式
// ============================================

import NodeInitializer from './NodeInitializer.js';

const BoardRenderer = {
  /**
   * 渲染棋盘
   * @param {Object} nodeStates - 节点状态
   * @param {Object} animatingNodes - 动画中的节点
   */
  renderBoard(nodeStates, animatingNodes) {
    ['P1', 'P2'].forEach(playerId => {
      const starEl = document.getElementById(`${playerId.toLowerCase()}-star`);
      if (!starEl) return;

      const container = starEl.querySelector('.pentagram-container');
      if (container.children.length === 0) {
        NodeInitializer.initBoardNodes(container, playerId);
      }

      for (let i = 0; i < 5; i++) {
        const key = `${playerId}-${i}`;
        if (animatingNodes[key]) continue;

        const state = nodeStates[key];
        const nodeEl = container.querySelector(`.node[data-index="${i}"]`);
        if (nodeEl) {
          this.updateNodeStyle(nodeEl, state, i);
        }
      }
    });
  },

  /**
   * 更新节点样式
   * @param {HTMLElement} el - 节点元素
   * @param {Object} state - 节点状态 {yang, yin}
   * @param {number} elementIndex - 五行索引
   */
  updateNodeStyle(el, state, elementIndex) {
    console.log('[BoardRenderer] updateNodeStyle:', { elementIndex, yang: state.yang, yin: state.yin });
    el.classList.remove('lit-yang', 'lit-yin', 'cracked-yang', 'cracked-yin', 'blessed-yang', 'blessed-yin');

    if (state.yang === 1) el.classList.add('lit-yang');
    else if (state.yang === 2) el.classList.add('lit-yang', 'blessed-yang');
    else if (state.yang === -1) el.classList.add('cracked-yang');

    if (state.yin === 1) el.classList.add('lit-yin');
    else if (state.yin === 2) el.classList.add('lit-yin', 'blessed-yin');
    else if (state.yin === -1) el.classList.add('cracked-yin');
  },

  /**
   * 处理棋盘转场动画
   * @param {number} progress - 动画进度 (0-1)
   */
  handleTransitionUpdate(progress) {
    console.log('[BoardRenderer] handleTransitionUpdate called, progress:', progress);
    const battleLayer = document.getElementById('battle-layer');
    if (battleLayer.style.display !== 'flex') {
      battleLayer.style.display = 'flex';
      battleLayer.style.opacity = 0;
    }
    battleLayer.style.opacity = Math.min(1, progress * 1.5);

    ['P1', 'P2'].forEach(playerId => {
      const starEl = document.getElementById(`${playerId.toLowerCase()}-star`);
      if (!starEl) {
        console.warn('[BoardRenderer] starEl not found for', playerId);
        return;
      }

      const container = starEl.querySelector('.pentagram-container');
      console.log('[BoardRenderer]', playerId, 'container children before init:', container.children.length);
      if (container.children.length === 0) {
        NodeInitializer.initBoardNodes(container, playerId);
        console.log('[BoardRenderer]', playerId, 'container children after init:', container.children.length);
      }

      const nodes = container.querySelectorAll('.node');
      console.log('[BoardRenderer]', playerId, 'nodes found:', nodes.length);
      nodes.forEach(node => {
        const angleRad = parseFloat(node.dataset.angle);
        const currentRadius = 40 * progress;
        node.style.left = `calc(50% + ${currentRadius}% * ${Math.cos(angleRad)})`;
        node.style.top = `calc(50% + ${currentRadius}% * ${Math.sin(angleRad)})`;
        const scale = 0.5 + 0.5 * progress;
        node.style.transform = `translate(-50%, -50%) scale(${scale})`;
      });
    });
  }
};

export default BoardRenderer;

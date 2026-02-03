// ============================================
// 棋盘渲染器（主控制器）
// ============================================
// 职责：
// - 渲染棋盘和节点状态
// - 管理棋盘转场动画
// - 更新节点样式
// - 根据 myRole 决定 PVP 镜像显示
// ============================================

import NodeInitializer from './NodeInitializer.js';
import StateManager from '../../state/StateManager.js';

const BoardRenderer = {
  /**
   * 获取渲染顺序（PVP 镜像显示）
   * - P1 玩家：先渲染 P1（上方），再渲染 P2（下方）
   * - P2 玩家：先渲染 P2（上方），再渲染 P1（下方）
   */
  _getRenderOrder() {
    const myRole = StateManager.getMyRole();
    // P2 玩家需要镜像：P2 在上（对手位置），P1 在下（自己的位置）
    if (myRole === 'P2') {
      return ['P2', 'P1'];
    }
    // P1 玩家或 PvAI：正常顺序
    return ['P1', 'P2'];
  },

  /**
   * 获取显示的角色标签
   * @param {string} playerId - 'P1' | 'P2'
   * @returns {string} - 显示的标签
   */
  _getDisplayLabel(playerId) {
    const myRole = StateManager.getMyRole();
    if (myRole === 'P2') {
      // P2 玩家看到的界面：P2 显示为"我方"，P1 显示为"对手"
      return playerId === 'P2' ? 'P1 (我方)' : 'P2 (对手)';
    }
    // P1 玩家看到的界面：P1 显示为"P1"，P2 显示为"P2"
    return playerId;
  },

  /**
   * 渲染棋盘
   * @param {Object} nodeStates - 节点状态
   * @param {Object} animatingNodes - 动画中的节点
   */
  renderBoard(nodeStates, animatingNodes) {
    const renderOrder = this._getRenderOrder();

    renderOrder.forEach(playerId => {
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
    const battleLayer = document.getElementById('battle-layer');
    if (battleLayer.style.display !== 'flex') {
      battleLayer.style.display = 'flex';
      battleLayer.style.opacity = 0;
    }
    battleLayer.style.opacity = Math.min(1, progress * 1.5);

    const renderOrder = this._getRenderOrder();

    renderOrder.forEach(playerId => {
      const starEl = document.getElementById(`${playerId.toLowerCase()}-star`);
      if (!starEl) {
        return;
      }

      const container = starEl.querySelector('.pentagram-container');
      if (container.children.length === 0) {
        NodeInitializer.initBoardNodes(container, playerId);
      }

      const nodes = container.querySelectorAll('.node');
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

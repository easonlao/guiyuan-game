// ============================================
// 节点初始化器
// ============================================
// 职责：
// - 初始化棋盘节点 DOM
// - 创建节点元素
// - 应用节点样式
// ============================================

import { STEMS_MAP, ELEMENTS_DATA } from '../../config/game-config.js';

const NodeInitializer = {
  /**
   * 初始化棋盘节点
   * @param {HTMLElement} container - 容器元素
   * @param {string} playerId - 玩家ID
   */
  initBoardNodes(container, playerId) {
    const isInverted = (playerId === 'P2');
    const p1Indices = [0, 1, 2, 3, 4];
    const p2Indices = [3, 2, 1, 0, 4];
    const indices = isInverted ? p2Indices : p1Indices;

    indices.forEach((elementIndex, i) => {
      const nodeEl = this._createNodeElement(elementIndex, i, isInverted);
      container.appendChild(nodeEl);
    });
  },

  /**
   * 创建单个节点元素
   * @param {number} elementIndex - 五行索引
   * @param {number} positionIndex - 位置索引
   * @param {boolean} isInverted - 是否倒置
   * @returns {HTMLElement}
   * @private
   */
  _createNodeElement(elementIndex, positionIndex, isInverted) {
    const el = document.createElement('div');
    el.className = 'node taiji-card';
    el.dataset.index = elementIndex;

    const angleDeg = positionIndex * 72 - 90 + (isInverted ? 180 : 0);
    el.dataset.angle = angleDeg * (Math.PI / 180);

    const angleRad = angleDeg * (Math.PI / 180);
    const radius = 35;
    const x = 50 + radius * Math.cos(angleRad);
    const y = 50 + radius * Math.sin(angleRad);

    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.transform = 'translate(-50%, -50%)';

    el.innerHTML = this._getNodeHTML(elementIndex);
    this._applyNodeStyles(el, elementIndex);

    return el;
  },

  /**
   * 获取节点 HTML
   * @param {number} elementIndex - 五行索引
   * @returns {string}
   * @private
   */
  _getNodeHTML(elementIndex) {
    return `
      <div class="yang-body"></div>
      <div class="yang-head"></div>
      <div class="yin-head"></div>
      <svg class="line-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path class="arc-seg arc-left" d="M 50 0 A 50 50 0 0 0 50 100"></path>
        <path class="arc-seg arc-right" d="M 50 0 A 50 50 0 0 1 50 100"></path>
        <path class="arc-seg arc-top" d="M 50 0 A 25 25 0 0 1 50 50"></path>
        <path class="arc-seg arc-bottom" d="M 50 50 A 25 25 0 0 0 50 100"></path>
      </svg>
      <div class="stem-name name-yang"></div>
      <div class="stem-name name-yin"></div>
    `;
  },

  /**
   * 应用节点样式
   * @param {HTMLElement} el - 节点元素
   * @param {number} elementIndex - 五行索引
   * @private
   */
  _applyNodeStyles(el, elementIndex) {
    const yangText = STEMS_MAP[elementIndex].yang;
    const yinText = STEMS_MAP[elementIndex].yin;
    const colorData = ELEMENTS_DATA[elementIndex];

    el.querySelector('.name-yang').textContent = yangText;
    el.querySelector('.name-yin').textContent = yinText;
    el.style.setProperty('--real-c-yang', colorData.cy);
    el.style.setProperty('--real-c-yin', colorData.ci);
    el.style.setProperty('--head-top-color', colorData.cy);
    el.style.setProperty('--head-bottom-color', colorData.ci);
  }
};

export default NodeInitializer;

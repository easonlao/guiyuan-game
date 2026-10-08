// ============================================
// 第一段飞行动画控制器
// ============================================
// 职责：
// - 处理天干从中宫到本命的第一段飞行
// - 创建抛射物并执行飞行动画
// - 触发节点撞击效果
// ============================================

import EventBus from '../../bus/EventBus.js';

const FirstFlight = {
  /**
   * 处理第一段飞行动画
   * @param {Object} stem - 天干对象
   * @param {string} playerId - 玩家ID
   * @param {HTMLElement} container - 容器元素
   * @param {Function} onComplete - 完成回调
   */
  handleFirstFlight(stem, playerId, container, onComplete) {
    const stemEl = document.getElementById(`${playerId.toLowerCase()}-center-stem`);
    const myNode = container?.querySelector(`.node[data-index="${stem.element}"]`);

    if (!myNode || !stemEl) {
      console.warn('[FirstFlight] 缺少必要元素');
      return;
    }

    const projectile = this._createProjectile(stem.color, container);
    stemEl.style.opacity = '0';

    this._animateFlight(projectile, myNode, () => {
      this._onFlightComplete(myNode, projectile, onComplete);
    });
  },

  /**
   * 创建抛射物元素
   * @param {string} color - 颜色
   * @param {HTMLElement} container - 容器
   * @returns {HTMLElement}
   * @private
   */
  _createProjectile(color, container) {
    const projectile = document.createElement('div');
    projectile.className = 'energy-projectile';
    projectile.style.color = color;
    projectile.style.left = '50%';
    projectile.style.top = '50%';
    container.appendChild(projectile);
    return projectile;
  },

  /**
   * 执行飞行动画
   * @param {HTMLElement} projectile - 抛射物
   * @param {HTMLElement} targetNode - 目标节点
   * @param {Function} onComplete - 完成回调
   * @private
   */
  _animateFlight(projectile, targetNode, onComplete) {
    const flight = projectile.animate([
      {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%) scale(1)'
      },
      {
        left: targetNode.style.left,
        top: targetNode.style.top,
        transform: 'translate(-50%, -50%) scale(1)'
      }
    ], {
      duration: 500,
      easing: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
      fill: 'forwards'
    });

    flight.onfinish = () => onComplete();
  },

  /**
   * 飞行完成处理
   * @param {HTMLElement} targetNode - 目标节点
   * @param {HTMLElement} projectile - 抛射物
   * @param {Function} onComplete - 完成回调
   * @private
   */
  _onFlightComplete(targetNode, projectile, onComplete) {
    targetNode.classList.remove('node-impact');
    void targetNode.offsetWidth;
    targetNode.classList.add('node-impact');
    projectile.remove();

    EventBus.emit('ui:impact-stage1');
    onComplete();
  }
};

export default FirstFlight;

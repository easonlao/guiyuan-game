// ============================================
// 第二段飞行动画控制器
// ============================================
// 职责：
// - 处理从本命到目标的第二段飞行
// - 支持圆形轨迹和直线轨迹
// - 执行爆炸和冲击效果
// ============================================

import EventBus from '../../bus/EventBus.js';
import ExplosionEffects from './ExplosionEffects.js';
import NodeRenderer from '../board/NodeRenderer.js';

const SecondFlight = {
  /**
   * 播放二段飞行动画
   * @param {Object} stem - 天干对象
   * @param {HTMLElement} startNode - 起始节点
   * @param {Object} targetInfo - 目标信息 {playerId, elementIndex}
   * @param {string} actionType - 动作类型
   * @param {Object} animatingNodes - 动画中的节点映射
   * @param {Function} updateNodeStyle - 更新样式的回调
   */
  playSecondFlight(stem, startNode, targetInfo, actionType, animatingNodes = null, updateNodeStyle = null) {
    this._animatingNodes = animatingNodes;
    this._updateNodeStyle = updateNodeStyle;
    const { playerId: targetPlayerId, elementIndex: targetElementIndex } = targetInfo;

    const targetStarEl = document.getElementById(`${targetPlayerId.toLowerCase()}-star`);
    const targetNode = targetStarEl?.querySelector(`.node[data-index="${targetElementIndex}"]`);

    if (!targetNode) return;

    const battleLayer = document.getElementById('battle-layer');
    const { startX, startY, deltaX, deltaY } = this._calculatePositions(startNode, targetNode, battleLayer);

    const projectile = this._createProjectile(stem, actionType, startX, startY, battleLayer);
    const isSameNode = (startNode === targetNode);
    const keyframes = this._generateKeyframes(isSameNode, deltaX, deltaY);

    this._animateFlight(projectile, keyframes, () => {
      this._onFlightComplete(projectile, targetNode, targetPlayerId, targetElementIndex, actionType, isSameNode, deltaX, deltaY);
    });
  },

  /**
   * 计算位置信息
   * @param {HTMLElement} startNode - 起始节点
   * @param {HTMLElement} targetNode - 目标节点
   * @param {HTMLElement} battleLayer - 战斗层
   * @returns {Object}
   * @private
   */
  _calculatePositions(startNode, targetNode, battleLayer) {
    const sRect = startNode.getBoundingClientRect();
    const tRect = targetNode.getBoundingClientRect();
    const lRect = battleLayer.getBoundingClientRect();

    return {
      startX: Math.round(sRect.left - lRect.left + sRect.width / 2),
      startY: Math.round(sRect.top - lRect.top + sRect.height / 2),
      deltaX: Math.round(tRect.left - lRect.left + tRect.width / 2) - Math.round(sRect.left - lRect.left + sRect.width / 2),
      deltaY: Math.round(tRect.top - lRect.top + tRect.height / 2) - Math.round(sRect.top - lRect.top + sRect.height / 2)
    };
  },

  /**
   * 创建抛射物
   * @param {Object} stem - 天干对象
   * @param {string} actionType - 动作类型
   * @param {number} startX - 起始X坐标
   * @param {number} startY - 起始Y坐标
   * @param {HTMLElement} battleLayer - 战斗层
   * @returns {HTMLElement}
   * @private
   */
  _createProjectile(stem, actionType, startX, startY, battleLayer) {
    const projectile = document.createElement('div');
    projectile.className = 'energy-projectile';
    projectile.style.color = stem.color;

    if (actionType.includes('ATK')) {
      projectile.style.filter = 'brightness(1.5) drop-shadow(0 0 10px red)';
    }

    projectile.style.left = `${startX}px`;
    projectile.style.top = `${startY}px`;
    battleLayer.appendChild(projectile);

    return projectile;
  },

  /**
   * 生成关键帧
   * @param {boolean} isSameNode - 是否为同一节点
   * @param {number} deltaX - X轴偏移
   * @param {number} deltaY - Y轴偏移
   * @returns {Array}
   * @private
   */
  _generateKeyframes(isSameNode, deltaX, deltaY) {
    if (isSameNode) {
      const r = 45;
      const steps = 24;
      const keyframes = [];
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * 360;
        const rad = (angle * Math.PI) / 180;
        const xOffset = Math.round(Math.cos(rad) * r);
        const yOffset = Math.round(Math.sin(rad) * r);
        const translateX = xOffset >= 0 ? `calc(-50% + ${xOffset}px)` : `calc(-50% - ${Math.abs(xOffset)}px)`;
        const translateY = yOffset >= 0 ? `calc(-50% + ${yOffset}px)` : `calc(-50% - ${Math.abs(yOffset)}px)`;
        keyframes.push({
          transform: `translate(${translateX}, ${translateY}) scale(1.2)`,
          offset: i / steps
        });
      }
      return keyframes;
    } else {
      const translateX = deltaX >= 0 ? `calc(-50% + ${deltaX}px)` : `calc(-50% - ${Math.abs(deltaX)}px)`;
      const translateY = deltaY >= 0 ? `calc(-50% + ${deltaY}px)` : `calc(-50% - ${Math.abs(deltaY)}px)`;
      return [
        { transform: 'translate(-50%, -50%) scale(1)' },
        { transform: `translate(${translateX}, ${translateY}) scale(1.5)` }
      ];
    }
  },

  /**
   * 执行飞行动画
   * @param {HTMLElement} projectile - 抛射物
   * @param {Array} keyframes - 关键帧
   * @param {Function} onComplete - 完成回调
   * @private
   */
  _animateFlight(projectile, keyframes, onComplete) {
    const flight = projectile.animate(keyframes, {
      duration: 500,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards'
    });

    flight.onfinish = onComplete;
  },

  /**
   * 飞行完成处理
   * @param {HTMLElement} projectile - 抛射物
   * @param {HTMLElement} targetNode - 目标节点
   * @param {string} targetPlayerId - 目标玩家ID
   * @param {number} targetElementIndex - 目标五行索引
   * @param {string} actionType - 动作类型
   * @param {boolean} isSameNode - 是否为同一节点
   * @param {number} deltaX - X轴偏移
   * @param {number} deltaY - Y轴偏移
   * @private
   */
  _onFlightComplete(projectile, targetNode, targetPlayerId, targetElementIndex, actionType, isSameNode, deltaX, deltaY) {
    EventBus.emit('ui:impact-final');
    ExplosionEffects.playExplosion(projectile, isSameNode, deltaX, deltaY);

    if (actionType.includes('ATK')) {
      ExplosionEffects.playShakeImpact(targetNode);
    }

    // 刷新目标节点的待处理状态
    if (this._animatingNodes && this._updateNodeStyle) {
      NodeRenderer.flushPendingState(targetPlayerId, targetElementIndex, this._animatingNodes, this._updateNodeStyle);
    }
  }
};

export default SecondFlight;

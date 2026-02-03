// ============================================
// 天干粒子生成器
// ============================================
// 职责：
// - 生成粒子动画
// - 管理粒子生命周期
// - 计算粒子轨迹
// ============================================

import { ELEMENTS_DATA } from '../../config/game-config.js';

const StemParticleGenerator = {
  /**
   * 创建并动画化粒子
   * @param {HTMLElement} container - 容器元素
   * @param {Array} nodes - 节点数组
   * @param {HTMLElement} stemEl - 天干元素
   * @param {number} targetElementIndex - 目标五行索引（干支对应的节点，未使用）
   * @param {Function} onParticleComplete - 粒子完成回调
   * @param {Function} onComplete - 所有粒子完成回调
   */
  createParticles(container, nodes, stemEl, targetElementIndex, onParticleComplete, onComplete) {
    const total = nodes.length * 5;
    let arrived = 0;
    let localBurstTriggered = false;

    const timeoutId = setTimeout(() => {
      if (!localBurstTriggered) {
        console.warn('[StemParticleGenerator] 粒子动画超时');
        localBurstTriggered = true;
        onComplete();
      }
    }, 2000);

    nodes.forEach((node) => {
      const angle = parseFloat(node.dataset.angle);
      for (let j = 0; j < 5; j++) {
        this._createSingleParticle(container, angle, stemEl, node, () => {
          arrived++;
          onParticleComplete(arrived, total);

          if (arrived >= Math.floor(total * 0.9) && !localBurstTriggered) {
            clearTimeout(timeoutId);
            localBurstTriggered = true;
            onComplete();
          }
        });
      }
    });
  },

  /**
   * 创建单个粒子
   * @param {HTMLElement} container - 容器元素
   * @param {number} sourceAngle - 源节点角度
   * @param {HTMLElement} stemEl - 天干元素
   * @param {HTMLElement} node - 节点元素
   * @param {Function} onFinish - 完成回调
   * @private
   */
  _createSingleParticle(container, sourceAngle, stemEl, node, onFinish) {
    const particle = document.createElement('div');
    particle.className = 'energy-particle';
    const nodeIndex = parseInt(node.dataset.index) || 0;
    particle.style.background = ELEMENTS_DATA[nodeIndex]?.cy || '#fff';

    const keyframes = this._generateKeyframes(sourceAngle);
    const animation = particle.animate(keyframes, { duration: 600 + Math.random() * 300 });
    container.appendChild(particle);

    animation.onfinish = () => {
      particle.remove();
      onFinish();
    };

    animation.oncancel = () => {
      particle.remove();
    };
  },

  /**
   * 生成粒子关键帧
   * @param {number} sourceAngle - 源节点角度
   * @returns {Array}
   * @private
   */
  _generateKeyframes(sourceAngle) {
    const keyframes = [];
    const steps = 10;

    // 源节点位置（40% 半径）
    const sourceX = 50 + 40 * Math.cos(sourceAngle);
    const sourceY = 50 + 40 * Math.sin(sourceAngle);
    // 目标位置（中心）
    const targetX = 50;
    const targetY = 50;

    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      // 线性插值从源节点到中心
      const currentX = sourceX + (targetX - sourceX) * t;
      const currentY = sourceY + (targetY - sourceY) * t;

      keyframes.push({
        left: `${currentX}%`,
        top: `${currentY}%`,
        opacity: t < 0.1 ? t * 10 : (t > 0.8 ? (1 - t) * 5 : 1),
        transform: `translate(-50%, -50%) scale(${1 - t * 0.5})`,
        offset: t
      });
    }

    return keyframes;
  }
};

export default StemParticleGenerator;

// ============================================
// 天干生成动画控制器（主协调器）
// ============================================
// 职责：
// - 协调粒子动画和显示效果
// - 管理天干元素状态
// - 控制动画流程
// ============================================

import StemParticleGenerator from './StemParticleGenerator.js';
import StemManifestation from './StemManifestation.js';

const StemAnimation = {
  /**
   * 播放天干生成动画
   * @param {string} playerId - 玩家ID
   * @param {Object} stem - 天干对象
   * @param {Object} animatingNodes - 动画中的节点映射
   */
  playStemGenerationAnimation(playerId, stem, animatingNodes) {
    const starId = `${playerId.toLowerCase()}-star`;
    const container = document.getElementById(starId)?.querySelector('.pentagram-container');
    const stemEl = document.getElementById(`${playerId.toLowerCase()}-center-stem`);

    if (!container || !stemEl) {
      console.warn('[StemAnimation] 干支动画元素未找到', { starId });
      return;
    }

    const nodeKey = `${playerId}-${stem.element}`;
    animatingNodes[nodeKey] = { pendingState: null };

    this._resetStemElement(stemEl);

    StemParticleGenerator.createParticles(
      container,
      Array.from(container.querySelectorAll('.node')),
      stemEl,
      stem.element,
      (arrived, total) => {
        stemEl.style.transform = `translate(-50%, -50%) scale(${0.2 + (arrived / total) * 0.6})`;
        stemEl.style.opacity = 0.3 + (arrived / total) * 0.5;
      },
      () => {
        StemManifestation.triggerManifestation(stemEl, stem, playerId, animatingNodes);
      }
    );
  },

  /**
   * 重置天干元素状态
   * @param {HTMLElement} stemEl - 天干元素
   * @private
   */
  _resetStemElement(stemEl) {
    // 1. 先清除所有内联样式和类名
    stemEl.style.cssText = '';
    stemEl.className = 'center-stem';
    stemEl.innerText = '';

    // 2. 立即强制重排，确保清除生效
    void stemEl.offsetWidth;

    // 3. 重新设置初始状态（覆盖 CSS 默认的 opacity: 0）
    stemEl.style.fontSize = `var(--stem-size, 50px)`;
    stemEl.style.visibility = 'visible';
    stemEl.style.opacity = '0.3';
    stemEl.style.transform = 'translate(-50%, -50%) scale(0.2)';
    stemEl.style.background = 'radial-gradient(circle, #fff 0%, transparent 70%)';
    stemEl.style.width = '60px';
    stemEl.style.height = '60px';
    stemEl.style.borderRadius = '50%';
    stemEl.style.left = '50%';
    stemEl.style.top = '50%';
    stemEl.style.transition = 'none';

    // 4. 再次强制重排，确保新样式生效
    void stemEl.offsetWidth;
  }
};

export default StemAnimation;

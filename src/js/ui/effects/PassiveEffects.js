// ============================================
// 被动效果动画系统
// ============================================
// 职责：
// - 回合结算动画（天道分红、道损亏损）
// - 最终惩罚动画（道损惩罚）
// ============================================

import EventBus from '../../bus/EventBus.js';
import { GAME_EVENTS } from '../../types/events.js';
import StateManager from '../../state/StateManager.js';

const PassiveEffects = {
  /**
   * 播放跳过动画（五行干支四散消失效果）
   * @param {Object} data - { stem, playerId }
   */
  playSkip(data) {
    const { stem, playerId } = data;
    console.log('[PassiveEffects] 播放跳过动画（四散消失）', { stem, playerId });

    // 获取天干元素（使用当前玩家的中心天干）
    const stemEl = document.getElementById(`${playerId.toLowerCase()}-center-stem`);
    if (!stemEl) {
      console.warn('[PassiveEffects] 未找到天干元素:', `${playerId.toLowerCase()}-center-stem`);
      return;
    }

    // 创建四散粒子
    const container = document.body;
    const rect = stemEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const particleCount = 12;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'scatter-particle';

      // 随机颜色
      const colors = ['#ff6b6b', '#ffd700', '#4a90e2', '#2dcc70', '#9b59b6', '#ff9500'];
      const color = colors[Math.floor(Math.random() * colors.length)];

      // 随机方向
      const angle = (i / particleCount) * Math.PI * 2;
      const distance = 100 + Math.random() * 50;
      const endX = centerX + Math.cos(angle) * distance;
      const endY = centerY + Math.sin(angle) * distance;

      particle.style.cssText = `
        position: fixed;
        left: ${centerX}px;
        top: ${centerY}px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${color};
        pointer-events: none;
        z-index: 1000;
        box-shadow: 0 0 10px ${color};
      `;

      container.appendChild(particle);

      // 动画
      particle.animate([
        {
          transform: 'translate(-50%, -50%) scale(1)',
          opacity: 1
        },
        {
          transform: `translate(${endX - centerX}px, ${endY - centerY}px) scale(0)`,
          opacity: 0
        }
      ], {
        duration: 800 + Math.random() * 400,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fill: 'forwards'
      }).onfinish = () => particle.remove();
    }

    // 天干本身淡出
    stemEl.animate([
      { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
      { opacity: 0, transform: 'translate(-50%, -50%) scale(0.5)' }
    ], {
      duration: 600,
      easing: 'ease-in-out',
      fill: 'forwards'
    }).onfinish = () => {
      // 重置天干元素样式
      stemEl.style.opacity = '0';
      stemEl.style.transform = '';
      stemEl.style.visibility = 'hidden';
    };
  },

  /**
   * 播放回合结算动画
   * @param {Object} result - 结算结果 { P1: { unityCount, damageCount }, P2: { unityCount, damageCount } }
   * @returns {Promise<void>} 动画完成的 Promise
   */
  playTurnSettlement(result) {
    console.log('[PassiveEffects] 播放回合结算动画', result);

    const animationPromises = [];

    // 只处理 result 中存在的玩家
    Object.keys(result).forEach(playerId => {
      const { unityCount, damageCount } = result[playerId];

      // 播放归一状态动画
      if (unityCount > 0) {
        animationPromises.push(this._playUnityAnimation(playerId));
      }

      // 播放道损警告动画
      if (damageCount > 0) {
        animationPromises.push(this._playDamageWarning(playerId));
      }
    });

    // 等待所有动画完成
    return Promise.all(animationPromises).then(() => {
      console.log('[PassiveEffects] 回合结算动画完成');
    });
  },


  /**
   * 播放归一状态动画（金色光晕）
   * @private
   * @returns {Promise<void>} 动画完成的 Promise
   */
  _playUnityAnimation(playerId) {
    const container = document.querySelector(`#${playerId.toLowerCase()}-star .pentagram-container`);
    if (!container) return Promise.resolve();

    const effectPromises = [];

    for (let i = 0; i < 5; i++) {
      const nodeState = StateManager.getNodeState(playerId, i);
      if (nodeState.yang === 2 && nodeState.yin === 2) {
        const nodeEl = container.querySelector(`.node[data-index="${i}"]`);
        if (nodeEl) {
          effectPromises.push(this._createUnityEffect(nodeEl));
        }
      }
    }

    return Promise.all(effectPromises);
  },

  /**
   * 播放道损警告动画（红色颤动）
   * @private
   * @returns {Promise<void>} 动画完成的 Promise
   */
  _playDamageWarning(playerId) {
    const container = document.querySelector(`#${playerId.toLowerCase()}-star .pentagram-container`);
    if (!container) return Promise.resolve();

    const effectPromises = [];

    for (let i = 0; i < 5; i++) {
      const nodeState = StateManager.getNodeState(playerId, i);
      // 只有 yang=-1 且 yin=-1 才算道损
      if (nodeState.yang === -1 && nodeState.yin === -1) {
        const nodeEl = container.querySelector(`.node[data-index="${i}"]`);
        if (nodeEl) {
          effectPromises.push(this._createDamageWarningEffect(nodeEl));
        }
      }
    }

    return Promise.all(effectPromises);
  },

  /**
   * 创建归一光晕效果（金色扩散）
   * @private
   * @returns {Promise<void>} 动画完成的 Promise
   */
  _createUnityEffect(nodeEl) {
    return new Promise((resolve) => {
      const rect = nodeEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // 创建光晕圈
      const ring = document.createElement('div');
      ring.style.cssText = `
        position: fixed;
        left: ${centerX}px;
        top: ${centerY}px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 3px solid rgba(255, 215, 0, 1);
        box-shadow: 0 0 30px rgba(255, 215, 0, 0.8), 0 0 60px rgba(255, 215, 0, 0.4);
        pointer-events: none;
        z-index: 1000;
        transform: translate(-50%, -50%);
      `;
      document.body.appendChild(ring);

      // 金色扩散动画
      ring.animate([
        {
          width: '20px',
          height: '20px',
          opacity: 1,
          borderWidth: '3px'
        },
        {
          width: '150px',
          height: '150px',
          opacity: 0,
          borderWidth: '1px'
        }
      ], {
        duration: 800,
        easing: 'ease-out',
        fill: 'forwards'
      }).onfinish = () => {
        ring.remove();
        resolve();
      };
    });
  },

  /**
   * 创建道损警告效果（红色扩散）
   * @private
   * @returns {Promise<void>} 动画完成的 Promise
   */
  _createDamageWarningEffect(nodeEl) {
    return new Promise((resolve) => {
      const rect = nodeEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // 创建红色光晕圈
      const ring = document.createElement('div');
      ring.style.cssText = `
        position: fixed;
        left: ${centerX}px;
        top: ${centerY}px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 3px solid rgba(220, 20, 60, 1);
        box-shadow: 0 0 30px rgba(220, 20, 60, 0.8), 0 0 60px rgba(220, 20, 60, 0.4);
        pointer-events: none;
        z-index: 999;
        transform: translate(-50%, -50%);
      `;
      document.body.appendChild(ring);

      // 红色扩散动画
      ring.animate([
        {
          width: '20px',
          height: '20px',
          opacity: 1,
          borderWidth: '3px'
        },
        {
          width: '150px',
          height: '150px',
          opacity: 0,
          borderWidth: '1px'
        }
      ], {
        duration: 800,
        easing: 'ease-out',
        fill: 'forwards'
      }).onfinish = () => {
        ring.remove();
        resolve();
      };
    });
  },

  /**
   * 播放最终惩罚动画
   * @param {Object} result - 惩罚结果 { P1: damageCount, P2: damageCount }
   * @returns {Promise<void>} 动画完成的 Promise
   */
  playFinalPenalty(result) {
    console.log('[PassiveEffects] 播放最终惩罚动画', result);

    const animationPromises = [];

    ['P1', 'P2'].forEach(playerId => {
      const { damageCount } = result[playerId];
      if (damageCount > 0) {
        animationPromises.push(this._playFinalPenaltyAnimation(playerId));
      }
    });

    return Promise.all(animationPromises).then(() => {
      console.log('[PassiveEffects] 最终惩罚动画完成');
    });
  },

  /**
   * 播放最终惩罚动画（红色下沉）
   * @private
   * @returns {Promise<void>} 动画完成的 Promise
   */
  _playFinalPenaltyAnimation(playerId) {
    const container = document.querySelector(`#${playerId.toLowerCase()}-star .pentagram-container`);
    if (!container) return Promise.resolve();

    const effectPromises = [];

    for (let i = 0; i < 5; i++) {
      const nodeState = StateManager.getNodeState(playerId, i);
      // 只有 yang=-1 且 yin=-1 才算道损
      if (nodeState.yang === -1 && nodeState.yin === -1) {
        const nodeEl = container.querySelector(`.node[data-index="${i}"]`);
        if (nodeEl) {
          effectPromises.push(this._createPenaltyEffect(nodeEl));
        }
      }
    }

    return Promise.all(effectPromises);
  },

  /**
   * 创建惩罚下沉效果
   * @private
   * @returns {Promise<void>} 动画完成的 Promise
   */
  _createPenaltyEffect(nodeEl) {
    return new Promise((resolve) => {
      const rect = nodeEl.getBoundingClientRect();

      // 创建包装元素，避免影响节点原始位置
      const wrapper = document.createElement('div');
      wrapper.className = 'penalty-effect-wrapper';
      wrapper.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        pointer-events: none;
        z-index: 1000;
        border-radius: 50%;
        animation: penalty-shrink 1000ms ease-in-out;
      `;

      // 创建红色特效背景
      const effect = document.createElement('div');
      effect.className = 'penalty-effect-bg';
      effect.style.cssText = `
        width: 100%;
        height: 100%;
        background: radial-gradient(circle, rgba(220, 20, 60, 0.8) 0%, transparent 70%);
        border-radius: 50%;
        animation: penalty-sink 1000ms ease-in-out forwards;
      `;
      wrapper.appendChild(effect);
      document.body.appendChild(wrapper);

      // 清理
      setTimeout(() => {
        wrapper.remove();
        resolve();
      }, 1050);
    });
  }
};

// 添加 CSS 动画
const style = document.createElement('style');
style.textContent = `
  /* 归一光晕扩散动画 */
  @keyframes unity-ring-spread {
    0% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0.8;
    }
    100% {
      transform: translate(-50%, -50%) scale(3);
      opacity: 0;
    }
  }

  /* 道损颤动动画 */
  .damage-warning {
    animation: damage-shake 0.15s ease-in-out 3;
  }

  @keyframes damage-shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-3px) rotate(-2deg); }
    75% { transform: translateX(3px) rotate(2deg); }
  }

  /* 道损红色脉冲 */
  @keyframes damage-pulse {
    0%, 100% { opacity: 0.3; transform: scale(1); }
    50% { opacity: 0.8; transform: scale(1.05); }
  }

  /* 惩罚下沉动画 */
  @keyframes penalty-sink {
    0% {
      transform: scale(1);
      opacity: 0.8;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.6;
    }
    100% {
      transform: scale(0.95);
      opacity: 0;
    }
  }

  /* 惩罚节点效果 */
  .penalty-effect {
    animation: penalty-shrink 1000ms ease-in-out;
  }

  @keyframes penalty-shrink {
    0%, 100% { transform: scale(1); }
    30% { transform: scale(0.95) rotate(-3deg); }
    70% { transform: scale(1.02) rotate(3deg); }
  }
`;

// 只添加一次
if (!document.getElementById('passive-effects-styles')) {
  style.id = 'passive-effects-styles';
  document.head.appendChild(style);
}

export default PassiveEffects;

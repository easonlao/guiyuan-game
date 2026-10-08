// ============================================
// 粒子系统
// ============================================
// 职责：
// - 粒子爆发动画
// - 能量流转动画
// - 螺旋汇聚动画
// ============================================

import EventBus from '../../bus/EventBus.js';
import { ANIMATION_EVENTS } from '../../types/events.js';

const ParticleSystem = {
  particles: new Set(),

  /**
   * 初始化
   */
  init() {
    EventBus.on(ANIMATION_EVENTS.PARTICLE_BURST, this.burst.bind(this));
    EventBus.on(ANIMATION_EVENTS.PARTICLE_FLOW, this.flow.bind(this));
    EventBus.on(ANIMATION_EVENTS.PARTICLE_SPIRAL, this.spiral.bind(this));
  },

  /**
   * 粒子爆发
   * @param {Object} data - 粒子数据
   */
  burst(data) {
    const { origin, count = 20, spread = 100, color } = data;

    for (let i = 0; i < count; i++) {
      const particle = this.createParticle(origin, color);
      const angle = (Math.PI * 2 * i) / count;
      const distance = spread * (0.5 + Math.random() * 0.5);

      particle.animate([
        { transform: 'scale(0)', opacity: 1 },
        {
          transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(1)`,
          opacity: 0
        }
      ], {
        duration: 600 + Math.random() * 400,
        easing: 'ease-out'
      }).onfinish = () => this.remove(particle);
    }
  },

  /**
   * 能量流转
   * @param {Object} data - 流转数据
   */
  flow(data) {
    const { from, to, count = 10, color } = data;

    for (let i = 0; i < count; i++) {
      const particle = this.createParticle(from, color);
      const progress = i / (count - 1);

      particle.animate([
        { transform: 'scale(0)', opacity: 1 },
        {
          transform: `translate(${to.x - from.x * progress}px, ${to.y - from.y * progress}px) scale(1)`,
          opacity: 0
        }
      ], {
        duration: 800,
        easing: 'ease-in-out',
        delay: i * 50
      }).onfinish = () => this.remove(particle);
    }
  },

  /**
   * 螺旋汇聚
   * @param {Object} data - 汇聚数据
   */
  spiral(data) {
    const { center, target, count = 50, color } = data;

    for (let i = 0; i < count; i++) {
      const particle = this.createParticle(center, color);
      const angle = (Math.PI * 2 * i) / count;
      const radius = 50 + (i * 2);
      const spiralAngle = angle + (i * 0.2);

      particle.animate([
        { transform: 'scale(0)', opacity: 1 },
        {
          transform: `translate(${Math.cos(spiralAngle) * radius}px, ${Math.sin(spiralAngle) * radius}px) scale(0)`,
          opacity: 0
        }
      ], {
        duration: 1000 + i * 20,
        easing: 'ease-in-out',
        delay: i * 30
      }).onfinish = () => this.remove(particle);
    }
  },

  /**
   * 创建粒子
   * @param {Object} origin - 原点坐标
   * @param {string} color - 粒子颜色
   * @returns {Element} 粒子元素
   */
  createParticle(origin, color) {
    const p = document.createElement('div');
    p.className = 'energy-particle';
    p.style.cssText = `
      position: absolute;
      left: ${origin.x}px;
      top: ${origin.y}px;
      width: 4px;
      height: 4px;
      background: ${color};
      border-radius: 50%;
      box-shadow: 0 0 10px ${color};
      z-index: 90;
      pointer-events: none;
      opacity: 1;
    `;
    document.body.appendChild(p);
    this.particles.add(p);
    return p;
  },

  /**
   * 移除粒子
   * @param {Element} particle - 粒子元素
   */
  remove(particle) {
    particle.remove();
    this.particles.delete(particle);
  }
};

export default ParticleSystem;

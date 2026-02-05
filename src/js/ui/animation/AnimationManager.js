import EventBus from '../../bus/EventBus.js';
import ParticleSystem from './ParticleSystem.js';
import { ANIMATION_EVENTS, UI_EVENTS } from '../../types/events.js';

const AnimationManager = {
  queue: [],
  isPlaying: false,

  init() {
    EventBus.on(UI_EVENTS.SHOW_OVERLAY, this.showOverlay.bind(this));
    EventBus.on(UI_EVENTS.HIDE_OVERLAY, this.hideOverlay.bind(this));
    EventBus.on('game:skip-turn', this.playSkipAnimation.bind(this));
  },

  playSkipAnimation(data) {
    const { stem, playerId } = data;

    // 隐藏中间的天干文字
    const stemEl = document.getElementById(`${playerId.toLowerCase()}-center-stem`);
    if (stemEl) {
      stemEl.style.opacity = '0';
      stemEl.style.visibility = 'hidden';
    }

    // 显示空转提示文字（简短显示）
    const msgEl = document.getElementById('init-message');
    if (msgEl) {
      msgEl.textContent = '空转';
      msgEl.style.opacity = '1';
      msgEl.style.visibility = 'visible';
      msgEl.style.color = 'rgba(255, 255, 255, 0.5)';
      msgEl.style.textShadow = 'none';

      // 短暂显示后隐藏
      setTimeout(() => {
        msgEl.style.opacity = '0';
        msgEl.style.visibility = 'hidden';
      }, 800);
    }
  },

  showOverlay(data) {
    const { type, message } = data;

    const overlay = document.createElement('div');
    overlay.className = 'decision-overlay';
    overlay.innerHTML = `
      <div class="overlay-content fade-in">
        <p class="overlay-message">${message}</p>
      </div>
    `;

    document.body.appendChild(overlay);

    setTimeout(() => {
      overlay.classList.add('active');
    }, 50);
  },

  hideOverlay() {
    const overlay = document.querySelector('.decision-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }
  },

  triggerParticleBurst(data) {
    EventBus.emit(ANIMATION_EVENTS.PARTICLE_BURST, data);
  },

  triggerParticleFlow(data) {
    EventBus.emit(ANIMATION_EVENTS.PARTICLE_FLOW, data);
  },

  triggerParticleSpiral(data) {
    EventBus.emit(ANIMATION_EVENTS.PARTICLE_SPIRAL, data);
  }
};

export default AnimationManager;

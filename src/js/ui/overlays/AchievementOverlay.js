// ============================================
// 成就过场画面
// ============================================
// 职责：
// - 显示"五行归元"过场（全点亮时）
// - 显示"局终"过场（60回合结束时）
// ============================================

import EventBus from '../../bus/EventBus.js';
import { GAME_EVENTS } from '../../types/events.js';

const AchievementOverlay = {
  _overlay: null,
  _title: null,
  _subtitle: null,
  _activeTimeout: null,
  _hasShown: { fullUnity: false, turnLimit: false },
  _isShowing: false, // 标记是否正在显示过场

  init() {
    console.log('[AchievementOverlay] 初始化成就过场系统');
    this._createOverlay();
    this._bindEvents();
  },

  _createOverlay() {
    // 创建过场容器
    const overlay = document.createElement('div');
    overlay.id = 'achievement-overlay';
    overlay.innerHTML = `
      <div class="bg-glow"></div>
      <div class="achievement-elements">
        <div class="achievement-element"></div>
        <div class="achievement-element"></div>
        <div class="achievement-element"></div>
        <div class="achievement-element"></div>
        <div class="achievement-element"></div>
      </div>
      <h1 class="achievement-title" id="achievement-title">五行归元</h1>
    `;

    document.getElementById('app').appendChild(overlay);
    this._overlay = overlay;
    this._title = document.getElementById('achievement-title');

    console.log('[AchievementOverlay] 过场容器已创建', {
      overlay: !!overlay,
      title: !!this._title
    });
  },

  _bindEvents() {
    EventBus.on('achievement:show-full-unity', (data) => {
      console.log('[AchievementOverlay] 收到 achievement:show-full-unity 事件', data);
      this.showFullUnity(data);
    });
    EventBus.on('achievement:show-turn-limit', (data) => {
      console.log('[AchievementOverlay] 收到 achievement:show-turn-limit 事件', data);
      this.showTurnLimit(data);
    });
    // VICTORY 事件不再自动隐藏过场，让过场自然结束
  },

  /**
   * 显示五行归元过场（全点亮时）
   * @param {string} winnerId - 获胜者ID
   */
  showFullUnity(winnerId) {
    if (this._hasShown.fullUnity) return;
    this._hasShown.fullUnity = true;

    this._title.textContent = '五行归元';
    this._show(4000);
  },

  /**
   * 显示局终过场（60回合结束时）
   * @param {string} result - 结果（P1/P2/DRAW）
   */
  showTurnLimit(result) {
    if (this._hasShown.turnLimit) return;
    this._hasShown.turnLimit = true;

    this._title.textContent = '局终';
    this._show(3000);
  },

  /**
   * 显示过场画面
   * @param {number} duration - 显示时长（毫秒）
   * @private
   */
  _show(duration) {
    console.log('[AchievementOverlay] 显示过场画面');

    // 清除之前的定时器
    if (this._activeTimeout) {
      clearTimeout(this._activeTimeout);
    }

    // 显示过场
    this._overlay.classList.add('active');

    // 自动隐藏
    this._activeTimeout = setTimeout(() => {
      this.hide();
    }, duration);
  },

  /**
   * 隐藏过场画面
   */
  hide() {
    console.log('[AchievementOverlay] 隐藏过场画面');
    this._overlay.classList.remove('active');

    if (this._activeTimeout) {
      clearTimeout(this._activeTimeout);
      this._activeTimeout = null;
    }
  },

  /**
   * 重置显示标志（新游戏开始时调用）
   */
  reset() {
    this._hasShown = { fullUnity: false, turnLimit: false };
    this.hide();
  }
};

export default AchievementOverlay;

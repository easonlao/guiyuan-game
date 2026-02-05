// ============================================
// 重连遮罩层控制器
// ============================================
// 职责：
// - 显示网络断开/重连状态
// - 显示重连进度
// - 处理重连失败后的用户操作
// ============================================

import EventBus from '../../bus/EventBus.js';

const ReconnectionOverlay = {
  _isVisible: false,
  _reconnectAttempt: 0,
  _maxAttempts: 10,

  /**
   * 初始化事件监听
   */
  init() {
    // 监听断线事件
    EventBus.on('RECONNECT:disconnected', () => {
      this.show('网络连接已断开，正在尝试重连...');
    });

    // 监听重连进度
    EventBus.on('RECONNECT:progress', (data) => {
      this.updateProgress(data.attempt, data.maxAttempts, data.message);
    });

    // 监听重连成功
    EventBus.on('RECONNECT:success', () => {
      this.hide();
    });

    // 监听重连失败
    EventBus.on('RECONNECT:failed', (data) => {
      this.showFailed(data.attempts, data.error);
    });

    // 绑定返回主菜单按钮
    document.getElementById('reconnect-back-btn')?.addEventListener('click', () => {
      this.backToMenu();
    });
  },

  /**
   * 显示重连遮罩层
   * @param {string} message - 提示消息
   */
  show(message) {
    const overlay = document.getElementById('reconnection-overlay');
    if (!overlay) return;

    const title = document.getElementById('reconnect-title');
    const messageEl = document.getElementById('reconnect-message');
    const progress = document.getElementById('reconnect-progress');
    const failedInfo = document.getElementById('reconnect-failed-info');
    const backBtn = document.getElementById('reconnect-back-btn');

    if (title) title.textContent = '网络连接已断开';
    if (messageEl) messageEl.textContent = message || '正在尝试重连...';
    if (progress) progress.style.display = 'block';
    if (failedInfo) failedInfo.style.display = 'none';
    if (backBtn) backBtn.style.display = 'none';

    overlay.style.display = 'flex';
    this._isVisible = true;
  },

  /**
   * 更新重连进度
   * @param {number} attempt - 当前尝试次数
   * @param {number} maxAttempts - 最大尝试次数
   * @param {string} message - 提示消息
   */
  updateProgress(attempt, maxAttempts, message) {
    const overlay = document.getElementById('reconnection-overlay');
    if (!overlay || !this._isVisible) return;

    const messageEl = document.getElementById('reconnect-message');
    const attemptEl = document.getElementById('reconnect-attempt');

    this._reconnectAttempt = attempt;
    this._maxAttempts = maxAttempts;

    if (messageEl) messageEl.textContent = message || '正在重连...';
    if (attemptEl) {
      attemptEl.textContent = `重连尝试: ${attempt} / ${maxAttempts}`;
    }
  },

  /**
   * 隐藏重连遮罩层
   */
  hide() {
    const overlay = document.getElementById('reconnection-overlay');
    if (!overlay) return;

    overlay.style.display = 'none';
    this._isVisible = false;
    this._reconnectAttempt = 0;
  },

  /**
   * 显示重连失败
   * @param {number} attempts - 尝试次数
   * @param {string} error - 错误信息
   */
  showFailed(attempts, error) {
    const overlay = document.getElementById('reconnection-overlay');
    if (!overlay) return;

    const title = document.getElementById('reconnect-title');
    const message = document.getElementById('reconnect-message');
    const progress = document.getElementById('reconnect-progress');
    const failedInfo = document.getElementById('reconnect-failed-info');
    const backBtn = document.getElementById('reconnect-back-btn');

    if (title) title.textContent = '重连失败';
    if (message) message.textContent = `无法连接到服务器。已尝试 ${attempts} 次。`;
    if (progress) progress.style.display = 'none';
    if (failedInfo) failedInfo.style.display = 'block';
    if (backBtn) backBtn.style.display = 'block';

    this._isVisible = true;
  },

  /**
   * 返回主菜单
   */
  backToMenu() {
    this.hide();
    EventBus.emit('game:return-to-menu');
  }
};

export default ReconnectionOverlay;

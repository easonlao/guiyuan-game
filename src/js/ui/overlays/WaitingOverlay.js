// ============================================
// 等待界面控制器
// ============================================
// 职责：
// - 显示等待/匹配界面
// - 处理房间分享链接
// - 处理玩家加入事件
// ============================================

import EventBus from '../../bus/EventBus.js';
import ClipboardHelper from '../utils/ClipboardHelper.js';

const WaitingOverlay = {
  _currentShareUrl: null,
  _hasStartedGame: false,

  /**
   * 初始化事件监听
   */
  init() {
    EventBus.on('game:initiative-completed', () => {
      console.log('[WaitingOverlay] 收到 game:initiative-completed，隐藏等待界面');
      this.hideWaiting();
    });

    EventBus.on('anim:initiative-finished', () => {
      console.log('[WaitingOverlay] 收到 anim:initiative-finished，隐藏等待界面');
      this.hideWaiting();
    });

    EventBus.on('game:show-waiting', (data) => this.showWaiting(data));
    EventBus.on('game:waiting-info', (data) => this.updateWaitingInfo(data));
    EventBus.on('game:room-error', (data) => this.showRoomError(data));
    EventBus.on('game:player-joined', (data) => this.onPlayerJoined(data));

    // 复制按钮事件
    document.getElementById('waiting-copy-btn')?.addEventListener('click', () => {
      this.copyShareLink();
    });

    console.log('[WaitingOverlay] 事件监听器已绑定');
  },

  /**
   * 显示等待界面
   * @param {Object} data - {isHost}
   */
  showWaiting(data) {
    const waitingLayer = document.getElementById('waiting-layer');
    if (!waitingLayer) return;

    const title = document.getElementById('waiting-title');
    const actions = document.getElementById('waiting-actions');
    const status = document.getElementById('waiting-status');

    if (data.isHost) {
      title.textContent = '等待对手加入';
      if (actions) actions.style.display = 'flex';
      if (status) status.style.display = 'none';
    } else {
      title.textContent = '等待开始';
      if (actions) actions.style.display = 'none';
      if (status) status.style.display = 'block';
    }

    waitingLayer.style.display = 'flex';
  },

  /**
   * 更新等待信息
   * @param {Object} data - {roomCode, shareUrl}
   */
  updateWaitingInfo(data) {
    const { shareUrl } = data;
    this._currentShareUrl = shareUrl;
    console.log('[WaitingOverlay] 分享链接已存储:', shareUrl);
  },

  /**
   * 隐藏等待界面
   */
  hideWaiting() {
    const waitingLayer = document.getElementById('waiting-layer');
    if (waitingLayer) waitingLayer.style.display = 'none';
    this._currentShareUrl = null;
    this._hasStartedGame = false;
  },

  /**
   * 复制分享链接
   */
  copyShareLink() {
    const shareUrl = this._currentShareUrl;
    if (!shareUrl) {
      console.warn('[WaitingOverlay] 没有可复制的分享链接');
      return;
    }

    ClipboardHelper.copyToClipboard(shareUrl, () => this._showCopySuccess());
  },

  /**
   * 显示复制成功反馈
   * @private
   */
  _showCopySuccess() {
    const copyBtn = document.getElementById('waiting-copy-btn');
    if (!copyBtn) return;

    copyBtn.textContent = '已复制';
    copyBtn.classList.add('copied');

    setTimeout(() => {
      copyBtn.textContent = '复制邀请链接';
      copyBtn.classList.remove('copied');
    }, 2000);

    console.log('[WaitingOverlay] 分享链接已复制:', this._currentShareUrl);
  },

  /**
   * 显示房间错误
   * @param {Object} data - {error}
   */
  showRoomError(data) {
    const { error } = data;
    alert(`房间错误: ${error}`);
    this.hideWaiting();
    EventBus.emit('game:return-to-menu');
  },

  /**
   * 玩家已加入
   */
  onPlayerJoined(data) {
    console.log('[WaitingOverlay] 玩家加入事件:', data);

    const title = document.getElementById('waiting-title');
    const actions = document.getElementById('waiting-actions');
    const status = document.getElementById('waiting-status');

    // 更新 UI 显示"等待对手准备"
    if (title) title.textContent = '等待房主准备游戏';
    if (actions) actions.style.display = 'none';
    if (status) status.style.display = 'block';

    // 注意：P2（加入者）在这里不触发游戏开始
    // 而是等待 P1 的先手判定消息
    console.log('[WaitingOverlay] 等待房主的先手判定消息...');
  }
};

export default WaitingOverlay;

// ============================================
// 棋盘动画控制器
// ============================================
// 职责：
// - 播放先手判定动画
// - 管理棋盘节点高亮效果
// ============================================

import EventBus from '../../bus/EventBus.js';
import StateManager from '../../state/StateManager.js';

const BoardAnimation = {
  // 标志：防止重复调用
  _hasShownResult: false,
  _animationTimer: null,

  /**
   * 播放先手判定动画
   */
  playInitiativeAnimation() {
    const p1Container = document.querySelector('#p1-star .pentagram-container');
    const p2Container = document.querySelector('#p2-star .pentagram-container');
    const msgEl = document.getElementById('init-message');

    msgEl.classList.remove('message-fade-in');
    msgEl.textContent = '';

    let toggle = false;
    let speed = 100;
    let winnerId = null;

    // 清理之前的动画（如果存在）
    if (this._animationTimer) {
      clearTimeout(this._animationTimer);
    }

    // 重置标志
    this._hasShownResult = false;

    const flash = () => {
      if (toggle) {
        p1Container?.classList.add('highlight');
        p2Container?.classList.remove('highlight');
      } else {
        p1Container?.classList.remove('highlight');
        p2Container?.classList.add('highlight');
      }

      if (winnerId) {
        if (toggle === (winnerId === 'P1')) {
          setTimeout(showResult, 500);
          return;
        }
      }

      toggle = !toggle;
      if (speed < 300) speed *= 1.05;
      this._animationTimer = setTimeout(flash, speed);
    };

    const showResult = () => {
      if (this._hasShownResult) {
        return;
      }
      this._hasShownResult = true;

      // 根据myRole判断显示文本（P2玩家看到的是镜像的）
      const myRole = StateManager.getMyRole();
      let displayText;
      if (myRole === 'P2') {
        // P2玩家：P1是对手，P2是自己
        displayText = winnerId === 'P1' ? '对家先手' : '本尊先手';
      } else {
        // P1玩家或单机模式：P1是自己，P2是对手
        displayText = winnerId === 'P1' ? '本尊先手' : '对家先手';
      }

      msgEl.textContent = displayText;
      msgEl.classList.add('message-fade-in');

      p1Container?.classList.remove('highlight');
      p2Container?.classList.remove('highlight');

      this._animationTimer = setTimeout(() => {
        EventBus.emit('anim:initiative-finished');
      }, 1200);
    };

    // 先设置监听器，再开始动画
    // 注意：由于使用了 { once: true }，监听器会在触发后自动移除
    // 所以每次都需要重新注册监听器
    EventBus.on('game:initiative-completed', (data) => {
      winnerId = data.winner;
      // flash() 循环会检测到 winnerId 并在正确的时机停止
    }, { once: true });

    // 立即启动闪烁动画
    flash();
  }
};

export default BoardAnimation;

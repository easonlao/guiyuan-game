// ============================================
// 棋盘动画控制器
// ============================================
// 职责：
// - 播放先手判定动画
// - 管理棋盘节点高亮效果
// ============================================

import EventBus from '../../bus/EventBus.js';

const BoardAnimation = {
  // 标志：防止重复调用 showResult
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
      // 防止重复调用
      if (this._hasShownResult) {
        console.log('[BoardAnimation] showResult 已被调用，跳过');
        return;
      }
      this._hasShownResult = true;

      msgEl.textContent = winnerId === 'P1' ? '本尊先手' : '对家先手';
      msgEl.classList.add('message-fade-in');

      // 移除高亮
      p1Container?.classList.remove('highlight');
      p2Container?.classList.remove('highlight');

      // 延迟发出完成事件，让玩家看到结果
      // 此时 INITIATIVE 命令已被确认，数据库已更新
      this._animationTimer = setTimeout(() => {
        EventBus.emit('anim:initiative-finished');
      }, 1200);
    };

    flash();

    EventBus.on('game:initiative-completed', (data) => {
      winnerId = data.winner;
      // INITIATIVE 命令已确认，现在可以安全地完成动画并开始游戏
      // 立即显示结果并发出完成事件
      showResult();
    }, { once: true });
  }
};

export default BoardAnimation;

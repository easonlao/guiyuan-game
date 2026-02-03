// ============================================
// 胜利弹窗控制器（主控制器）
// ============================================
// 职责：
// - 显示胜利/平局信息
// - 协调行为统计渲染
// - 处理返回按钮
// ============================================

import EventBus from '../../bus/EventBus.js';
import StateManager from '../../state/StateManager.js';
import ActionStatsRenderer from './ActionStatsRenderer.js';

const VictoryOverlay = {
  /**
   * 显示胜利弹窗
   * @param {Object} data - {winner, reason}
   */
  showVictory(data) {
    const { winner, reason } = data;
    const state = StateManager.getState();
    const victoryPopup = document.getElementById('victory-popup');

    if (!victoryPopup) return;

    this._updateVictoryTitle(winner);
    this._updateVictoryContent(reason, state);
    ActionStatsRenderer.renderActionStats(state);
    victoryPopup.style.display = 'flex';
  },

  /**
   * 更新胜利标题
   * @param {string} winner - 胜利者
   * @private
   */
  _updateVictoryTitle(winner) {
    const title = document.getElementById('victory-title');

    if (winner === 'P1') {
      title.textContent = '本尊胜';
      title.style.color = '#2dcc70';
    } else if (winner === 'P2') {
      title.textContent = '对家胜';
      title.style.color = '#ff6b6b';
    } else {
      title.textContent = '平局';
      title.style.color = '#f4a460';
    }
  },

  /**
   * 更新胜利内容
   * @param {string} reason - 胜利原因
   * @param {Object} state - 游戏状态
   * @private
   */
  _updateVictoryContent(reason, state) {
    const reasonText = document.getElementById('victory-reason');
    const scoreP1 = document.getElementById('victory-score-p1');
    const scoreP2 = document.getElementById('victory-score-p2');

    reasonText.textContent = reason;
    scoreP1.textContent = state.players.P1.score;
    scoreP2.textContent = state.players.P2.score;
  },

  /**
   * 隐藏胜利弹窗
   */
  hideVictory() {
    const victoryPopup = document.getElementById('victory-popup');
    if (victoryPopup) victoryPopup.style.display = 'none';
  }
};

export default VictoryOverlay;

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

    // 确保渲染器更新镜像模式
    const myRole = StateManager.getMyRole();

    this._updateVictoryTitle(winner, myRole);
    this._updateVictoryContent(reason, state, myRole);
    ActionStatsRenderer.renderActionStats(state);
    victoryPopup.style.display = 'flex';
  },

  /**
   * 更新胜利标题
   * @param {string} winner - 胜利者
   * @param {string} myRole - 当前玩家角色
   * @private
   */
  _updateVictoryTitle(winner, myRole) {
    const title = document.getElementById('victory-title');

    // 根据当前玩家角色判断显示文本
    let displayText;
    if (winner === 'DRAW') {
      displayText = '平局';
      title.style.color = '#f4a460';
    } else if (winner === myRole) {
      displayText = '本尊胜';
      title.style.color = '#2dcc70';
    } else {
      displayText = '对家胜';
      title.style.color = '#ff6b6b';
    }

    title.textContent = displayText;
  },

  /**
   * 更新胜利内容
   * @param {string} reason - 胜利原因
   * @param {Object} state - 游戏状态
   * @param {string} myRole - 当前玩家角色
   * @private
   */
  _updateVictoryContent(reason, state, myRole) {
    const reasonText = document.getElementById('victory-reason');
    const scoreP1 = document.getElementById('victory-score-p1');
    const scoreP2 = document.getElementById('victory-score-p2');
    const scoreLabelP1 = document.querySelector('#victory-popup .p1 .score-label');
    const scoreLabelP2 = document.querySelector('#victory-popup .p2 .score-label');

    reasonText.textContent = reason;

    // 根据当前玩家角色显示分数标签
    if (myRole === 'P2') {
      // P2 视角：P2 是本尊，P1 是对家
      if (scoreLabelP1) scoreLabelP1.textContent = '对家';
      if (scoreLabelP2) scoreLabelP2.textContent = '本尊';
      scoreP1.textContent = state.players.P1.score;
      scoreP2.textContent = state.players.P2.score;
    } else {
      // P1 视角或单机模式：P1 是本尊，P2 是对家
      if (scoreLabelP1) scoreLabelP1.textContent = '本尊';
      if (scoreLabelP2) scoreLabelP2.textContent = '对家';
      scoreP1.textContent = state.players.P1.score;
      scoreP2.textContent = state.players.P2.score;
    }
  },

  /**
   * 隐藏胜利弹窗
   */
  hideVictory() {
    console.log('[VictoryOverlay] hideVictory 被调用');
    const victoryPopup = document.getElementById('victory-popup');
    if (victoryPopup) {
      victoryPopup.style.display = 'none';
      console.log('[VictoryOverlay] 胜利弹窗已隐藏');
    } else {
      console.warn('[VictoryOverlay] victory-popup 元素未找到');
    }
  }
};

export default VictoryOverlay;

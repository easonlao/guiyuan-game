// ============================================
// 分层统计渲染器 v2 - 简化版
// ============================================
// 职责：
// - 渲染统计数据（合并显示，无分类）
// - 生成统计 HTML
// - 计算总计数据
// ============================================

import StateManager from '../../state/StateManager.js';

const ActionStatsRenderer = {
  /**
   * 渲染统计
   * @param {Object} state - 游戏状态
   */
  renderActionStats(state) {
    const stats = StateManager.getAllStats();
    const scores = StateManager.getAllScores();
    const victoryContent = document.querySelector('.victory-content');

    let statsContainer = document.getElementById('action-stats-container');
    if (statsContainer) {
      statsContainer.remove();
    }

    statsContainer = document.createElement('div');
    statsContainer.id = 'action-stats-container';
    statsContainer.className = 'action-stats-container';
    statsContainer.innerHTML = this._generateStatsHTML(stats, scores);

    const backBtn = document.getElementById('victory-back-btn');
    if (backBtn) {
      victoryContent.insertBefore(statsContainer, backBtn);
    } else {
      victoryContent.appendChild(statsContainer);
    }
  },

  /**
   * 生成统计 HTML（合并所有类别）
   * @param {Object} stats - 统计数据 {action, state, passive}
   * @param {Object} scores - 分数数据 {action, state, passive}
   * @returns {string}
   * @private
   */
  _generateStatsHTML(stats, scores) {
    // 合并所有统计项
    const allStats = {};
    const allScores = {};

    // 遍历三个类别
    for (const category of ['action', 'state', 'passive']) {
      const categoryStats = stats[category].P1;
      const categoryScores = scores[category].P1;

      for (const [key, count] of Object.entries(categoryStats)) {
        if (count > 0) {
          allStats[key] = (allStats[key] || 0) + count;
          allScores[key] = (allScores[key] || 0) + categoryScores[key];
        }
      }
    }

    // 按分数排序（高到低）
    const sortedItems = Object.entries(allStats)
      .filter(([key]) => allScores[key] !== 0)
      .sort(([, a], [, b]) => allScores[b] - allScores[a]);

    let html = '<div style="text-align:center;">';
    html += '<div style="display:flex; flex-direction:column; gap:0.8rem; align-items:stretch;">';

    for (const [key, count] of sortedItems) {
      const score = allScores[key];
      const scorePrefix = score >= 0 ? '+' : '';

      html += `<div class="action-stat-button" style="color: ${score >= 0 ? '#ffd700' : '#ff6b6b'};">
        <span class="stat-action-name">${key}</span>
        <span class="stat-count">${count}</span>
        <span class="stat-score">${scorePrefix}${score}</span>
      </div>`;
    }

    html += '</div></div>';
    return html;
  }
};

export default ActionStatsRenderer;

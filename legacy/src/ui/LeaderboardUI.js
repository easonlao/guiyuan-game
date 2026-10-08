// ============================================
// 排行榜 UI 控制器
// ============================================
// 职责：
// - 排行榜界面显示/隐藏
// - 排行榜数据渲染
// - 排行榜按钮交互
// ============================================

import EventBus from '../bus/EventBus.js';
import LeaderboardManager from '../network/LeaderboardManager.js';

const LeaderboardUI = {
  isOpen: false,

  init() {
    // 绑定排行榜按钮
    const leaderboardBtn = document.getElementById('leaderboard-btn');
    const closeBtn = document.getElementById('leaderboard-close');
    const leaderboardLayer = document.getElementById('leaderboard-layer');

    if (leaderboardBtn) {
      leaderboardBtn.addEventListener('click', () => this.show());
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }

    // 点击背景关闭
    if (leaderboardLayer) {
      leaderboardLayer.addEventListener('click', (e) => {
        if (e.target === leaderboardLayer) {
          this.hide();
        }
      });
    }

    // 监听排行榜更新事件
    EventBus.on('leaderboard:updated', this.handleLeaderboardUpdate.bind(this));

    // 订阅实时排行榜更新
    LeaderboardManager.subscribeToLeaderboard((payload) => {
      // 实时更新
    });
  },

  /**
   * 显示排行榜
   */
  async show() {
    if (this.isOpen) return;

    const layer = document.getElementById('leaderboard-layer');
    if (!layer) return;

    layer.style.display = 'flex';
    this.isOpen = true;

    // 刷新并显示排行榜数据
    await this.refreshLeaderboard();
  },

  /**
   * 隐藏排行榜
   */
  hide() {
    const layer = document.getElementById('leaderboard-layer');
    if (!layer) return;

    layer.style.display = 'none';
    this.isOpen = false;
  },

  /**
   * 刷新排行榜数据
   */
  async refreshLeaderboard() {
    const loadingEl = document.getElementById('leaderboard-loading');
    const tableWrapperEl = document.getElementById('leaderboard-table-wrapper');

    // 显示加载状态
    if (loadingEl) loadingEl.style.display = 'block';
    if (tableWrapperEl) tableWrapperEl.classList.remove('active');

    // 获取排行榜数据
    const result = await LeaderboardManager.getLeaderboard(100);

    if (result.success && result.data) {
      this.renderLeaderboard(result.data);
    } else {
      this.showError(result.error || '加载失败');
    }
  },

  /**
   * 渲染排行榜表格
   */
  renderLeaderboard(data) {
    const loadingEl = document.getElementById('leaderboard-loading');
    const tableWrapperEl = document.getElementById('leaderboard-table-wrapper');
    const tbody = document.getElementById('leaderboard-body');
    const lastUpdatedEl = document.getElementById('last-updated');

    if (!tbody) return;

    // 隐藏加载状态，显示表格
    if (loadingEl) loadingEl.style.display = 'none';
    if (tableWrapperEl) tableWrapperEl.classList.add('active');

    // 清空现有内容
    tbody.innerHTML = '';

    // 渲染排行榜条目
    data.forEach((entry, index) => {
      const rank = index + 1;
      const row = document.createElement('tr');

      // 排名样式
      let rankClass = '';
      if (rank === 1) rankClass = 'rank-1';
      else if (rank === 2) rankClass = 'rank-2';
      else if (rank === 3) rankClass = 'rank-3';
      else if (rank <= 10) rankClass = 'rank-top10';

      // 计算胜率（使用与平均分相同的容错逻辑）
      const effectiveGames = entry._effectiveGames || (entry.games_played || 0);
      const finalGames = effectiveGames > 0 ? effectiveGames : (entry.wins || 1);
      const winRate = finalGames > 0
        ? ((entry.wins || 0) / finalGames * 100).toFixed(1) + '%'
        : '0%';

      row.innerHTML = `
        <td class="${rankClass}">#${rank}</td>
        <td>${this.escapeHtml(entry.player_name || '匿名')}</td>
        <td class="${rankClass}">${entry.best_score || 0}</td>
        <td>${entry.avg_score || 0}</td>
        <td>${winRate}</td>
      `;

      tbody.appendChild(row);
    });

    // 更新时间戳
    if (lastUpdatedEl) {
      const timestamp = new Date().toLocaleString('zh-CN');
      lastUpdatedEl.textContent = `更新于: ${timestamp}`;
    }
  },

  /**
   * 显示错误信息
   */
  showError(message) {
    const loadingEl = document.getElementById('leaderboard-loading');
    const tableWrapperEl = document.getElementById('leaderboard-table-wrapper');

    if (loadingEl) {
      loadingEl.textContent = `加载失败: ${message}`;
      loadingEl.style.display = 'block';
    }
    if (tableWrapperEl) {
      tableWrapperEl.classList.remove('active');
    }
  },

  /**
   * 处理排行榜更新事件
   */
  handleLeaderboardUpdate(data) {
    if (this.isOpen) {
      this.renderLeaderboard(data.data);
    }
  },

  /**
   * HTML 转义
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

export default LeaderboardUI;

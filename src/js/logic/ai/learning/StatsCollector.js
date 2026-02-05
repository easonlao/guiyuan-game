// ============================================
// 统计数据收集器
// ============================================
// 职责：
// - 收集游戏统计数据
// - 分析动作使用频率
// - 分析归一进度趋势
// - 提供统计查询接口
// ============================================

const StatsCollector = {
  // 累计统计数据
  cumulative: {
    totalGames: 0,
    p1Wins: 0,
    p2Wins: 0,
    draws: 0,
    totalTurns: 0,
    actionCounts: { AUTO: 0, CONVERT: 0, TRANS: 0, ATK: 0, BURST: 0, BURST_ATK: 0 }
  },

  /**
   * 初始化统计收集器
   */
  init: function() {
    this._loadFromStorage();
    console.log('[StatsCollector] 初始化，历史局数:', this.cumulative.totalGames);
  },

  /**
   * 记录一局游戏
   */
  recordGame: function(gameData) {
    this.cumulative.totalGames++;
    this.cumulative.totalTurns += gameData.turnCount;

    if (gameData.winner === 'P1') this.cumulative.p1Wins++;
    else if (gameData.winner === 'P2') this.cumulative.p2Wins++;
    else if (gameData.winner === 'DRAW') this.cumulative.draws++;

    // 累计动作使用次数
    if (gameData.stats && gameData.stats.actionCounts) {
      for (const action in gameData.stats.actionCounts) {
        this.cumulative.actionCounts[action] += gameData.stats.actionCounts[action];
      }
    }

    this._saveToStorage();
  },

  /**
   * 获取动作使用统计
   */
  getActionStats: function() {
    const total = Object.values(this.cumulative.actionCounts).reduce(function(a, b) { return a + b; }, 0);

    if (total === 0) {
      return { total: 0, byAction: {} };
    }

    const byAction = {};
    for (const action in this.cumulative.actionCounts) {
      byAction[action] = {
        count: this.cumulative.actionCounts[action],
        percentage: (this.cumulative.actionCounts[action] / total * 100).toFixed(1) + '%'
      };
    }

    return { total: total, byAction: byAction };
  },

  /**
   * 获取胜率统计
   */
  getWinRateStats: function() {
    const total = this.cumulative.totalGames;

    if (total === 0) {
      return { p1: '0%', p2: '0%', draw: '0%' };
    }

    return {
      p1: (this.cumulative.p1Wins / total * 100).toFixed(1) + '%',
      p2: (this.cumulative.p2Wins / total * 100).toFixed(1) + '%',
      draw: (this.cumulative.draws / total * 100).toFixed(1) + '%'
    };
  },

  /**
   * 获取平均回合数
   */
  getAverageTurns: function() {
    if (this.cumulative.totalGames === 0) return 0;
    return (this.cumulative.totalTurns / this.cumulative.totalGames).toFixed(1);
  },

  /**
   * 分析最近 N 局的趋势
   */
  analyzeRecentTrends: function(n) {
    n = n || 10;
    const history = this._loadHistory();
    const recentGames = history.slice(-n);

    if (recentGames.length === 0) {
      return { error: '没有历史数据' };
    }

    let p1Wins = 0;
    let avgTurns = 0;

    for (let i = 0; i < recentGames.length; i++) {
      const game = recentGames[i];
      if (game.winner === 'P1') p1Wins++;
      avgTurns += game.turnCount;
    }

    avgTurns = avgTurns / recentGames.length;

    return {
      games: recentGames.length,
      p1Wins: p1Wins,
      p2Wins: recentGames.length - p1Wins,
      p1WinRate: (p1Wins / recentGames.length * 100).toFixed(1) + '%',
      avgTurns: avgTurns.toFixed(1)
    };
  },

  /**
   * 分析动作与胜负的关系
   */
  analyzeActionWinCorrelation: function() {
    const history = this._loadHistory();

    if (history.length === 0) {
      return { error: '没有历史数据' };
    }

    // 按动作类型分组统计
    const actionStats = {
      CONVERT: { wins: 0, total: 0 },
      TRANS: { wins: 0, total: 0 },
      ATK: { wins: 0, total: 0 },
      BURST: { wins: 0, total: 0 },
      BURST_ATK: { wins: 0, total: 0 }
    };

    for (let i = 0; i < history.length; i++) {
      const game = history[i];
      const isP1Win = game.winner === 'P1';

      for (const action in game.stats.actionCounts) {
        if (actionStats[action]) {
          actionStats[action].total += game.stats.actionCounts[action];
          if (isP1Win) {
            actionStats[action].wins += game.stats.actionCounts[action];
          }
        }
      }
    }

    // 计算胜率
    const result = {};
    for (const action in actionStats) {
      const stats = actionStats[action];
      result[action] = {
        total: stats.total,
        winRate: stats.total > 0 ? (stats.wins / stats.total * 100).toFixed(1) + '%' : 'N/A'
      };
    }

    return result;
  },

  /**
   * 获取完整统计摘要
   */
  getFullSummary: function() {
    return {
      overview: {
        totalGames: this.cumulative.totalGames,
        avgTurns: this.getAverageTurns()
      },
      winRates: this.getWinRateStats(),
      actions: this.getActionStats(),
      recentTrends: this.analyzeRecentTrends(10),
      actionCorrelation: this.analyzeActionWinCorrelation()
    };
  },

  /**
   * 重置统计数据
   */
  resetStats: function() {
    this.cumulative = {
      totalGames: 0,
      p1Wins: 0,
      p2Wins: 0,
      draws: 0,
      totalTurns: 0,
      actionCounts: { AUTO: 0, CONVERT: 0, TRANS: 0, ATK: 0, BURST: 0, BURST_ATK: 0 }
    };
    this._saveToStorage();
    console.log('[StatsCollector] 统计数据已重置');
  },

  /**
   * 从本地存储加载历史数据
   * @private
   */
  _loadHistory: function() {
    try {
      const data = localStorage.getItem('wuxing_game_history');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[StatsCollector] 加载历史数据失败:', error);
      return [];
    }
  },

  /**
   * 从本地存储加载统计数据
   * @private
   */
  _loadFromStorage: function() {
    try {
      const data = localStorage.getItem('wuxing_stats_cumulative');
      if (data) {
        this.cumulative = JSON.parse(data);
      }
    } catch (error) {
      console.error('[StatsCollector] 加载统计数据失败:', error);
    }
  },

  /**
   * 保存到本地存储
   * @private
   */
  _saveToStorage: function() {
    try {
      localStorage.setItem('wuxing_stats_cumulative', JSON.stringify(this.cumulative));
    } catch (error) {
      console.error('[StatsCollector] 保存统计数据失败:', error);
    }
  }
};

export default StatsCollector;

// ============================================
// 排行榜管理器 (参考 SnakeGame LeaderboardAPI)
// ============================================
// 职责：
// - 提交/更新玩家分数
// - 获取 Top 100 排行榜
// - 查询玩家排名
// - 实时排行榜更新
// ============================================

import EventBus from '../bus/EventBus.js';
import StateManager from '../state/StateManager.js';
import { supabase, query, insert, update, getCurrentUserId } from './supabaseClient.js';
import { GAME_EVENTS } from '../types/events.js';

const LeaderboardManager = {
  leaderboard: [],
  isLoading: false,
  lastUpdated: null,
  realtimeSubscription: null,

  init() {
    console.log('[LeaderboardManager] 初始化排行榜管理器...');

    // 监听游戏胜利事件
    EventBus.on(GAME_EVENTS.VICTORY, this.handleGameEnd.bind(this));

    // 监听排行榜刷新请求
    EventBus.on('leaderboard:refresh', this.fetchLeaderboard.bind(this));

    // 初始化时获取排行榜
    this.fetchLeaderboard();
  },

  async handleGameEnd(data) {
    const { winner, reason } = data;
    const state = this.getGameState();

    if (!state) {
      console.warn('[LeaderboardManager] 无法获取游戏状态');
      return;
    }

    const player1Score = state.players.P1.score;
    const player2Score = state.players.P2.score;
    const currentUserId = getCurrentUserId();

    console.log('[LeaderboardManager] 游戏结束，更新排行榜:', { winner, reason, player1Score, player2Score });

    // 提交双方玩家分数
    await this.submitScore('P1', player1Score, { winner, reason, gameMode: state.gameMode });
    await this.submitScore('P2', player2Score, { winner, reason, gameMode: state.gameMode });

    // 刷新排行榜
    await this.fetchLeaderboard();

    // 触发排行榜更新事件
    EventBus.emit('leaderboard:updated', {
      data: this.leaderboard,
      timestamp: this.lastUpdated
    });
  },

  /**
   * 获取排行榜（参考 SnakeGame getLeaderboard）
   * @param {number} limit - 返回条数，默认 100
   * @returns {Promise<Object>} 排行榜数据
   */
  async getLeaderboard(limit = 100) {
    if (this.isLoading) {
      console.log('[LeaderboardManager] 排行榜加载中...');
      return { success: false, message: '加载中' };
    }

    this.isLoading = true;

    try {
      const data = await query('player_scores', {
        order: 'total_score',
        ascending: false,
        limit: limit
      });

      if (!data) {
        throw new Error('获取排行榜失败');
      }

      this.leaderboard = data;
      this.lastUpdated = new Date();

      console.log('[LeaderboardManager] 排行榜获取成功:', this.leaderboard.length, '条记录');

      return { success: true, data: this.leaderboard };
    } catch (error) {
      console.error('[LeaderboardManager] 排行榜获取失败:', error);
      return { success: false, error: error.message };
    } finally {
      this.isLoading = false;
    }
  },

  /**
   * 刷新排行榜并触发事件
   */
  async fetchLeaderboard() {
    const result = await this.getLeaderboard(100);

    if (result.success) {
      EventBus.emit('leaderboard:updated', {
        data: this.leaderboard,
        timestamp: this.lastUpdated
      });
    }
  },

  /**
   * 提交或更新分数（参考 SnakeGame submitScore）
   * @param {string} playerId - 玩家 ID (P1/P2)
   * @param {number} score - 本次得分
   * @param {Object} gameData - 游戏数据
   * @returns {Promise<Object>} 提交结果
   */
  async submitScore(playerId, score, gameData = {}) {
    try {
      // 基础验证
      if (!playerId || typeof score !== 'number' || score < 0) {
        throw new Error('无效的玩家 ID 或分数');
      }

      // 生成唯一的玩家标识（使用 localStorage 的 ID）
      const uniquePlayerId = getCurrentUserId() || `guest_${Date.now()}`;
      const playerName = playerId === 'P1' ? '本尊' : '对家';

      // 查询是否已有记录
      const existing = await query('player_scores', {
        match: { player_id: uniquePlayerId }
      });

      const timestamp = new Date().toISOString();
      const playerData = {
        player_id: uniquePlayerId,
        player_name: playerName,
        total_score: score,
        games_played: 1,
        wins: gameData.winner === playerId ? 1 : 0,
        last_played_at: timestamp,
        game_mode: gameData.gameMode || 1
      };

      let result;

      if (existing && existing.length > 0) {
        const current = existing[0];

        // 只在新分数更高时更新（参考 SnakeGame 逻辑）
        if (score > (current.best_score || 0)) {
          result = await update('player_scores', {
            ...playerData,
            total_score: (current.total_score || 0) + score,
            games_played: (current.games_played || 0) + 1,
            wins: (current.wins || 0) + (gameData.winner === playerId ? 1 : 0),
            best_score: score
          }, { match: { player_id: uniquePlayerId } });

          console.log('[LeaderboardManager] 更新玩家分数:', uniquePlayerId, score);
        } else {
          // 分数不是最高，但仍累加总局分和游戏场次
          result = await update('player_scores', {
            total_score: (current.total_score || 0) + score,
            games_played: (current.games_played || 0) + 1,
            wins: (current.wins || 0) + (gameData.winner === playerId ? 1 : 0),
            last_played_at: timestamp
          }, { match: { player_id: uniquePlayerId } });

          console.log('[LeaderboardManager] 累加玩家分数:', uniquePlayerId);
        }
      } else {
        // 新玩家，插入记录
        playerData.best_score = score;
        playerData.created_at = timestamp;
        result = await insert('player_scores', playerData);

        console.log('[LeaderboardManager] 新玩家记录:', uniquePlayerId);
      }

      return { success: true, updated: true };
    } catch (error) {
      console.error('[LeaderboardManager] 提交分数失败:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * 检查分数是否入围排行榜（参考 SnakeGame isLeaderboardScore）
   * @param {number} score - 分数
   * @param {number} limit - 排行榜条数
   * @returns {Promise<Object>} 是否入围及排名
   */
  async isLeaderboardScore(score, limit = 100) {
    try {
      const { data } = await this.getLeaderboard(limit);

      if (!data || data.length < limit) {
        return { qualifies: true, rank: (data?.length || 0) + 1 };
      }

      const lowestScore = data[data.length - 1].total_score;
      const qualifies = score > lowestScore;

      if (qualifies) {
        const rank = data.findIndex(entry => score > entry.total_score) + 1;
        return { qualifies: true, rank: rank || data.length + 1 };
      }

      return { qualifies: false, rank: null };
    } catch (error) {
      console.error('[LeaderboardManager] 检查入围失败:', error);
      return { qualifies: false, error: error.message };
    }
  },

  /**
   * 获取玩家排名（参考 SnakeGame getPlayerRank）
   * @param {string} playerId - 玩家 ID
   * @returns {Promise<Object>} 排名信息
   */
  async getPlayerRank(playerId) {
    try {
      const uniquePlayerId = getCurrentUserId();
      const { data } = await this.getLeaderboard();

      if (!data) {
        return { found: false };
      }

      const playerIndex = data.findIndex(player => player.player_id === uniquePlayerId);

      if (playerIndex === -1) {
        return { found: false };
      }

      return {
        found: true,
        rank: playerIndex + 1,
        score: data[playerIndex].total_score,
        bestScore: data[playerIndex].best_score,
        totalPlayers: data.length
      };
    } catch (error) {
      console.error('[LeaderboardManager] 获取排名失败:', error);
      return { found: false, error: error.message };
    }
  },

  /**
   * 订阅实时排行榜更新（参考 SnakeGame subscribeToLeaderboard）
   * @param {Function} callback - 回调函数
   * @returns {Object} 订阅对象
   */
  subscribeToLeaderboard(callback) {
    if (this.realtimeSubscription) {
      console.warn('[LeaderboardManager] 已存在订阅，先取消旧订阅');
      this.unsubscribeFromLeaderboard();
    }

    this.realtimeSubscription = supabase
      .channel('leaderboard-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'player_scores'
      }, (payload) => {
        console.log('[LeaderboardManager] 实时更新:', payload);
        callback(payload);
        // 自动刷新本地排行榜
        this.fetchLeaderboard();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[LeaderboardManager] 已订阅排行榜实时更新');
        }
      });

    return this.realtimeSubscription;
  },

  /**
   * 取消实时订阅
   */
  unsubscribeFromLeaderboard() {
    if (this.realtimeSubscription) {
      supabase.removeChannel(this.realtimeSubscription);
      this.realtimeSubscription = null;
      console.log('[LeaderboardManager] 已取消排行榜订阅');
    }
  },

  /**
   * 获取本地排行榜数据
   */
  getLeaderboardData() {
    return this.leaderboard;
  },

  /**
   * 辅助：获取游戏状态
   */
  getGameState() {
    try {
      return StateManager.getState();
    } catch (error) {
      console.error('[LeaderboardManager] 获取游戏状态失败:', error);
      return null;
    }
  }
};

export default LeaderboardManager;

// ============================================
// 对局数据记录器
// ============================================
// 职责：
// - 记录每局游戏的完整数据
// - 记录每个回合的决策过程
// - 记录统计数据
// - 提供数据查询接口
// ============================================

import StateManager from '../../../state/StateManager.js';
import UnityEvaluator from '../core/UnityEvaluator.js';

const GameRecorder = {
  // 当前游戏数据
  currentGame: null,

  // 是否启用记录
  enabled: true,

  /**
   * 初始化新游戏记录
   * @param {string} gameMode - 游戏模式
   */
  initGame(gameMode) {
    if (!this.enabled) return;

    this.currentGame = {
      gameId: this._generateUUID(),
      timestamp: Date.now(),
      gameMode,
      winner: null,
      turnCount: 0,
      finalScores: { P1: 0, P2: 0 },
      turns: [],
      stats: {
        actionCounts: { AUTO: 0, CONVERT: 0, TRANS: 0, ATK: 0, BURST: 0, BURST_ATK: 0 },
        unityProgression: [],
        opponentUnityProgression: []
      }
    };

    console.log('[GameRecorder] 初始化游戏记录:', this.currentGame.gameId);
  },

  /**
   * 记录回合数据
   * @param {Object} turnData - 回合数据
   */
  recordTurn(turnData) {
    if (!this.enabled || !this.currentGame) return;

    const { playerId, stem, availableActions, selectedAction, aiDecision } = turnData;

    // 获取双方归一状态
    const bothEval = UnityEvaluator.evaluateBoth();
    const myEval = playerId === 'P1' ? bothEval.P1 : bothEval.P2;
    const opponentEval = playerId === 'P1' ? bothEval.P2 : bothEval.P1;

    const turnRecord = {
      turn: this.currentGame.turnCount + 1,
      playerId,
      stem: { name: stem.name, element: stem.element },
      availableActions: availableActions.map(a => a.type),
      selectedAction: selectedAction.type,
      myUnityBefore: myEval.unityCount,
      myUnityAfter: null,  // 会在回合结束时更新
      opponentUnityBefore: opponentEval.unityCount,
      opponentUnityAfter: null,
      aiDecision: aiDecision ? {
        strategy: aiDecision.strategy,
        value: aiDecision.value,
        breakdown: aiDecision.breakdown,
        allActionValues: aiDecision.allActions
      } : null
    };

    this.currentGame.turns.push(turnRecord);
    this.currentGame.turnCount = turnRecord.turn;

    // 记录归一进度
    this.currentGame.stats.unityProgression.push(myEval.unityCount);
    this.currentGame.stats.opponentUnityProgression.push(opponentEval.unityCount);
  },

  /**
   * 更新回合后的状态
   */
  updateTurnAfterState() {
    if (!this.enabled || !this.currentGame || this.currentGame.turns.length === 0) return;

    const lastTurn = this.currentGame.turns[this.currentGame.turns.length - 1];
    const playerId = lastTurn.playerId;

    // 重新获取状态
    const bothEval = UnityEvaluator.evaluateBoth();
    const myEval = playerId === 'P1' ? bothEval.P1 : bothEval.P2;
    const opponentEval = playerId === 'P1' ? bothEval.P2 : bothEval.P1;

    lastTurn.myUnityAfter = myEval.unityCount;
    lastTurn.opponentUnityAfter = opponentEval.unityCount;
  },

  /**
   * 记录动作使用
   * @param {string} actionType - 动作类型
   */
  recordAction(actionType) {
    if (!this.enabled || !this.currentGame) return;

    if (this.currentGame.stats.actionCounts[actionType] !== undefined) {
      this.currentGame.stats.actionCounts[actionType]++;
    }
  },

  /**
   * 结束游戏记录
   * @param {string} winner - 胜利者
   */
  endGame(winner) {
    if (!this.enabled || !this.currentGame) return;

    const state = StateManager.getState();
    this.currentGame.winner = winner;
    this.currentGame.finalScores = {
      P1: state.players.P1.score,
      P2: state.players.P2.score
    };

    console.log('[GameRecorder] 游戏结束:', winner, '回合数:', this.currentGame.turnCount);

    // 保存到本地存储
    this._saveToStorage();

    return this.currentGame;
  },

  /**
   * 获取当前游戏数据
   * @returns {Object}
   */
  getCurrentGame() {
    return this.currentGame;
  },

  /**
   * 从本地存储加载历史游戏数据
   * @param {number} limit - 最大数量
   * @returns {Array}
   */
  loadHistory(limit = 100) {
    try {
      const data = localStorage.getItem('wuxing_game_history');
      if (!data) return [];

      const history = JSON.parse(data);
      return history.slice(-limit);
    } catch (error) {
      console.error('[GameRecorder] 加载历史数据失败:', error);
      return [];
    }
  },

  /**
   * 清除历史数据
   */
  clearHistory() {
    localStorage.removeItem('wuxing_game_history');
    console.log('[GameRecorder] 历史数据已清除');
  },

  /**
   * 启用/禁用记录
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log('[GameRecorder] 记录', enabled ? '启用' : '禁用');
  },

  /**
   * 保存到本地存储
   * @private
   */
  _saveToStorage() {
    try {
      const history = this.loadHistory();
      history.push(this.currentGame);

      // 只保留最近 500 局
      if (history.length > 500) {
        history.splice(0, history.length - 500);
      }

      localStorage.setItem('wuxing_game_history', JSON.stringify(history));
      console.log('[GameRecorder] 游戏数据已保存，历史局数:', history.length);
    } catch (error) {
      console.error('[GameRecorder] 保存数据失败:', error);
    }
  },

  /**
   * 生成 UUID
   * @private
   */
  _generateUUID() {
    return 'game_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  },

  /**
   * 导出数据为 JSON
   * @returns {string}
   */
  exportData() {
    const history = this.loadHistory();
    return JSON.stringify(history, null, 2);
  },

  /**
   * 获取统计摘要
   * @returns {Object}
   */
  getStatsSummary() {
    const history = this.loadHistory();

    if (history.length === 0) {
      return { totalGames: 0 };
    }

    // 计算统计数据
    let p1Wins = 0;
    let p2Wins = 0;
    let draws = 0;
    let totalTurns = 0;

    history.forEach(game => {
      if (game.winner === 'P1') p1Wins++;
      else if (game.winner === 'P2') p2Wins++;
      else if (game.winner === 'DRAW') draws++;
      totalTurns += game.turnCount;
    });

    return {
      totalGames: history.length,
      p1Wins,
      p2Wins,
      draws,
      p1WinRate: (p1Wins / history.length * 100).toFixed(1) + '%',
      p2WinRate: (p2Wins / history.length * 100).toFixed(1) + '%',
      avgTurns: (totalTurns / history.length).toFixed(1)
    };
  }
};

export default GameRecorder;

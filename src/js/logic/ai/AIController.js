// ============================================
// AI 决策控制器（重构版）
// ============================================
// 职责：
// - 整合所有 AI 模块
// - 评估可用动作并选择最优动作
// - 根据游戏状态调整策略
// - 模拟延时执行
// ============================================

import UnityEvaluator from './core/UnityEvaluator.js';
import ActionValueCalculator from './core/ActionValueCalculator.js';
import StrategySelector from './core/StrategySelector.js';
import GameRecorder from './learning/GameRecorder.js';
import StatsCollector from './learning/StatsCollector.js';

const AIController = {
  /**
   * 调试模式开关
   */
  debugMode: true,

  /**
   * 数据收集模式开关
   */
  dataCollectionEnabled: true,

  /**
   * 初始化（需要在游戏开始时调用）
   * @param {string} gameMode - 游戏模式
   */
  init(gameMode) {
    GameRecorder.initGame(gameMode);
    StatsCollector.init();
    console.log('[AIController] 初始化完成，数据收集', this.dataCollectionEnabled ? '启用' : '禁用');
  },

  /**
   * 记录决策数据
   * @param {string} playerId - 玩家ID
   * @param {Object} stem - 天干
   * @param {Array} actions - 可用动作
   * @param {Object} selectedAction - 选中的动作
   * @private
   */
  _recordDecision(playerId, stem, actions, selectedAction) {
    if (!this.dataCollectionEnabled) return;

    GameRecorder.recordTurn({
      playerId,
      stem,
      availableActions: actions,
      selectedAction,
      aiDecision: selectedAction._ai ? {
        strategy: selectedAction._ai.strategy,
        value: selectedAction._ai.value,
        breakdown: selectedAction._ai.breakdown,
        allActions: selectedAction._ai.allActions
      } : null
    });

    GameRecorder.recordAction(selectedAction.type);
  },

  /**
   * 结束游戏记录（需要在游戏结束时调用）
   * @param {string} winner - 胜利者
   */
  endGame(winner) {
    if (!this.dataCollectionEnabled) return;

    const gameData = GameRecorder.endGame(winner);
    if (gameData) {
      StatsCollector.recordGame(gameData);
    }
  },

  /**
   * 获取统计数据
   * @returns {Object}
   */
  getStats() {
    return StatsCollector.getFullSummary();
  },

  /**
   * 获取历史游戏数据
   * @param {number} limit - 最大数量
   * @returns {Array}
   */
  getHistory(limit) {
    return GameRecorder.loadHistory(limit);
  },

  /**
   * 清除历史数据
   */
  clearHistory() {
    GameRecorder.clearHistory();
    StatsCollector.resetStats();
  },

  /**
   * 启用/禁用数据收集
   * @param {boolean} enabled
   */
  setDataCollectionEnabled(enabled) {
    this.dataCollectionEnabled = enabled;
    GameRecorder.setEnabled(enabled);
  },

  /**
   * AI 执行决策
   * @param {Array} actions - 可用动作列表
   * @param {Object} stem - 当前天干
   * @param {string} playerId - 玩家ID
   * @param {Function} executor - 执行回调函数
   */
  execute(actions, stem, playerId, executor) {
    if (actions.length === 0) {
      console.warn('[AIController] 没有可用动作');
      return;
    }

    // 如果只有一个动作，直接选择
    if (actions.length === 1) {
      this._logDecision(playerId, actions[0], stem, '唯一选择');
      this._recordDecision(playerId, stem, actions, actions[0]);
      setTimeout(() => executor(actions[0]), 800);
      return;
    }

    // 选择最优动作
    const selected = this._selectBestAction(actions, stem, playerId);

    this._logDecision(playerId, selected, stem);
    this._recordDecision(playerId, stem, actions, selected);

    setTimeout(() => {
      executor(selected);
    }, 800);
  },

  /**
   * 选择最优动作（核心决策逻辑 - 使用局势感知系统）
   * @param {Array} actions - 可用动作列表
   * @param {Object} stem - 当前天干
   * @param {string} playerId - 玩家ID
   * @returns {Object} - 选中的动作
   * @private
   */
  _selectBestAction(actions, stem, playerId) {
    // 计算所有动作的价值（ActionValueCalculator 已包含局势感知）
    const valuedActions = ActionValueCalculator.calculateAllActions(actions, playerId, stem);

    // 选择最优动作（直接使用 totalValue，不再应用额外权重）
    const bestAction = valuedActions.reduce((best, current) =>
      current.value > best.value ? current : best
    );

    // 获取策略信息用于调试（仅保留用于日志显示）
    const strategy = StrategySelector.selectStrategy(playerId);

    // 添加元数据用于调试
    return {
      ...bestAction,
      _ai: {
        value: bestAction.value,
        breakdown: bestAction.breakdown,
        strategyPhase: strategy.phase,  // 仅用于调试显示
        situationScore: bestAction.breakdown.situationScore,  // 局势分数
        multipliers: bestAction.breakdown.multipliers,  // 局势系数
        allActions: valuedActions.map(a => ({
          type: a.type,
          value: a.value,
          breakdown: a.breakdown
        }))
      }
    };
  },

  /**
   * 记录决策日志
   * @param {string} playerId - 玩家ID
   * @param {Object} action - 选中的动作
   * @param {Object} stem - 当前天干
   * @param {string} reason - 选择原因
   * @private
   */
  _logDecision(playerId, action, stem, reason = null) {
    if (!this.debugMode) return;

    console.log(`[AIController] ${playerId} 选择动作: ${action.type}`);

    if (action._ai) {
      const ai = action._ai;
      const situation = ai.situationScore;
      let situationText = '持平';
      if (situation <= -1) situationText = '落后';
      if (situation >= 1) situationText = '领先';

      console.log(`  局势: ${situationText} (${situation.toFixed(1)})`);
      console.log(`  系数: 攻击×${ai.multipliers?.offense || 1}, 推进×${ai.multipliers?.defense || 1}`);
      console.log(`  价值: ${ai.value.toFixed(1)}`);
      console.log(`  明细: 归一${ai.breakdown?.unityScore || 0} + 战略${ai.breakdown?.strategicScore || 0} - 成本${ai.breakdown?.turnCost || 0}`);
      console.log(`  所有动作:`, ai.allActions.map(a => `${a.type}:${a.value.toFixed(0)}`).join(', '));
    }

    if (reason) {
      console.log(`  原因: ${reason}`);
    }
  },

  /**
   * 启用/禁用调试模式
   * @param {boolean} enabled
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  },

  /**
   * 获取当前游戏状态评估（用于调试）
   * @param {string} playerId - 玩家ID
   * @returns {Object}
   */
  getGameStateEvaluation(playerId) {
    const bothEval = UnityEvaluator.evaluateBoth();
    const strategy = StrategySelector.selectStrategy(playerId);

    return {
      both: bothEval,
      strategy,
      myEval: playerId === 'P1' ? bothEval.P1 : bothEval.P2,
      opponentEval: playerId === 'P1' ? bothEval.P2 : bothEval.P1
    };
  }
};

export default AIController;

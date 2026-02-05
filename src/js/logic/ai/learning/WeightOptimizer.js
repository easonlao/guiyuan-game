// ============================================
// 权重优化器
// ============================================
// @status 部分实现 - 数据分析已完成，动态权重应用待实现
// @priority 低 - 当前使用固定权重已满足游戏需求
//
// 职责：
// - 分析收集的游戏数据
// - 计算动作的实际效果
// - 对比预期价值与实际收益
// - 生成权重调整建议
// - 支持 A/B 测试
//
// 注意：applyWeights() 方法需要修改 ActionValueCalculator.js 支持动态权重，
//       这是一个较大的架构变更，当前版本使用固定权重配置。
// ============================================

import GameRecorder from './GameRecorder.js';
import StatsCollector from './StatsCollector.js';

// 当前权重配置（与 ActionValueCalculator 保持一致）
const CURRENT_WEIGHTS = {
  UNITY_PROGRESSION: {
    COMPLETE_NEW: 200,      // 完成新归一
    CLOSE_TO_UNITY: 100,    // 接近归一
    ADVANCE_VOID: 50,       // 推进虚空
    REPAIR_DAMAGE: 150      // 修复道损
  },
  STRATEGIC: {
    BREAK_OPPOSITE_UNITY: 180,     // 破坏对方归一
    BREAK_OPPOSITE_HARMONY: 150,   // 破坏对方合一
    CREATE_HARMONY: 50,            // 创建自己的合一
    BURST_BONUS: 100,              // BURST 爆发推进
    BURST_ATK_BONUS: 120,          // BURST_ATK 双重打击
    DELAY_OPPOSITE: 80             // 延缓对方
  },
  TURN_COST: {
    WASTED_TURN: -50               // 无效回合
  }
};

const WeightOptimizer = {
  /**
   * 分析所有数据并生成优化报告
   * @returns {Object} 优化报告
   */
  analyzeAll: function() {
    const history = GameRecorder.loadHistory();
    const stats = StatsCollector.getFullSummary();

    if (history.length === 0) {
      return { error: '暂无数据' };
    }

    console.log('[WeightOptimizer] 开始分析', history.length, '局游戏');

    const report = {
      dataSummary: {
        totalGames: history.length,
        p1WinRate: stats.winRates.p1,
        avgTurns: stats.overview.avgTurns
      },
      actionAnalysis: this._analyzeActions(history),
      unityCorrelation: this._analyzeUnityCorrelation(history),
      phaseAnalysis: this._analyzePhases(history),
      suggestions: []
    };

    // 生成优化建议
    report.suggestions = this._generateSuggestions(report);

    return report;
  },

  /**
   * 分析动作效果
   * @private
   */
  _analyzeActions: function(history) {
    const actionStats = {
      AUTO: { wins: 0, total: 0, avgUnityGain: 0 },
      CONVERT: { wins: 0, total: 0, avgUnityGain: 0 },
      TRANS: { wins: 0, total: 0, avgUnityGain: 0 },
      ATK: { wins: 0, total: 0, avgUnityGain: 0 },
      BURST: { wins: 0, total: 0, avgUnityGain: 0 },
      BURST_ATK: { wins: 0, total: 0, avgUnityGain: 0 }
    };

    // 分析每个回合
    for (let i = 0; i < history.length; i++) {
      const game = history[i];
      const isP1Win = game.winner === 'P1';

      for (let j = 0; j < game.turns.length; j++) {
        const turn = game.turns[j];

        if (turn.playerId === 'P1' && actionStats[turn.selectedAction]) {
          actionStats[turn.selectedAction].total++;

          // 计算归一增益
          const unityGain = turn.myUnityAfter - turn.myUnityBefore;
          actionStats[turn.selectedAction].avgUnityGain += unityGain;

          // 如果 P1 赢了，这个动作贡献胜利
          if (isP1Win) {
            actionStats[turn.selectedAction].wins++;
          }
        }
      }
    }

    // 计算平均值
    for (const action in actionStats) {
      if (actionStats[action].total > 0) {
        actionStats[action].avgUnityGain = (actionStats[action].avgUnityGain / actionStats[action].total).toFixed(2);
        actionStats[action].winRate = (actionStats[action].wins / actionStats[action].total * 100).toFixed(1) + '%';
      }
    }

    return actionStats;
  },

  /**
   * 分析归一进度与胜负相关性
   * @private
   */
  _analyzeUnityCorrelation: function(history) {
    let fastWins = 0;  // 快速达到高归一
    let slowWins = 0;  // 慢速但获胜
    let fastLosses = 0;
    let slowLosses = 0;

    for (let i = 0; i < history.length; i++) {
      const game = history[i];
      const progression = game.stats.unityProgression;
      const isP1Win = game.winner === 'P1';

      // 计算达到 4 归一的回合数
      let turnToReach4 = -1;
      for (let j = 0; j < progression.length; j++) {
        if (progression[j] >= 4) {
          turnToReach4 = j + 1;
          break;
        }
      }

      if (turnToReach4 !== -1 && turnToReach4 <= 10) {
        // 快速归一
        if (isP1Win) fastWins++;
        else fastLosses++;
      } else if (isP1Win) {
        slowWins++;
      } else {
        slowLosses++;
      }
    }

    return {
      fastWins,
      fastLosses,
      slowWins,
      slowLosses,
      fastWinRate: history.length > 0 ? (fastWins / (fastWins + fastLosses) * 100).toFixed(1) + '%' : 'N/A'
    };
  },

  /**
   * 分析不同阶段的表现
   * @private
   */
  _analyzePhases: function(history) {
    const phaseStats = {
      early: { wins: 0, losses: 0, avgUnityGain: 0 },
      mid: { wins: 0, losses: 0, avgUnityGain: 0 },
      late: { wins: 0, losses: 0, avgUnityGain: 0 }
    };

    for (let i = 0; i < history.length; i++) {
      const game = history[i];
      const isP1Win = game.winner === 'P1';
      const progression = game.stats.unityProgression;

      // 分析每个回合的阶段
      for (let j = 0; j < game.turns.length && j < progression.length; j++) {
        const unity = progression[j];
        const turn = game.turns[j];

        if (turn.playerId !== 'P1') continue;

        let phase;
        if (unity < 2) phase = 'early';
        else if (unity < 4) phase = 'mid';
        else phase = 'late';

        if (phaseStats[phase]) {
          if (isP1Win) phaseStats[phase].wins++;
          else phaseStats[phase].losses++;
        }
      }
    }

    return phaseStats;
  },

  /**
   * 生成优化建议
   * @private
   */
  _generateSuggestions: function(report) {
    const suggestions = [];
    const actionAnalysis = report.actionAnalysis;
    const unityCorrelation = report.unityCorrelation;

    // 检查动作使用情况
    let lowUsageActions = [];
    for (const action in actionAnalysis) {
      if (actionAnalysis[action].total < 10) {
        lowUsageActions.push(action);
      }
    }

    if (lowUsageActions.length > 0) {
      suggestions.push({
        type: 'WARNING',
        message: '部分动作使用过少: ' + lowUsageActions.join(', '),
        action: '需要更多数据或调整权重'
      });
    }

    // 检查快速归一胜率
    if (unityCorrelation.fastWinRate !== 'N/A') {
      const fastRate = parseFloat(unityCorrelation.fastWinRate);
      if (fastRate < 60) {
        suggestions.push({
          type: 'INFO',
          message: '快速归一胜率较低 (' + fastRate + '%)',
          action: '考虑提高归一推进权重'
        });
      }
    }

    // 检查 CONVERT 效果
    if (actionAnalysis.CONVERT.total > 10) {
      const convertGain = parseFloat(actionAnalysis.CONVERT.avgUnityGain);
      if (convertGain < 0.3) {
        suggestions.push({
          type: 'WARNING',
          message: 'CONVERT 平均归一增益较低 (' + convertGain + ')',
          action: 'CONVERT 可能被过度使用或使用时机不当'
        });
      }
    }

    // 检查 ATK 效果
    if (actionAnalysis.ATK.total > 10) {
      const atkWinRate = parseFloat(actionAnalysis.ATK.winRate);
      if (atkWinRate < 45) {
        suggestions.push({
          type: 'INFO',
          message: 'ATK 使用时胜率较低 (' + atkWinRate + '%)',
          action: '可能需要调整攻击时机或降低攻击权重'
        });
      }
    }

    // 检查 BURST 使用
    if (actionAnalysis.BURST.total === 0) {
      suggestions.push({
        type: 'WARNING',
        message: 'BURST 从未被使用',
        action: '需要更多合一状态的游戏，或检查 BURST 触发条件'
      });
    }

    return suggestions;
  },

  /**
   * 导出优化报告
   * @returns {string} JSON 格式的报告
   */
  exportReport: function() {
    const report = this.analyzeAll();
    return JSON.stringify(report, null, 2);
  },

  /**
   * 获取当前权重配置
   * @returns {Object}
   */
  getCurrentWeights: function() {
    return JSON.parse(JSON.stringify(CURRENT_WEIGHTS));
  },

  /**
   * 应用新权重配置（未实现）
   * @param {Object} newWeights - 新的权重配置
   * @returns {boolean} 是否成功应用
   *
   * 注意：此功能需要以下架构变更：
   * 1. 修改 ActionValueCalculator.js 支持动态权重配置
   * 2. 实现权重热加载机制
   * 3. 添加权重验证逻辑
   *
   * 当前版本使用固定权重配置（CURRENT_WEIGHTS），
   * 已满足游戏平衡性需求。
   */
  applyWeights: function(newWeights) {
    console.warn('[WeightOptimizer] 动态权重应用功能未实现');
    console.log('[WeightOptimizer] 当前使用固定权重配置:', CURRENT_WEIGHTS);
    return false;
  },

  /**
   * 生成 A/B 测试配置
   * @param {Object} variantWeights - 变体权重
   * @returns {Object} A/B 测试配置
   */
  generateABTest: function(variantWeights) {
    return {
      control: this.getCurrentWeights(),
      variant: variantWeights,
      testId: 'ab_test_' + Date.now(),
      createdAt: new Date().toISOString()
    };
  }
};

export default WeightOptimizer;

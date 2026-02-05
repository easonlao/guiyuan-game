// ============================================
// 策略选择器
// ============================================
// 职责：
// - 根据归一进度选择策略
// - 调整不同动作的权重
// - 处理紧急情况
// - 提供策略建议
// ============================================

import UnityEvaluator from './UnityEvaluator.js';

// 策略权重配置
const STRATEGY_WEIGHTS = {
  // 前期策略（归一 < 3）：优先推进自己归一
  early: {
    CONVERT: 1.5,    // 优先：快速完成单一元素
    TRANS: 1.3,      // 次之：推进生属性
    BURST: 1.0,      // 正常
    AUTO: 1.2,       // 高优先级：免费推进
    ATK: 0.7,        // 降低：延缓不如推进
    BURST_ATK: 0.6   // 降低：前期不急于攻击
  },

  // 中期策略（归一 3-4）：平衡推进与延缓
  mid: {
    CONVERT: 1.2,
    TRANS: 1.0,
    BURST: 1.5,      // 提高：寻找爆发机会
    BURST_ATK: 1.2,  // 提高：攻击对方归一
    AUTO: 1.0,
    ATK: 1.0         // 正常：平衡攻击
  },

  // 后期策略（归一 = 4，或对方归一=4）：激进
  late: {
    BURST: 2.0,      // 最高优先级：爆发推进
    BURST_ATK: 1.8,  // 高优先级：强力延缓
    CONVERT: 1.3,    // 快速完成最后元素
    ATK: 1.3,        // 激进破坏对方
    TRANS: 0.8,      // 降低：时间不够
    AUTO: 1.0
  },

  // 紧急策略（对方归一 = 4）：最高优先级破坏对方
  urgent: {
    ATK: 2.5,        // 最高优先级：破坏对方归一
    BURST_ATK: 2.3,  // 最高优先级：双重打击
    BURST: 0.5,      // 降低：没时间建设
    CONVERT: 0.8,
    TRANS: 0.6,
    AUTO: 1.0
  }
};

const StrategySelector = {
  /**
   * 根据游戏状态选择策略
   * @param {string} playerId - 玩家ID
   * @returns {Object} { phase, weights, recommendations }
   */
  selectStrategy(playerId) {
    // 评估双方归一状态
    const bothEval = UnityEvaluator.evaluateBoth();
    const myEval = playerId === 'P1' ? bothEval.P1 : bothEval.P2;
    const opponentEval = playerId === 'P1' ? bothEval.P2 : bothEval.P1;

    // 获取游戏阶段
    const phase = UnityEvaluator.getGamePhase(bothEval);

    // 获取对应阶段的权重
    const weights = STRATEGY_WEIGHTS[phase];

    // 生成建议
    const recommendations = this._generateRecommendations(phase, myEval, opponentEval);

    return {
      phase,
      weights,
      recommendations,
      myUnity: myEval.unityCount,
      opponentUnity: opponentEval.unityCount,
      isUrgent: phase === 'urgent'
    };
  },

  /**
   * 生成策略建议
   * @private
   */
  _generateRecommendations(phase, myEval, opponentEval) {
    const recommendations = [];

    switch (phase) {
      case 'early':
        recommendations.push('优先推进自己归一');
        recommendations.push('CONVERT 快速完成单一元素');
        recommendations.push('TRANS 推进生属性');
        break;

      case 'mid':
        recommendations.push('平衡推进与延缓');
        recommendations.push('寻找 BURST 机会');
        recommendations.push('攻击对方已归一元素');
        break;

      case 'late':
        recommendations.push('激进推进最后元素');
        recommendations.push('全力使用 BURST');
        if (opponentEval.unityCount >= 4) {
          recommendations.push('激进破坏对方归一');
        }
        break;

      case 'urgent':
        recommendations.push('紧急：最高优先级破坏对方归一');
        recommendations.push('ATK > BURST_ATK > 其他');
        break;
    }

    return recommendations;
  },

  /**
   * 应用策略权重到动作价值
   * @param {Array} actions - 带价值的动作列表
   * @param {Object} strategy - 策略对象
   * @returns {Array} 加权后的动作列表
   */
  applyStrategyWeights(actions, strategy) {
    const { weights } = strategy;

    return actions.map(action => {
      const weight = weights[action.type] || 1.0;
      const weightedValue = action.value * weight;

      return {
        ...action,
        weightedValue,
        strategyWeight: weight
      };
    });
  },

  /**
   * 根据策略选择最优动作
   * @param {Array} weightedActions - 加权后的动作列表
   * @returns {Object} 最优动作
   */
  selectBestAction(weightedActions) {
    // 按加权价值排序
    const sorted = weightedActions.sort((a, b) => b.weightedValue - a.weightedValue);

    return sorted[0];
  },

  /**
   * 检查是否需要紧急防御
   * @param {string} playerId - 玩家ID
   * @returns {boolean}
   */
  isEmergencyDefense(playerId) {
    const bothEval = UnityEvaluator.evaluateBoth();
    const opponentEval = playerId === 'P1' ? bothEval.P2 : bothEval.P1;

    // 对方有4个或更多归一，需要紧急防御
    return opponentEval.unityCount >= 4;
  },

  /**
   * 获取推荐的优先级动作类型
   * @param {string} phase - 游戏阶段
   * @returns {Array} 优先级的动作类型列表
   */
  getPriorityActionTypes(phase) {
    const weights = STRATEGY_WEIGHTS[phase];

    // 按权重排序动作类型
    const types = Object.keys(weights).sort((a, b) => weights[b] - weights[a]);

    return types;
  },

  /**
   * 检查是否有 BURST 机会
   * @param {string} playerId - 玩家ID
   * @param {number} stemElement - 天干元素
   * @returns {boolean}
   */
  hasBurstOpportunity(playerId, stemElement) {
    // 检查是否有合一状态可以消耗
    const harmoniedElements = UnityEvaluator.getHarmoniedElements(playerId);
    return harmoniedElements.length > 0;
  },

  /**
   * 获取策略描述（用于调试）
   * @param {Object} strategy - 策略对象
   * @returns {string}
   */
  describeStrategy(strategy) {
    const { phase, myUnity, opponentUnity, isUrgent } = strategy;

    let desc = `阶段: ${phase}, 我方归一: ${myUnity}/5, 对方归一: ${opponentUnity}/5`;

    if (isUrgent) {
      desc += ' [紧急防御]';
    }

    return desc;
  }
};

export default StrategySelector;

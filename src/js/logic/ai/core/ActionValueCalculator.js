// ============================================
// 动作价值计算器
// ============================================
// 职责：
// - 计算每个动作的归一推进价值
// - 计算每个动作的战略价值
// - 评估回合成本
// - 综合计算动作总价值
// ============================================

import StateManager from '../../../state/StateManager.js';
import UnityEvaluator from './UnityEvaluator.js';
import { RULES } from '../../../config/game-config.js';

// 动作价值配置（重新设计：移除人为奖励，添加局势感知）
const VALUE_CONFIG = {
  // 基础分
  BASE_SCORES: {
    CONVERT: 30,      // 调息基础分
    TRANS: 20,        // 化基础分
    BURST: 80,        // 强化基础分（消耗阴干风险补偿）
    ATK: 0,           // 破纯战略分
    BURST_ATK: 0      // 强破纯战略分
  },

  // 归一推进效果分
  UNITY_PROGRESSION: {
    COMPLETE_NEW: 200,      // 完成新归一 (未归一 -> 归一)
    CLOSE_TO_UNITY: 100,    // 接近归一 (0->1 或 1->2)
    NORMAL_PROGRESS: 30,    // 普通推进
    FILL_HARMONY: 60        // 填满合一 (1 -> 2)，从80降至60
  },

  // 战略分（降低基础值，通过局势系数动态调整）
  STRATEGIC: {
    BREAK_OPPOSITE_UNITY: 150,    // 破坏对方归一，从180降至150
    BREAK_OPPOSITE_HARMONY: 120,  // 破坏对方合一，从150降至120
    CAUSE_DAMAGE: 100,            // 造成道损（0 -> -1），从120降至100
    BURST_ATK_DOUBLE: 90          // BURST_ATK 双重打击，从120降至90
  },

  // 局势判断权重
  SITUATION_WEIGHTS: {
    UNITY: 0.7,        // 归一差距权重
    SCORE: 0.3         // 分数差距权重
  },

  // 局势系数
  SITUATION_MULTIPLIERS: {
    BEHIND: { offense: 1.5, defense: 0.8 },    // 落后时：提高攻击权重
    EVEN: { offense: 1.0, defense: 1.0 },      // 持平时：标准权重
    AHEAD: { offense: 0.7, defense: 1.2 }      // 领先时：提高推进权重
  },

  // 回合成本
  TURN_COST: {
    WASTE_ACTION: 50,             // 浪费动作（如攻击已道损）
    LOW_PRIORITY: 30              // 低优先级动作
  }
};

const ActionValueCalculator = {
  /**
   * 计算局势分数（综合判断：归一差距70% + 分数差距30%）
   * @param {string} playerId - 玩家ID
   * @returns {number} 局势分数（负数=落后，正数=领先）
   * @private
   */
  _assessSituation(playerId) {
    const opponentId = playerId === 'P1' ? 'P2' : 'P1';

    // 获取双方归一数量
    const myUnity = UnityEvaluator.evaluatePlayerUnity(playerId).unityCount;
    const opponentUnity = UnityEvaluator.evaluatePlayerUnity(opponentId).unityCount;

    // 获取双方分数（使用 getState() 方法安全获取）
    const state = StateManager.getState();
    const myScore = state.players[playerId].score;
    const opponentScore = state.players[opponentId].score;

    // 归一差距（-5 到 +5）
    const unityDiff = myUnity - opponentUnity;

    // 分数差距归一化（大约 -30 到 +30，除以100得到类似范围）
    const scoreDiff = (myScore - opponentScore) / 100;

    // 综合局势分数
    return unityDiff * VALUE_CONFIG.SITUATION_WEIGHTS.UNITY +
           scoreDiff * VALUE_CONFIG.SITUATION_WEIGHTS.SCORE;
  },

  /**
   * 根据局势获取系数
   * @param {string} playerId - 玩家ID
   * @returns {Object} { offense, defense }
   * @private
   */
  _getSituationMultipliers(playerId) {
    const situationScore = this._assessSituation(playerId);

    if (situationScore <= -1) {
      // 落后：提高攻击权重
      return VALUE_CONFIG.SITUATION_MULTIPLIERS.BEHIND;
    } else if (situationScore >= 1) {
      // 领先：提高推进权重
      return VALUE_CONFIG.SITUATION_MULTIPLIERS.AHEAD;
    } else {
      // 持平：标准权重
      return VALUE_CONFIG.SITUATION_MULTIPLIERS.EVEN;
    }
  },

  /**
   * 计算动作的总价值（重新设计：局势感知 + 移除人为奖励）
   * @param {Object} action - 动作对象
   * @param {string} playerId - 玩家ID
   * @param {Object} stem - 当前天干
   * @returns {Object} { value, breakdown }
   */
  calculateActionValue(action, playerId, stem) {
    const opponentId = playerId === 'P1' ? 'P2' : 'P1';

    // 获取局势系数
    const multipliers = this._getSituationMultipliers(playerId);

    // 计算归一推进分（防御类，乘以 defense 系数）
    const unityScore = this._calculateUnityScore(action, playerId, stem) * multipliers.defense;

    // 计算战略分（攻击类，乘以 offense 系数）
    const strategicScore = this._calculateStrategicScore(action, playerId, opponentId, stem) * multipliers.offense;

    // 计算回合成本
    const turnCost = this._calculateTurnCost(action, playerId, opponentId);

    // 总价值
    const totalValue = unityScore + strategicScore - turnCost;

    return {
      totalValue,
      breakdown: {
        unityScore: Math.round(unityScore),
        strategicScore: Math.round(strategicScore),
        turnCost,
        multipliers,  // 添加局势系数用于调试
        situationScore: this._assessSituation(playerId)  // 添加局势分数用于调试
      }
    };
  },

  /**
   * 计算归一推进分
   * @private
   */
  _calculateUnityScore(action, playerId, stem) {
    const { type } = action;
    let score = 0;

    switch (type) {
      case 'AUTO':
        // AUTO 是免费的修复/点亮
        score = this._evaluateAutoAction(action, playerId, stem);
        break;

      case 'CONVERT':
        // CONVERT 可以快速完成单一元素的归一
        score = this._evaluateConvertAction(action, playerId);
        break;

      case 'TRANS':
        // TRANS 推进生属性
        score = this._evaluateTransAction(action, playerId);
        break;

      case 'ATK':
        // ATK 主要用于延缓对方，归一推进分较低
        score = 0;  // ATK 的价值主要在战略分
        break;

      case 'BURST':
        // BURST 爆发推进生属性×2
        score = this._evaluateBurstAction(action, playerId);
        break;

      case 'BURST_ATK':
        // BURST_ATK 主要用于破坏对方
        score = 0;  // BURST_ATK 的价值主要在战略分
        break;
    }

    return score;
  },

  /**
   * 评估 AUTO 动作
   * @private
   */
  _evaluateAutoAction(action, playerId, stem) {
    // AUTO 是自动吸纳，节点状态<1时触发
    // 免费的推进，价值较高
    return VALUE_CONFIG.UNITY_PROGRESSION.ADVANCE_VOID + 20;
  },

  /**
   * 评估 CONVERT 动作（重新设计：基础分 + 效果分）
   * @private
   */
  _evaluateConvertAction(action, playerId) {
    const { target } = action;
    const nodeState = StateManager.getNodeState(target.playerId, target.elementIndex);

    // 基础分
    const baseScore = VALUE_CONFIG.BASE_SCORES.CONVERT;

    // CONVERT 是阴阳互转，可以快速完成单一元素的归一
    const beforeUnity = nodeState.yang >= 1 && nodeState.yin >= 1;

    // 模拟执行后
    let afterYang = nodeState.yang;
    let afterYin = nodeState.yin;

    if (target.isYang) {
      afterYang = Math.min(afterYang + 1, 2);
    } else {
      afterYin = Math.min(afterYin + 1, 2);
    }

    const afterUnity = afterYang >= 1 && afterYin >= 1;

    // 效果分
    let effectScore = 0;
    if (!beforeUnity && afterUnity) {
      effectScore = VALUE_CONFIG.UNITY_PROGRESSION.COMPLETE_NEW;
    } else if (!afterUnity) {
      effectScore = VALUE_CONFIG.UNITY_PROGRESSION.CLOSE_TO_UNITY;
    } else if (afterUnity && (afterYang === 2 || afterYin === 2)) {
      effectScore = VALUE_CONFIG.UNITY_PROGRESSION.FILL_HARMONY;
    } else {
      effectScore = VALUE_CONFIG.UNITY_PROGRESSION.NORMAL_PROGRESS;
    }

    return baseScore + effectScore;
  },

  /**
   * 评估 TRANS 动作（重新设计：基础分 + 效果分）
   * @private
   */
  _evaluateTransAction(action, playerId) {
    const { target } = action;
    const nodeState = StateManager.getNodeState(target.playerId, target.elementIndex);

    // 基础分
    const baseScore = VALUE_CONFIG.BASE_SCORES.TRANS;

    // TRANS 是流转到生属性
    const beforeUnity = nodeState.yang >= 1 && nodeState.yin >= 1;

    // 模拟执行后
    let afterYang = nodeState.yang;
    let afterYin = nodeState.yin;

    if (target.isYang) {
      afterYang = Math.min(afterYang + 1, 2);
    } else {
      afterYin = Math.min(afterYin + 1, 2);
    }

    const afterUnity = afterYang >= 1 && afterYin >= 1;

    // 效果分
    let effectScore = 0;
    if (!beforeUnity && afterUnity) {
      effectScore = VALUE_CONFIG.UNITY_PROGRESSION.COMPLETE_NEW;
    } else {
      effectScore = VALUE_CONFIG.UNITY_PROGRESSION.CLOSE_TO_UNITY;
    }

    return baseScore + effectScore;
  },

  /**
   * 评估 BURST 动作（重新设计：移除 BURST_BOOST，基于实际效果）
   * @private
   */
  _evaluateBurstAction(action, playerId) {
    // BURST 消耗合一状态的阴，强化生属性×2

    // 计算生属性的当前状态
    const stemElement = action.stemElement || 0;
    const shengElement = RULES[stemElement].s;

    const nodeState = StateManager.getNodeState(playerId, shengElement);
    const beforeUnity = nodeState.yang >= 1 && nodeState.yin >= 1;

    // 基础分（消耗阴干的风险补偿）
    const baseScore = VALUE_CONFIG.BASE_SCORES.BURST;

    // BURST 执行两次，每次都会推进
    let effectScore = 0;

    // 第一次推进
    if (!beforeUnity) {
      effectScore += VALUE_CONFIG.UNITY_PROGRESSION.CLOSE_TO_UNITY;
    } else {
      effectScore += VALUE_CONFIG.UNITY_PROGRESSION.FILL_HARMONY;
    }

    // 第二次推进（固定值）
    effectScore += VALUE_CONFIG.UNITY_PROGRESSION.NORMAL_PROGRESS;

    return baseScore + effectScore;  // 不再加 BURST_BOOST
  },

  /**
   * 计算战略分
   * @private
   */
  _calculateStrategicScore(action, playerId, opponentId, stem) {
    const { type } = action;
    let score = 0;

    switch (type) {
      case 'ATK':
        score = this._evaluateAtkStrategic(action, opponentId);
        break;

      case 'BURST_ATK':
        score = this._evaluateBurstAtkStrategic(action, opponentId);
        break;

      case 'BURST':
        // BURST 的战略价值已经在归一推进分中计算
        score = 0;
        break;

      default:
        // 其他动作的战略价值较低
        score = 0;
        break;
    }

    return score;
  },

  /**
   * 评估 ATK 的战略价值（重新设计：降低基础值）
   * @private
   */
  _evaluateAtkStrategic(action, opponentId) {
    const { target } = action;
    const nodeState = StateManager.getNodeState(target.playerId, target.elementIndex);

    // 检查目标是否归一
    const isUnity = nodeState.yang >= 1 && nodeState.yin >= 1;

    // 检查目标是否合一
    const isHarmony = nodeState.yang === 2 && nodeState.yin === 2;

    // 破坏对方归一（1→0）
    if (isUnity && !isHarmony) {
      return VALUE_CONFIG.STRATEGIC.BREAK_OPPOSITE_UNITY;
    }

    // 破坏对方合一（2→1）
    if (isHarmony) {
      return VALUE_CONFIG.STRATEGIC.BREAK_OPPOSITE_HARMONY;
    }

    // 造成道损（0→-1）
    return VALUE_CONFIG.STRATEGIC.CAUSE_DAMAGE;
  },

  /**
   * 评估 BURST_ATK 的战略价值（重新设计：降低基础值）
   * @private
   */
  _evaluateBurstAtkStrategic(action, opponentId) {
    // BURST_ATK 攻击对方克属性×2
    const targetElement = action.targetEl;
    const nodeState = StateManager.getNodeState(opponentId, targetElement);

    // 检查目标是否归一
    const isUnity = nodeState.yang >= 1 && nodeState.yin >= 1;

    // 检查目标是否合一
    const isHarmony = nodeState.yang === 2 && nodeState.yin === 2;

    // 双重打击的基础分
    let score = VALUE_CONFIG.STRATEGIC.BURST_ATK_DOUBLE;

    // 破坏对方归一或合一的额外价值
    if (isHarmony) {
      score += VALUE_CONFIG.STRATEGIC.BREAK_OPPOSITE_HARMONY;
    } else if (isUnity) {
      score += VALUE_CONFIG.STRATEGIC.BREAK_OPPOSITE_UNITY;
    }

    return score;
  },

  /**
   * 计算回合成本
   * @private
   */
  _calculateTurnCost(action, playerId, opponentId) {
    let cost = 0;

    // 攻击已经道损的节点是浪费
    if (action.type === 'ATK' || action.type === 'BURST_ATK') {
      const targetElement = action.targetEl || action.target?.elementIndex;
      if (targetElement !== undefined) {
        const nodeState = StateManager.getNodeState(
          action.type === 'ATK' ? opponentId : playerId,
          targetElement
        );

        // 如果目标已经道损，攻击价值很低
        if (nodeState.yang === -1 && nodeState.yin === -1) {
          cost = VALUE_CONFIG.TURN_COST.WASTE_ACTION;
        }
      }
    }

    return cost;
  },

  /**
   * 批量计算所有可用动作的价值
   * @param {Array} actions - 可用动作列表
   * @param {string} playerId - 玩家ID
   * @param {Object} stem - 当前天干
   * @returns {Array} 带价值的动作列表
   */
  calculateAllActions(actions, playerId, stem) {
    return actions.map(action => {
      const result = this.calculateActionValue(action, playerId, stem);
      return {
        ...action,
        value: result.totalValue,
        breakdown: result.breakdown
      };
    });
  }
};

export default ActionValueCalculator;

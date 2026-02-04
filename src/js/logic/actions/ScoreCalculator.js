// ============================================
// 积分计算器 v4 - 行为 + 状态双轨制
// ============================================
// 职责：
// - 计算行为分 + 状态分
// - 应用稀有度加成
// - 分别记录行为和状态统计
// ============================================

import StateManager from '../../state/StateManager.js';
import { POINTS_CONFIG } from '../../config/game-config.js';

const ACTION_PROBABILITY = {
  'AUTO': 1.0,
  'ATK': 0.518,
  'TRANS': 0.243,
  'CONVERT': 0.167,
  'BURST': 0.035,
  'BURST_ATK': 0.036,
  'DIVIDEND': 1.0,
  'PENALTY': 1.0,
};

const ScoreCalculator = {
  /**
   * 计算并应用得分（行为分 + 状态分）
   * @param {string} playerId - 玩家ID
   * @param {string} actionType - 动作类型
   * @param {number} beforeState - 修改前状态值
   * @param {number} afterState - 修改后状态值
   * @param {boolean} isYang - 是否为阳
   * @param {boolean} isAttack - 是否为攻击行为
   */
  calculateAndApplyScore(playerId, actionType, beforeState, afterState, isYang, isAttack) {
    // 1. 计算行为分
    const actionScore = this._getActionScore(actionType);
    const actionName = this._getActionName(actionType);

    // 2. 计算状态分
    const stateScore = this._getStateChangeScore(beforeState, afterState, isYang);
    const stateName = this._getStateName(beforeState, afterState, isYang);

    // 3. 总分 = 行为分 + 状态分
    const totalScore = actionScore + stateScore;

    if (totalScore !== 0) {
      // 应用稀有度加成（对总分计算）
      const finalScore = this._applyRarityBonus(totalScore, actionType);

      // 组合显示原因
      const combinedReason = this._getCombinedReason(actionType, stateName);

      // 统一调用：只调用一次 addScore，避免重复加分
      // 统计拆分由 StateManager._recordScoreByReason() 内部处理
      // reason 格式：动作·状态（如 "破·破阴点亮"）
      StateManager.addScore(playerId, finalScore, combinedReason, actionType);

      // 日志显示：使用 Math.round 避免浮点精度问题
      const rarityBonus = finalScore - totalScore;
      console.log(`[Score] ${actionType}: 行为${actionScore} + 状态${stateScore} + 稀有${rarityBonus} = ${finalScore} - ${combinedReason}`);
    }
  },

  /**
   * 获取行为分（执行动作的基础分）
   * @private
   */
  _getActionScore(actionType) {
    return POINTS_CONFIG.ACTION[actionType] || 0;
  },

  /**
   * 获取动作名称
   * @private
   */
  _getActionName(actionType) {
    const names = {
      'AUTO': '吸纳',
      'CONVERT': '调息',
      'TRANS': '化',
      'ATK': '破',
      'BURST': '强化',
      'BURST_ATK': '强破'
    };
    return names[actionType] || actionType;
  },

  /**
   * 获取状态变化分
   * @private
   */
  _getStateChangeScore(beforeState, afterState, isYang) {
    // 攻击类状态变化
    if (beforeState === 0 && afterState === -1) {
      return isYang ? POINTS_CONFIG.STATE_CHANGE.CAUSE_DMG.yang : POINTS_CONFIG.STATE_CHANGE.CAUSE_DMG.yin;
    }
    if (beforeState === 1 && afterState === 0) {
      return isYang ? POINTS_CONFIG.STATE_CHANGE.BREAK_LIGHT.yang : POINTS_CONFIG.STATE_CHANGE.BREAK_LIGHT.yin;
    }
    if (beforeState === 2 && afterState === 1) {
      return POINTS_CONFIG.STATE_CHANGE.WEAKEN;
    }

    // 防御类状态变化
    if (beforeState === -1 && afterState === 0) {
      return isYang ? POINTS_CONFIG.STATE_CHANGE.REPAIR_DMG.yang : POINTS_CONFIG.STATE_CHANGE.REPAIR_DMG.yin;
    }
    if (beforeState === 0 && afterState === 1) {
      return POINTS_CONFIG.STATE_CHANGE.LIGHT_UP;
    }
    if (beforeState === 1 && afterState === 2) {
      return POINTS_CONFIG.STATE_CHANGE.BLESSING;
    }

    return 0;
  },

  /**
   * 获取状态名称
   * @private
   */
  _getStateName(beforeState, afterState, isYang) {
    if (beforeState === -1 && afterState === 0) return '修复道损';
    if (beforeState === 0 && afterState === 1) return '点亮';
    if (beforeState === 1 && afterState === 2) return '加持';
    if (beforeState === 0 && afterState === -1) return isYang ? '致阳道损' : '致阴道损';
    if (beforeState === 1 && afterState === 0) return isYang ? '破阳点亮' : '破阴点亮';
    if (beforeState === 2 && afterState === 1) return '削弱加持';
    return '';
  },

  /**
   * 获取综合得分原因（用于显示）
   * @private
   */
  _getCombinedReason(actionType, stateName) {
    const actionName = this._getActionName(actionType);
    return stateName ? `${actionName}·${stateName}` : actionName;
  },

  /**
   * 应用稀有度加成
   * @private
   */
  _applyRarityBonus(score, actionType) {
    const prob = ACTION_PROBABILITY[actionType] || 0.5;
    const rarityBonus = score * (1 - prob) * POINTS_CONFIG.RARITY_MULTIPLIER;
    return Math.round(score + rarityBonus);
  }
};

export default ScoreCalculator;

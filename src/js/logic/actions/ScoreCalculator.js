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
import { calculateRarityAdjustedScore } from './RarityScoring.js';

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
  beginAction() {
    this.burstBehaviorAwarded = false;
  },

  calculateAndApplyScore(playerId, actionType, beforeState, afterState, isYang, isAttack) {
    const baseActionScore = this._getActionScore(actionType);
    const awardsBurstBehaviorOnce = this.scoringConfig?.burstActionScoreOnce &&
      ['BURST', 'BURST_ATK'].includes(actionType);
    const includeBehaviorScore = !awardsBurstBehaviorOnce || !this.burstBehaviorAwarded;
    const actionScore = includeBehaviorScore ? baseActionScore : 0;
    if (awardsBurstBehaviorOnce && baseActionScore > 0) this.burstBehaviorAwarded = true;

    const stateScore = this._getStateChangeScore(beforeState, afterState, isYang, isAttack, actionType);
    const stateName = this._getStateName(beforeState, afterState, isYang);
    const totalScore = actionScore + stateScore;

    if (totalScore !== 0) {
      const finalScore = this._applyRarityBonus(totalScore, actionType);
      const combinedReason = this._getCombinedReason(actionType, stateName);
      const scoreBreakdown = this.scoringConfig ? { baseActionScore, actionScore, stateScore } : undefined;
      this.stateManager.addScore(playerId, finalScore, combinedReason, actionType, scoreBreakdown);
    }
  },

  /**
   * 获取行为分（执行动作的基础分）
   * @private
   */
  _getActionScore(actionType) {
    const pointsConfig = this.scoringConfig?.pointsConfig ?? POINTS_CONFIG;
    return pointsConfig.ACTION[actionType] || 0;
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
  _getStateChangeScore(beforeState, afterState, isYang, isAttack, actionType) {
    const pointsConfig = this.scoringConfig?.pointsConfig ?? POINTS_CONFIG;
    const isBurstSelfCost = this.scoringConfig?.noSelfCostReward && !isAttack &&
      afterState < beforeState && ['BURST', 'BURST_ATK'].includes(actionType);
    if (isBurstSelfCost) return 0;

    // 攻击类状态变化
    if (beforeState === 0 && afterState === -1) {
      return isYang ? pointsConfig.STATE_CHANGE.CAUSE_DMG.yang : pointsConfig.STATE_CHANGE.CAUSE_DMG.yin;
    }
    if (beforeState === 1 && afterState === 0) {
      return isYang ? pointsConfig.STATE_CHANGE.BREAK_LIGHT.yang : pointsConfig.STATE_CHANGE.BREAK_LIGHT.yin;
    }
    if (beforeState === 2 && afterState === 1) {
      return pointsConfig.STATE_CHANGE.WEAKEN;
    }

    // 防御类状态变化
    if (beforeState === -1 && afterState === 0) {
      return isYang ? pointsConfig.STATE_CHANGE.REPAIR_DMG.yang : pointsConfig.STATE_CHANGE.REPAIR_DMG.yin;
    }
    if (beforeState === 0 && afterState === 1) {
      return pointsConfig.STATE_CHANGE.LIGHT_UP;
    }
    if (beforeState === 1 && afterState === 2) {
      return pointsConfig.STATE_CHANGE.BLESSING;
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
    if (this.scoringConfig?.disableRarityBonus) return score;
    const multiplier = this.scoringConfig?.pointsConfig?.RARITY_MULTIPLIER ?? POINTS_CONFIG.RARITY_MULTIPLIER;
    return calculateRarityAdjustedScore(score, actionType, multiplier);
  }
};

export function createScoreCalculator(stateManager = StateManager, scoringConfig = null) {
  return Object.assign(Object.create(ScoreCalculator), { stateManager, scoringConfig });
}

const DefaultScoreCalculator = createScoreCalculator();
export default DefaultScoreCalculator;

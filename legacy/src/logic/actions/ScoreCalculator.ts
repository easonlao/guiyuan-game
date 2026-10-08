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
import { calculateRarityAdjustedScore, isNoRarityAction } from './RarityScoring.js';

export interface ScoringConfig {
  pointsConfig?: typeof POINTS_CONFIG;
  burstActionScoreOnce?: boolean;
  noSelfCostReward?: boolean;
  attackScoreMultiplier?: number;
  disableRarityBonus?: boolean;
}

export class ScoreCalculator {
  stateManager: any;
  scoringConfig: ScoringConfig | null;
  burstBehaviorAwarded: boolean = false;

  constructor(stateManager: any = StateManager, scoringConfig: ScoringConfig | null = null) {
    this.stateManager = stateManager;
    this.scoringConfig = scoringConfig;
  }

  /**
   * 重置单次行为积分的发放状态
   */
  beginAction(): void {
    this.burstBehaviorAwarded = false;
  }

  /**
   * 计算并应用得分（行为分 + 状态分）
   */
  calculateAndApplyScore(
    playerId: string, 
    actionType: string, 
    beforeState: number, 
    afterState: number, 
    isYang: boolean, 
    isAttack: boolean
  ): void {
    const baseActionScore = this._getActionScore(actionType);
    const awardsBurstBehaviorOnce = !!this.scoringConfig?.burstActionScoreOnce &&
      ['BURST', 'BURST_ATK'].includes(actionType);
    const includeBehaviorScore = !awardsBurstBehaviorOnce || !this.burstBehaviorAwarded;
    const actionScore = includeBehaviorScore ? baseActionScore : 0;
    
    if (awardsBurstBehaviorOnce && baseActionScore > 0) {
      this.burstBehaviorAwarded = true;
    }

    const stateScore = this._getStateChangeScore(beforeState, afterState, isYang, isAttack, actionType);
    const stateName = this._getStateName(beforeState, afterState, isYang);
    const totalScore = actionScore + stateScore;

    if (totalScore !== 0) {
      const finalScore = this._applyRarityBonus(totalScore, actionType);
      const combinedReason = this._getCombinedReason(actionType, stateName);
      const scoreBreakdown = this.scoringConfig ? { baseActionScore, actionScore, stateScore } : undefined;
      this.stateManager.addScore(playerId, finalScore, combinedReason, actionType, scoreBreakdown);
    }
  }

  private _getActionScore(actionType: string): number {
    const pointsConfig = this.scoringConfig?.pointsConfig ?? POINTS_CONFIG;
    // @ts-ignore
    return pointsConfig.ACTION[actionType] || 0;
  }

  private _getActionName(actionType: string): string {
    const names: Record<string, string> = {
      'AUTO': '吸纳',
      'CONVERT': '调息',
      'TRANS': '化',
      'ATK': '破',
      'BURST': '强化',
      'BURST_ATK': '强破'
    };
    return names[actionType] || actionType;
  }

  private _getStateChangeScore(beforeState: number, afterState: number, isYang: boolean, isAttack: boolean, actionType: string): number {
    const pointsConfig = this.scoringConfig?.pointsConfig ?? POINTS_CONFIG;
    const isBurstSelfCost = !!this.scoringConfig?.noSelfCostReward && !isAttack &&
      afterState < beforeState && ['BURST', 'BURST_ATK'].includes(actionType);
    
    if (isBurstSelfCost) return 0;

    const multiplier = (isAttack && this.scoringConfig?.attackScoreMultiplier) ? this.scoringConfig.attackScoreMultiplier : 1;

    // 攻击类状态变化
    if (beforeState === 0 && afterState === -1) {
      const base = isYang ? pointsConfig.STATE_CHANGE.CAUSE_DMG.yang : pointsConfig.STATE_CHANGE.CAUSE_DMG.yin;
      return Math.round(base * multiplier);
    }
    if (beforeState === 1 && afterState === 0) {
      const base = isYang ? pointsConfig.STATE_CHANGE.BREAK_LIGHT.yang : pointsConfig.STATE_CHANGE.BREAK_LIGHT.yin;
      return Math.round(base * multiplier);
    }
    if (beforeState === 2 && afterState === 1) {
      return Math.round(pointsConfig.STATE_CHANGE.WEAKEN * multiplier);
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
  }

  private _getStateName(beforeState: number, afterState: number, isYang: boolean): string {
    if (beforeState === -1 && afterState === 0) return '修复道损';
    if (beforeState === 0 && afterState === 1) return '点亮';
    if (beforeState === 1 && afterState === 2) return '加持';
    if (beforeState === 0 && afterState === -1) return isYang ? '致阳道损' : '致阴道损';
    if (beforeState === 1 && afterState === 0) return isYang ? '破阳点亮' : '破阴点亮';
    if (beforeState === 2 && afterState === 1) return '削弱加持';
    return '';
  }

  private _getCombinedReason(actionType: string, stateName: string): string {
    const actionName = this._getActionName(actionType);
    return stateName ? `${actionName}·${stateName}` : actionName;
  }

  private _applyRarityBonus(score: number, actionType: string): number {
    if (this.scoringConfig?.disableRarityBonus) return score;
    if (isNoRarityAction(actionType, this.scoringConfig)) return score;
    const multiplier = this.scoringConfig?.pointsConfig?.RARITY_MULTIPLIER ?? POINTS_CONFIG.RARITY_MULTIPLIER;
    return calculateRarityAdjustedScore(score, actionType, multiplier);
  }
}

export function createScoreCalculator(stateManager: any = StateManager, scoringConfig: ScoringConfig | null = null): ScoreCalculator {
  return new ScoreCalculator(stateManager, scoringConfig);
}

const DefaultScoreCalculator = new ScoreCalculator();
export default DefaultScoreCalculator;

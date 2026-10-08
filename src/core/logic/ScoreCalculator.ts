/**
 * 归元弈 (Guiyuan) - 双轨制计分器 (ScoreCalculator)
 */

import { ActionType, NodeLevel } from '../types/domain.js';

export interface ScoreConfig {
  readonly lightUpPoints: number;      // 点亮基础分 (虚空 0 -> 点亮 1)
  readonly blessPoints: number;        // 加持基础分 (点亮 1 -> 加持 2)
  readonly repairPoints: number;       // 修复道损分 (道损 -1 -> 虚空 0)
  readonly damageEnemyPoints: number;  // 攻击压制分 (压制对手节点)
  readonly burstBonusPoints: number;   // 爆发动作分
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  lightUpPoints: 10,
  blessPoints: 15,
  repairPoints: 5,
  damageEnemyPoints: 12,
  burstBonusPoints: 8
};

export class ScoreCalculator {
  constructor(private readonly config: ScoreConfig = DEFAULT_SCORE_CONFIG) {}

  /**
   * 根据节点等级变化计算基础分
   */
  calculateTransitionPoints(prevLevel: NodeLevel, newLevel: NodeLevel): number {
    if (prevLevel === -1 && newLevel === 0) {
      return this.config.repairPoints;
    }
    if (prevLevel === 0 && newLevel === 1) {
      return this.config.lightUpPoints;
    }
    if (prevLevel === 1 && newLevel === 2) {
      return this.config.blessPoints;
    }
    return 0;
  }

  /**
   * 根据动作类型计算动作附加分
   */
  calculateActionPoints(actionType: ActionType): number {
    switch (actionType) {
      case ActionType.ATK:
      case ActionType.BURST_ATK:
        return this.config.damageEnemyPoints;
      case ActionType.BURST:
        return this.config.burstBonusPoints;
      default:
        return 0;
    }
  }
}

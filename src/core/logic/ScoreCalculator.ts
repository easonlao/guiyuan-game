/**
 * 归元弈 (Guiyuan) - 双轨制计分器 (ScoreCalculator)
 * 纯 TS 规范，实现 ADR 0002 规定的行为分与状态分双轨制结算、
 * 2.5 倍攻击压制加成以及爆发动作稀有度黑名单过滤
 */

import { ActionType, NodeLevel, Polarity } from '../types/domain.js';

export interface ActionPointsConfig {
  readonly AUTO: number;
  readonly CONVERT: number;
  readonly TRANS: number;
  readonly ATK: number;
  readonly BURST: number;
  readonly BURST_ATK: number;
}

export interface StateChangePointsConfig {
  readonly REPAIR_DMG: { readonly yang: number; readonly yin: number };
  readonly LIGHT_UP: number;
  readonly BLESSING: number;
  readonly CAUSE_DMG: { readonly yang: number; readonly yin: number };
  readonly BREAK_LIGHT: { readonly yang: number; readonly yin: number };
  readonly WEAKEN: number;
}

export interface PointsConfig {
  readonly ACTION: ActionPointsConfig;
  readonly STATE_CHANGE: StateChangePointsConfig;
  readonly RARITY_MULTIPLIER: number;
  readonly NO_RARITY_ACTIONS: readonly ActionType[];
}

/**
 * ADR 0002 形式化计分配置表
 */
export const POINTS_CONFIG: PointsConfig = {
  // 【行为分】执行动作的基础分
  ACTION: {
    AUTO: 0,
    CONVERT: 50,
    TRANS: 30,
    ATK: 40,
    BURST: 100,
    BURST_ATK: 80
  },

  // 【状态分】节点状态变化的分数（已硬编码 2.5 倍攻击压制得分）
  STATE_CHANGE: {
    // 己方建设提升
    REPAIR_DMG: { yang: 200, yin: 200 }, // -1 -> 0 修复道损
    LIGHT_UP: 100,                        // 0 -> 1 点亮虚空
    BLESSING: 200,                        // 1 -> 2 加持（归一）

    // 敌方状态破坏（2.5倍强化）
    CAUSE_DMG: { yang: 300, yin: 250 },  // 0 -> -1 致道损
    BREAK_LIGHT: { yang: 200, yin: 150 },// 1 -> 0 破点亮
    WEAKEN: 200                           // 2 -> 1 削弱加持
  },

  // 稀有度乘数
  RARITY_MULTIPLIER: 1.5,

  // 稀有度黑名单（严禁享受稀有度加成的动作类型）
  NO_RARITY_ACTIONS: [ActionType.BURST, ActionType.BURST_ATK]
};

/**
 * 动作基础发生概率（用于稀有度加成计算）
 */
export const ACTION_PROBABILITY: Readonly<Record<ActionType, number>> = {
  [ActionType.AUTO]: 1.0,
  [ActionType.ATK]: 0.518,
  [ActionType.TRANS]: 0.243,
  [ActionType.CONVERT]: 0.167,
  [ActionType.BURST]: 0.035,
  [ActionType.BURST_ATK]: 0.036
};

/**
 * 向后兼容的简单配置接口
 */
export interface ScoreConfig {
  readonly repairPoints: number;
  readonly lightUpPoints: number;
  readonly blessPoints: number;
  readonly damageEnemyPoints: number;
  readonly burstBonusPoints: number;
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  repairPoints: 200,
  lightUpPoints: 100,
  blessPoints: 200,
  damageEnemyPoints: 40,
  burstBonusPoints: 100
};

export class ScoreCalculator {
  constructor(public readonly config: PointsConfig = POINTS_CONFIG) {}

  /**
   * 计算指定动作的行为基础分
   */
  calculateActionPoints(actionType: ActionType): number {
    return this.config.ACTION[actionType] ?? 0;
  }

  /**
   * 根据节点等级跃迁与极性计算状态变化分
   * @param prevLevel 变化前等级
   * @param newLevel 变化后等级
   * @param polarity 极性 (YANG / YIN)
   * @param isAttack 是否为对敌方的攻击破坏
   */
  calculateTransitionPoints(
    prevLevel: NodeLevel,
    newLevel: NodeLevel,
    polarity: Polarity = Polarity.YANG,
    isAttack: boolean = false
  ): number {
    if (prevLevel === newLevel) {
      return 0;
    }

    if (isAttack) {
      // 敌方状态破坏
      if (prevLevel === 0 && newLevel === -1) {
        return polarity === Polarity.YANG
          ? this.config.STATE_CHANGE.CAUSE_DMG.yang
          : this.config.STATE_CHANGE.CAUSE_DMG.yin;
      }
      if (prevLevel === 1 && newLevel === 0) {
        return polarity === Polarity.YANG
          ? this.config.STATE_CHANGE.BREAK_LIGHT.yang
          : this.config.STATE_CHANGE.BREAK_LIGHT.yin;
      }
      if (prevLevel === 2 && newLevel === 1) {
        return this.config.STATE_CHANGE.WEAKEN;
      }
      return 0;
    }

    // 己方建设提升
    if (prevLevel === -1 && newLevel === 0) {
      return polarity === Polarity.YANG
        ? this.config.STATE_CHANGE.REPAIR_DMG.yang
        : this.config.STATE_CHANGE.REPAIR_DMG.yin;
    }
    if (prevLevel === 0 && newLevel === 1) {
      return this.config.STATE_CHANGE.LIGHT_UP;
    }
    if (prevLevel === 1 && newLevel === 2) {
      return this.config.STATE_CHANGE.BLESSING;
    }

    return 0;
  }

  /**
   * 判断动作是否命中稀有度黑名单
   */
  isNoRarityAction(actionType: ActionType): boolean {
    return this.config.NO_RARITY_ACTIONS.includes(actionType);
  }

  /**
   * 应用稀有度加成：命中黑名单动作直接返回原分值
   */
  applyRarityBonus(
    score: number,
    actionType: ActionType,
    multiplier: number = this.config.RARITY_MULTIPLIER
  ): number {
    if (score === 0) return 0;
    if (this.isNoRarityAction(actionType)) {
      return score;
    }
    const probability = ACTION_PROBABILITY[actionType] ?? 0.5;
    const rarityBonus = score * (1 - probability) * multiplier;
    return Math.round(score + rarityBonus);
  }
}

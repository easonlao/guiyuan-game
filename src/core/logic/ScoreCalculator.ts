/**
 * 归元弈 (Guiyuan) - 双轨制计分器 (ScoreCalculator)
 * 纯 TS 规范，实现 ADR 0002 规定的行为分与状态分双轨制结算、
 * 2.5 倍攻击压制加成
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

/**
 * 攻击进度定价（ticket 05 候选 A，ticket 06 采纳进生产）。
 *
 * 攻击状态分（CAUSE_DMG / BREAK_LIGHT / WEAKEN）乘以
 *   `floor + span × (行动前对手盘面归一节点数 / 5)`。
 * 未配置时恒等（factor = 1），供测试与对照配置使用。
 */
export interface AttackProgressScale {
  readonly floor: number;
  readonly span: number;
}

/**
 * 赛跑差定价（ticket 05 候选 C 的机制，仅供候选搜索复跑）。
 *
 * 攻击动作（ATK / BURST_ATK）在计分上附加
 *   `gain × (己方落后量 − 对手落后量)`，
 * 其中落后量 = 未点亮侧数 + 残留道损数；正数表示己方落后，即奖励压制。
 * `cap` 给出单项附加分的绝对值上限，缺省不限。
 * 生产 `POINTS_CONFIG` **不配置**，未配置时恒等 0，生产行为逐字节不变。
 */
export interface RaceDiffPricing {
  readonly gain: number;
  readonly cap?: number;
}

export interface PointsConfig {
  readonly ACTION: ActionPointsConfig;
  readonly STATE_CHANGE: StateChangePointsConfig;
  readonly GUI_YI_MILESTONE?: number;
  readonly DAMAGE_PENALTY?: number;
  /** 攻击进度定价；缺省不配置（恒等）。见 `AttackProgressScale`。 */
  readonly ATTACK_PROGRESS_SCALE?: AttackProgressScale;
  /** 赛跑差定价；缺省不配置（恒等 0）。见 `RaceDiffPricing`。 */
  readonly RACE_DIFF_PRICING?: RaceDiffPricing;
}

/** 节点归一里程碑奖励常量 (+60分) */
export const GUI_YI_MILESTONE = 60;

/** 终局残留道损惩罚常量 (-50分/道损) */
export const DAMAGE_PENALTY = 50;

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

  // 节点归一里程碑奖励分
  GUI_YI_MILESTONE: 60,

  // 终局残留道损扣分
  DAMAGE_PENALTY: 50,

  // 攻击进度定价（ticket 06 采纳 ticket 05 候选 A）：
  // 攻击状态分乘以 floor + span × (行动前对手归一节点数 / 5)，
  // 让压制的相对回报随对手归一进度上升、在对手尚未归一时下降。
  // 采纳记录与四标准证据见 docs/adr/0011-balance-route-fix-rules.md 追加节。
  ATTACK_PROGRESS_SCALE: { floor: 0.3, span: 0.9 }
};

export class ScoreCalculator {
  static readonly GUI_YI_MILESTONE = 60;
  static readonly DAMAGE_PENALTY = 50;

  constructor(public readonly config: PointsConfig = POINTS_CONFIG) {}

  get guiYiMilestone(): number {
    return this.config.GUI_YI_MILESTONE ?? GUI_YI_MILESTONE;
  }

  get damagePenalty(): number {
    return this.config.DAMAGE_PENALTY ?? DAMAGE_PENALTY;
  }

  /**
   * 计算节点归一里程碑奖励分
   * @param count 达成归一的节点数量（增量）
   */
  calculateGuiYiMilestonePoints(count: number): number {
    return count * this.guiYiMilestone;
  }

  calculateGuiYiMilestone(count: number): number {
    return this.calculateGuiYiMilestonePoints(count);
  }

  /**
   * 计算终局道损扣分
   * @param damageCount 残留道损总数量（每个阴或阳为 -1 记 1 个道损）
   */
  calculateDamagePenalty(damageCount: number): number {
    return damageCount * this.damagePenalty;
  }

  calculateEndgameDamagePenalty(damageCount: number): number {
    return this.calculateDamagePenalty(damageCount);
  }

  /**
   * 计算指定动作的行为基础分
   */
  calculateActionPoints(actionType: ActionType): number {
    // `ACTION` 只声明有基础分的动作；消散 (DISSIPATE) 与过牌 (PASS) 由规则
    // 强制计 0 分，不在配置内，查不到即回退 0。
    const actionPoints: Partial<Record<ActionType, number>> = this.config.ACTION;
    return actionPoints[actionType] ?? 0;
  }

  /**
   * 攻击进度定价系数（ticket 05 候选 A）。
   *
   * 以行动前对手盘面已归一节点数（0–5）线性插值：`floor + span × (count / 5)`。
   * 未配置 `ATTACK_PROGRESS_SCALE` 时返回恒等 1。调用方负责四舍五入与只作用于攻击状态分。
   */
  attackProgressScale(opponentGuiYiCount: number): number {
    const scale = this.config.ATTACK_PROGRESS_SCALE;
    if (!scale) {
      return 1;
    }
    return scale.floor + scale.span * (opponentGuiYiCount / 5);
  }

  /**
   * 赛跑差定价附加分（ticket 05 候选 C）。
   *
   * 传入行动前的「己方落后量」与「对手落后量」（未点亮侧数 + 残留道损数），
   * 返回 `gain × (ownBehind − opponentBehind)`，受可选 `cap` 截断。
   * 未配置 `RACE_DIFF_PRICING` 时恒等 0。调用方负责只作用于攻击动作。
   */
  raceDiffPoints(ownBehind: number, opponentBehind: number): number {
    const pricing = this.config.RACE_DIFF_PRICING;
    if (!pricing || pricing.gain === 0) {
      return 0;
    }
    const term = pricing.gain * (ownBehind - opponentBehind);
    return pricing.cap === undefined
      ? term
      : Math.max(-pricing.cap, Math.min(pricing.cap, term));
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
}

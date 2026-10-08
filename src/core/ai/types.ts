/**
 * 归元弈 (Guiyuan) - 策略 AI 类型定义
 * 纯 TS 规范，零外部运行时依赖
 */

import { ActionPayload, ActionType, GameState, TianGanInfo } from '../types/domain.js';

/**
 * 启发式策略权重配置 (StrategyWeights)
 */
export interface StrategyWeights {
  /** 修复己方道损 (-1 -> 0 或 -1 -> 1) 的价值权重 */
  readonly repairDamage: number;

  /** 点亮虚空侧 (0 -> 1) 的价值权重 */
  readonly lightVoid: number;

  /** 达成单节点归一 (阴阳皆 >= 1) 的价值权重 */
  readonly reachGuiYi: number;

  /** 达成单节点亢极 (阴阳皆 == 2) 或极性加持 (1 -> 2) 的价值权重 */
  readonly reachKangJi: number;

  /** 推进五行全归元 (距离5个归一节点的接近程度) 的价值权重 */
  readonly guiyuanProgress: number;

  /** 压制敌方节点使其等级下降 (如 2 -> 1, 1 -> 0) 的基础价值权重 */
  readonly suppressNode: number;

  /** 破坏敌方归一状态 (原本归一，受击后不再归一) 的价值权重 */
  readonly breakOpponentGuiYi: number;

  /** 造成敌方道损 (0 -> -1) 的价值权重 */
  readonly causeDamage: number;

  /** 爆发连动额外行动 (BURST / BURST_ATK 带来的 extraTurn) 的价值权重 */
  readonly burstExtraTurn: number;

  /** 规则得分收益权重 (scoreDelta * scoreDeltaWeight) */
  readonly scoreDeltaWeight?: number;

  /** 直接达成五行归元终局获胜的超额权重 */
  readonly winReward?: number;

  /** 基础动作类型偏好微调 */
  readonly baseActionBias?: Partial<Record<ActionType, number>>;
}

/**
 * 动作评估得分细分项
 */
export interface ActionScoreBreakdown {
  /** 自保修复得分 */
  readonly repairScore: number;
  /** 归元推进得分 (包含点亮虚空、达成归一、加持亢极、全归元推进) */
  readonly unityScore: number;
  /** 压制克破得分 (包含降级、破归一、造成道损) */
  readonly suppressionScore: number;
  /** 连动收益得分 (extraTurn) */
  readonly burstScore: number;
  /** 规则得分奖励 (scoreDelta) */
  readonly scoreDeltaPoints: number;
  /** 动作基础偏好得分 */
  readonly biasScore: number;
  /** 综合加权总分 */
  readonly totalScore: number;
}

/**
 * 动作评估结果
 */
export interface ActionScore {
  readonly action: ActionPayload;
  readonly score: number;
  readonly breakdown: ActionScoreBreakdown;
}

/**
 * 策略决策函数契约
 * 兼容 TurnManager 的 TurnStrategy 与 HeadlessMatch
 */
export type DecisionStrategy = (
  state: GameState,
  tianGan: TianGanInfo,
  availableActions?: ActionPayload[]
) => ActionPayload;

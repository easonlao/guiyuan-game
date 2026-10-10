/**
 * 归元弈 (Guiyuan) - 策略构造器与预设策略集
 * 纯 TS 规范，零外部运行时依赖
 */

import { ActionPayload, ActionType, GameState, TianGanInfo } from '../types/domain.js';
import { getAvailableActions, RuleSwitches } from '../logic/ActionCandidates.js';
import { ActionResolver } from '../logic/ActionResolver.js';
import { ScoreCalculator, PointsConfig } from '../logic/ScoreCalculator.js';
import { ActionEvaluator, DEFAULT_STRATEGY_WEIGHTS } from './ActionEvaluator.js';
import { ActionScore, DecisionStrategy, StrategyWeights } from './types.js';

/**
 * 平衡策略权重 (对齐 GDD：自保 > 归一 > 攻击)
 */
export const BALANCED_WEIGHTS: StrategyWeights = {
  repairDamage: 260,
  reachGuiYi: 240,
  lightVoid: 100,
  reachKangJi: 50,
  guiyuanProgress: 140,
  burstExtraTurn: 120,
  breakOpponentGuiYi: 100,
  causeDamage: 60,
  suppressNode: 30,
  scoreDeltaWeight: 0.8,
  winReward: 10000,
  baseActionBias: {}
};

/**
 * 归元冲刺策略权重 (偏归元冲刺，全力点亮与达成归一)
 */
export const RUSH_GUIYUAN_WEIGHTS: StrategyWeights = {
  repairDamage: 60,
  reachGuiYi: 280,
  lightVoid: 120,
  reachKangJi: 70,
  guiyuanProgress: 180,
  burstExtraTurn: 110,
  breakOpponentGuiYi: 25,
  causeDamage: 15,
  suppressNode: 10,
  scoreDeltaWeight: 0.8,
  winReward: 12000,
  baseActionBias: {}
};

/**
 * 激进压制策略权重 (偏压制克破，优先破坏敌方归一与制造道损)
 */
export const AGGRESSIVE_WEIGHTS: StrategyWeights = {
  repairDamage: 50,
  reachGuiYi: 40,
  lightVoid: 25,
  reachKangJi: 20,
  guiyuanProgress: 20,
  burstExtraTurn: 80,
  breakOpponentGuiYi: 220,
  causeDamage: 160,
  suppressNode: 90,
  scoreDeltaWeight: 0.8,
  winReward: 10000,
  baseActionBias: {}
};

/**
 * 保守防御策略权重 (偏防御自保，极高优先级修复道损，稳固阵地)
 */
export const DEFENSIVE_WEIGHTS: StrategyWeights = {
  repairDamage: 320,
  reachGuiYi: 110,
  lightVoid: 70,
  reachKangJi: 40,
  guiyuanProgress: 40,
  burstExtraTurn: 40,
  breakOpponentGuiYi: 50,
  causeDamage: 30,
  suppressNode: 20,
  scoreDeltaWeight: 0.8,
  winReward: 10000,
  baseActionBias: {}
};

export interface StrategyOptions {
  readonly evaluator?: ActionEvaluator;
  readonly tieBreaker?: (candidates: ActionScore[]) => ActionPayload;
  /** 通用规则开关；默认恒等，不传即全部关闭 */
  readonly rules?: RuleSwitches;
}

/**
 * 工厂函数：基于指定权重生成策略决策函数
 */
export function createStrategy(
  weights?: Partial<StrategyWeights>,
  options: StrategyOptions = {}
): DecisionStrategy {
  const mergedWeights: StrategyWeights = {
    ...DEFAULT_STRATEGY_WEIGHTS,
    ...weights
  };
  const evaluator = options.evaluator ?? new ActionEvaluator();

  return (
    state: GameState,
    tianGan: TianGanInfo,
    availableActions?: ActionPayload[]
  ): ActionPayload => {
    const actions =
      availableActions && availableActions.length > 0
        ? availableActions
        : getAvailableActions(state, tianGan);

    if (actions.length === 0) {
      // 兜底心跳
      return {
        actionType: ActionType.AUTO,
        player: state.currentPlayer,
        element: tianGan.element,
        polarity: tianGan.polarity
      };
    }

    if (actions.length === 1) {
      return actions[0];
    }

    const scored = evaluator.evaluateAll(state, tianGan, actions, mergedWeights, options.rules);

    // 稳定排序：得分高者排在前
    scored.sort((a, b) => b.score - a.score);

    if (options.tieBreaker) {
      const bestScore = scored[0].score;
      const topCandidates = scored.filter(s => s.score === bestScore);
      if (topCandidates.length > 1) {
        return options.tieBreaker(topCandidates);
      }
    }

    return scored[0].action;
  };
}

/**
 * 把同一份计分配置同时绑定到 AI 动作估值器与动作解析器。
 * 这是「计分是 AI 决策输入」这一角色的唯一保证：
 * 若只把配置交给 HeadlessMatch 的解析器，AI 估值器仍读默认 POINTS_CONFIG，
 * 换一套计分数值后 AI 行为会逐字节不变。
 * 默认（POINTS_CONFIG）下与 createStrategy(weights) 等价。
 */
export function createScoreBoundStrategy(
  weights: StrategyWeights,
  config: PointsConfig,
  rules?: RuleSwitches
): DecisionStrategy {
  return createStrategy(weights, {
    evaluator: new ActionEvaluator(new ActionResolver(new ScoreCalculator(config))),
    rules
  });
}

/** 预设策略：平衡策略 (对齐 GDD) */
export const balancedStrategy: DecisionStrategy = createStrategy(BALANCED_WEIGHTS);

/** 预设策略：归元冲刺 */
export const rushGuiyuanStrategy: DecisionStrategy = createStrategy(RUSH_GUIYUAN_WEIGHTS);

/** 预设策略：激进压制 */
export const aggressiveStrategy: DecisionStrategy = createStrategy(AGGRESSIVE_WEIGHTS);

/** 预设策略：保守自保 */
export const defensiveStrategy: DecisionStrategy = createStrategy(DEFENSIVE_WEIGHTS);

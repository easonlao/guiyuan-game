/**
 * 归元弈 (Guiyuan) - 动作估值器 (ActionEvaluator)
 * 基于状态预测与多维度启发式权重，对候选动作进行纯数学打分
 * 纯 TS 规范，零外部运行时依赖
 */

import {
  ActionScore,
  StrategyWeights
} from './types.js';
import {
  ActionPayload,
  GameState,
  PlayerId,
  TianGanInfo,
  WuXing
} from '../types/domain.js';
import { ActionResolver } from '../logic/ActionResolver.js';
import { isBoardGuiYuan, isNodeGuiYi, isNodeKangJi } from '../logic/State.js';

export const DEFAULT_STRATEGY_WEIGHTS: StrategyWeights = {
  repairDamage: 120,
  reachGuiYi: 90,
  lightVoid: 40,
  reachKangJi: 30,
  guiyuanProgress: 35,
  breakOpponentGuiYi: 80,
  causeDamage: 60,
  suppressNode: 30,
  burstExtraTurn: 70,
  scoreDeltaWeight: 1,
  winReward: 10000,
  baseActionBias: {}
};

export class ActionEvaluator {
  constructor(private readonly resolver: ActionResolver = new ActionResolver()) {}

  /**
   * 评估单个动作的综合价值
   */
  evaluate(
    state: GameState,
    tianGan: TianGanInfo,
    action: ActionPayload,
    weights: StrategyWeights = DEFAULT_STRATEGY_WEIGHTS
  ): ActionScore {
    const simulatedState: GameState = {
      ...state,
      currentTianGan: tianGan
    };

    const result = this.resolver.resolve(simulatedState, action);

    if (!result.success) {
      return {
        action,
        score: -999999,
        breakdown: {
          repairScore: 0,
          unityScore: 0,
          suppressionScore: 0,
          burstScore: 0,
          scoreDeltaPoints: 0,
          biasScore: 0,
          totalScore: -999999
        }
      };
    }

    const activePlayerId = action.player;
    const opponentPlayerId: PlayerId = activePlayerId === 'P1' ? 'P2' : 'P1';

    const prevActive = state.players[activePlayerId].board;
    const nextActive = result.nextState.players[activePlayerId].board;
    const prevOpponent = state.players[opponentPlayerId].board;
    const nextOpponent = result.nextState.players[opponentPlayerId].board;

    const elements = Object.values(WuXing);

    // 1. 自保 / 修复 (-1 -> 0 / 1)
    let repairScore = 0;
    for (const el of elements) {
      if (prevActive[el].yin === -1 && nextActive[el].yin > -1) {
        repairScore += weights.repairDamage;
      }
      if (prevActive[el].yang === -1 && nextActive[el].yang > -1) {
        repairScore += weights.repairDamage;
      }
    }

    // 2. 归元推进
    let unityScore = 0;
    let prevGuiYiCount = 0;
    let nextGuiYiCount = 0;

    for (const el of elements) {
      const prevNode = prevActive[el];
      const nextNode = nextActive[el];

      const prevIsGuiYi = isNodeGuiYi(prevNode);
      const nextIsGuiYi = isNodeGuiYi(nextNode);

      if (prevIsGuiYi) prevGuiYiCount++;
      if (nextIsGuiYi) nextGuiYiCount++;

      // 达成归一
      if (!prevIsGuiYi && nextIsGuiYi) {
        unityScore += weights.reachGuiYi;
      } else if (prevIsGuiYi && !nextIsGuiYi) {
        // 动作消耗导致失去归一
        unityScore -= weights.reachGuiYi * 0.5;
      }

      // 点亮虚空侧 (0 -> 1)
      if (prevNode.yin === 0 && nextNode.yin >= 1) {
        unityScore += weights.lightVoid;
      }
      if (prevNode.yang === 0 && nextNode.yang >= 1) {
        unityScore += weights.lightVoid;
      }

      // 达成加持 (1 -> 2) 与亢极
      if (prevNode.yin < 2 && nextNode.yin === 2) {
        unityScore += weights.reachKangJi * 0.5;
      }
      if (prevNode.yang < 2 && nextNode.yang === 2) {
        unityScore += weights.reachKangJi * 0.5;
      }
      if (!isNodeKangJi(prevNode) && isNodeKangJi(nextNode)) {
        unityScore += weights.reachKangJi * 0.5;
      }
    }

    // 推进五行全归元 (净归一节点增量 与 整体接近度)
    const guiYiDelta = nextGuiYiCount - prevGuiYiCount;
    if (guiYiDelta > 0) {
      unityScore += guiYiDelta * weights.guiyuanProgress;
    }
    unityScore += nextGuiYiCount * (weights.guiyuanProgress * 0.2);

    // 若达成五行全归元终局获胜
    if (isBoardGuiYuan(nextActive)) {
      unityScore += weights.winReward ?? 500;
    }

    // 3. 压制克破
    let suppressionScore = 0;
    for (const el of elements) {
      const prevOpNode = prevOpponent[el];
      const nextOpNode = nextOpponent[el];

      // 破坏对方归一状态
      if (isNodeGuiYi(prevOpNode) && !isNodeGuiYi(nextOpNode)) {
        suppressionScore += weights.breakOpponentGuiYi;
      }

      // 造成对方道损 (从 >= 0 降至 -1)
      if (prevOpNode.yin >= 0 && nextOpNode.yin === -1) {
        suppressionScore += weights.causeDamage;
      }
      if (prevOpNode.yang >= 0 && nextOpNode.yang === -1) {
        suppressionScore += weights.causeDamage;
      }

      // 普通降级压制 (2 -> 1, 1 -> 0, 等)
      if (nextOpNode.yin < prevOpNode.yin) {
        const diff = prevOpNode.yin - nextOpNode.yin;
        suppressionScore += diff * weights.suppressNode;
      }
      if (nextOpNode.yang < prevOpNode.yang) {
        const diff = prevOpNode.yang - nextOpNode.yang;
        suppressionScore += diff * weights.suppressNode;
      }
    }

    // 4. 连动额外行动收益 (BURST / BURST_ATK)
    let burstScore = 0;
    if (result.extraTurn) {
      burstScore += weights.burstExtraTurn;
    }

    // 5. 规则得分奖励
    const scoreWeight = weights.scoreDeltaWeight ?? 1;
    const scoreDeltaPoints = result.scoreDelta * scoreWeight;

    // 6. 动作基础偏好
    const biasScore = weights.baseActionBias?.[action.actionType] ?? 0;

    const totalScore =
      repairScore +
      unityScore +
      suppressionScore +
      burstScore +
      scoreDeltaPoints +
      biasScore;

    return {
      action,
      score: totalScore,
      breakdown: {
        repairScore,
        unityScore,
        suppressionScore,
        burstScore,
        scoreDeltaPoints,
        biasScore,
        totalScore
      }
    };
  }

  /**
   * 评估一组候选动作并返回打分列表
   */
  evaluateAll(
    state: GameState,
    tianGan: TianGanInfo,
    actions: ActionPayload[],
    weights: StrategyWeights = DEFAULT_STRATEGY_WEIGHTS
  ): ActionScore[] {
    return actions.map(action => this.evaluate(state, tianGan, action, weights));
  }
}

/**
 * 归元弈 (Guiyuan) - 无头推演模拟器 (HeadlessMatch)
 * 脱离任何 UI 引擎，纯在 Node.js 中执行批量对弈与平衡性/性能验证
 */

import { ActionType, GameState, PlayerId, TianGanInfo } from '../types/domain.js';
import { GameRecord, ActionRecord } from '../types/record.js';
import { createInitialGameState } from '../logic/State.js';
import { ActionResolver } from '../logic/ActionResolver.js';
import { getAvailableActions } from '../logic/ActionCandidates.js';
import { createPRNG, drawTianGan, PRNG } from '../utils/prng.js';
import type { DecisionStrategy } from '../ai/types.js';

export type { DecisionStrategy };

export interface MatchOptions {
  readonly seed?: number;
  readonly maxRounds?: number;
  readonly recordActions?: boolean;
}

export interface MatchResult {
  readonly winner: PlayerId | 'DRAW' | null;
  readonly endReason: 'GUI_YUAN' | 'MAX_ROUNDS' | null;
  readonly roundsPlayed: number;
  readonly finalP1Score: number;
  readonly finalP2Score: number;
  readonly finalState: GameState;
  readonly record: GameRecord;
}

/** 随机天干生成器 (兼容旧调用或使用显式 PRNG) */
export function getRandomTianGan(prng?: PRNG): TianGanInfo {
  if (prng) {
    return drawTianGan(prng);
  }
  const defaultPrng = createPRNG();
  return drawTianGan(defaultPrng);
}

/** 极简基础策略：优先吸纳 AUTO */
export const defaultBaselineStrategy: DecisionStrategy = (state, tianGan) => {
  return {
    actionType: ActionType.AUTO,
    player: state.currentPlayer,
    element: tianGan.element,
    polarity: tianGan.polarity
  };
};

export class HeadlessMatch {
  private readonly resolver = new ActionResolver();

  run(
    strategyP1: DecisionStrategy = defaultBaselineStrategy,
    strategyP2: DecisionStrategy = defaultBaselineStrategy,
    optionsOrMaxRounds: number | MatchOptions = 30
  ): MatchResult {
    const options: MatchOptions =
      typeof optionsOrMaxRounds === 'number'
        ? { maxRounds: optionsOrMaxRounds }
        : optionsOrMaxRounds;

    const maxRounds = options.maxRounds ?? 30;
    const seed = options.seed ?? 123456789;
    const prng = createPRNG(seed);

    let state = createInitialGameState(maxRounds);
    const recordActions = options.recordActions ?? true;
    const actionRecords: ActionRecord[] = [];
    let isExtraTurn = false;

    while (!state.isGameOver && state.round <= maxRounds) {
      const tianGan = drawTianGan(prng);
      const candidates = getAvailableActions(state, tianGan, { isExtraTurn });
      const currentStrategy = state.currentPlayer === 'P1' ? strategyP1 : strategyP2;
      let action = currentStrategy(state, tianGan, candidates);

      // 连动锁防线：额外回合中禁止二次爆发，若策略违规返回爆发动作则降级为首个合法动作
      if (
        isExtraTurn &&
        (action.actionType === ActionType.BURST || action.actionType === ActionType.BURST_ATK)
      ) {
        action = candidates[0] ?? {
          actionType: ActionType.AUTO,
          player: state.currentPlayer,
          element: tianGan.element,
          polarity: tianGan.polarity
        };
      }

      if (recordActions) {
        actionRecords.push({
          round: state.round,
          player: state.currentPlayer,
          action
        });
      }

      const result = this.resolver.resolve(
        { ...state, currentTianGan: tianGan },
        action
      );

      // 处理连动状态追踪
      if (result.extraTurn && !isExtraTurn) {
        isExtraTurn = true;
      } else {
        isExtraTurn = false;
      }

      state = result.nextState;
    }

    const record: GameRecord = {
      seed,
      maxRounds,
      actions: actionRecords
    };

    return {
      winner: state.winner,
      endReason: state.endReason,
      roundsPlayed: state.round,
      finalP1Score: state.players.P1.score,
      finalP2Score: state.players.P2.score,
      finalState: state,
      record
    };
  }
}

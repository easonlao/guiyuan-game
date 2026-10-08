/**
 * 归元弈 (Guiyuan) - 无头推演模拟器 (HeadlessMatch)
 * 脱离任何 UI 引擎，纯在 Node.js 中执行批量对弈与平衡性/性能验证
 */

import { ActionPayload, ActionType, GameState, PlayerId, TIAN_GAN_LIST, TianGanInfo } from '../types/domain.js';
import { createInitialGameState } from '../logic/State.js';
import { ActionResolver } from '../logic/ActionResolver.js';

export type DecisionStrategy = (state: GameState, tianGan: TianGanInfo) => ActionPayload;

export interface MatchResult {
  readonly winner: PlayerId | 'DRAW' | null;
  readonly endReason: 'GUI_YUAN' | 'MAX_ROUNDS' | null;
  readonly roundsPlayed: number;
  readonly finalP1Score: number;
  readonly finalP2Score: number;
  readonly finalState: GameState;
}

/** 随机天干生成器 (可控种子或随机) */
export function getRandomTianGan(): TianGanInfo {
  const index = Math.floor(Math.random() * TIAN_GAN_LIST.length);
  return TIAN_GAN_LIST[index];
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
    maxRounds = 60
  ): MatchResult {
    let state = createInitialGameState(maxRounds);

    while (!state.isGameOver && state.round <= maxRounds) {
      const tianGan = getRandomTianGan();
      const currentStrategy = state.currentPlayer === 'P1' ? strategyP1 : strategyP2;
      const action = currentStrategy(state, tianGan);

      const result = this.resolver.resolve(
        { ...state, currentTianGan: tianGan },
        action
      );
      state = result.nextState;
    }

    return {
      winner: state.winner,
      endReason: state.endReason,
      roundsPlayed: state.round,
      finalP1Score: state.players.P1.score,
      finalP2Score: state.players.P2.score,
      finalState: state
    };
  }
}

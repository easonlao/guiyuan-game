/**
 * 归元弈 (Guiyuan) - 无头推演模拟器 (HeadlessMatch)
 * 脱离任何 UI 引擎，纯在 Node.js 中执行批量对弈与平衡性/性能验证
 */

import { ActionType, GameState, PlayerId, TianGanInfo } from '../types/domain.js';
import { GameRecord, ActionRecord } from '../types/record.js';
import {
  createInitialGameState,
  canTianGanLightUnlightedSide,
  getUnlightedSide,
  clampNodeLevel
} from '../logic/State.js';
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

export type ClosureType =
  | 'DOUBLE_GUIYUAN'
  | 'SUDDEN_DEATH'
  | 'CATCHUP_FAIL'
  | 'P2_DIRECT_GUIYUAN'
  | 'MAX_ROUNDS';

export interface MatchResult {
  readonly winner: PlayerId | 'DRAW' | null;
  readonly endReason: 'GUI_YUAN' | 'MAX_ROUNDS' | null;
  readonly closureType?: ClosureType;
  readonly showdownOccurred?: boolean;
  readonly showdownSuccess?: boolean;
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
    let isShowdown = false;
    let showdownSuccess = false;

    while (!state.isGameOver && state.round <= maxRounds) {
      // 终轮天命揭牌决胜阶段判定：先手 P1 已锁定五行归元且当前轮到后手 P2 (听牌临界态)
      if (state.lockedGuiYuan?.P1 && state.currentPlayer === 'P2') {
        const tianGan = drawTianGan(prng);
        const p2Board = state.players.P2.board;
        const success = canTianGanLightUnlightedSide(p2Board, tianGan);

        let nextP2Board = p2Board;
        let nextLockedGuiYuan = {
          P1: true,
          P2: false
        };
        let winner: PlayerId = 'P1';

        if (success) {
          winner = 'P2';
          nextLockedGuiYuan = {
            P1: true,
            P2: true
          };
          const unlighted = getUnlightedSide(p2Board);
          if (unlighted) {
            nextP2Board = {
              ...p2Board,
              [unlighted.element]: {
                ...p2Board[unlighted.element],
                [unlighted.polarity]: clampNodeLevel(p2Board[unlighted.element][unlighted.polarity] + 1)
              }
            };
          }
        } else {
          winner = 'P1';
        }

        state = {
          ...state,
          currentTianGan: tianGan,
          isGameOver: true,
          winner,
          endReason: 'GUI_YUAN',
          lockedGuiYuan: nextLockedGuiYuan,
          players: {
            ...state.players,
            P2: {
              ...state.players.P2,
              board: nextP2Board
            }
          }
        };

        isShowdown = true;
        showdownSuccess = success;
        break;
      }

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

    let closureType: ClosureType | undefined;
    if (state.endReason === 'MAX_ROUNDS') {
      closureType = 'MAX_ROUNDS';
    } else if (state.endReason === 'GUI_YUAN') {
      const p1Gui = state.lockedGuiYuan?.P1 ?? false;
      const p2Gui = state.lockedGuiYuan?.P2 ?? false;
      if (p1Gui && p2Gui) {
        closureType = 'DOUBLE_GUIYUAN';
      } else if (!p1Gui && p2Gui) {
        closureType = 'P2_DIRECT_GUIYUAN';
      } else if (p1Gui && !p2Gui) {
        closureType = isShowdown ? 'CATCHUP_FAIL' : 'SUDDEN_DEATH';
      }
    }

    const record: GameRecord = {
      seed,
      maxRounds,
      actions: actionRecords
    };

    return {
      winner: state.winner,
      endReason: state.endReason,
      closureType,
      showdownOccurred: isShowdown,
      showdownSuccess: isShowdown ? showdownSuccess : undefined,
      roundsPlayed: state.round,
      finalP1Score: state.players.P1.score,
      finalP2Score: state.players.P2.score,
      finalState: state,
      record
    };
  }
}

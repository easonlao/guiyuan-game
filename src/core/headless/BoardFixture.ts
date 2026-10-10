/**
 * 归元弈 (Guiyuan) - 受控盘面 fixture 构造器 (Board Fixture)
 *
 * 测试基础设施（spec Implementation Decisions #9），不是接缝。
 * 在 `createInitialGameState()` / `createEmptyBoard()` 之上覆盖指定节点阴阳等级，
 * 使「某节点阴侧处于道损、其余初始」这类盘面用一行写出。
 *
 * - `boardWith(overrides)` 构造仅覆盖被测节点的棋盘，其余节点保持虚空 (0,0)。
 * - `gameStateWith(options)` 在 `createInitialGameState()` 之上构造完整 `GameState`。
 *
 * 既可从测试使用，也可从测量台/实验代码（`src/core/headless/`）使用。
 */

import {
  BoardState,
  GameState,
  NodeLevel,
  PlayerId,
  WuXing
} from '../types/domain.js';
import { createInitialGameState } from '../logic/State.js';

/** 单节点覆盖：只覆盖列出的侧，未列出的侧保持虚空 (0) */
export interface NodeLevelOverride {
  readonly yin?: NodeLevel;
  readonly yang?: NodeLevel;
}

/** 盘面覆盖：以五行为键，值为该节点要覆盖的侧 */
export type BoardOverrides = Partial<Record<WuXing, NodeLevelOverride>>;

/** 完整总状态 fixture 选项；未列出的字段沿用 `createInitialGameState()` 的初值 */
export interface GameStateFixtureOptions {
  readonly P1?: BoardOverrides;
  readonly P2?: BoardOverrides;
  readonly round?: number;
  readonly maxRounds?: number;
  readonly currentPlayer?: PlayerId;
  readonly lockedGuiYuan?: Readonly<Record<PlayerId, boolean>>;
  /** 双方分数覆盖；未提供时保持初值 0 */
  readonly score?: Readonly<Record<PlayerId, number>>;
  readonly isGameOver?: boolean;
  readonly winner?: PlayerId | 'DRAW' | null;
  readonly endReason?: 'GUI_YUAN' | 'MAX_ROUNDS' | null;
}

/** 构造仅覆盖被测节点的棋盘，其余节点保持虚空 (0,0) */
export function boardWith(overrides: BoardOverrides = {}): BoardState {
  const board: Record<WuXing, { yin: NodeLevel; yang: NodeLevel }> = {
    [WuXing.WOOD]: { yin: 0, yang: 0 },
    [WuXing.FIRE]: { yin: 0, yang: 0 },
    [WuXing.EARTH]: { yin: 0, yang: 0 },
    [WuXing.METAL]: { yin: 0, yang: 0 },
    [WuXing.WATER]: { yin: 0, yang: 0 }
  };

  for (const element of Object.values(WuXing)) {
    const override = overrides[element];
    if (!override) continue;
    board[element] = {
      yin: override.yin ?? board[element].yin,
      yang: override.yang ?? board[element].yang
    };
  }

  return board;
}

/** 在初始总状态之上覆盖指定节点阴阳等级与终局元数据，返回完整 `GameState` */
export function gameStateWith(options: GameStateFixtureOptions = {}): GameState {
  const initial = createInitialGameState(options.maxRounds);

  return {
    ...initial,
    round: options.round ?? initial.round,
    currentPlayer: options.currentPlayer ?? initial.currentPlayer,
    isGameOver: options.isGameOver ?? initial.isGameOver,
    winner: options.winner ?? initial.winner,
    endReason: options.endReason ?? initial.endReason,
    lockedGuiYuan: options.lockedGuiYuan ?? initial.lockedGuiYuan,
    players: {
      P1: {
        ...initial.players.P1,
        score: options.score?.P1 ?? initial.players.P1.score,
        board: options.P1 ? boardWith(options.P1) : initial.players.P1.board
      },
      P2: {
        ...initial.players.P2,
        score: options.score?.P2 ?? initial.players.P2.score,
        board: options.P2 ? boardWith(options.P2) : initial.players.P2.board
      }
    }
  };
}

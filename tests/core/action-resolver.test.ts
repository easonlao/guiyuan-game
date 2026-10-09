import { describe, it, expect } from 'vitest';
import {
  ActionType,
  WuXing,
  Polarity
} from '../../src/core/types/index.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';

describe('ActionResolver (Pure Immutable Calculations)', () => {
  const resolver = new ActionResolver();

  it('AUTO (吸纳): should increase node level from 0 to 1', () => {
    const initialState = createInitialGameState();
    const result = resolver.resolve(initialState, {
      actionType: ActionType.AUTO,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG
    });

    expect(result.success).toBe(true);
    expect(result.nextState.players.P1.board[WuXing.WOOD].yang).toBe(1);
    expect(result.nextState.players.P1.score).toBeGreaterThan(0);
    expect(result.nextState.currentPlayer).toBe('P2');
    expect(result.nextState.round).toBe(2);
    // Verify immutability of previous state
    expect(initialState.players.P1.board[WuXing.WOOD].yang).toBe(0);
    // Verify structural sharing: unmodified nodes share reference
    expect(result.nextState.players.P1.board[WuXing.FIRE]).toBe(initialState.players.P1.board[WuXing.FIRE]);
    expect(result.nextState.players.P2.board).toBe(initialState.players.P2.board);
  });


  it('CONVERT (调息): should transfer energy to opposite polarity', () => {
    const initialState = createInitialGameState();
    const result = resolver.resolve(initialState, {
      actionType: ActionType.CONVERT,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YIN
    });

    expect(result.success).toBe(true);
    expect(result.nextState.players.P1.board[WuXing.WOOD].yin).toBe(1);
    expect(result.nextState.players.P1.board[WuXing.WOOD].yang).toBe(0);
  });

  it('TRANS (化): should strengthen generating element (WOOD -> FIRE)', () => {
    const initialState = createInitialGameState();
    const result = resolver.resolve(initialState, {
      actionType: ActionType.TRANS,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: Polarity.YANG
    });

    expect(result.success).toBe(true);
    expect(result.nextState.players.P1.board[WuXing.FIRE].yang).toBe(1);
  });

  it('ATK (破): should damage opponent overcoming element (WOOD -> EARTH)', () => {
    const initialState = createInitialGameState();
    const result = resolver.resolve(initialState, {
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: Polarity.YANG
    });

    expect(result.success).toBe(true);
    // P2 EARTH yang goes from 0 to -1 (DAMAGE)
    expect(result.nextState.players.P2.board[WuXing.EARTH].yang).toBe(-1);
  });

  it('BURST (强化): should require GuiYi, consume 1 level, and grant extra turn', () => {
    const initialState = createInitialGameState();
    // Prepare P1 WOOD with GuiYi (yin: 1, yang: 1)
    const prepResult = resolver.resolve(initialState, {
      actionType: ActionType.AUTO,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YIN
    });
    const stateWithYin = {
      ...prepResult.nextState,
      currentPlayer: 'P1' as const,
      players: {
        ...prepResult.nextState.players,
        P1: {
          ...prepResult.nextState.players.P1,
          board: {
            ...prepResult.nextState.players.P1.board,
            [WuXing.WOOD]: { yin: 1 as const, yang: 1 as const }
          }
        }
      }
    };

    const burstResult = resolver.resolve(stateWithYin, {
      actionType: ActionType.BURST,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      consumePolarity: Polarity.YIN,
      polarity: Polarity.YANG
    });

    expect(burstResult.success).toBe(true);
    expect(burstResult.extraTurn).toBe(true);
    // WOOD yin was consumed from 1 to 0
    expect(burstResult.nextState.players.P1.board[WuXing.WOOD].yin).toBe(0);
    // FIRE yang was buffed from 0 to 1
    expect(burstResult.nextState.players.P1.board[WuXing.FIRE].yang).toBe(1);
    // Extra turn keeps current player as P1 without advancing round
    expect(burstResult.nextState.currentPlayer).toBe('P1');
  });

  it('Victory by 五行归元 (GuiYuan) should end game immediately', () => {
    let state = createInitialGameState();
    // Pre-light 4 elements
    const almostWinBoard = {
      [WuXing.WOOD]: { yin: 1, yang: 1 },
      [WuXing.FIRE]: { yin: 1, yang: 1 },
      [WuXing.EARTH]: { yin: 1, yang: 1 },
      [WuXing.METAL]: { yin: 1, yang: 1 },
      [WuXing.WATER]: { yin: 1, yang: 0 }
    } as const;

    state = {
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, board: almostWinBoard }
      }
    };

    const finalResult = resolver.resolve(state, {
      actionType: ActionType.AUTO,
      player: 'P1',
      element: WuXing.WATER,
      polarity: Polarity.YANG
    });

    expect(finalResult.success).toBe(true);
    expect(finalResult.nextState.isGameOver).toBe(true);
    expect(finalResult.nextState.winner).toBe('P1');
    expect(finalResult.nextState.endReason).toBe('GUI_YUAN');
  });

  it('DISSIPATE (亢极散气): should reduce KangJi side from 2 to 1 with 0 score and hand over turn', () => {
    let state = createInitialGameState();
    state = {
      ...state,
      players: {
        ...state.players,
        P1: {
          ...state.players.P1,
          score: 500,
          board: {
            ...state.players.P1.board,
            [WuXing.WOOD]: { yin: 2, yang: 2 }
          }
        }
      }
    };

    const result = resolver.resolve(state, {
      actionType: ActionType.DISSIPATE,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG
    });

    expect(result.success).toBe(true);
    expect(result.scoreDelta).toBe(0);
    expect(result.extraTurn).toBe(false);
    expect(result.nextState.players.P1.score).toBe(500);
    expect(result.nextState.players.P1.board[WuXing.WOOD].yang).toBe(1);
    expect(result.nextState.players.P1.board[WuXing.WOOD].yin).toBe(2);
    expect(result.nextState.currentPlayer).toBe('P2');
    expect(result.nextState.round).toBe(2);
  });
});

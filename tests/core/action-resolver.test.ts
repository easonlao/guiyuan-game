import { describe, it, expect } from 'vitest';
import { ActionType, WuXing, Polarity } from '../../src/core/types/index.js';
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
      polarity: Polarity.YANG,
    });

    expect(result.success).toBe(true);
    expect(result.nextState.players.P1.board[WuXing.WOOD].yang).toBe(1);
    expect(result.nextState.players.P1.score).toBeGreaterThan(0);
    expect(result.nextState.currentPlayer).toBe('P2');
    expect(result.nextState.round).toBe(1);
    // Verify immutability of previous state
    expect(initialState.players.P1.board[WuXing.WOOD].yang).toBe(0);
    // Verify structural sharing: unmodified nodes share reference
    expect(result.nextState.players.P1.board[WuXing.FIRE]).toBe(
      initialState.players.P1.board[WuXing.FIRE],
    );
    expect(result.nextState.players.P2.board).toBe(initialState.players.P2.board);
  });

  it('CONVERT (调息): should transfer energy to opposite polarity', () => {
    const initialState = createInitialGameState();
    const result = resolver.resolve(initialState, {
      actionType: ActionType.CONVERT,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YIN,
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
      polarity: Polarity.YANG,
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
      polarity: Polarity.YANG,
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
      polarity: Polarity.YIN,
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
            [WuXing.WOOD]: { yin: 1 as const, yang: 1 as const },
          },
        },
      },
    };

    const burstResult = resolver.resolve(stateWithYin, {
      actionType: ActionType.BURST,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      consumePolarity: Polarity.YIN,
    });

    expect(burstResult.success).toBe(true);
    expect(burstResult.extraTurn).toBe(true);
    // WOOD yin was consumed from 1 to 0
    expect(burstResult.nextState.players.P1.board[WuXing.WOOD].yin).toBe(0);
    // FIRE was buffed twice, yin-first: (0, 0) -> (2, 0)
    expect(burstResult.nextState.players.P1.board[WuXing.FIRE]).toEqual({ yin: 2, yang: 0 });
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
      [WuXing.WATER]: { yin: 1, yang: 0 },
    } as const;

    state = {
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, board: almostWinBoard },
      },
    };

    const finalResult = resolver.resolve(state, {
      actionType: ActionType.AUTO,
      player: 'P1',
      element: WuXing.WATER,
      polarity: Polarity.YANG,
    });

    expect(finalResult.success).toBe(true);
    expect(finalResult.nextState.isGameOver).toBe(true);
    expect(finalResult.nextState.winner).toBe('P1');
    expect(finalResult.nextState.endReason).toBe('GUI_YUAN');
  });

  it('Victory by 五行归元 (GuiYuan) for P2 ends the game without granting an extra turn', () => {
    const base = createInitialGameState();
    // P2 差 1 侧归元；本大回合已然闭合，归元即终局，不授予额外行动。
    const almostWinBoard = {
      [WuXing.WOOD]: { yin: 1, yang: 1 },
      [WuXing.FIRE]: { yin: 1, yang: 1 },
      [WuXing.EARTH]: { yin: 1, yang: 1 },
      [WuXing.METAL]: { yin: 1, yang: 1 },
      [WuXing.WATER]: { yin: 1, yang: 0 },
    } as const;

    const state = {
      ...base,
      currentPlayer: 'P2' as const,
      players: {
        ...base.players,
        P2: { ...base.players.P2, board: almostWinBoard },
      },
    };

    const result = resolver.resolve(state, {
      actionType: ActionType.AUTO,
      player: 'P2',
      element: WuXing.WATER,
      polarity: Polarity.YANG,
    });

    expect(result.success).toBe(true);
    expect(result.nextState.isGameOver).toBe(true);
    expect(result.nextState.winner).toBe('P2');
    expect(result.nextState.endReason).toBe('GUI_YUAN');
    // 终局即大回合闭合：extraTurn 必须为 false（HeadlessMatch/ActionEvaluator 会读该字段）
    expect(result.extraTurn).toBe(false);
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
            [WuXing.WOOD]: { yin: 2, yang: 2 },
          },
        },
      },
    };

    const result = resolver.resolve(state, {
      actionType: ActionType.DISSIPATE,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG,
    });

    expect(result.success).toBe(true);
    expect(result.scoreDelta).toBe(0);
    expect(result.extraTurn).toBe(false);
    expect(result.nextState.players.P1.score).toBe(500);
    expect(result.nextState.players.P1.board[WuXing.WOOD].yang).toBe(1);
    expect(result.nextState.players.P1.board[WuXing.WOOD].yin).toBe(2);
    expect(result.nextState.currentPlayer).toBe('P2');
    expect(result.nextState.round).toBe(1);
  });

  describe('Ticket 01: CONVERT Gate Defensive Check & PASS Resolution', () => {
    it('defensively rejects CONVERT if target polarity level is already LIT (1)', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 },
            },
          },
        },
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YIN,
      });

      expect(result.success).toBe(false);
      expect(result.scoreDelta).toBe(0);
      expect(result.message).toContain('严禁调息');
      expect(result.nextState.players.P1.board[WuXing.WOOD].yin).toBe(1);
    });

    it('defensively rejects CONVERT if target polarity level is already BLESSED (2)', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: 2, yang: 1 },
            },
          },
        },
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YIN,
      });

      expect(result.success).toBe(false);
      expect(result.scoreDelta).toBe(0);
      expect(result.message).toContain('严禁调息');
      expect(result.nextState.players.P1.board[WuXing.WOOD].yin).toBe(2);
    });

    it('resolves PASS with scoreDelta 0, success true, unchanged boards, and hands over turn', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            score: 120,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 },
            },
          },
        },
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.PASS,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG,
      });

      expect(result.success).toBe(true);
      expect(result.scoreDelta).toBe(0);
      expect(result.extraTurn).toBe(false);
      expect(result.nextState.players.P1.score).toBe(120);
      expect(result.nextState.players.P1.board[WuXing.WOOD]).toEqual({ yin: 1, yang: 1 });
      expect(result.nextState.currentPlayer).toBe('P2');
      expect(result.nextState.round).toBe(1);
    });
  });

  describe('Ticket 04: 终局、封顶与失败路径的真实行为', () => {
    it('rejects every action once the game is already over, without mutating state', () => {
      const gameOverState = {
        ...createInitialGameState(),
        isGameOver: true,
        winner: 'P1' as const,
        endReason: 'GUI_YUAN' as const,
      };

      const result = resolver.resolve(gameOverState, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG,
      });

      expect(result.success).toBe(false);
      expect(result.nextState).toBe(gameOverState);
      expect(result.extraTurn).toBe(false);
      expect(result.scoreDelta).toBe(0);
    });

    it('CONVERT gate: rejects a target side that is already lit, without granting an extra turn', () => {
      const base = createInitialGameState();
      const state = {
        ...base,
        players: {
          ...base.players,
          P1: {
            ...base.players.P1,
            board: {
              ...base.players.P1.board,
              [WuXing.WOOD]: { yin: 1 as const, yang: 1 as const },
            },
          },
        },
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YIN,
      });

      expect(result.success).toBe(false);
      expect(result.extraTurn).toBe(false);
      expect(result.nextState).toBe(state);
    });

    it('AUTO on an already-blessed node (level 2) still succeeds but does not raise the level', () => {
      const base = createInitialGameState();
      const state = {
        ...base,
        players: {
          ...base.players,
          P1: {
            ...base.players.P1,
            board: {
              ...base.players.P1.board,
              [WuXing.WOOD]: { yin: 0 as const, yang: 2 as const },
            },
          },
        },
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG,
      });

      expect(result.success).toBe(true);
      expect(result.nextState.players.P1.board[WuXing.WOOD].yang).toBe(2);
    });

    it('BURST consumes the requested YANG side of the source node', () => {
      const base = createInitialGameState();
      const state = {
        ...base,
        players: {
          ...base.players,
          P1: {
            ...base.players.P1,
            board: {
              ...base.players.P1.board,
              [WuXing.WOOD]: { yin: 1 as const, yang: 1 as const },
            },
          },
        },
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YANG,
      });

      expect(result.success).toBe(true);
      expect(result.nextState.players.P1.board[WuXing.WOOD].yang).toBe(0);
      expect(result.nextState.players.P1.board[WuXing.WOOD].yin).toBe(1);
    });

    it('BURST rejects a source node that is not yet GuiYi', () => {
      const base = createInitialGameState();
      const state = {
        ...base,
        players: {
          ...base.players,
          P1: {
            ...base.players.P1,
            board: {
              ...base.players.P1.board,
              [WuXing.WOOD]: { yin: 1 as const, yang: 0 as const },
            },
          },
        },
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
      });

      expect(result.success).toBe(false);
      expect(result.extraTurn).toBe(false);
      expect(result.nextState).toBe(state);
    });

    it('BURST_ATK rejects a source node that is not yet GuiYi', () => {
      const base = createInitialGameState();
      const state = {
        ...base,
        players: {
          ...base.players,
          P1: {
            ...base.players.P1,
            board: {
              ...base.players.P1.board,
              [WuXing.WOOD]: { yin: 1 as const, yang: 0 as const },
            },
          },
        },
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.BURST_ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YANG,
        polarity: Polarity.YANG,
      });

      expect(result.success).toBe(false);
      expect(result.extraTurn).toBe(false);
      expect(result.nextState).toBe(state);
    });

    it('BURST_ATK consumes the requested YIN side of the source node', () => {
      const base = createInitialGameState();
      const state = {
        ...base,
        players: {
          ...base.players,
          P1: {
            ...base.players.P1,
            board: {
              ...base.players.P1.board,
              [WuXing.WOOD]: { yin: 1 as const, yang: 1 as const },
            },
          },
        },
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.BURST_ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YANG,
      });

      expect(result.success).toBe(true);
      expect(result.nextState.players.P1.board[WuXing.WOOD].yin).toBe(0);
      expect(result.nextState.players.P1.board[WuXing.WOOD].yang).toBe(1);
    });

    it('MAX_ROUNDS: deducts the damage penalty from the acting player (P2) score', () => {
      const base = createInitialGameState(30);
      const state = {
        ...base,
        round: 30,
        currentPlayer: 'P2' as const,
        players: {
          P1: { ...base.players.P1, score: 500 },
          P2: {
            ...base.players.P2,
            score: 500,
            board: {
              ...base.players.P2.board,
              [WuXing.WOOD]: { yin: -1 as const, yang: 0 as const },
            },
          },
        },
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.PASS,
        player: 'P2',
      });

      expect(result.success).toBe(true);
      expect(result.nextState.isGameOver).toBe(true);
      expect(result.nextState.endReason).toBe('MAX_ROUNDS');
      // 行动方 P2 带 1 个道损：500 - 50 = 450；P1 无道损保持 500
      expect(result.nextState.players.P2.score).toBe(450);
      expect(result.nextState.players.P1.score).toBe(500);
      expect(result.nextState.winner).toBe('P1');
    });
  });
});

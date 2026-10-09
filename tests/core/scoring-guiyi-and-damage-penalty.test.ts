import { describe, it, expect } from 'vitest';
import {
  ActionType,
  WuXing,
  Polarity
} from '../../src/core/types/index.js';
import {
  createInitialGameState,
  createEmptyBoard,
  countBoardDamage,
  countBoardGuiYi
} from '../../src/core/logic/State.js';
import {
  ScoreCalculator,
  POINTS_CONFIG,
  DEFAULT_SCORE_CONFIG,
  GUI_YI_MILESTONE,
  DAMAGE_PENALTY
} from '../../src/core/logic/ScoreCalculator.js';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';

describe('GuiYi Milestone Bonus (+60) & Endgame Damage Penalty (-50)', () => {
  const calculator = new ScoreCalculator();
  const resolver = new ActionResolver(calculator);

  describe('1. 计分器配置与方法 (ScoreCalculator)', () => {
    it('POINTS_CONFIG and constants should expose GUI_YI_MILESTONE: 60 and DAMAGE_PENALTY: 50', () => {
      expect(GUI_YI_MILESTONE).toBe(60);
      expect(DAMAGE_PENALTY).toBe(50);
      expect(POINTS_CONFIG.GUI_YI_MILESTONE).toBe(60);
      expect(POINTS_CONFIG.DAMAGE_PENALTY).toBe(50);
      expect(DEFAULT_SCORE_CONFIG.guiYiMilestone).toBe(60);
      expect(DEFAULT_SCORE_CONFIG.damagePenalty).toBe(50);
    });

    it('ScoreCalculator instance provides calculation methods', () => {
      expect(calculator.guiYiMilestone).toBe(60);
      expect(calculator.damagePenalty).toBe(50);
      expect(calculator.calculateGuiYiMilestonePoints(1)).toBe(60);
      expect(calculator.calculateGuiYiMilestonePoints(2)).toBe(120);
      expect(calculator.calculateDamagePenalty(1)).toBe(50);
      expect(calculator.calculateDamagePenalty(3)).toBe(150);
    });
  });

  describe('2. 达成归一里程碑奖励 (+60 分)', () => {
    it('AUTO: grants +60 milestone bonus when node reaches GuiYi', () => {
      // Wood is { yin: 1, yang: 0 }, AUTO on yang lights it up to 1 => GuiYi achieved!
      const baseState = createInitialGameState();
      const state = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            score: 0,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 1 as const, yang: 0 as const }
            }
          }
        }
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      // AUTO (0) + LIGHT_UP (100) + GUI_YI_MILESTONE (60) = 160
      expect(result.scoreDelta).toBe(160);
      expect(result.nextState.players.P1.score).toBe(160);
      expect(result.nextState.players.P1.board[WuXing.WOOD].yang).toBe(1);
      expect(result.nextState.players.P1.board[WuXing.WOOD].yin).toBe(1);
    });

    it('CONVERT: grants +60 milestone bonus when node reaches GuiYi', () => {
      // Wood is { yin: 0, yang: 1 }, CONVERT on yin lights it up to 1 => GuiYi achieved!
      const baseState = createInitialGameState();
      const state = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            score: 0,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 0 as const, yang: 1 as const }
            }
          }
        }
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YIN
      });

      expect(result.success).toBe(true);
      // CONVERT (50) + LIGHT_UP (100) + GUI_YI_MILESTONE (60) = 210
      expect(result.scoreDelta).toBe(210);
      expect(result.nextState.players.P1.score).toBe(210);
    });

    it('TRANS: grants +60 milestone bonus when generating element reaches GuiYi', () => {
      // Source WOOD, target FIRE. FIRE is { yin: 1, yang: 0 }. TRANS on FIRE yang lights it to 1 => GuiYi!
      const baseState = createInitialGameState();
      const state = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            score: 0,
            board: {
              ...baseState.players.P1.board,
              [WuXing.FIRE]: { yin: 1 as const, yang: 0 as const }
            }
          }
        }
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.TRANS,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      // TRANS (30) + LIGHT_UP (100) + GUI_YI_MILESTONE (60) = 190
      expect(result.scoreDelta).toBe(190);
      expect(result.nextState.players.P1.score).toBe(190);
      expect(result.nextState.players.P1.board[WuXing.FIRE].yang).toBe(1);
    });

    it('BURST: grants +60 milestone bonus when target element newly achieves GuiYi', () => {
      // Source WOOD is GuiYi { yin: 1, yang: 1 }. Target FIRE is { yin: 1, yang: 0 }.
      // BURST consumes WOOD yin (1 -> 0), buffs FIRE yang (0 -> 1) => FIRE reaches GuiYi!
      const baseState = createInitialGameState();
      const state = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            score: 0,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 1 as const, yang: 1 as const },
              [WuXing.FIRE]: { yin: 1 as const, yang: 0 as const }
            }
          }
        }
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      // BURST (100) + LIGHT_UP (100) + GUI_YI_MILESTONE (60) = 260
      expect(result.scoreDelta).toBe(260);
      expect(result.nextState.players.P1.score).toBe(260);
      expect(result.nextState.players.P1.board[WuXing.WOOD].yin).toBe(0);
      expect(result.nextState.players.P1.board[WuXing.FIRE].yang).toBe(1);
    });
  });

  describe('3. 未增加归一节点时不发放归一里程碑奖励', () => {
    it('AUTO: lighting up single side from void does NOT award milestone', () => {
      const state = createInitialGameState();
      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      expect(result.scoreDelta).toBe(100); // Only light_up, no milestone
      expect(result.nextState.players.P1.score).toBe(100);
    });

    it('AUTO: blessing already GuiYi node does NOT award milestone again', () => {
      const baseState = createInitialGameState();
      const state = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            score: 160,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 1 as const, yang: 1 as const }
            }
          }
        }
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      // BLESSING (200), no milestone
      expect(result.scoreDelta).toBe(200);
      expect(result.nextState.players.P1.score).toBe(360);
    });

    it('DISSIPATE: dissipating KangJi node does NOT award milestone', () => {
      const baseState = createInitialGameState();
      const state = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            score: 500,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 2 as const, yang: 2 as const }
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
      expect(result.nextState.players.P1.score).toBe(500);
    });

    it('BURST: when target node does not reach GuiYi, does NOT award milestone', () => {
      const baseState = createInitialGameState();
      const state = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            score: 0,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 1 as const, yang: 1 as const },
              [WuXing.FIRE]: { yin: 0 as const, yang: 0 as const }
            }
          }
        }
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      // BURST (100) + LIGHT_UP (100) = 200, no milestone
      expect(result.scoreDelta).toBe(200);
      expect(result.nextState.players.P1.score).toBe(200);
    });
  });

  describe('4. 终局回合上限残留道损结算 (-50分/道损)', () => {
    it('deducts 50 pts per residual damage (-1) on both boards at MAX_ROUNDS', () => {
      let state = createInitialGameState(2);
      // Round 2 (last round), P2 turn
      state = {
        ...state,
        round: 2,
        currentPlayer: 'P2',
        players: {
          P1: {
            id: 'P1',
            score: 300,
            board: {
              ...createEmptyBoard(),
              [WuXing.WOOD]: { yin: -1 as const, yang: 0 as const } // 1 damage => -50 => 250
            }
          },
          P2: {
            id: 'P2',
            score: 200,
            board: {
              ...createEmptyBoard(),
              [WuXing.FIRE]: { yin: 0 as const, yang: 0 as const } // 0 damage
            }
          }
        }
      };

      // P2 performs AUTO on FIRE yang (+100 light_up) -> P2 raw score: 300
      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P2',
        element: WuXing.FIRE,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      expect(result.nextState.isGameOver).toBe(true);
      expect(result.nextState.endReason).toBe('MAX_ROUNDS');

      // P1 score: 300 - 50 = 250
      expect(result.nextState.players.P1.score).toBe(250);
      // P2 score: 200 + 100 - 0 = 300
      expect(result.nextState.players.P2.score).toBe(300);
      // P2 (300) > P1 (250) => P2 wins
      expect(result.nextState.winner).toBe('P2');
    });

    it('damage penalty flips victory when leader has heavy damage', () => {
      let state = createInitialGameState(1);
      // P1 has 2 damages, P2 has 0 damage.
      // P1 score: 200 raw, P2 score: 120.
      state = {
        ...state,
        round: 1,
        currentPlayer: 'P1',
        players: {
          P1: {
            id: 'P1',
            score: 200,
            board: {
              ...createEmptyBoard(),
              [WuXing.WOOD]: { yin: -1 as const, yang: -1 as const } // 2 damages => -100
            }
          },
          P2: {
            id: 'P2',
            score: 120,
            board: createEmptyBoard() // 0 damage
          }
        }
      };

      // P1 does AUTO on FIRE (not repairing WOOD), score delta = 100
      // P1 raw score: 300 - 100 (damage) = 200
      // P2 score: 120 - 0 = 120
      // P1 wins with 200 vs 120
      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.FIRE,
        polarity: Polarity.YANG
      });

      expect(result.nextState.players.P1.score).toBe(200);
      expect(result.nextState.players.P2.score).toBe(120);
      expect(result.nextState.winner).toBe('P1');
    });

    it('ties after damage penalty result in P2 (后手) winning', () => {
      let state = createInitialGameState(1);
      // P1 has 1 damage: score 200 -> 150.
      // P2 has 0 damage: score 150 -> 150.
      // Equal score (150 vs 150) => P2 wins!
      state = {
        ...state,
        round: 1,
        currentPlayer: 'P1',
        players: {
          P1: {
            id: 'P1',
            score: 100, // will get +100 from AUTO => 200 raw
            board: {
              ...createEmptyBoard(),
              [WuXing.EARTH]: { yin: -1 as const, yang: 0 as const } // 1 damage => -50 => 150
            }
          },
          P2: {
            id: 'P2',
            score: 150,
            board: createEmptyBoard() // 0 damage => 150
          }
        }
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(result.nextState.isGameOver).toBe(true);
      expect(result.nextState.endReason).toBe('MAX_ROUNDS');
      expect(result.nextState.players.P1.score).toBe(150);
      expect(result.nextState.players.P2.score).toBe(150);
      expect(result.nextState.winner).toBe('P2');
    });

    it('GUI_YUAN victory does NOT deduct damage penalty', () => {
      let state = createInitialGameState(10);
      // Pre-light 4 elements, 5th element will be completed
      // P1 also has a damaged element on P2 board, and P1 has damage on Wood yin but reaches GuiYuan?
      // Wait, if all 5 elements are GuiYi, none of them can be -1 because GuiYi means yin>=1 and yang>=1!
      // But P2 has damage. Check P1 wins with GUI_YUAN reason without penalty.
      const almostWinBoard = {
        [WuXing.WOOD]: { yin: 1 as const, yang: 1 as const },
        [WuXing.FIRE]: { yin: 1 as const, yang: 1 as const },
        [WuXing.EARTH]: { yin: 1 as const, yang: 1 as const },
        [WuXing.METAL]: { yin: 1 as const, yang: 1 as const },
        [WuXing.WATER]: { yin: 1 as const, yang: 0 as const }
      };

      state = {
        ...state,
        players: {
          P1: {
            id: 'P1',
            score: 500,
            board: almostWinBoard
          },
          P2: {
            id: 'P2',
            score: 400,
            board: {
              ...createEmptyBoard(),
              [WuXing.WOOD]: { yin: -1 as const, yang: -1 as const } // P2 has 2 damages
            }
          }
        }
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WATER,
        polarity: Polarity.YANG
      });

      expect(result.nextState.isGameOver).toBe(true);
      expect(result.nextState.endReason).toBe('GUI_YUAN');
      expect(result.nextState.winner).toBe('P1');
      // P2 score remains 400 because GuiYuan victory does not perform endgame damage penalty
      expect(result.nextState.players.P2.score).toBe(400);
    });
  });

  describe('5. State 辅助工具函数', () => {
    it('countBoardDamage counts all -1 sides accurately', () => {
      const board = {
        ...createEmptyBoard(),
        [WuXing.WOOD]: { yin: -1 as const, yang: 1 as const },
        [WuXing.FIRE]: { yin: -1 as const, yang: -1 as const }
      };
      expect(countBoardDamage(board)).toBe(3);
    });

    it('countBoardGuiYi counts all nodes with yin>=1 and yang>=1', () => {
      const board = {
        ...createEmptyBoard(),
        [WuXing.WOOD]: { yin: 1 as const, yang: 1 as const },
        [WuXing.FIRE]: { yin: 2 as const, yang: 1 as const },
        [WuXing.EARTH]: { yin: 0 as const, yang: 1 as const }
      };
      expect(countBoardGuiYi(board)).toBe(2);
    });
  });
});

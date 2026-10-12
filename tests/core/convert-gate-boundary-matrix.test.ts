import { describe, it, expect } from 'vitest';
import {
  ActionPayload,
  ActionType,
  GameState,
  Polarity,
  TIAN_GAN_LIST,
  WuXing,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE,
} from '../../src/core/types/domain.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { getAvailableActions } from '../../src/core/logic/ActionCandidates.js';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';
import { TurnManager } from '../../src/core/logic/TurnManager.js';
import { ActionEvaluator, DEFAULT_STRATEGY_WEIGHTS } from '../../src/core/ai/ActionEvaluator.js';
import {
  createStrategy,
  balancedStrategy,
  rushGuiyuanStrategy,
  aggressiveStrategy,
  defensiveStrategy,
} from '../../src/core/ai/Strategy.js';
import { HeadlessMatch } from '../../tools/HeadlessMatch.js';

describe('Ticket 02: CONVERT Gate Boundary Matrix & System Regression', () => {
  const resolver = new ActionResolver();
  const evaluator = new ActionEvaluator();

  const ALL_ELEMENTS = [WuXing.WOOD, WuXing.FIRE, WuXing.EARTH, WuXing.METAL, WuXing.WATER];

  describe('1. Exhaustive Boundary Matrix: All 5 Elements & Both Polarities', () => {
    describe('1.1 Yang Stems: Drawn Yang side is 1 or 2', () => {
      for (const element of ALL_ELEMENTS) {
        const yangStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === element && tg.polarity === Polarity.YANG,
        )!;

        // Permutations where opposite side (YIN) <= 0: CONVERT MUST BE GENERATED
        const allowedCombinations = [
          { yang: 1, yin: -1, label: '(1, -1)' },
          { yang: 1, yin: 0, label: '(1, 0)' },
          { yang: 2, yin: -1, label: '(2, -1)' },
          { yang: 2, yin: 0, label: '(2, 0)' },
        ];

        for (const combo of allowedCombinations) {
          it(`[${element}] Yang Stem (${yangStem.name}) at ${combo.label} generates CONVERT strictly to opposite polarity (YIN)`, () => {
            let state = createInitialGameState();
            state = {
              ...state,
              players: {
                ...state.players,
                P1: {
                  ...state.players.P1,
                  board: {
                    ...state.players.P1.board,
                    [element]: { yin: combo.yin, yang: combo.yang },
                  },
                },
              },
            };

            const actions = getAvailableActions(state, yangStem);
            const convertActions = actions.filter((a) => a.actionType === ActionType.CONVERT);

            expect(convertActions).toHaveLength(1);
            expect(convertActions[0]).toEqual({
              actionType: ActionType.CONVERT,
              player: 'P1',
              element,
              polarity: Polarity.YIN,
            });
          });
        }

        // Permutations where opposite side (YIN) >= 1: CONVERT MUST BE STRICTLY PROHIBITED
        const prohibitedCombinations = [
          { yang: 1, yin: 1, label: '(1, 1)' },
          { yang: 1, yin: 2, label: '(1, 2)' },
          { yang: 2, yin: 1, label: '(2, 1)' },
          { yang: 2, yin: 2, label: '(2, 2)' },
        ];

        for (const combo of prohibitedCombinations) {
          it(`[${element}] Yang Stem (${yangStem.name}) at ${combo.label} strictly prohibits CONVERT`, () => {
            let state = createInitialGameState();
            state = {
              ...state,
              players: {
                ...state.players,
                P1: {
                  ...state.players.P1,
                  board: {
                    ...state.players.P1.board,
                    [element]: { yin: combo.yin, yang: combo.yang },
                  },
                },
              },
            };

            const actions = getAvailableActions(state, yangStem);
            const convertActions = actions.filter((a) => a.actionType === ActionType.CONVERT);
            expect(convertActions).toHaveLength(0);
          });
        }
      }
    });

    describe('1.2 Yin Stems: Drawn Yin side is 1 or 2', () => {
      for (const element of ALL_ELEMENTS) {
        const yinStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === element && tg.polarity === Polarity.YIN,
        )!;

        // Permutations where opposite side (YANG) <= 0: CONVERT MUST BE GENERATED
        const allowedCombinations = [
          { yin: 1, yang: -1, label: '(1, -1)' },
          { yin: 1, yang: 0, label: '(1, 0)' },
          { yin: 2, yang: -1, label: '(2, -1)' },
          { yin: 2, yang: 0, label: '(2, 0)' },
        ];

        for (const combo of allowedCombinations) {
          it(`[${element}] Yin Stem (${yinStem.name}) at ${combo.label} generates CONVERT strictly to opposite polarity (YANG)`, () => {
            let state = createInitialGameState();
            state = {
              ...state,
              players: {
                ...state.players,
                P1: {
                  ...state.players.P1,
                  board: {
                    ...state.players.P1.board,
                    [element]: { yin: combo.yin, yang: combo.yang },
                  },
                },
              },
            };

            const actions = getAvailableActions(state, yinStem);
            const convertActions = actions.filter((a) => a.actionType === ActionType.CONVERT);

            expect(convertActions).toHaveLength(1);
            expect(convertActions[0]).toEqual({
              actionType: ActionType.CONVERT,
              player: 'P1',
              element,
              polarity: Polarity.YANG,
            });
          });
        }

        // Permutations where opposite side (YANG) >= 1: CONVERT MUST BE STRICTLY PROHIBITED
        const prohibitedCombinations = [
          { yin: 1, yang: 1, label: '(1, 1)' },
          { yin: 1, yang: 2, label: '(1, 2)' },
          { yin: 2, yang: 1, label: '(2, 1)' },
          { yin: 2, yang: 2, label: '(2, 2)' },
        ];

        for (const combo of prohibitedCombinations) {
          it(`[${element}] Yin Stem (${yinStem.name}) at ${combo.label} strictly prohibits CONVERT`, () => {
            let state = createInitialGameState();
            state = {
              ...state,
              players: {
                ...state.players,
                P1: {
                  ...state.players.P1,
                  board: {
                    ...state.players.P1.board,
                    [element]: { yin: combo.yin, yang: combo.yang },
                  },
                },
              },
            };

            const actions = getAvailableActions(state, yinStem);
            const convertActions = actions.filter((a) => a.actionType === ActionType.CONVERT);
            expect(convertActions).toHaveLength(0);
          });
        }
      }
    });
  });

  describe('2. Mid-State Extreme Targets: 强化门槛放开后的候选集与结算', () => {
    describe('2.1 Exhaustive 5-Element Mid-State: Yang Stems', () => {
      for (const element of ALL_ELEMENTS) {
        const yangStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === element && tg.polarity === Polarity.YANG,
        )!;
        const keTarget = OVERCOMING_CYCLE[element];
        const shengTarget = GENERATION_CYCLE[element];

        it(`[${element}] Yang stem (${yangStem.name}) 相生 (2, 2) 且相克 (-1, -1) 时强化与强破并列，强化结算为连动`, () => {
          let state = createInitialGameState();
          // P1: current element is (1, 1) -> CONVERT blocked because opposite (yin) is 1
          // P1: shengTarget is (2, 2) -> 强化门槛放开后仍可发动（满溢则亏）
          // P2: keTarget is (-1, -1) -> ATK 被封死；强破门槛放开后仍可发动（见底即止）
          state = {
            ...state,
            players: {
              ...state.players,
              P1: {
                ...state.players.P1,
                score: 150,
                board: {
                  ...state.players.P1.board,
                  [element]: { yin: 1, yang: 1 },
                  [shengTarget]: { yin: 2, yang: 2 },
                },
              },
              P2: {
                ...state.players.P2,
                score: 80,
                board: {
                  ...state.players.P2.board,
                  [keTarget]: { yin: -1, yang: -1 },
                },
              },
            },
          };

          const actions = getAvailableActions(state, yangStem);

          expect(actions).toEqual([
            {
              actionType: ActionType.BURST,
              player: 'P1',
              sourceElement: element,
              consumePolarity: Polarity.YIN,
            },
            {
              actionType: ActionType.BURST_ATK,
              player: 'P1',
              sourceElement: element,
              consumePolarity: Polarity.YANG,
            },
          ]);

          const result = resolver.resolve(state, actions[0]);

          expect(result.success).toBe(true);
          expect(result.extraTurn).toBe(true);
          // 相生目标 (2, 2) 净零：100 行为分 + 一次溢出（0 分）+ 一次加持 (200)
          expect(result.scoreDelta).toBe(300);
          expect(result.nextState.players.P1.score).toBe(450);
          expect(result.nextState.players.P2.score).toBe(80);
          expect(result.nextState.players.P1.board[element]).toEqual({ yin: 0, yang: 1 });
          expect(result.nextState.players.P1.board[shengTarget]).toEqual({ yin: 2, yang: 2 });
          // 连动：行动权留在 P1，回合不推进
          expect(result.nextState.currentPlayer).toBe('P1');
          expect(result.nextState.round).toBe(state.round);
        });
      }
    });

    describe('2.2 Exhaustive 5-Element Mid-State: Yin Stems', () => {
      for (const element of ALL_ELEMENTS) {
        const yinStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === element && tg.polarity === Polarity.YIN,
        )!;
        const shengTarget = GENERATION_CYCLE[element];
        const keTarget = OVERCOMING_CYCLE[element];

        it(`[${element}] Yin stem (${yinStem.name}) 相生 (2, 2) 且相克 (-1, -1) 时强化与强破并列，强化结算为连动`, () => {
          let state = createInitialGameState();
          // P1: current element is (1, 1) -> CONVERT blocked because opposite (yang) is 1
          // P1: shengTarget is (2, 2) -> TRANS blocked；强化门槛放开后仍可发动（满溢则亏）
          // P2: keTarget is (-1, -1) -> 强破门槛放开后仍可发动（见底即止）
          state = {
            ...state,
            players: {
              ...state.players,
              P1: {
                ...state.players.P1,
                score: 200,
                board: {
                  ...state.players.P1.board,
                  [element]: { yin: 1, yang: 1 },
                  [shengTarget]: { yin: 2, yang: 2 },
                },
              },
              P2: {
                ...state.players.P2,
                score: 110,
                board: {
                  ...state.players.P2.board,
                  [keTarget]: { yin: -1, yang: -1 },
                },
              },
            },
          };

          const actions = getAvailableActions(state, yinStem);

          expect(actions).toEqual([
            {
              actionType: ActionType.BURST,
              player: 'P1',
              sourceElement: element,
              consumePolarity: Polarity.YIN,
            },
            {
              actionType: ActionType.BURST_ATK,
              player: 'P1',
              sourceElement: element,
              consumePolarity: Polarity.YANG,
            },
          ]);

          const result = resolver.resolve(state, actions[0]);

          expect(result.success).toBe(true);
          expect(result.extraTurn).toBe(true);
          expect(result.scoreDelta).toBe(300);
          expect(result.nextState.players.P1.score).toBe(500);
          expect(result.nextState.players.P2.score).toBe(110);
          expect(result.nextState.players.P1.board[element]).toEqual({ yin: 0, yang: 1 });
          expect(result.nextState.players.P1.board[shengTarget]).toEqual({ yin: 2, yang: 2 });
          expect(result.nextState.currentPlayer).toBe('P1');
          expect(result.nextState.round).toBe(state.round);
        });
      }
    });

    describe('2.3 Non-GuiYi Mid-State Asymmetric Combinations ((2, 1) and (1, 2))', () => {
      it('强化与强破并列 when stem node is (yin: 2, yang: 1) for Yang stem and ke target is damaged', () => {
        let state = createInitialGameState();
        // WOOD: yin 2, yang 1. Drawn stem is YANG (甲木).
        // Opposite side is YIN (2) -> CONVERT prohibited.
        // Node is GuiYi (yin 2, yang 1) -> BURST available.
        // Overcoming target EARTH is (-1, -1) -> ATK blocked；强破门槛放开后仍可发动（见底即止）；shengTarget FIRE is (2, 2)
        state = {
          ...state,
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [WuXing.WOOD]: { yin: 2, yang: 1 },
                [WuXing.FIRE]: { yin: 2, yang: 2 },
              },
            },
            P2: {
              ...state.players.P2,
              board: {
                ...state.players.P2.board,
                [WuXing.EARTH]: { yin: -1, yang: -1 },
              },
            },
          },
        };

        const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!;
        const actions = getAvailableActions(state, jiaWood);
        expect(actions.map((a) => a.actionType)).toEqual([ActionType.BURST, ActionType.BURST_ATK]);
      });

      it('强化与强破并列 when stem node is (yin: 1, yang: 2) for Yin stem and ke target is damaged', () => {
        let state = createInitialGameState();
        // FIRE: yin 1, yang 2. Drawn stem is YIN (丁火).
        // Opposite side is YANG (2) -> CONVERT prohibited.
        // Node is GuiYi (yin 1, yang 2) -> BURST available.
        // Generation target EARTH is (2, 2) -> TRANS blocked；overcome target METAL is (-1, -1) -> 强破门槛放开后仍可发动（见底即止）
        state = {
          ...state,
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [WuXing.FIRE]: { yin: 1, yang: 2 },
                [WuXing.EARTH]: { yin: 2, yang: 2 },
              },
            },
            P2: {
              ...state.players.P2,
              board: {
                ...state.players.P2.board,
                [WuXing.METAL]: { yin: -1, yang: -1 },
              },
            },
          },
        };

        const dingFire = TIAN_GAN_LIST.find((tg) => tg.name === '丁')!;
        const actions = getAvailableActions(state, dingFire);
        expect(actions.map((a) => a.actionType)).toEqual([ActionType.BURST, ActionType.BURST_ATK]);
      });
    });

    describe('2.4 Extra Turn Dead-End Scenarios', () => {
      it('triggers PASS during extra turn when normal action targets are unavailable', () => {
        let state = createInitialGameState();
        // Extra turn prohibits BURST & BURST_ATK
        // P1 WOOD (1, 1), P2 EARTH (-1, -1)
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
            P2: {
              ...state.players.P2,
              board: {
                ...state.players.P2.board,
                [WuXing.EARTH]: { yin: -1, yang: -1 },
              },
            },
          },
        };

        const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!;
        const actions = getAvailableActions(state, jiaWood, { isExtraTurn: true });

        expect(actions).toHaveLength(1);
        expect(actions[0].actionType).toBe(ActionType.PASS);

        const result = resolver.resolve(state, actions[0]);
        expect(result.success).toBe(true);
        expect(result.scoreDelta).toBe(0);
        expect(result.extraTurn).toBe(false);
        expect(result.nextState.currentPlayer).toBe('P2');
      });

      it('advances round properly when P2 resolves PASS', () => {
        let state = createInitialGameState();
        state = {
          ...state,
          currentPlayer: 'P2',
          round: 3,
          players: {
            ...state.players,
            P2: {
              ...state.players.P2,
              score: 50,
              board: {
                ...state.players.P2.board,
                [WuXing.WATER]: { yin: 1, yang: 1 },
                [WuXing.WOOD]: { yin: 2, yang: 2 },
              },
            },
            P1: {
              ...state.players.P1,
              score: 75,
              board: {
                ...state.players.P1.board,
                [WuXing.FIRE]: { yin: -1, yang: -1 },
              },
            },
          },
        };

        // 强化门槛放开后，这一盘面不再生成 PASS（唯一候选是强化），
        // 故直接构造 PASS 载荷，继续钉住「PASS 闭合大回合并推进回合数」的契约。
        const passAction: ActionPayload = {
          actionType: ActionType.PASS,
          player: 'P2',
          element: WuXing.WATER,
          polarity: Polarity.YANG,
        };
        const result = resolver.resolve(state, passAction);
        expect(result.success).toBe(true);
        expect(result.scoreDelta).toBe(0);
        expect(result.nextState.currentPlayer).toBe('P1');
        expect(result.nextState.round).toBe(4);
      });
    });
  });

  describe('3. AI Strategy Evaluator & Decision Integration with PASS', () => {
    const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!;

    it('ActionEvaluator returns neutral score (0) and clean breakdown for PASS', () => {
      const state = createInitialGameState();
      const passAction: ActionPayload = {
        actionType: ActionType.PASS,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG,
      };

      const score = evaluator.evaluate(state, jiaWood, passAction);

      expect(score.score).toBe(0);
      expect(score.breakdown.repairScore).toBe(0);
      expect(score.breakdown.unityScore).toBe(0);
      expect(score.breakdown.suppressionScore).toBe(0);
      expect(score.breakdown.burstScore).toBe(0);
      expect(score.breakdown.scoreDeltaPoints).toBe(0);
      expect(score.breakdown.biasScore).toBe(0);
      expect(score.breakdown.totalScore).toBe(0);
    });

    it('ActionEvaluator applies baseActionBias to PASS if configured', () => {
      const state = createInitialGameState();
      const passAction: ActionPayload = {
        actionType: ActionType.PASS,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG,
      };

      const weights = {
        ...DEFAULT_STRATEGY_WEIGHTS,
        baseActionBias: { [ActionType.PASS]: -15 },
      };

      const score = evaluator.evaluate(state, jiaWood, passAction, weights);
      expect(score.score).toBe(-15);
      expect(score.breakdown.biasScore).toBe(-15);
    });

    it('all preset strategies select PASS when PASS is the sole candidate action', () => {
      // 强化门槛放开后，中位态总能给出合法动作，PASS 只在连动额外行动中出现；
      // 因此这里直接给出唯一候选，继续钉住预设策略对 PASS 单候选的处理。
      const passAction: ActionPayload = {
        actionType: ActionType.PASS,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG,
      };
      const state = createInitialGameState();

      const strategies = [
        { name: 'balancedStrategy', fn: balancedStrategy },
        { name: 'rushGuiyuanStrategy', fn: rushGuiyuanStrategy },
        { name: 'aggressiveStrategy', fn: aggressiveStrategy },
        { name: 'defensiveStrategy', fn: defensiveStrategy },
      ];

      for (const { name, fn } of strategies) {
        const decision = fn(state, jiaWood, [passAction]);
        expect(decision.actionType, `${name} should select PASS`).toBe(ActionType.PASS);
        expect(decision.player).toBe('P1');
      }
    });

    it('custom strategy handles PASS candidates smoothly without error', () => {
      const customStrategy = createStrategy({
        scoreDeltaWeight: 1.5,
        baseActionBias: { [ActionType.PASS]: 0 },
      });

      const passAction: ActionPayload = {
        actionType: ActionType.PASS,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG,
      };

      const state = createInitialGameState();
      const decision = customStrategy(state, jiaWood, [passAction]);
      expect(decision).toEqual(passAction);
    });

    it('TurnManager executes turn smoothly when the AI strategy takes the 强化 candidate', () => {
      const baseState = createInitialGameState();
      // Configure state so drawn stem 甲木 hits the extreme-target scenario without triggering 5-element GuiYuan
      const deadEndState: GameState = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            score: 100,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 },
              [WuXing.FIRE]: { yin: 2, yang: 2 },
            },
          },
          P2: {
            ...baseState.players.P2,
            score: 50,
            board: {
              ...baseState.players.P2.board,
              [WuXing.EARTH]: { yin: -1, yang: -1 },
            },
          },
        },
      };

      // PRNG that consistently draws index 0: 甲木 (WOOD, YANG)
      const deterministicPrng = {
        next: () => 0,
        nextInt: () => 0,
        getState: () => 0,
      };

      const turnManager = new TurnManager({
        initialState: deadEndState,
        prng: deterministicPrng,
      });

      // Execute turn with balancedStrategy: 甲木 相生目标 (2, 2) -> 候选【强化】【强破】，策略选中强化
      const result = turnManager.executeTurnWithStrategy(balancedStrategy);

      expect(result.success).toBe(true);
      // 100 行为分 + 一次溢出（0 分）+ 一次加持 (200)
      expect(result.scoreDelta).toBe(300);
      expect(turnManager.getState().players.P1.score).toBe(400);
      // 连动：行动权留在 P1，回合不推进
      expect(turnManager.getState().currentPlayer).toBe('P1');
      expect(turnManager.isExtraTurnActive()).toBe(true);
      expect(turnManager.getState().isGameOver).toBe(false);
    });
  });

  describe('4. Headless Match Regression & Deadlock Prevention', () => {
    it('HeadlessMatch runs to completion without deadlock when encountering PASS candidates', () => {
      const match = new HeadlessMatch();

      // Test a batch of seeds to ensure no crashes or deadlocks across various random distributions
      const testSeeds = [1001, 2024, 99999, 42, 777];

      for (const seed of testSeeds) {
        const result = match.run(balancedStrategy, balancedStrategy, {
          seed,
          maxRounds: 30,
        });

        expect(result.roundsPlayed).toBeGreaterThanOrEqual(1);
        expect(result.finalState).toBeDefined();
        expect(typeof result.finalP1Score).toBe('number');
        expect(typeof result.finalP2Score).toBe('number');
        expect(['P1', 'P2', 'DRAW', null]).toContain(result.winner);
      }
    });

    it('HeadlessMatch reproduces deterministic game record across all strategies', () => {
      const match = new HeadlessMatch();
      const run1 = match.run(rushGuiyuanStrategy, aggressiveStrategy, {
        seed: 45678,
        maxRounds: 25,
      });
      const run2 = match.run(rushGuiyuanStrategy, aggressiveStrategy, {
        seed: 45678,
        maxRounds: 25,
      });

      expect(run1.roundsPlayed).toBe(run2.roundsPlayed);
      expect(run1.winner).toBe(run2.winner);
      expect(run1.finalP1Score).toBe(run2.finalP1Score);
      expect(run1.finalP2Score).toBe(run2.finalP2Score);
      expect(run1.record.actions).toEqual(run2.record.actions);
    });
  });
});

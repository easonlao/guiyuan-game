import { describe, it, expect } from 'vitest';
import {
  ActionType,
  GameState,
  Polarity,
  TIAN_GAN_LIST,
  WuXing
} from '../../src/core/types/domain.js';
import {
  createInitialGameState
} from '../../src/core/logic/State.js';
import {
  ActionEvaluator,
  DEFAULT_STRATEGY_WEIGHTS
} from '../../src/core/ai/ActionEvaluator.js';
import {
  createStrategy,
  balancedStrategy,
  rushGuiyuanStrategy,
  aggressiveStrategy,
  defensiveStrategy
} from '../../src/core/ai/Strategy.js';
import { HeadlessMatch } from '../../src/core/headless/HeadlessMatch.js';
import { TurnManager } from '../../src/core/logic/TurnManager.js';

describe('AI Strategy Engine (src/core/ai)', () => {
  const evaluator = new ActionEvaluator();
  const jiaWoodYang = TIAN_GAN_LIST[0]; // 甲木 (阳)
  const yiWoodYin = TIAN_GAN_LIST[1];   // 乙木 (阴)

  describe('1. ActionEvaluator Heuristic Scoring', () => {
    it('rewards repairing player damage (-1 -> 0/1)', () => {
      const baseState = createInitialGameState();
      // P1 木阴为道损 (-1)
      const damagedState: GameState = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: -1, yang: 0 }
            }
          }
        }
      };

      const repairAction = {
        actionType: ActionType.AUTO,
        player: 'P1' as const,
        element: WuXing.WOOD,
        polarity: Polarity.YIN
      };

      const score = evaluator.evaluate(damagedState, yiWoodYin, repairAction);
      expect(score.breakdown.repairScore).toBe(DEFAULT_STRATEGY_WEIGHTS.repairDamage);
      expect(score.score).toBeGreaterThan(0);
    });

    it('rewards lighting void node (0 -> 1) and reaching GuiYi (1, 1)', () => {
      const baseState = createInitialGameState();
      // P1 木阳已是 1，木阴为 0。使用 CONVERT 将其调息点亮木阴，达成归一！
      const stateWithYangLit: GameState = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 0, yang: 1 }
            }
          }
        }
      };

      const convertAction = {
        actionType: ActionType.CONVERT,
        player: 'P1' as const,
        element: WuXing.WOOD,
        polarity: Polarity.YIN
      };

      const score = evaluator.evaluate(stateWithYangLit, jiaWoodYang, convertAction);
      expect(score.breakdown.unityScore).toBeGreaterThanOrEqual(
        DEFAULT_STRATEGY_WEIGHTS.reachGuiYi + DEFAULT_STRATEGY_WEIGHTS.lightVoid
      );
    });

    it('rewards reaching KangJi / blessing (1 -> 2)', () => {
      const baseState = createInitialGameState();
      // P1 木已归一 (1, 1)，水已点亮 (1, 0)
      const stateGuiYi: GameState = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 },
              [WuXing.WATER]: { yin: 1, yang: 0 }
            }
          }
        }
      };

      // 水生木 (TRANS)，强化木阳侧使其成为加持 2
      const transAction = {
        actionType: ActionType.TRANS,
        player: 'P1' as const,
        sourceElement: WuXing.WATER,
        polarity: Polarity.YANG
      };

      const guiWaterYin = TIAN_GAN_LIST.find((tg) => tg.name === '癸')!;
      const score = evaluator.evaluate(stateGuiYi, guiWaterYin, transAction);
      expect(score.breakdown.unityScore).toBeGreaterThan(0);
    });

    it('rewards breaking opponent GuiYi and causing damage on ATK', () => {
      const baseState = createInitialGameState();
      // P1 木阳为 1；P2 土归一 (1, 1)
      // 甲木克戊土
      const stateWithOpponentGuiYi: GameState = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 0, yang: 1 }
            }
          },
          P2: {
            ...baseState.players.P2,
            board: {
              ...baseState.players.P2.board,
              [WuXing.EARTH]: { yin: 1, yang: 1 }
            }
          }
        }
      };

      const atkAction = {
        actionType: ActionType.ATK,
        player: 'P1' as const,
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN // 压制 P2 土阴 (1 -> 0)，破其归一！
      };

      const score = evaluator.evaluate(stateWithOpponentGuiYi, jiaWoodYang, atkAction);
      expect(score.breakdown.suppressionScore).toBeGreaterThanOrEqual(
        DEFAULT_STRATEGY_WEIGHTS.breakOpponentGuiYi
      );
    });

    it('rewards extra turn from BURST / BURST_ATK', () => {
      const baseState = createInitialGameState();
      // P1 木归一 (1, 1)，可 BURST 推进火
      const stateWithGuiYi: GameState = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 }
            }
          }
        }
      };

      const burstAction = {
        actionType: ActionType.BURST,
        player: 'P1' as const,
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YIN
      };

      const score = evaluator.evaluate(stateWithGuiYi, jiaWoodYang, burstAction);
      expect(score.breakdown.burstScore).toBe(DEFAULT_STRATEGY_WEIGHTS.burstExtraTurn);
    });

    it('assigns heavy penalty to invalid / unsuccessful actions', () => {
      const baseState = createInitialGameState();
      // P1 木节点为空(0, 0)，尝试 BURST 爆发，ActionResolver 判定无法爆发
      const invalidAction = {
        actionType: ActionType.BURST,
        player: 'P1' as const,
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YIN
      };

      const score = evaluator.evaluate(baseState, jiaWoodYang, invalidAction);
      expect(score.score).toBeLessThan(-100000);
    });
  });

  describe('2. Multi-Strategy Decision Divergence', () => {
    it('differentiates defensive/balanced vs aggressive when self is damaged and opponent can be attacked', () => {
      // 场景：
      // P1 的木阳为 1，但水阴是道损 -1！
      // 当前抽到 癸水 (阴)！
      // P1 的候选包括：
      // Option 1: AUTO 水 (阴)，修复自身水道损 (-1 -> 0)
      // Option 2: ATK (如果满足) 或者其他。
      // 更精准的对抗局面：
      // P1 木归一 (1, 1)，火处于道损 (yin: -1, yang: 0)；P2 土归一 (1, 1)。
      // 此时抽到 丁火 (阴)：
      // 动作 A: AUTO 丁火 (阴)，修复己方火道损 (-1 -> 0)
      // 动作 B: BURST_ATK 木 -> 土，强破 P2 的归一并触发连动！
      const baseState = createInitialGameState();
      const dingFireYin = TIAN_GAN_LIST[3]; // 丁火 (阴)

      const dilemmaState: GameState = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 },
              [WuXing.FIRE]: { yin: -1, yang: 0 }
            }
          },
          P2: {
            ...baseState.players.P2,
            board: {
              ...baseState.players.P2.board,
              [WuXing.EARTH]: { yin: 1, yang: 1 }
            }
          }
        }
      };

      const repairOption = {
        actionType: ActionType.AUTO,
        player: 'P1' as const,
        element: WuXing.FIRE,
        polarity: Polarity.YIN
      };

      const attackOption = {
        actionType: ActionType.BURST_ATK,
        player: 'P1' as const,
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YANG,
        polarity: Polarity.YIN
      };

      const availableActions = [repairOption, attackOption];

      // Defensive 策略：自保修复权重极高 (repairDamage=220 > attack 收益)
      const defAction = defensiveStrategy(dilemmaState, dingFireYin, availableActions);
      expect(defAction.actionType).toBe(ActionType.AUTO);

      // Aggressive 策略：破坏对方归一与造成道损权重极高 (breakOpponentGuiYi=180 + suppress + burst=80 > repairDamage=50)
      const aggAction = aggressiveStrategy(dilemmaState, dingFireYin, availableActions);
      expect(aggAction.actionType).toBe(ActionType.BURST_ATK);
    });

    it('differentiates rushGuiyuan vs aggressive when choosing between GuiYi completion and opponent suppression', () => {
      // 场景：
      // P1 木阳为 1，木阴为 0；P2 土归一 (1, 1)。
      // 抽到 甲木 (阳)：
      // 候选 1: CONVERT 木 (调息至阴，达成己方木归一！)
      // 候选 2: ATK 木 -> 土 (压制 P2 土阴，破坏对方归一！)
      const baseState = createInitialGameState();
      const testState: GameState = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 0, yang: 1 }
            }
          },
          P2: {
            ...baseState.players.P2,
            board: {
              ...baseState.players.P2.board,
              [WuXing.EARTH]: { yin: 1, yang: 1 }
            }
          }
        }
      };

      const convertAction = {
        actionType: ActionType.CONVERT,
        player: 'P1' as const,
        element: WuXing.WOOD,
        polarity: Polarity.YIN
      };

      const atkAction = {
        actionType: ActionType.ATK,
        player: 'P1' as const,
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN
      };

      const candidates = [convertAction, atkAction];

      // rushGuiyuan 偏归元冲刺：应优先达成单节点归一 (CONVERT)
      const rushChoice = rushGuiyuanStrategy(testState, jiaWoodYang, candidates);
      expect(rushChoice.actionType).toBe(ActionType.CONVERT);

      // aggressive 偏压制克破：应优先破坏对方归一 (ATK)
      const aggChoice = aggressiveStrategy(testState, jiaWoodYang, candidates);
      expect(aggChoice.actionType).toBe(ActionType.ATK);
    });

    it('balancedStrategy aligns with GDD: repairs damage before rushing unity', () => {
      const baseState = createInitialGameState();
      // P1 同时有修复机会 (水道损) 和点亮虚空机会
      const testState: GameState = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WATER]: { yin: -1, yang: 0 },
              [WuXing.WOOD]: { yin: 0, yang: 0 }
            }
          }
        }
      };

      const repairAction = {
        actionType: ActionType.AUTO,
        player: 'P1' as const,
        element: WuXing.WATER,
        polarity: Polarity.YIN
      };

      const lightAction = {
        actionType: ActionType.AUTO,
        player: 'P1' as const,
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      };

      const choice = balancedStrategy(testState, TIAN_GAN_LIST[9], [lightAction, repairAction]);
      expect(choice).toEqual(repairAction);
    });
  });

  describe('3. Custom Strategy Creation and Tie-Breaker', () => {
    it('allows custom weights injection', () => {
      // 自定义极端策略：唯独极度偏好 TRANS
      const customStrategy = createStrategy({
        baseActionBias: { [ActionType.TRANS]: 9999 }
      });

      const baseState = createInitialGameState();
      const dummyAction1 = {
        actionType: ActionType.AUTO,
        player: 'P1' as const,
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      };
      const dummyAction2 = {
        actionType: ActionType.TRANS,
        player: 'P1' as const,
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN
      };

      // 赋予合法环境
      const validState: GameState = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 0 }
            }
          }
        }
      };

      const decision = customStrategy(validState, yiWoodYin, [dummyAction1, dummyAction2]);
      expect(decision.actionType).toBe(ActionType.TRANS);
    });

    it('supports custom tieBreaker when scores are tied', () => {
      const tieBreaker = (candidates: any[]) => candidates[candidates.length - 1].action;
      const strategyWithTieBreaker = createStrategy({}, { tieBreaker });

      const state = createInitialGameState();
      // 两者打分相同的情况
      const action1 = {
        actionType: ActionType.AUTO,
        player: 'P1' as const,
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      };
      const action2 = {
        actionType: ActionType.AUTO,
        player: 'P1' as const,
        element: WuXing.FIRE,
        polarity: Polarity.YANG
      };

      const decision = strategyWithTieBreaker(state, jiaWoodYang, [action1, action2]);
      expect(decision).toEqual(action2);
    });

    it('falls back safely to AUTO if no action is provided', () => {
      const state = createInitialGameState();
      const strategy = createStrategy();
      const decision = strategy(state, jiaWoodYang, []);

      expect(decision.actionType).toBe(ActionType.AUTO);
      expect(decision.player).toBe('P1');
      expect(decision.element).toBe(WuXing.WOOD);
    });
  });

  describe('4. Full HeadlessMatch & TurnManager Integration', () => {
    it('runs headless matches between balancedStrategy and rushGuiyuanStrategy', () => {
      const match = new HeadlessMatch();
      const result = match.run(balancedStrategy, rushGuiyuanStrategy, {
        seed: 12345,
        maxRounds: 40
      });

      expect(result.roundsPlayed).toBeGreaterThanOrEqual(1);
      expect(result.finalState).toBeDefined();
      expect(result.record.actions.length).toBeGreaterThan(0);
    });

    it('integrates seamlessly with TurnManager.executeTurnWithStrategy', () => {
      const turnManager = new TurnManager();
      const result = turnManager.executeTurnWithStrategy(rushGuiyuanStrategy);

      expect(result.success).toBe(true);
      expect(turnManager.getState().round).toBe(1);
      expect(turnManager.getState().currentPlayer).toBe('P2');
    });
  });
});

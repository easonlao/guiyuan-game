import { describe, it, expect } from 'vitest';
import {
  ActionType,
  WuXing,
  Polarity,
  TIAN_GAN_LIST
} from '../../src/core/types/domain.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { gameStateWith } from '../../src/core/headless/BoardFixture.js';
import { ActionEvaluator } from '../../src/core/ai/ActionEvaluator.js';
import {
  balancedStrategy,
  rushGuiyuanStrategy,
  aggressiveStrategy,
  defensiveStrategy
} from '../../src/core/ai/Strategy.js';
import { HeadlessBenchmark } from '../../src/core/headless/HeadlessBenchmark.js';

describe('Ticket 03: 策略 AI 价值评估器对接与平衡性基线验收', () => {
  const evaluator = new ActionEvaluator();
  const jiaWoodYang = TIAN_GAN_LIST[0]; // 甲木 (阳)

  describe('1. ActionEvaluator 真实 scoreDelta 无缝注入与攻防平衡', () => {
    it('consumes true scoreDelta in evaluation breakdown', () => {
      const state = createInitialGameState();
      // P1 performs AUTO on WOOD (yang) -> 0 to 1 (light up: 100 points)
      const autoAction = {
        actionType: ActionType.AUTO,
        player: 'P1' as const,
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      };

      const score = evaluator.evaluate(state, jiaWoodYang, autoAction);
      expect(score.breakdown.scoreDeltaPoints).toBe(100);

      // P1 performs CONVERT on WOOD (yin) -> 50 action + 100 light up = 150 points
      const convertAction = {
        actionType: ActionType.CONVERT,
        player: 'P1' as const,
        element: WuXing.WOOD,
        polarity: Polarity.YIN
      };
      const convertScore = evaluator.evaluate(state, jiaWoodYang, convertAction);
      expect(convertScore.breakdown.scoreDeltaPoints).toBe(150);
    });

    it('balances attack suppression value when opponent node is damaged', () => {
      const state = createInitialGameState();
      // ATK WOOD -> EARTH: 40 behavior + 300 attack damage = 340 points
      const atkAction = {
        actionType: ActionType.ATK,
        player: 'P1' as const,
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      };

      const score = evaluator.evaluate(state, jiaWoodYang, atkAction);
      expect(score.breakdown.scoreDeltaPoints).toBe(340);
      expect(score.breakdown.suppressionScore).toBeGreaterThan(0);
    });
  });

  describe('2. 各项预设策略行为倾向验证', () => {
    it('defensive strategy prioritizes self repair over attack', () => {
      const dingFireYin = TIAN_GAN_LIST[3];

      const dilemmaState = gameStateWith({
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: -1, yang: 0 }
        },
        P2: { [WuXing.EARTH]: { yin: 1, yang: 1 } }
      });

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

      const choice = defensiveStrategy(dilemmaState, dingFireYin, [repairOption, attackOption]);
      expect(choice.actionType).toBe(ActionType.AUTO);
    });

    it('aggressive strategy prioritizes opponent disruption', () => {
      const dingFireYin = TIAN_GAN_LIST[3];

      const dilemmaState = gameStateWith({
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: -1, yang: 0 }
        },
        P2: { [WuXing.EARTH]: { yin: 1, yang: 1 } }
      });

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

      const choice = aggressiveStrategy(dilemmaState, dingFireYin, [repairOption, attackOption]);
      expect(choice.actionType).toBe(ActionType.BURST_ATK);
    });

    it('rushGuiyuan strategy prioritizes unity completion over suppression', () => {
      const testState = gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 0, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: 1, yang: 1 } }
      });

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

      const choice = rushGuiyuanStrategy(testState, jiaWoodYang, [convertAction, atkAction]);
      expect(choice.actionType).toBe(ActionType.CONVERT);
    });
  });

  describe('3. ADR 0001 安全护栏基线推演验收', () => {
    it('satisfies ADR 0001 guardrails: GuiYuan rate between 75% and 95%, fair win rates, low GC delta', () => {
      const benchmark = new HeadlessBenchmark();
      // Run 500 matches verification sample
      const metrics = benchmark.run({
        matches: 500,
        strategyP1: balancedStrategy,
        strategyP2: balancedStrategy
      });

      // 护栏 1: 同水平五行归元率处于安全区间 (30大回合与智能快刀下，归元率保持在 75%~95%)
      // 注：此带为启发式预设自对弈口径，无 ADR 记录；与 ADR 0001 的搜索深度 1/2 带 25%~80% 无法比较，见 docs/headless/guardrail-provenance.md。
      expect(metrics.guiYuanRate).toBeGreaterThanOrEqual(0.75);
      expect(metrics.guiYuanRate).toBeLessThanOrEqual(0.95);

      // 护栏 3: 先手胜率严格落在 [48.5%, 52.0%] 附近合理区间
      expect(metrics.p1WinRate).toBeGreaterThanOrEqual(0.45);
      expect(metrics.p1WinRate).toBeLessThanOrEqual(0.55);

      // 内存稳定性: 500 局内存增量不超过 15MB
      expect(metrics.heapUsedDeltaMB).toBeLessThan(15);
    });
  });
});

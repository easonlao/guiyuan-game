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
import {
  checkGuardrailBand
} from '../../src/core/headless/GuardrailBand.js';

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
      // ATK WOOD -> EARTH：行为分 40 + 攻击状态分。
      // 工单 06 采纳进度定价后，对手盘面 0 个归一节点 → ×0.3：round(300 × 0.3) = 90。
      // 故 40 + 90 = 130（采纳前为 340）。
      const atkAction = {
        actionType: ActionType.ATK,
        player: 'P1' as const,
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      };

      const score = evaluator.evaluate(state, jiaWoodYang, atkAction);
      expect(score.breakdown.scoreDeltaPoints).toBe(130);
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

  describe('3. live 启发式预设护栏基线推演验收', () => {
    it('satisfies the live heuristic-preset guardrails: GuiYuan rate between 89% and 95%, fair win rates, low GC delta', () => {
      const benchmark = new HeadlessBenchmark();
      // Run 500 matches verification sample
      const metrics = benchmark.run({
        matches: 500,
        strategyP1: balancedStrategy,
        strategyP2: balancedStrategy
      });

      // 护栏 1/3/内存：与带比较的唯一实现是 `checkGuardrailBand`
      // （`src/core/headless/GuardrailBand.ts`）。本测试只调用谓词、不与任何数字比较，
      // 因此没有可硬编码的副本。锚点 = 500 局平衡自对弈、baseSeed 默认 10000、
      // maxRounds 默认 30 下的实测 90.40%（同口径先手 50.40%）。带为何取
      // 0.89 / 0.95 / 0.47 / 0.51（把「无进度定价」的回退 88.40% / 51.20% 挡在带外）
      // 见 GuardrailBand.ts 的常量注释与 ADR 0011。失败时 `toEqual([])` 的 diff
      // 会列出每条违规的 bound / actual / boundValue。
      expect(
        checkGuardrailBand({
          guiYuanRate: metrics.guiYuanRate,
          p1WinRate: metrics.p1WinRate,
          heapUsedDeltaMB: metrics.heapUsedDeltaMB
        })
      ).toEqual([]);
    });
  });
});

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
    it('satisfies the live heuristic-preset guardrails: GuiYuan rate between 75% and 95%, fair win rates, low GC delta', () => {
      const benchmark = new HeadlessBenchmark();
      // Run 500 matches verification sample
      const metrics = benchmark.run({
        matches: 500,
        strategyP1: balancedStrategy,
        strategyP2: balancedStrategy
      });

      // 护栏 1: 同水平五行归元率处于安全区间。
      // 工单 06 采纳进度定价后按新规则重设（spec 决策 13）：旧带 [0.75, 0.95] 描述的是
      // 改动前现状（基线约 88.4%），不是新游戏的目标值。新锚点 = 500 局平衡自对弈、
      // 种子 10000、30 大回合下的实测 90.40%；新带 [0.86, 0.95] 围绕锚点收紧下界，
      // 仍拒绝 ADR 0010 的极端候选（attack-zero 把归元率推到 ≈99.9%）。
      // 口径记录见 ADR 0011「决策 2」与追加的「采纳记录」。
      expect(metrics.guiYuanRate).toBeGreaterThanOrEqual(0.86);
      expect(metrics.guiYuanRate).toBeLessThanOrEqual(0.95);

      // 护栏 3: 先手胜率。新锚点实测 50.40%，旧带 [0.45, 0.55] 重新锚定为 [0.47, 0.54]。
      expect(metrics.p1WinRate).toBeGreaterThanOrEqual(0.47);
      expect(metrics.p1WinRate).toBeLessThanOrEqual(0.54);

      // 内存稳定性: 500 局内存增量不超过 15MB
      expect(metrics.heapUsedDeltaMB).toBeLessThan(15);
    });
  });
});

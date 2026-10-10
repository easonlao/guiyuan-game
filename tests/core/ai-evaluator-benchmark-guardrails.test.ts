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
  GUARDRAIL_GUIYUAN_MIN,
  GUARDRAIL_GUIYUAN_MAX,
  GUARDRAIL_P1_WIN_MIN,
  GUARDRAIL_P1_WIN_MAX,
  GUARDRAIL_HEAP_MAX_MB
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

      // 护栏 1: 同水平五行归元率处于安全区间。
      // 锚点 = 500 局平衡自对弈、baseSeed 默认 10000、maxRounds 默认 30 下的实测
      // 90.40%（同口径先手 50.40%）。工单 06 采纳进度定价后按 spec 决策 13 把旧带
      // [0.75, 0.95] 重设为 [0.86, 0.95]，但下界 0.86 仍把「无进度定价」时的 88.40%
      // 包在带内（0.884 >= 0.86 通过），该带本身拦不住这次回退。
      // 后续工单 02 把下界收到 0.89 = 锚点 − 1.4pp，使 88.40% 落在带外。
      // 注意不是 0.88：断言是 >= 下界，0.884 >= 0.88 仍会通过，达不到「回归时带断言
      // 变红」的目的，勿改回 0.88。上界保留 0.95（锚点 + 4.6pp），仍拒绝 ADR 0010 的
      // 极端候选（attack-zero 把归元率推到 ≈99.9%）。
      // 口径记录见 ADR 0011「决策 2」与「采纳记录」。
      // 带值唯一定义在 `src/core/headless/GuardrailBand.ts`，本测试只 import、不硬编码。
      expect(metrics.guiYuanRate).toBeGreaterThanOrEqual(GUARDRAIL_GUIYUAN_MIN);
      expect(metrics.guiYuanRate).toBeLessThanOrEqual(GUARDRAIL_GUIYUAN_MAX);

      // 护栏 3: 先手胜率。锚点实测 50.40%。旧带 [0.47, 0.54] 的上界 0.54 同样包住了
      // 「无进度定价」时的 51.20%（0.512 <= 0.54 通过），故上界收到 0.51 = 锚点 + 0.6pp，
      // 使 51.20% 落在带外；下界 0.47（锚点 − 3.4pp）不变。0.6pp 的余量很薄，是有意为之：
      // 先手胜率的回退幅度只有 0.8pp，不收紧就抓不到。
      expect(metrics.p1WinRate).toBeGreaterThanOrEqual(GUARDRAIL_P1_WIN_MIN);
      expect(metrics.p1WinRate).toBeLessThanOrEqual(GUARDRAIL_P1_WIN_MAX);

      // 内存稳定性: 500 局内存增量不超过 15MB
      expect(metrics.heapUsedDeltaMB).toBeLessThan(GUARDRAIL_HEAP_MAX_MB);
    });
  });
});

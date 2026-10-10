/**
 * Ticket 05 — 死旋钮普查 (Dead Knob Census)
 *
 * 目的：把「哪些可调参数真的被读取」变成可执行断言，使 `docs/headless/knob-census.md`
 * 的活/死清单不能静默腐烂。本文件建立在 Ticket 04 的注入链路验证
 * (`tests/core/injection-path-verification.test.ts`) 之上，不重复其逐注入点行；
 * 这里做的是**逐参数**的三列普查：
 *
 *   (a) AI 估值是否读取它   —— 用 `ActionEvaluator.evaluate(...).score`（AI 的真实估值函数）
 *   (b) 终局判定是否读取它 —— 用 `ActionResolver.resolve(...).nextState.players[].score`（终局分数/胜负）
 *   (c) 扰动后输出是否变化 —— 用同一 `resolve` 的 `scoreDelta` + 终局分数 + 盘面快照
 *
 * 接缝（spec Implementation Decisions 1–3，不新增第三个）：
 *   - 主接缝：HeadlessMatch.run / HeadlessBenchmark.run
 *   - 场景接缝：ActionResolver.resolve（受控盘面）
 *
 * 已确认结论（见文档）：
 *   - 死旋钮：RARITY_MULTIPLIER、NO_RARITY_ACTIONS、ACTION.DISSIPATE、ACTION.PASS
 *   - 仅终局生效（AI 不可见）：DAMAGE_PENALTY
 *   - 规则开关 boardOnly 的活消费者是估值器；MatchOptions/BenchmarkOptions/TurnManager/
 *     ActionCandidates/HeadlessMatchConfig 上的 `rules` 转发当前无消费者（死）。
 */

import { describe, it, expect } from 'vitest';
import {
  ActionType,
  Polarity,
  TIAN_GAN_LIST,
  WuXing,
  type ActionPayload,
  type GameState,
  type TianGanInfo
} from '../../src/core/types/domain.js';
import {
  ScoreCalculator,
  POINTS_CONFIG,
  type PointsConfig
} from '../../src/core/logic/ScoreCalculator.js';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';
import { ActionEvaluator, DEFAULT_STRATEGY_WEIGHTS } from '../../src/core/ai/ActionEvaluator.js';
import {
  BALANCED_WEIGHTS,
  createScoreBoundStrategy,
  balancedStrategy
} from '../../src/core/ai/Strategy.js';
import type { StrategyWeights } from '../../src/core/ai/types.js';
import { gameStateWith } from '../../src/core/headless/BoardFixture.js';
import { HeadlessMatch } from '../../src/core/headless/HeadlessMatch.js';
import { HeadlessBenchmark } from '../../src/core/headless/HeadlessBenchmark.js';

const JIA_WOOD_YANG = TIAN_GAN_LIST[0]; // 甲木（阳）
const YI_WOOD_YIN = TIAN_GAN_LIST[1]; // 乙木（阴）

// ---------------------------------------------------------------------------
// 通用探针
// ---------------------------------------------------------------------------

interface Scenario {
  readonly state: GameState;
  readonly tianGan: TianGanInfo;
  readonly action: ActionPayload;
}

/** AI 估值函数读取的分数（ActionEvaluator 即 AI 的动作估值器）。 */
function aiValuation(config: PointsConfig, s: Scenario): number {
  const evaluator = new ActionEvaluator(new ActionResolver(new ScoreCalculator(config)));
  return evaluator.evaluate(s.state, s.tianGan, s.action).score;
}

/** 终局分数 + 行为快照（ActionResolver 即终局结算与状态转移的唯一入口）。 */
function settlement(config: PointsConfig, s: Scenario): {
  readonly score: number;
  readonly scoreDelta: number;
  readonly board: unknown;
} {
  const resolver = new ActionResolver(new ScoreCalculator(config));
  const result = resolver.resolve({ ...s.state, currentTianGan: s.tianGan }, s.action);
  return {
    score: result.nextState.players[s.action.player].score,
    scoreDelta: result.scoreDelta,
    board: result.nextState.players[s.action.player].board
  };
}

function outputChanged(config: PointsConfig, s: Scenario): boolean {
  const base = settlement(POINTS_CONFIG, s);
  const perturbed = settlement(config, s);
  return (
    base.score !== perturbed.score ||
    base.scoreDelta !== perturbed.scoreDelta ||
    JSON.stringify(base.board) !== JSON.stringify(perturbed.board)
  );
}

// ---------------------------------------------------------------------------
// 计分参数普查 (PointsConfig)
// ---------------------------------------------------------------------------

interface ScoringKnob {
  readonly knob: string;
  /** (a) AI 估值是否读取 */
  readonly aiReads: boolean;
  /** (b) 终局判定是否读取 */
  readonly terminalReads: boolean;
  /** 扰动值（刻意不同，足以改变任何真实读取路径） */
  readonly mutate: () => PointsConfig;
  readonly scenario: () => Scenario;
}

function perturbAction(type: ActionType): PointsConfig {
  return {
    ...POINTS_CONFIG,
    ACTION: { ...POINTS_CONFIG.ACTION, [type]: POINTS_CONFIG.ACTION[type] + 1000 }
  };
}

function perturbStateScalar(key: 'LIGHT_UP' | 'BLESSING' | 'WEAKEN'): PointsConfig {
  return {
    ...POINTS_CONFIG,
    STATE_CHANGE: {
      ...POINTS_CONFIG.STATE_CHANGE,
      [key]: POINTS_CONFIG.STATE_CHANGE[key] + 1000
    }
  };
}

function perturbStatePair(
  key: 'REPAIR_DMG' | 'CAUSE_DMG' | 'BREAK_LIGHT',
  polarity: 'yang' | 'yin'
): PointsConfig {
  const stateChange = POINTS_CONFIG.STATE_CHANGE;
  return {
    ...POINTS_CONFIG,
    STATE_CHANGE: {
      ...stateChange,
      [key]: { ...stateChange[key], [polarity]: stateChange[key][polarity] + 1000 }
    }
  };
}

const AUTO_YANG: ActionPayload = {
  actionType: ActionType.AUTO,
  player: 'P1',
  element: WuXing.WOOD,
  polarity: Polarity.YANG
};

const ATK_YIN: ActionPayload = {
  actionType: ActionType.ATK,
  player: 'P1',
  sourceElement: WuXing.WOOD,
  polarity: Polarity.YIN
};

const SCORING_KNOBS: readonly ScoringKnob[] = [
  {
    knob: 'ACTION.AUTO',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbAction(ActionType.AUTO),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: AUTO_YANG
    })
  },
  {
    knob: 'ACTION.CONVERT',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbAction(ActionType.CONVERT),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 0, yang: 1 } } }),
      tianGan: JIA_WOOD_YANG,
      action: { actionType: ActionType.CONVERT, player: 'P1', element: WuXing.WOOD, polarity: Polarity.YIN }
    })
  },
  {
    knob: 'ACTION.TRANS',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbAction(ActionType.TRANS),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1 }, [WuXing.FIRE]: { yin: 0 } } }),
      tianGan: YI_WOOD_YIN,
      action: { actionType: ActionType.TRANS, player: 'P1', sourceElement: WuXing.WOOD, polarity: Polarity.YIN }
    })
  },
  {
    knob: 'ACTION.ATK',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbAction(ActionType.ATK),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yin: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: ATK_YIN
    })
  },
  {
    knob: 'ACTION.BURST',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbAction(ActionType.BURST),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 }, [WuXing.FIRE]: { yin: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YIN
      }
    })
  },
  {
    knob: 'ACTION.BURST_ATK',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbAction(ActionType.BURST_ATK),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } }, P2: { [WuXing.EARTH]: { yin: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: {
        actionType: ActionType.BURST_ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YANG,
        polarity: Polarity.YIN
      }
    })
  },
  {
    // 死旋钮：ActionResolver 在 DISSIPATE 分支把 scoreDelta 强制为 0，从不读 ACTION.DISSIPATE。
    knob: 'ACTION.DISSIPATE',
    aiReads: false,
    terminalReads: false,
    mutate: () => perturbAction(ActionType.DISSIPATE),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 2, yang: 2 } } }),
      tianGan: JIA_WOOD_YANG,
      action: { actionType: ActionType.DISSIPATE, player: 'P1', element: WuXing.WOOD, polarity: Polarity.YANG }
    })
  },
  {
    // 死旋钮：ActionResolver 在 PASS 分支把 scoreDelta 强制为 0，从不读 ACTION.PASS。
    knob: 'ACTION.PASS',
    aiReads: false,
    terminalReads: false,
    mutate: () => perturbAction(ActionType.PASS),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } } }),
      tianGan: JIA_WOOD_YANG,
      action: { actionType: ActionType.PASS, player: 'P1', element: WuXing.WOOD, polarity: Polarity.YANG }
    })
  },
  {
    knob: 'STATE_CHANGE.REPAIR_DMG.yang',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbStatePair('REPAIR_DMG', 'yang'),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: -1 } } }),
      tianGan: JIA_WOOD_YANG,
      action: AUTO_YANG
    })
  },
  {
    knob: 'STATE_CHANGE.REPAIR_DMG.yin',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbStatePair('REPAIR_DMG', 'yin'),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: -1 } } }),
      tianGan: YI_WOOD_YIN,
      action: { actionType: ActionType.AUTO, player: 'P1', element: WuXing.WOOD, polarity: Polarity.YIN }
    })
  },
  {
    knob: 'STATE_CHANGE.LIGHT_UP',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbStateScalar('LIGHT_UP'),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: AUTO_YANG
    })
  },
  {
    knob: 'STATE_CHANGE.BLESSING',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbStateScalar('BLESSING'),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1 }, [WuXing.FIRE]: { yang: 1 } } }),
      tianGan: YI_WOOD_YIN,
      action: { actionType: ActionType.TRANS, player: 'P1', sourceElement: WuXing.WOOD, polarity: Polarity.YANG }
    })
  },
  {
    knob: 'STATE_CHANGE.CAUSE_DMG.yang',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbStatePair('CAUSE_DMG', 'yang'),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yang: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: { actionType: ActionType.ATK, player: 'P1', sourceElement: WuXing.WOOD, polarity: Polarity.YANG }
    })
  },
  {
    knob: 'STATE_CHANGE.CAUSE_DMG.yin',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbStatePair('CAUSE_DMG', 'yin'),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yin: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: ATK_YIN
    })
  },
  {
    knob: 'STATE_CHANGE.BREAK_LIGHT.yang',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbStatePair('BREAK_LIGHT', 'yang'),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yang: 1 } } }),
      tianGan: JIA_WOOD_YANG,
      action: { actionType: ActionType.ATK, player: 'P1', sourceElement: WuXing.WOOD, polarity: Polarity.YANG }
    })
  },
  {
    knob: 'STATE_CHANGE.BREAK_LIGHT.yin',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbStatePair('BREAK_LIGHT', 'yin'),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yin: 1 } } }),
      tianGan: JIA_WOOD_YANG,
      action: ATK_YIN
    })
  },
  {
    knob: 'STATE_CHANGE.WEAKEN',
    aiReads: true,
    terminalReads: true,
    mutate: () => perturbStateScalar('WEAKEN'),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yang: 2 } } }),
      tianGan: JIA_WOOD_YANG,
      action: { actionType: ActionType.ATK, player: 'P1', sourceElement: WuXing.WOOD, polarity: Polarity.YANG }
    })
  },
  {
    // 死旋钮：applyRarityBonus 在生产路径无调用点；乘数留在配置里只是历史残留。
    knob: 'RARITY_MULTIPLIER',
    aiReads: false,
    terminalReads: false,
    mutate: () => ({ ...POINTS_CONFIG, RARITY_MULTIPLIER: 99 }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yin: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: ATK_YIN
    })
  },
  {
    // 死旋钮：isNoRarityAction 只被 applyRarityBonus 调用，后者无调用点。
    knob: 'NO_RARITY_ACTIONS',
    aiReads: false,
    terminalReads: false,
    mutate: () => ({ ...POINTS_CONFIG, NO_RARITY_ACTIONS: [] }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yin: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: ATK_YIN
    })
  },
  {
    knob: 'GUI_YI_MILESTONE',
    aiReads: true,
    terminalReads: true,
    mutate: () => ({
      ...POINTS_CONFIG,
      GUI_YI_MILESTONE: (POINTS_CONFIG.GUI_YI_MILESTONE ?? 60) + 1000
    }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 0, yang: 1 } } }),
      tianGan: JIA_WOOD_YANG,
      action: { actionType: ActionType.CONVERT, player: 'P1', element: WuXing.WOOD, polarity: Polarity.YIN }
    })
  },
  {
    // 仅终局生效类：只在 MAX_ROUNDS 结算分支从 finalScore 扣减，从不进入 scoreDelta。
    knob: 'DAMAGE_PENALTY',
    aiReads: false,
    terminalReads: true,
    mutate: () => ({ ...POINTS_CONFIG, DAMAGE_PENALTY: 0 }),
    scenario: () => ({
      state: gameStateWith({
        round: 1,
        maxRounds: 1,
        currentPlayer: 'P2',
        P1: { [WuXing.WOOD]: { yin: -1 } },
        P2: { [WuXing.FIRE]: { yang: -1 } }
      }),
      tianGan: JIA_WOOD_YANG,
      action: { actionType: ActionType.PASS, player: 'P2', element: WuXing.WOOD, polarity: Polarity.YANG }
    })
  }
];

describe('Ticket 05 — 计分参数普查 (PointsConfig)：AI 估值 / 终局判定 / 扰动输出', () => {
  for (const row of SCORING_KNOBS) {
    describe(row.knob, () => {
      it(`(a) AI 估值读取 = ${row.aiReads}`, () => {
        const scenario = row.scenario();
        const control = aiValuation(POINTS_CONFIG, scenario);
        const perturbed = aiValuation(row.mutate(), scenario);
        if (row.aiReads) {
          expect(perturbed).not.toBe(control);
        } else {
          expect(perturbed).toBe(control);
        }
      });

      it(`(b) 终局判定读取 = ${row.terminalReads}`, () => {
        const scenario = row.scenario();
        const control = settlement(POINTS_CONFIG, scenario);
        const perturbed = settlement(row.mutate(), scenario);
        if (row.terminalReads) {
          expect(perturbed.score).not.toBe(control.score);
        } else {
          expect(perturbed.score).toBe(control.score);
        }
      });

      it(`(c) 扰动后输出变化 = ${row.aiReads || row.terminalReads}`, () => {
        const scenario = row.scenario();
        expect(outputChanged(row.mutate(), scenario)).toBe(row.aiReads || row.terminalReads);
      });
    });
  }

  it('活参数清单（由三列普查派生）', () => {
    const live = SCORING_KNOBS.filter(row => row.aiReads || row.terminalReads).map(row => row.knob);
    expect(live).toEqual([
      'ACTION.AUTO',
      'ACTION.CONVERT',
      'ACTION.TRANS',
      'ACTION.ATK',
      'ACTION.BURST',
      'ACTION.BURST_ATK',
      'STATE_CHANGE.REPAIR_DMG.yang',
      'STATE_CHANGE.REPAIR_DMG.yin',
      'STATE_CHANGE.LIGHT_UP',
      'STATE_CHANGE.BLESSING',
      'STATE_CHANGE.CAUSE_DMG.yang',
      'STATE_CHANGE.CAUSE_DMG.yin',
      'STATE_CHANGE.BREAK_LIGHT.yang',
      'STATE_CHANGE.BREAK_LIGHT.yin',
      'STATE_CHANGE.WEAKEN',
      'GUI_YI_MILESTONE',
      'DAMAGE_PENALTY'
    ]);
  });

  it('死参数清单（AI 不读、终局不读、扰动无变化）', () => {
    const dead = SCORING_KNOBS.filter(row => !row.aiReads && !row.terminalReads).map(row => row.knob);
    expect(dead).toEqual([
      'ACTION.DISSIPATE',
      'ACTION.PASS',
      'RARITY_MULTIPLIER',
      'NO_RARITY_ACTIONS'
    ]);
  });

  it('「仅终局生效」类当前唯一成员是 DAMAGE_PENALTY（终局读、AI 不读）', () => {
    const terminalOnly = SCORING_KNOBS.filter(row => row.terminalReads && !row.aiReads).map(row => row.knob);
    expect(terminalOnly).toEqual(['DAMAGE_PENALTY']);
  });
});

// ---------------------------------------------------------------------------
// 批量指标层面：死旋钮必须逐格不变，且同一断言下活旋钮必须变化
// ---------------------------------------------------------------------------

/** 剔除运行期噪声（耗时/内存），只留确定性对局指标。 */
function deterministicMetrics(metrics: ReturnType<HeadlessBenchmark['run']>): unknown {
  const {
    totalDurationMs,
    avgDurationMs,
    tps,
    heapUsedDeltaMB,
    heapUsedStartMB,
    heapUsedEndMB,
    ...rest
  } = metrics;
  void totalDurationMs;
  void avgDurationMs;
  void tps;
  void heapUsedDeltaMB;
  void heapUsedStartMB;
  void heapUsedEndMB;
  return rest;
}

describe('Ticket 05 — 死旋钮不改变任何批量指标（同断言下活旋钮必须变化）', () => {
  const base = { matches: 60, baseSeed: 10000, maxRounds: 30 } as const;

  const cases: readonly {
    readonly name: string;
    readonly config: PointsConfig;
    readonly dead: boolean;
  }[] = [
    { name: 'RARITY_MULTIPLIER=99', config: { ...POINTS_CONFIG, RARITY_MULTIPLIER: 99 }, dead: true },
    { name: 'NO_RARITY_ACTIONS=[]', config: { ...POINTS_CONFIG, NO_RARITY_ACTIONS: [] }, dead: true },
    {
      name: 'ACTION.DISSIPATE=999',
      config: { ...POINTS_CONFIG, ACTION: { ...POINTS_CONFIG.ACTION, DISSIPATE: 999 } },
      dead: true
    },
    {
      name: 'ACTION.PASS=999',
      config: { ...POINTS_CONFIG, ACTION: { ...POINTS_CONFIG.ACTION, PASS: 999 } },
      dead: true
    },
    {
      name: '对照：STATE_CHANGE.CAUSE_DMG 放大 10 倍（活旋钮，断言必须有牙齿）',
      config: {
        ...POINTS_CONFIG,
        STATE_CHANGE: {
          ...POINTS_CONFIG.STATE_CHANGE,
          CAUSE_DMG: { yang: 3000, yin: 2500 }
        }
      },
      dead: false
    }
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const benchmark = new HeadlessBenchmark();
      // 同一份配置同时绑定 AI 估值器与解析器，确保配置若被读取，轨迹与指标都会变。
      const defaultStrategy = createScoreBoundStrategy(BALANCED_WEIGHTS, POINTS_CONFIG);
      const perturbedStrategy = createScoreBoundStrategy(BALANCED_WEIGHTS, testCase.config);

      const control = benchmark.run({
        ...base,
        strategyP1: defaultStrategy,
        strategyP2: defaultStrategy,
        scoreConfig: POINTS_CONFIG
      });
      const perturbed = benchmark.run({
        ...base,
        strategyP1: perturbedStrategy,
        strategyP2: perturbedStrategy,
        scoreConfig: testCase.config
      });

      if (testCase.dead) {
        expect(deterministicMetrics(perturbed)).toEqual(deterministicMetrics(control));
      } else {
        expect(deterministicMetrics(perturbed)).not.toEqual(deterministicMetrics(control));
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 规则开关与选项参数普查
// ---------------------------------------------------------------------------

describe('Ticket 05 — 规则开关 (RuleSwitches) 与选项参数普查', () => {
  it('RuleSwitches.boardOnly：AI 估值器直接读取（活旋钮）', () => {
    const scenario = SCORING_KNOBS.find(row => row.knob === 'ACTION.ATK')!.scenario();
    const evaluator = new ActionEvaluator(new ActionResolver());
    const scoring = evaluator.evaluate(
      scenario.state,
      scenario.tianGan,
      scenario.action,
      DEFAULT_STRATEGY_WEIGHTS,
      { boardOnly: false }
    ).score;
    const boardOnly = evaluator.evaluate(
      scenario.state,
      scenario.tianGan,
      scenario.action,
      DEFAULT_STRATEGY_WEIGHTS,
      { boardOnly: true }
    ).score;
    expect(boardOnly).not.toBe(scoring);
  });

  it('BenchmarkOptions.rules：只转发到候选接缝，当前无消费者（死）', () => {
    // 策略不绑定 rules，仅 benchmark 选项带 rules。若转发真的到达 AI，轨迹会变。
    const benchmark = new HeadlessBenchmark();
    const base = { matches: 40, baseSeed: 10000, maxRounds: 30 } as const;
    const strategy = createScoreBoundStrategy(BALANCED_WEIGHTS, POINTS_CONFIG);
    const control = benchmark.run({ ...base, strategyP1: strategy, strategyP2: strategy });
    const withRules = benchmark.run({
      ...base,
      strategyP1: strategy,
      strategyP2: strategy,
      rules: { boardOnly: true }
    });
    expect(deterministicMetrics(withRules)).toEqual(deterministicMetrics(control));
  });

  it('HeadlessMatchConfig.rules：只转发到候选接缝，当前无消费者（死）', () => {
    const control = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
      seed: 4242,
      maxRounds: 30
    });
    const withRules = new HeadlessMatch({ rules: { boardOnly: true } }).run(
      balancedStrategy,
      balancedStrategy,
      { seed: 4242, maxRounds: 30 }
    );
    expect(withRules.record.actions).toEqual(control.record.actions);
    expect([withRules.finalP1Score, withRules.finalP2Score]).toEqual([
      control.finalP1Score,
      control.finalP2Score
    ]);
  });
});

// ---------------------------------------------------------------------------
// AI 估值权重 (StrategyWeights)：全部为活参数
// ---------------------------------------------------------------------------

interface WeightKnob {
  readonly knob: keyof StrategyWeights;
  readonly mutate: (weights: StrategyWeights) => StrategyWeights;
  readonly scenario: () => Scenario;
}

function withWeights(overrides: Partial<StrategyWeights>): StrategyWeights {
  return { ...DEFAULT_STRATEGY_WEIGHTS, ...overrides };
}

const WEIGHT_KNOBS: readonly WeightKnob[] = [
  {
    knob: 'repairDamage',
    mutate: w => ({ ...w, repairDamage: w.repairDamage + 1000 }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: -1 } } }),
      tianGan: JIA_WOOD_YANG,
      action: AUTO_YANG
    })
  },
  {
    knob: 'lightVoid',
    mutate: w => ({ ...w, lightVoid: w.lightVoid + 1000 }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: AUTO_YANG
    })
  },
  {
    knob: 'reachGuiYi',
    mutate: w => ({ ...w, reachGuiYi: w.reachGuiYi + 1000 }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 0, yang: 1 } } }),
      tianGan: JIA_WOOD_YANG,
      action: { actionType: ActionType.CONVERT, player: 'P1', element: WuXing.WOOD, polarity: Polarity.YIN }
    })
  },
  {
    knob: 'reachKangJi',
    mutate: w => ({ ...w, reachKangJi: w.reachKangJi + 1000 }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1 }, [WuXing.FIRE]: { yang: 1 } } }),
      tianGan: YI_WOOD_YIN,
      action: { actionType: ActionType.TRANS, player: 'P1', sourceElement: WuXing.WOOD, polarity: Polarity.YANG }
    })
  },
  {
    knob: 'guiyuanProgress',
    mutate: w => ({ ...w, guiyuanProgress: w.guiyuanProgress + 1000 }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 0, yang: 1 } } }),
      tianGan: JIA_WOOD_YANG,
      action: { actionType: ActionType.CONVERT, player: 'P1', element: WuXing.WOOD, polarity: Polarity.YIN }
    })
  },
  {
    knob: 'breakOpponentGuiYi',
    mutate: w => ({ ...w, breakOpponentGuiYi: w.breakOpponentGuiYi + 1000 }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yin: 1, yang: 1 } } }),
      tianGan: JIA_WOOD_YANG,
      action: ATK_YIN
    })
  },
  {
    knob: 'causeDamage',
    mutate: w => ({ ...w, causeDamage: w.causeDamage + 1000 }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yin: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: ATK_YIN
    })
  },
  {
    knob: 'suppressNode',
    mutate: w => ({ ...w, suppressNode: w.suppressNode + 1000 }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yin: 2 } } }),
      tianGan: JIA_WOOD_YANG,
      action: ATK_YIN
    })
  },
  {
    knob: 'burstExtraTurn',
    mutate: w => ({ ...w, burstExtraTurn: w.burstExtraTurn + 1000 }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 }, [WuXing.FIRE]: { yin: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YIN
      }
    })
  },
  {
    knob: 'scoreDeltaWeight',
    mutate: w => ({ ...w, scoreDeltaWeight: (w.scoreDeltaWeight ?? 1) + 1 }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yin: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: ATK_YIN
    })
  },
  {
    knob: 'winReward',
    mutate: w => ({ ...w, winReward: (w.winReward ?? 0) + 1000 }),
    scenario: () => ({
      // P1 四归一 + 水阴已亮、水阳待补：AUTO 水阳即达成五行全归元。
      state: gameStateWith({
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: 1, yang: 1 },
          [WuXing.EARTH]: { yin: 1, yang: 1 },
          [WuXing.METAL]: { yin: 1, yang: 1 },
          [WuXing.WATER]: { yin: 1, yang: 0 }
        }
      }),
      tianGan: { name: '壬', element: WuXing.WATER, polarity: Polarity.YANG },
      action: { actionType: ActionType.AUTO, player: 'P1', element: WuXing.WATER, polarity: Polarity.YANG }
    })
  },
  {
    knob: 'baseActionBias',
    mutate: w => ({ ...w, baseActionBias: { ...w.baseActionBias, [ActionType.ATK]: 1000 } }),
    scenario: () => ({
      state: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } }, P2: { [WuXing.EARTH]: { yin: 0 } } }),
      tianGan: JIA_WOOD_YANG,
      action: ATK_YIN
    })
  }
];

describe('Ticket 05 — AI 估值权重 (StrategyWeights) 全部为活参数', () => {
  for (const row of WEIGHT_KNOBS) {
    it(`${row.knob}：扰动改变 AI 估值分数`, () => {
      const scenario = row.scenario();
      const baseWeights = withWeights({});
      const control = new ActionEvaluator(new ActionResolver()).evaluate(
        scenario.state,
        scenario.tianGan,
        scenario.action,
        baseWeights
      ).score;
      const perturbed = new ActionEvaluator(new ActionResolver()).evaluate(
        scenario.state,
        scenario.tianGan,
        scenario.action,
        row.mutate(baseWeights)
      ).score;
      expect(perturbed).not.toBe(control);
    });
  }
});

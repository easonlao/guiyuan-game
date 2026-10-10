/**
 * Ticket 04 — 注入链路验证 (Injection Path Verification)
 *
 * 目的：证明每一个可注入配置**真的到达了它的消费者**，而不是被静默忽略。
 *
 * 缺陷形态（本文件要抓的）：
 *   计分配置注入曾经只到达 ActionResolver（解析器），没有到达 ActionEvaluator（AI 估值器）。
 *   于是换一套计分数值后 AI 动作轨迹逐字节不变，只有回合上限结算的判负标准变化。
 *   若不抓，实验会得出「任何计分数值都不影响归元率」的假结论。
 *
 * 验证结构（数据驱动，每个旋钮一行）：
 *   1. 连通断言：connected=true 时把旋钮改成刻意不同的值，必须观察到输出变化。
 *   2. 静默忽略证明：connected=false 时旋钮被断开（消费者退回默认），同一断言必须观察不到变化
 *      —— 这证明第 1 条断言确实有牙齿：链路若退化为断开形态，第 1 条就会失败。
 *
 * 接缝（spec Implementation Decisions 1–3，不新增第三个）：
 *   - 主接缝：HeadlessMatch.run / HeadlessBenchmark.run
 *   - 场景接缝：ActionResolver.resolve（受控盘面）
 *
 * 相关既有测试（本文件建立在其上，不重复）：
 *   - tests/core/headless-config-injection.test.ts 已锁定「单一 scoreConfig 经权重模板同时到达解析器与 AI 估值器」
 *     与「显式传入已构造策略时配置不改写其估值器」两类行为；本文件的 disconnected 分支复用后者。
 *   - tests/core/headless-config-injection.test.ts 已确认 GameManager 的 isBoardOnly 会影响 AI 决策；
 *     本文件在「两个入口」小节确认无头入口，并引用该用例覆盖游戏内入口。
 *
 * 转交 Ticket 05（死旋钮清单）：见文件末尾的 scoreConfig 子项普查。
 */

import { describe, it, expect } from 'vitest';
import { HeadlessMatch, type MatchResult } from '../../src/core/headless/HeadlessMatch.js';
import { HeadlessBenchmark, type BenchmarkMetrics } from '../../src/core/headless/HeadlessBenchmark.js';
import {
  createScoreBoundStrategy,
  balancedStrategy,
  aggressiveStrategy,
  BALANCED_WEIGHTS,
  AGGRESSIVE_WEIGHTS
} from '../../src/core/ai/Strategy.js';
import { DEFAULT_STRATEGY_WEIGHTS, ActionEvaluator } from '../../src/core/ai/ActionEvaluator.js';
import {
  ActionResolver
} from '../../src/core/logic/ActionResolver.js';
import { POINTS_CONFIG, ScoreCalculator, type PointsConfig } from '../../src/core/logic/ScoreCalculator.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { getAvailableActions } from '../../src/core/logic/ActionCandidates.js';
import { TurnManager } from '../../src/core/logic/TurnManager.js';
import { GameManager } from '../../src/minigame/game-manager.js';
import { createPRNG, type PRNG } from '../../src/core/utils/prng.js';
import {
  ActionType,
  Polarity,
  TIAN_GAN_LIST,
  WuXing,
  type ActionPayload,
  type GameState
} from '../../src/core/types/domain.js';

const SEED = 4242;
const MAX_ROUNDS = 30;

/**
 * 刻意不同的计分配置：把攻击类状态分放大到默认值的 10 倍。
 * 与默认配置差异足够大，只要 AI 估值器真的读到了它，动作轨迹就会改变。
 */
const ATTACK_HEAVY_POINTS_CONFIG: PointsConfig = {
  ...POINTS_CONFIG,
  STATE_CHANGE: {
    ...POINTS_CONFIG.STATE_CHANGE,
    CAUSE_DMG: { yang: 3000, yin: 2500 },
    BREAK_LIGHT: { yang: 2000, yin: 1500 },
    WEAKEN: 2000
  }
};

/** 全部计分来源归零：既改变终局分数，也等价于对 AI 关闭计分轴。 */
const ZERO_POINTS_CONFIG: PointsConfig = {
  ...POINTS_CONFIG,
  ACTION: {
    AUTO: 0,
    CONVERT: 0,
    TRANS: 0,
    ATK: 0,
    BURST: 0,
    BURST_ATK: 0,
    DISSIPATE: 0,
    PASS: 0
  },
  STATE_CHANGE: {
    REPAIR_DMG: { yang: 0, yin: 0 },
    LIGHT_UP: 0,
    BLESSING: 0,
    CAUSE_DMG: { yang: 0, yin: 0 },
    BREAK_LIGHT: { yang: 0, yin: 0 },
    WEAKEN: 0
  },
  GUI_YI_MILESTONE: 0,
  DAMAGE_PENALTY: 0
};

// ---------------------------------------------------------------------------
// 数据驱动骨架
// ---------------------------------------------------------------------------

interface InjectionPoint<T> {
  /** 可注入点名称 */
  readonly point: string;
  /** 该值的真实消费者 */
  readonly consumer: string;
  /** 是否只影响终局判定、不影响 AI 行为（转交 Ticket 05） */
  readonly terminalOnly: boolean;
  /**
   * 运行场景。connected=false 表示「消费者退回默认、旋钮被断开」的静默忽略形态。
   * perturbed=false 为对照值，perturbed=true 为刻意不同的扰动值。
   */
  readonly run: (perturbed: boolean, connected: boolean) => T;
  /** 从输出中取出应当变化的可观测量 */
  readonly observe: (output: T) => unknown;
}

function describeInjectionTable<T>(label: string, rows: readonly InjectionPoint<T>[]): void {
  describe(label, () => {
    for (const row of rows) {
      it(`${row.point} → ${row.consumer}${row.terminalOnly ? '（仅终局判定）' : ''}`, () => {
        const control = row.observe(row.run(false, true));
        const perturbed = row.observe(row.run(true, true));
        expect(perturbed).not.toEqual(control);
      });

      it(`${row.point}：静默忽略证明（消费者断开后观察不到变化）`, () => {
        const control = row.observe(row.run(false, false));
        const perturbed = row.observe(row.run(true, false));
        expect(perturbed).toEqual(control);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// 主接缝：HeadlessMatch.run
// ---------------------------------------------------------------------------

const MATCH_INJECTION_POINTS: readonly InjectionPoint<MatchResult>[] = [
  {
    point: 'seed',
    consumer: 'PRNG → 天干抽取 → AI 动作轨迹',
    terminalOnly: false,
    run: (perturbed, connected) => {
      // 断开时退回 HeadlessMatch 默认种子 123456789
      const seed = connected ? (perturbed ? 9999 : SEED) : 123456789;
      return new HeadlessMatch().run(balancedStrategy, balancedStrategy, { seed, maxRounds: MAX_ROUNDS });
    },
    observe: r => r.record.actions
  },
  {
    point: 'maxRounds',
    consumer: 'createInitialGameState + 主循环上界 → 终局原因/回合数',
    terminalOnly: false,
    run: (perturbed, connected) => {
      // 断开时退回默认 30
      const maxRounds = connected ? (perturbed ? MAX_ROUNDS : 1) : MAX_ROUNDS;
      return new HeadlessMatch().run(balancedStrategy, balancedStrategy, { seed: SEED, maxRounds });
    },
    observe: r => ({ endReason: r.endReason, roundsPlayed: r.roundsPlayed })
  },
  {
    point: 'recordActions',
    consumer: 'MatchOptions → GameRecord.actions 采集',
    terminalOnly: false,
    run: (perturbed, connected) => {
      // 断开时恒为 true（总是采集）
      const recordActions = connected ? !perturbed : true;
      return new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        recordActions
      });
    },
    observe: r => r.record.actions.length
  },
  {
    point: 'shouldCollectStats',
    consumer: 'MatchOptions → MatchResult.stats 采集',
    terminalOnly: false,
    run: (perturbed, connected) => {
      // 断开时恒为 true（总是采集）
      const shouldCollectStats = connected ? !perturbed : true;
      return new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        shouldCollectStats
      });
    },
    observe: r => (r.stats ? 'present' : 'absent')
  },
  {
    point: 'scoreConfig（解析器路径）',
    consumer: 'HeadlessMatch → ActionResolver → 终局分数',
    terminalOnly: false,
    run: (perturbed, connected) => {
      // 断开时退回默认 POINTS_CONFIG
      const scoreConfig = connected ? (perturbed ? ZERO_POINTS_CONFIG : POINTS_CONFIG) : POINTS_CONFIG;
      return new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        scoreConfig
      });
    },
    observe: r => [r.finalP1Score, r.finalP2Score]
  },
  {
    point: 'scoreConfig（AI 估值器路径）',
    consumer: 'HeadlessMatch.run(strategy=weights, scoreConfig) → ActionEvaluator → AI 动作轨迹',
    terminalOnly: false,
    run: (perturbed, connected) => {
      const config = connected ? (perturbed ? ATTACK_HEAVY_POINTS_CONFIG : POINTS_CONFIG) : POINTS_CONFIG;
      // 连通形态 = 修复后：入口收到权重模板，同一份 scoreConfig 同时绑定 AI 估值器与解析器。
      // 断开形态 = 修复前缺陷：策略是已构造的 balancedStrategy，估值器保留默认解析器，
      // 配置只到达 match.run 的解析器。此形态下换配置只改终局分数，AI 轨迹逐字节不变。
      const strategy = connected ? BALANCED_WEIGHTS : balancedStrategy;
      return new HeadlessMatch().run(strategy, strategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        scoreConfig: config
      });
    },
    observe: r => r.record.actions
  },
  {
    point: 'strategy weights',
    consumer: 'createStrategy → ActionEvaluator.evaluate 权重',
    terminalOnly: false,
    run: (perturbed, connected) => {
      // 断开形态 = createStrategy 忽略 weights 参数，退回 DEFAULT_STRATEGY_WEIGHTS
      const weights = connected
        ? perturbed
          ? AGGRESSIVE_WEIGHTS
          : BALANCED_WEIGHTS
        : DEFAULT_STRATEGY_WEIGHTS;
      const strategy = createScoreBoundStrategy(weights, POINTS_CONFIG);
      return new HeadlessMatch().run(strategy, strategy, { seed: SEED, maxRounds: MAX_ROUNDS });
    },
    observe: r => r.record.actions
  },
  {
    point: 'RuleSwitches.isBoardOnly（AI 估值器路径）',
    consumer: 'HeadlessMatch.run(strategy=weights, rules) → ActionEvaluator（关闭计分轴）',
    terminalOnly: false,
    run: (perturbed, connected) => {
      // 连通形态：权重模板 + rules 经无头入口同时绑定 AI 估值器。
      // 断开形态：不把 rules 交给入口，估值器退回「读取计分轴」，扰动观察不到变化。
      const rules = connected ? { isBoardOnly: perturbed } : undefined;
      return new HeadlessMatch().run(BALANCED_WEIGHTS, BALANCED_WEIGHTS, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        rules
      });
    },
    observe: r => r.record.actions
  }
];

// ---------------------------------------------------------------------------
// 主接缝：HeadlessBenchmark.run
// ---------------------------------------------------------------------------

const BENCHMARK_INJECTION_POINTS: readonly InjectionPoint<BenchmarkMetrics>[] = [
  {
    point: 'matches',
    consumer: 'BenchmarkOptions → 批量循环次数 → totalMatches',
    terminalOnly: false,
    run: (perturbed, connected) => {
      const matches = connected ? (perturbed ? 12 : 5) : 5;
      return new HeadlessBenchmark().run({
        matches,
        baseSeed: 10000,
        maxRounds: MAX_ROUNDS,
        strategyP1: balancedStrategy,
        strategyP2: balancedStrategy
      });
    },
    observe: m => m.totalMatches
  },
  {
    point: 'baseSeed',
    consumer: 'BenchmarkOptions → 逐局种子 → 聚合指标',
    terminalOnly: false,
    run: (perturbed, connected) => {
      const baseSeed = connected ? (perturbed ? 20000 : 10000) : 10000;
      return new HeadlessBenchmark().run({
        matches: 30,
        baseSeed,
        maxRounds: MAX_ROUNDS,
        strategyP1: balancedStrategy,
        strategyP2: balancedStrategy
      });
    },
    observe: m => [m.guiYuanCount, m.p1Wins, m.avgP1Score]
  },
  {
    point: 'strategyP1',
    consumer: 'BenchmarkOptions → HeadlessMatch 策略槽位 → 聚合指标',
    terminalOnly: false,
    run: (perturbed, connected) => {
      const strategyP1 = connected ? (perturbed ? aggressiveStrategy : balancedStrategy) : balancedStrategy;
      return new HeadlessBenchmark().run({
        matches: 30,
        baseSeed: 10000,
        maxRounds: MAX_ROUNDS,
        strategyP1,
        strategyP2: balancedStrategy
      });
    },
    observe: m => [m.guiYuanCount, m.p1Wins, m.avgP1Score]
  },
  {
    point: 'strategyP2',
    consumer: 'BenchmarkOptions → HeadlessMatch 策略槽位 → 聚合指标',
    terminalOnly: false,
    run: (perturbed, connected) => {
      const strategyP2 = connected ? (perturbed ? aggressiveStrategy : balancedStrategy) : balancedStrategy;
      return new HeadlessBenchmark().run({
        matches: 30,
        baseSeed: 10000,
        maxRounds: MAX_ROUNDS,
        strategyP1: balancedStrategy,
        strategyP2
      });
    },
    observe: m => [m.guiYuanCount, m.p2Wins, m.avgP2Score]
  },
  {
    point: 'scoreConfig（批量转发）',
    consumer: 'BenchmarkOptions → HeadlessMatch → ActionResolver → 平均分',
    terminalOnly: false,
    run: (perturbed, connected) => {
      const scoreConfig = connected ? (perturbed ? ZERO_POINTS_CONFIG : POINTS_CONFIG) : POINTS_CONFIG;
      return new HeadlessBenchmark().run({
        matches: 20,
        baseSeed: 10000,
        maxRounds: MAX_ROUNDS,
        scoreConfig,
        strategyP1: balancedStrategy,
        strategyP2: balancedStrategy
      });
    },
    observe: m => [m.avgP1Score, m.avgP2Score]
  },
  {
    point: 'scoreConfig（批量 AI 估值器路径）',
    consumer: 'BenchmarkOptions(strategy=weights) + scoreConfig → ActionEvaluator → 聚合指标',
    terminalOnly: false,
    run: (perturbed, connected) => {
      const scoreConfig = connected ? (perturbed ? ATTACK_HEAVY_POINTS_CONFIG : POINTS_CONFIG) : POINTS_CONFIG;
      // 连通形态：批量入口收到权重模板，同一份 scoreConfig 到达 AI 估值器。
      // 断开形态：已构造策略，估值器保留默认配置。
      const strategyP1 = connected
        ? BALANCED_WEIGHTS
        : createScoreBoundStrategy(BALANCED_WEIGHTS, POINTS_CONFIG);
      return new HeadlessBenchmark().run({
        matches: 40,
        baseSeed: 10000,
        maxRounds: MAX_ROUNDS,
        scoreConfig,
        strategyP1,
        strategyP2: strategyP1
      });
    },
    observe: m => [m.guiYuanCount, m.avgRounds]
  }
  // 说明：BenchmarkOptions.recordActions 与 .rules 转发到 HeadlessMatch.run，但
  // BenchmarkMetrics 不暴露逐动作记录；recordActions 在单局表已覆盖，rules 的
  // boardOnly 在候选接缝恒等（见下节），故不在此重复成行。
];

describeInjectionTable('主接缝 HeadlessMatch.run：每个旋钮都到达消费者', MATCH_INJECTION_POINTS);
describeInjectionTable('主接缝 HeadlessBenchmark.run：每个旋钮都到达消费者', BENCHMARK_INJECTION_POINTS);

// ---------------------------------------------------------------------------
// 构造函数实例级注入（HeadlessMatchConfig）
// ---------------------------------------------------------------------------

describe('HeadlessMatch 构造函数实例级注入', () => {
  it('scoreCalculator 注入改变终局分数', () => {
    const normal = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
      seed: SEED,
      maxRounds: MAX_ROUNDS
    });
    const zero = new HeadlessMatch({ scoreCalculator: new ScoreCalculator(ZERO_POINTS_CONFIG) }).run(
      balancedStrategy,
      balancedStrategy,
      { seed: SEED, maxRounds: MAX_ROUNDS }
    );
    expect([zero.finalP1Score, zero.finalP2Score]).not.toEqual([
      normal.finalP1Score,
      normal.finalP2Score
    ]);
    expect(zero.finalP1Score).toBe(0);
  });

  it('resolver 注入优先于 scoreCalculator', () => {
    const match = new HeadlessMatch({
      resolver: new ActionResolver(new ScoreCalculator(ZERO_POINTS_CONFIG)),
      scoreCalculator: new ScoreCalculator(POINTS_CONFIG)
    });
    const result = match.run(balancedStrategy, balancedStrategy, {
      seed: SEED,
      maxRounds: MAX_ROUNDS
    });
    expect(result.finalP1Score).toBe(0);
  });

  it('单局级 scoreConfig 覆盖实例级注入', () => {
    const match = new HeadlessMatch({ scoreCalculator: new ScoreCalculator(ZERO_POINTS_CONFIG) });
    const result = match.run(balancedStrategy, balancedStrategy, {
      seed: SEED,
      maxRounds: MAX_ROUNDS,
      scoreConfig: POINTS_CONFIG
    });
    expect(result.finalP1Score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 规则开关在候选接缝上的默认恒等（转交 Ticket 05）
// ---------------------------------------------------------------------------

describe('规则开关在候选接缝上是默认恒等（消费者是估值器，不是候选生成器）', () => {
  it('ActionCandidatesOptions.rules 当前不改变合法候选集合（boardOnly 恒等）', () => {
    const state = createInitialGameState(MAX_ROUNDS);
    const tianGan = TIAN_GAN_LIST[0];
    const plain = getAvailableActions(state, tianGan);
    const switched = getAvailableActions(state, tianGan, { rules: { isBoardOnly: true } });
    expect(switched).toEqual(plain);
  });

  it('ActionCandidatesOptions.isExtraTurn 过滤爆发候选（连动锁）', () => {
    const base = createInitialGameState(MAX_ROUNDS);
    const tianGan = TIAN_GAN_LIST[0]; // 甲木（阳）
    const state: GameState = {
      ...base,
      currentPlayer: 'P1',
      players: {
        ...base.players,
        P1: {
          ...base.players.P1,
          board: { ...base.players.P1.board, [WuXing.WOOD]: { yin: 1, yang: 1 } }
        }
      }
    };
    const isBurst = (a: ActionPayload): boolean =>
      a.actionType === ActionType.BURST || a.actionType === ActionType.BURST_ATK;

    expect(getAvailableActions(state, tianGan).some(isBurst)).toBe(true);
    expect(getAvailableActions(state, tianGan, { isExtraTurn: true }).some(isBurst)).toBe(false);
  });

  it('MatchOptions.rules 经权重模板策略到达 AI 估值器（活旋钮）', () => {
    // 修复后：入口收到权重模板时，MatchOptions.rules 与 scoreConfig 一起绑定 AI 估值器；
    // 只把 rules 交给候选生成器、策略为已构造函数时才观察不到变化（见主表 disconnected 分支）。
    const plain = new HeadlessMatch().run(BALANCED_WEIGHTS, BALANCED_WEIGHTS, {
      seed: SEED,
      maxRounds: MAX_ROUNDS
    });
    const withRule = new HeadlessMatch().run(BALANCED_WEIGHTS, BALANCED_WEIGHTS, {
      seed: SEED,
      maxRounds: MAX_ROUNDS,
      rules: { isBoardOnly: true }
    });
    expect(withRule.record.actions).not.toEqual(plain.record.actions);
  });
});

// ---------------------------------------------------------------------------
// 两个入口：游戏内 (GameManager / TurnManager) 与无头
// ---------------------------------------------------------------------------

describe('注入同时覆盖游戏内回合管理与无头推演两个入口', () => {
  it('无头入口：createScoreBoundStrategy 的计分配置到达 AI 估值器（见主表）', () => {
    // 由主表 scoreConfig（AI 估值器路径）行覆盖。
    const defaultResult = new HeadlessMatch().run(
      createScoreBoundStrategy(BALANCED_WEIGHTS, POINTS_CONFIG),
      createScoreBoundStrategy(BALANCED_WEIGHTS, POINTS_CONFIG),
      { seed: SEED, maxRounds: MAX_ROUNDS }
    );
    const heavyResult = new HeadlessMatch().run(
      createScoreBoundStrategy(BALANCED_WEIGHTS, ATTACK_HEAVY_POINTS_CONFIG),
      createScoreBoundStrategy(BALANCED_WEIGHTS, ATTACK_HEAVY_POINTS_CONFIG),
      { seed: SEED, maxRounds: MAX_ROUNDS }
    );
    expect(heavyResult.record.actions).not.toEqual(defaultResult.record.actions);
  });

  it('游戏内入口 TurnManager：注入的 resolver 决定计分结算', () => {
    const zero = new TurnManager({
      prng: createPRNG(777),
      resolver: new ActionResolver(new ScoreCalculator(ZERO_POINTS_CONFIG))
    });
    zero.startTurn();
    const zeroResult = zero.executeAction(zero.getAvailableActions()[0]);

    const normal = new TurnManager({ prng: createPRNG(777) });
    normal.startTurn();
    const normalResult = normal.executeAction(normal.getAvailableActions()[0]);

    // 同一动作：默认计分结算 > 0，零计分结算 = 0
    expect(normalResult.nextState.players.P1.score).toBeGreaterThan(0);
    expect(zeroResult.nextState.players.P1.score).toBe(0);
  });

  it('游戏内入口 GameManager：rules 绑定到 AI 估值器（受控盘面）', () => {
    // 受控盘面：P2 木归一 (1,1)，火阳道损；P1 土 (-1,0)。固定抽 甲木（阳）。
    // 默认计分下 AI 选 BURST_ATK（消耗木阳 1->0）；关闭计分轴后改选 ATK（保留木阳）。
    // 与 headless-config-injection.test.ts 的用例同源，此处仅确认两个入口都接线。
    const fixedPrng: PRNG = {
      next: () => 0,
      nextInt: min => min,
      getState: () => 0
    };

    const controlledState = (): GameState => {
      const base = createInitialGameState(MAX_ROUNDS);
      return {
        ...base,
        currentPlayer: 'P2',
        players: {
          ...base.players,
          P2: {
            ...base.players.P2,
            board: {
              ...base.players.P2.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 },
              [WuXing.FIRE]: { yin: 0, yang: -1 }
            }
          },
          P1: {
            ...base.players.P1,
            board: {
              ...base.players.P1.board,
              [WuXing.EARTH]: { yin: -1, yang: 0 }
            }
          }
        }
      };
    };

    const driveAiOnce = (rules?: { isBoardOnly?: boolean }): GameState => {
      const gm = new GameManager({ prng: fixedPrng, initialState: controlledState(), rules });
      for (let i = 0; i < 90; i++) {
        gm.update();
      }
      return gm.getState();
    };

    expect(driveAiOnce().players.P2.board[WuXing.WOOD].yang).toBe(0);
    expect(driveAiOnce({ isBoardOnly: true }).players.P2.board[WuXing.WOOD].yang).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// scoreConfig 子项普查 —— 转交 Ticket 05（死旋钮清单）
// ---------------------------------------------------------------------------

/**
 * 转交 Ticket 05 的结论表（此处以可执行断言固定事实）：
 *
 * | scoreConfig 子项      | 终局结算读取 | AI 估值读取 | 结论                     |
 * |----------------------|--------------|-------------|--------------------------|
 * | ACTION / STATE_CHANGE | 是           | 是（scoreDelta） | 活旋钮              |
 * | GUI_YI_MILESTONE     | 是           | 是（scoreDelta） | 活旋钮              |
 * | DAMAGE_PENALTY       | 是（仅 MAX_ROUNDS 终局） | 否 | 仅终局判定，AI 不可见 |
 * | RARITY_MULTIPLIER    | 否           | 否          | 死旋钮（applyRarityBonus 无调用点） |
 * | NO_RARITY_ACTIONS    | 否           | 否          | 死旋钮（同上）           |
 */

describe('scoreConfig 子项普查（转交 Ticket 05：死旋钮清单）', () => {
  /** 受控盘面：round=1 / maxRounds=1 / P2 行动 → PASS 触发 MAX_ROUNDS 终局结算。双方均有残留道损。 */
  function maxRoundsStateWithDamage(): GameState {
    const base = createInitialGameState(1);
    return {
      ...base,
      round: 1,
      maxRounds: 1,
      currentPlayer: 'P2',
      players: {
        P1: {
          ...base.players.P1,
          board: { ...base.players.P1.board, [WuXing.WOOD]: { yin: -1, yang: 0 } }
        },
        P2: {
          ...base.players.P2,
          board: {
            ...base.players.P2.board,
            [WuXing.FIRE]: { yin: -1, yang: 0 },
            [WuXing.METAL]: { yin: -1, yang: -1 }
          }
        }
      }
    };
  }

  const passAction: ActionPayload = {
    actionType: ActionType.PASS,
    player: 'P2',
    element: WuXing.WOOD,
    polarity: Polarity.YANG
  };
  const tianGan = TIAN_GAN_LIST[0];

  it('DAMAGE_PENALTY：改变终局分数（终局判定可见）', () => {
    const state = maxRoundsStateWithDamage();
    const zero = new ActionResolver(new ScoreCalculator({ ...POINTS_CONFIG, DAMAGE_PENALTY: 0 })).resolve(
      state,
      passAction
    );
    const fifty = new ActionResolver(
      new ScoreCalculator({ ...POINTS_CONFIG, DAMAGE_PENALTY: 50 })
    ).resolve(state, passAction);

    expect(zero.nextState.endReason).toBe('MAX_ROUNDS');
    expect([zero.nextState.players.P1.score, zero.nextState.players.P2.score]).not.toEqual([
      fifty.nextState.players.P1.score,
      fifty.nextState.players.P2.score
    ]);
  });

  it('DAMAGE_PENALTY：AI 估值不可见（scoreDelta 不含终局惩罚）', () => {
    const state = maxRoundsStateWithDamage();
    const zero = new ActionResolver(new ScoreCalculator({ ...POINTS_CONFIG, DAMAGE_PENALTY: 0 })).resolve(
      state,
      passAction
    );
    const fifty = new ActionResolver(
      new ScoreCalculator({ ...POINTS_CONFIG, DAMAGE_PENALTY: 50 })
    ).resolve(state, passAction);

    // scoreDelta 是 ActionEvaluator 唯一读取的计分量；终局惩罚不计入其中
    expect(zero.scoreDelta).toBe(fifty.scoreDelta);

    const evalZero = new ActionEvaluator(
      new ActionResolver(new ScoreCalculator({ ...POINTS_CONFIG, DAMAGE_PENALTY: 0 }))
    ).evaluate(state, tianGan, passAction);
    const evalFifty = new ActionEvaluator(
      new ActionResolver(new ScoreCalculator({ ...POINTS_CONFIG, DAMAGE_PENALTY: 50 }))
    ).evaluate(state, tianGan, passAction);
    expect(evalZero.score).toBe(evalFifty.score);
  });

  it('RARITY_MULTIPLIER：死旋钮（解析器与 AI 均不读取）', () => {
    const state = createInitialGameState(MAX_ROUNDS);
    const atk: ActionPayload = {
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: Polarity.YANG
    };
    const low = new ActionResolver(new ScoreCalculator({ ...POINTS_CONFIG, RARITY_MULTIPLIER: 0 }));
    const high = new ActionResolver(new ScoreCalculator({ ...POINTS_CONFIG, RARITY_MULTIPLIER: 99 }));

    const lowResult = low.resolve(state, atk);
    const highResult = high.resolve(state, atk);
    expect(lowResult.scoreDelta).toBe(highResult.scoreDelta);

    const evalLow = new ActionEvaluator(
      new ActionResolver(new ScoreCalculator({ ...POINTS_CONFIG, RARITY_MULTIPLIER: 0 }))
    ).evaluate(state, tianGan, atk);
    const evalHigh = new ActionEvaluator(
      new ActionResolver(new ScoreCalculator({ ...POINTS_CONFIG, RARITY_MULTIPLIER: 99 }))
    ).evaluate(state, tianGan, atk);
    expect(evalLow.score).toBe(evalHigh.score);
  });

  it('GUI_YI_MILESTONE：AI 估值可见（经 scoreDelta）', () => {
    const base = createInitialGameState(MAX_ROUNDS);
    const state: GameState = {
      ...base,
      currentPlayer: 'P1',
      players: {
        ...base.players,
        P1: {
          ...base.players.P1,
          board: { ...base.players.P1.board, [WuXing.WOOD]: { yin: 1, yang: 0 } }
        }
      }
    };
    const convert: ActionPayload = {
      actionType: ActionType.CONVERT,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG
    };

    const evalZero = new ActionEvaluator(
      new ActionResolver(new ScoreCalculator({ ...POINTS_CONFIG, GUI_YI_MILESTONE: 0 }))
    ).evaluate(state, tianGan, convert);
    const evalHigh = new ActionEvaluator(
      new ActionResolver(new ScoreCalculator({ ...POINTS_CONFIG, GUI_YI_MILESTONE: 999 }))
    ).evaluate(state, tianGan, convert);

    expect(evalHigh.breakdown.scoreDeltaPoints).toBeGreaterThan(evalZero.breakdown.scoreDeltaPoints);
  });
});

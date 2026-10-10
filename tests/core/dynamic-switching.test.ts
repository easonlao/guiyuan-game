import { describe, it, expect } from 'vitest';
import {
  ActionPayload,
  ActionType,
  GameState,
  Polarity,
  TIAN_GAN_LIST,
  WuXing
} from '../../src/core/types/domain.js';
import { gameStateWith } from '../../src/core/headless/BoardFixture.js';
import { HeadlessMatch } from '../../src/core/headless/HeadlessMatch.js';
import {
  DEFAULT_DYNAMIC_POLICY,
  DynamicSwitchStats,
  TEMPO_ONLY_POLICY,
  createDynamicSwitchingStrategy,
  dynamicStrategyVariant,
  runDynamicSwitchingExperiment
} from '../../src/core/headless/DynamicSwitching.js';
import { aggressiveStrategy } from '../../src/core/ai/Strategy.js';
import { DEFAULT_STRATEGY_VARIANTS } from '../../src/core/headless/ExperimentRunner.js';

const JIA_WOOD_YANG = TIAN_GAN_LIST[0]; // 甲木 (阳)
const MAX_ROUNDS = 30;
const BASE_SEED = 10000;

const convertWoodYin: ActionPayload = {
  actionType: ActionType.CONVERT,
  player: 'P1',
  element: WuXing.WOOD,
  polarity: Polarity.YIN
};

const atkEarthYin: ActionPayload = {
  actionType: ActionType.ATK,
  player: 'P1',
  sourceElement: WuXing.WOOD,
  polarity: Polarity.YIN
};

/**
 * 「推进 vs 压制」二选一困境：
 * - P1 木阴 0 / 木阳 1：CONVERT 木阴可点亮，推进己方归一。
 * - P2 土阴 1 / 土阳 1：ATK 木克土可把土阴 1 -> 0，破对手归一。
 * 两个候选动作同时合法，由切换模式决定选哪一个。
 */
function dilemmaState(p2EarthYin: 1 | 2): GameState {
  return gameStateWith({
    P1: { [WuXing.WOOD]: { yin: 0, yang: 1 } },
    P2: { [WuXing.EARTH]: { yin: p2EarthYin, yang: 1 } },
    currentPlayer: 'P1'
  });
}

/**
 * 己方快归元且领先、但一步不能直接赢的盘面：
 * P1 木 (0,1)、火 (1,0)，其余三点归一 → 还差 2 次行动；P2 只差 8 次行动。
 * 木阳 1 / 木阴 0 让 CONVERT（推进，但不立即归元）与 ATK（压制）同时合法，
 * 从而把「赛跑领先」条件与「破收益为 0」条件分离开来。
 */
function raceLeadState(): GameState {
  return gameStateWith({
    P1: {
      [WuXing.WOOD]: { yin: 0, yang: 1 },
      [WuXing.FIRE]: { yin: 1, yang: 0 },
      [WuXing.EARTH]: { yin: 1, yang: 1 },
      [WuXing.METAL]: { yin: 1, yang: 1 },
      [WuXing.WATER]: { yin: 1, yang: 1 }
    },
    P2: { [WuXing.EARTH]: { yin: 1, yang: 1 } },
    currentPlayer: 'P1'
  });
}

describe('Ticket 10 - 动态切换依据 (board-derived criterion)', () => {
  it('默认压制：本回合【破】仍有盘面收益（打点亮 1）时不切换，执行压制动作', () => {
    const strategy = createDynamicSwitchingStrategy(DEFAULT_DYNAMIC_POLICY);
    const choice = strategy(dilemmaState(1), JIA_WOOD_YANG, [convertWoodYin, atkEarthYin]);
    expect(choice).toEqual(atkEarthYin);
  });

  it('ticket 08 软拐点：只能打加持 2（盘面收益 0）时切换到推进动作', () => {
    const strategy = createDynamicSwitchingStrategy(DEFAULT_DYNAMIC_POLICY);
    const choice = strategy(dilemmaState(2), JIA_WOOD_YANG, [atkEarthYin, convertWoodYin]);
    expect(choice).toEqual(convertWoodYin);
  });

  it('赛跑领先：己方还差 2 次行动且领先时切换到推进动作（即使该动作不立即归元）', () => {
    const strategy = createDynamicSwitchingStrategy(DEFAULT_DYNAMIC_POLICY);
    const choice = strategy(raceLeadState(), JIA_WOOD_YANG, [atkEarthYin, convertWoodYin]);
    expect(choice).toEqual(convertWoodYin);
  });

  it('赛跑领先条件是可分离的：关闭它后同一盘面回到压制动作', () => {
    // TEMPO_ONLY 关闭了 advanceSelfMax（=-1），只剩「破收益为 0」一个条件；
    // raceLeadState 的土阴为 1（收益 1），因此应回到压制。
    const strategy = createDynamicSwitchingStrategy(TEMPO_ONLY_POLICY);
    const choice = strategy(raceLeadState(), JIA_WOOD_YANG, [atkEarthYin, convertWoodYin]);
    expect(choice).toEqual(atkEarthYin);
  });

  it('切换确实改变了对局轨迹：至少一个随机种子下与固定激进压制预设不同', () => {
    const dynamic = createDynamicSwitchingStrategy(DEFAULT_DYNAMIC_POLICY);
    const match = new HeadlessMatch();
    let differed = false;
    for (let seed = 10000; seed < 10040 && !differed; seed++) {
      const dynamicRun = match.run(dynamic, aggressiveStrategy, {
        seed,
        maxRounds: MAX_ROUNDS
      });
      const aggressiveRun = match.run(aggressiveStrategy, aggressiveStrategy, {
        seed,
        maxRounds: MAX_ROUNDS
      });
      differed = JSON.stringify(dynamicRun.record) !== JSON.stringify(aggressiveRun.record);
    }
    expect(differed).toBe(true);
  });
});

describe('Ticket 10 - 过程切换统计 (switch stats)', () => {
  it('逐决策记录模式、依据与盘面分布，且各计数自洽', () => {
    const stats = new DynamicSwitchStats();
    const strategy = createDynamicSwitchingStrategy(DEFAULT_DYNAMIC_POLICY, undefined, {}, stats);

    stats.beginMatch();
    // 压制决策（土阴 1，破有收益）
    strategy(dilemmaState(1), JIA_WOOD_YANG, [convertWoodYin, atkEarthYin]);
    // 推进决策（土阴 2，破收益 0）
    strategy(dilemmaState(2), JIA_WOOD_YANG, [convertWoodYin, atkEarthYin]);

    const snapshot = stats.snapshot();
    expect(snapshot.matches).toBe(1);
    expect(snapshot.decisions).toBe(2);
    expect(snapshot.suppressDecisions).toBe(1);
    expect(snapshot.advanceDecisions).toBe(1);
    expect(snapshot.advanceDecisions + snapshot.suppressDecisions).toBe(snapshot.decisions);
    // 同一玩家连续两次决策发生 1 次模式切换
    expect(snapshot.switches).toBe(1);
    expect(snapshot.switchesPerMatch).toBeCloseTo(1, 10);
    // 依据计数之和等于决策数
    const reasonTotal = snapshot.reasonCounts.reduce((sum, [, count]) => sum + count, 0);
    expect(reasonTotal).toBe(snapshot.decisions);
    // 最佳【破】收益分布覆盖 0 与 1 两种取值
    expect(snapshot.atkTempoHistogram.map(([key]) => key).sort()).toEqual(['0', '1']);
    // 赛跑领先量分布 = 对手还差行动 - 己方还差行动
    const leadTotal = snapshot.leadHistogram.reduce((sum, [, count]) => sum + count, 0);
    expect(leadTotal).toBe(snapshot.decisions);
  });

  it('新一局开始时重置「上一次模式」，不会把跨局首决策误记为切换', () => {
    const stats = new DynamicSwitchStats();
    const strategy = createDynamicSwitchingStrategy(DEFAULT_DYNAMIC_POLICY, undefined, {}, stats);

    stats.beginMatch();
    strategy(dilemmaState(1), JIA_WOOD_YANG, [convertWoodYin, atkEarthYin]); // 压制
    stats.beginMatch();
    strategy(dilemmaState(2), JIA_WOOD_YANG, [convertWoodYin, atkEarthYin]); // 推进，但属新局首决策

    const snapshot = stats.snapshot();
    expect(snapshot.matches).toBe(2);
    expect(snapshot.switches).toBe(0);
  });
});

describe('Ticket 10 - 动态 vs 静态对拼矩阵 (seat-balanced head-to-head)', () => {
  it('覆盖全部静态预设、每对打两个座次，且胜率互补', () => {
    const report = runDynamicSwitchingExperiment({
      policies: [DEFAULT_DYNAMIC_POLICY],
      matches: 3,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS,
      collectStats: false
    });

    expect(report.statics).toEqual(DEFAULT_STRATEGY_VARIANTS.map(v => v.name));
    const policyReport = report.policies[0];
    expect(policyReport.matchups).toHaveLength(DEFAULT_STRATEGY_VARIANTS.length);
    for (const matchup of policyReport.matchups) {
      expect(matchup.matches).toBe(6); // 2 座次 × 3 局
      expect(matchup.dynamicWinRate + matchup.staticWinRate).toBeCloseTo(1, 10);
      expect(DEFAULT_STRATEGY_VARIANTS.map(v => v.name)).toContain(matchup.staticStrategy);
    }
  });

  it('同一随机种子与同一输入产出同一报告 (确定性)', () => {
    const options = {
      policies: [DEFAULT_DYNAMIC_POLICY],
      matches: 3,
      baseSeed: 4242,
      maxRounds: MAX_ROUNDS,
      collectStats: true
    } as const;
    expect(runDynamicSwitchingExperiment(options)).toEqual(runDynamicSwitchingExperiment(options));
  });

  it('开启统计时采集到逐决策样本，且动态策略以标准 DecisionStrategy 注入', () => {
    const report = runDynamicSwitchingExperiment({
      policies: [DEFAULT_DYNAMIC_POLICY],
      matches: 3,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS,
      collectStats: true
    });
    const stats = report.policies[0].stats;
    expect(stats.decisions).toBeGreaterThan(0);
    expect(stats.advanceDecisions + stats.suppressDecisions).toBe(stats.decisions);
    expect(typeof dynamicStrategyVariant(DEFAULT_DYNAMIC_POLICY).create).toBe('function');
  });
});

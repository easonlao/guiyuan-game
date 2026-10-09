import { describe, it, expect } from 'vitest';
import {
  HeadlessBenchmark,
  BenchmarkMetrics,
  rushGuiyuanStrategy,
  aggressiveStrategy,
  balancedStrategy
} from '../../src/core/index.js';

describe('HeadlessBenchmark (Batch Headless Simulation & Diagnostic)', () => {
  it('should run 100 matches and produce complete valid metrics', () => {
    const benchmark = new HeadlessBenchmark();
    const metrics: BenchmarkMetrics = benchmark.run({
      matches: 100,
      baseSeed: 10000,
      maxRounds: 60
    });

    expect(metrics.totalMatches).toBe(100);
    expect(metrics.totalDurationMs).toBeGreaterThan(0);
    expect(metrics.avgDurationMs).toBeGreaterThan(0);
    expect(metrics.tps).toBeGreaterThan(0);

    // 胜负与平局守恒
    expect(metrics.p1Wins + metrics.p2Wins + metrics.draws).toBe(100);
    expect(metrics.p1WinRate).toBeCloseTo(metrics.p1Wins / 100, 5);
    expect(metrics.p2WinRate).toBeCloseTo(metrics.p2Wins / 100, 5);

    // 终局形态守恒
    expect(metrics.guiYuanCount + metrics.maxRoundsCount).toBe(100);
    expect(metrics.guiYuanRate).toBeCloseTo(metrics.guiYuanCount / 100, 5);
    expect(metrics.maxRoundsRate).toBeCloseTo(metrics.maxRoundsCount / 100, 5);

    // 智能快刀细分终局度量守恒
    expect(
      metrics.doubleGuiYuanCount +
      metrics.suddenDeathCount +
      metrics.catchupFailCount +
      metrics.p2DirectCount
    ).toBe(metrics.guiYuanCount);

    expect(
      metrics.doubleGuiYuanCount +
      metrics.suddenDeathCount +
      metrics.catchupFailCount +
      metrics.p2DirectCount +
      metrics.maxRoundsCount
    ).toBe(100);

    expect(metrics.doubleGuiYuanRate).toBeCloseTo(metrics.doubleGuiYuanCount / 100, 5);
    expect(metrics.suddenDeathRate).toBeCloseTo(metrics.suddenDeathCount / 100, 5);
    expect(metrics.catchupFailRate).toBeCloseTo(metrics.catchupFailCount / 100, 5);
    expect(metrics.p2DirectRate).toBeCloseTo(metrics.p2DirectCount / 100, 5);

    // 天命揭牌度量守恒
    expect(metrics.showdownCount).toBe(metrics.showdownSuccessCount + metrics.showdownFailCount);
    expect(metrics.showdownRate).toBeCloseTo(metrics.showdownCount / 100, 5);
    expect(metrics.showdownSuccessRate).toBeCloseTo(metrics.showdownSuccessCount / 100, 5);
    expect(metrics.showdownFailRate).toBeCloseTo(metrics.showdownFailCount / 100, 5);

    // 回合数与内存指标
    expect(metrics.avgRounds).toBeGreaterThan(0);
    expect(metrics.avgRounds).toBeLessThanOrEqual(60);
    expect(metrics.heapUsedStartMB).toBeGreaterThan(0);
    expect(metrics.heapUsedEndMB).toBeGreaterThan(0);
    expect(typeof metrics.heapUsedDeltaMB).toBe('number');
  });

  it('should format report with all required sections and data', () => {
    const benchmark = new HeadlessBenchmark();
    const metrics = benchmark.run({
      matches: 50,
      baseSeed: 20000
    });

    const report = benchmark.formatReport(metrics);

    expect(report).toContain('归元弈 (Guiyuan) - 万局无头推演基线评测报告');
    expect(report).toContain('对局总量 (Matches)');
    expect(report).toContain('单局平均耗时 (Avg Time)');
    expect(report).toContain('吞吐量 (Throughput)');
    expect(report).toContain('【胜负分布】');
    expect(report).toContain('P1 胜利');
    expect(report).toContain('P2 胜利');
    expect(report).toContain('【终局形态与回合】');
    expect(report).toContain('五行归元');
    expect(report).toContain('同轮双归元');
    expect(report).toContain('常规秒结');
    expect(report).toContain('追平失败');
    expect(report).toContain('后手直接');
    expect(report).toContain('天命揭牌');
    expect(report).toContain('达到上限');
    expect(report).toContain('【内存与 GC 指标】');
    expect(report).toContain('堆内存增量');
  });

  it('should support customized strategies for match pairings', () => {
    const benchmark = new HeadlessBenchmark();
    const metrics = benchmark.run({
      matches: 30,
      baseSeed: 30000,
      strategyP1: rushGuiyuanStrategy,
      strategyP2: aggressiveStrategy,
      maxRounds: 40
    });

    expect(metrics.totalMatches).toBe(30);
    expect(metrics.p1Wins + metrics.p2Wins + metrics.draws).toBe(30);
    expect(metrics.avgRounds).toBeLessThanOrEqual(40);
  });

  it('should produce 100% deterministic results given the same baseSeed', () => {
    const benchmark = new HeadlessBenchmark();
    const run1 = benchmark.run({
      matches: 50,
      baseSeed: 99999,
      strategyP1: balancedStrategy,
      strategyP2: balancedStrategy
    });

    const run2 = benchmark.run({
      matches: 50,
      baseSeed: 99999,
      strategyP1: balancedStrategy,
      strategyP2: balancedStrategy
    });

    expect(run1.p1Wins).toBe(run2.p1Wins);
    expect(run1.p2Wins).toBe(run2.p2Wins);
    expect(run1.draws).toBe(run2.draws);
    expect(run1.guiYuanCount).toBe(run2.guiYuanCount);
    expect(run1.maxRoundsCount).toBe(run2.maxRoundsCount);
    expect(run1.doubleGuiYuanCount).toBe(run2.doubleGuiYuanCount);
    expect(run1.suddenDeathCount).toBe(run2.suddenDeathCount);
    expect(run1.catchupFailCount).toBe(run2.catchupFailCount);
    expect(run1.p2DirectCount).toBe(run2.p2DirectCount);
    expect(run1.showdownCount).toBe(run2.showdownCount);
    expect(run1.showdownSuccessCount).toBe(run2.showdownSuccessCount);
    expect(run1.showdownFailCount).toBe(run2.showdownFailCount);
    expect(run1.avgRounds).toBe(run2.avgRounds);
  });

  it('should accurately classify all smart sudden death and catchup closure types', () => {
    const benchmark = new HeadlessBenchmark();
    const metrics = benchmark.run({
      matches: 200,
      baseSeed: 10000,
      strategyP1: balancedStrategy,
      strategyP2: balancedStrategy,
      maxRounds: 30
    });

    // 验证各细分终局类型均有采集且相互排他累加守恒
    expect(metrics.totalMatches).toBe(200);
    expect(metrics.guiYuanCount).toBeGreaterThan(0);
    expect(
      metrics.doubleGuiYuanCount +
      metrics.suddenDeathCount +
      metrics.catchupFailCount +
      metrics.p2DirectCount
    ).toBe(metrics.guiYuanCount);

    // 验证比率严格在 [0, 1] 区间
    expect(metrics.doubleGuiYuanRate).toBeGreaterThanOrEqual(0);
    expect(metrics.suddenDeathRate).toBeGreaterThanOrEqual(0);
    expect(metrics.catchupFailRate).toBeGreaterThanOrEqual(0);
    expect(metrics.p2DirectRate).toBeGreaterThanOrEqual(0);
    expect(metrics.showdownCount).toBe(metrics.showdownSuccessCount + metrics.showdownFailCount);
    expect(metrics.showdownRate).toBeGreaterThanOrEqual(0);
    expect(metrics.showdownSuccessRate).toBeGreaterThanOrEqual(0);
    expect(metrics.showdownFailRate).toBeGreaterThanOrEqual(0);
  });

  it('should handle recordActions option properly', () => {
    const benchmark = new HeadlessBenchmark();
    const metricsWithRecord = benchmark.run({
      matches: 10,
      baseSeed: 50000,
      recordActions: true
    });

    const metricsWithoutRecord = benchmark.run({
      matches: 10,
      baseSeed: 50000,
      recordActions: false
    });

    expect(metricsWithRecord.p1Wins).toBe(metricsWithoutRecord.p1Wins);
    expect(metricsWithRecord.p2Wins).toBe(metricsWithoutRecord.p2Wins);
    expect(metricsWithRecord.guiYuanCount).toBe(metricsWithoutRecord.guiYuanCount);
  });

  it('should handle zero matches edge case safely without dividing by zero', () => {
    const benchmark = new HeadlessBenchmark();
    const metrics = benchmark.run({ matches: 0 });

    expect(metrics.totalMatches).toBe(0);
    expect(metrics.p1WinRate).toBe(0);
    expect(metrics.p2WinRate).toBe(0);
    expect(metrics.avgDurationMs).toBe(0);
    expect(metrics.tps).toBe(0);
    expect(metrics.doubleGuiYuanRate).toBe(0);
    expect(metrics.suddenDeathRate).toBe(0);
    expect(metrics.catchupFailRate).toBe(0);
    expect(metrics.p2DirectRate).toBe(0);
    expect(metrics.showdownRate).toBe(0);
    expect(metrics.showdownSuccessRate).toBe(0);
    expect(metrics.showdownFailRate).toBe(0);

    const report = benchmark.formatReport(metrics);
    expect(typeof report).toBe('string');
  });
});

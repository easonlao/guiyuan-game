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
    expect(run1.avgRounds).toBe(run2.avgRounds);
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

    const report = benchmark.formatReport(metrics);
    expect(typeof report).toBe('string');
  });
});

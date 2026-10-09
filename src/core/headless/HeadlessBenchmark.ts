/**
 * 归元弈 (Guiyuan) - 万局无头推演基线评测器 (HeadlessBenchmark)
 * 纯 TS 实现，零 DOM/BOM 依赖，可在脱水/Node.js/CI 环境中执行海量批量推演与性能/GC 诊断
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { HeadlessMatch, DecisionStrategy } from './HeadlessMatch.js';
import { balancedStrategy } from '../ai/Strategy.js';

export interface BenchmarkOptions {
  matches: number;
  baseSeed?: number;
  maxRounds?: number;
  strategyP1?: DecisionStrategy;
  strategyP2?: DecisionStrategy;
  recordActions?: boolean;
}

export interface BenchmarkMetrics {
  totalMatches: number;
  totalDurationMs: number;
  avgDurationMs: number;
  tps: number;
  p1Wins: number;
  p2Wins: number;
  draws: number;
  p1WinRate: number;
  p2WinRate: number;
  guiYuanCount: number;
  guiYuanRate: number;
  maxRoundsCount: number;
  maxRoundsRate: number;
  avgRounds: number;
  heapUsedDeltaMB: number;
  heapUsedStartMB: number;
  heapUsedEndMB: number;
}

export class HeadlessBenchmark {
  private readonly headlessMatch: HeadlessMatch;

  constructor(headlessMatch?: HeadlessMatch) {
    this.headlessMatch = headlessMatch ?? new HeadlessMatch();
  }

  run(options?: Partial<BenchmarkOptions>): BenchmarkMetrics {
    const totalMatches = options?.matches ?? 10000;
    const baseSeed = options?.baseSeed ?? 10000;
    const maxRounds = options?.maxRounds ?? 30;
    const strategyP1 = options?.strategyP1 ?? balancedStrategy;
    const strategyP2 = options?.strategyP2 ?? balancedStrategy;
    const recordActions = options?.recordActions ?? false;

    // 内存检测前置准备（若处于 expose-gc 环境则尽可能触发全量 GC 获得干净初始基线）
    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
    }
    const memStart = typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage().heapUsed : 0;
    const startMs = performance.now();

    let p1Wins = 0;
    let p2Wins = 0;
    let draws = 0;
    let guiYuanCount = 0;
    let maxRoundsCount = 0;
    let totalRounds = 0;

    for (let i = 0; i < totalMatches; i++) {
      const matchResult = this.headlessMatch.run(strategyP1, strategyP2, {
        seed: baseSeed + i,
        maxRounds,
        recordActions
      });

      if (matchResult.winner === 'P1') {
        p1Wins++;
      } else if (matchResult.winner === 'P2') {
        p2Wins++;
      } else {
        draws++;
      }

      if (matchResult.endReason === 'GUI_YUAN') {
        guiYuanCount++;
      } else if (matchResult.endReason === 'MAX_ROUNDS') {
        maxRoundsCount++;
      }

      totalRounds += matchResult.roundsPlayed;
    }

    const endMs = performance.now();
    const memEnd = typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage().heapUsed : 0;

    const totalDurationMs = Math.max(0, endMs - startMs);
    const avgDurationMs = totalMatches > 0 ? totalDurationMs / totalMatches : 0;
    const durationSeconds = totalDurationMs / 1000;
    const tps = durationSeconds > 0 ? totalMatches / durationSeconds : 0;

    const p1WinRate = totalMatches > 0 ? p1Wins / totalMatches : 0;
    const p2WinRate = totalMatches > 0 ? p2Wins / totalMatches : 0;
    const guiYuanRate = totalMatches > 0 ? guiYuanCount / totalMatches : 0;
    const maxRoundsRate = totalMatches > 0 ? maxRoundsCount / totalMatches : 0;
    const avgRounds = totalMatches > 0 ? totalRounds / totalMatches : 0;

    const heapUsedStartMB = memStart / (1024 * 1024);
    const heapUsedEndMB = memEnd / (1024 * 1024);
    const heapUsedDeltaMB = (memEnd - memStart) / (1024 * 1024);

    return {
      totalMatches,
      totalDurationMs,
      avgDurationMs,
      tps,
      p1Wins,
      p2Wins,
      draws,
      p1WinRate,
      p2WinRate,
      guiYuanCount,
      guiYuanRate,
      maxRoundsCount,
      maxRoundsRate,
      avgRounds,
      heapUsedDeltaMB,
      heapUsedStartMB,
      heapUsedEndMB
    };
  }

  formatReport(metrics: BenchmarkMetrics): string {
    const p1Pct = (metrics.p1WinRate * 100).toFixed(2);
    const p2Pct = (metrics.p2WinRate * 100).toFixed(2);
    const drawPct = metrics.totalMatches > 0 ? ((metrics.draws / metrics.totalMatches) * 100).toFixed(2) : '0.00';
    const gyPct = (metrics.guiYuanRate * 100).toFixed(2);
    const mrPct = (metrics.maxRoundsRate * 100).toFixed(2);
    const tps = Math.round(metrics.tps);
    const avgMs = metrics.avgDurationMs.toFixed(3);
    const deltaSign = metrics.heapUsedDeltaMB >= 0 ? '+' : '';
    const deltaMB = `${deltaSign}${metrics.heapUsedDeltaMB.toFixed(2)}`;

    return [
      '=================================================================',
      '               归元弈 (Guiyuan) - 万局无头推演基线评测报告               ',
      '=================================================================',
      ` 对局总量 (Matches)     : ${metrics.totalMatches.toLocaleString()}`,
      ` 总耗时 (Total Duration) : ${metrics.totalDurationMs.toFixed(2)} ms`,
      ` 单局平均耗时 (Avg Time) : ${avgMs} ms`,
      ` 吞吐量 (Throughput)     : ${tps.toLocaleString()} TPS`,
      '-----------------------------------------------------------------',
      ' 【胜负分布】',
      ` P1 胜利 (P1 Wins)       : ${metrics.p1Wins.toLocaleString()} (${p1Pct}%)`,
      ` P2 胜利 (P2 Wins)       : ${metrics.p2Wins.toLocaleString()} (${p2Pct}%)`,
      ` 平局 (Draws)            : ${metrics.draws.toLocaleString()} (${drawPct}%)`,
      '-----------------------------------------------------------------',
      ' 【终局形态与回合】',
      ` 五行归元 (Gui Yuan)     : ${metrics.guiYuanCount.toLocaleString()} (${gyPct}%)`,
      ` 达到上限 (Max Rounds)   : ${metrics.maxRoundsCount.toLocaleString()} (${mrPct}%)`,
      ` 平均回合数 (Avg Rounds) : ${metrics.avgRounds.toFixed(2)} 回合`,
      '-----------------------------------------------------------------',
      ' 【内存与 GC 指标】',
      ` 起始堆内存 (Heap Start) : ${metrics.heapUsedStartMB.toFixed(2)} MB`,
      ` 结束堆内存 (Heap End)   : ${metrics.heapUsedEndMB.toFixed(2)} MB`,
      ` 堆内存增量 (Heap Delta) : ${deltaMB} MB`,
      '================================================================='
    ].join('\n');
  }
}

// 支持 CLI 命令行直接执行
if (typeof process !== 'undefined' && process.argv && process.argv[1]) {
  try {
    const isDirectRun =
      import.meta.url === pathToFileURL(process.argv[1]).href ||
      import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
    if (isDirectRun) {
      const benchmark = new HeadlessBenchmark();
      console.log('🚀 开始执行万局无头推演基准测试 (10,000 matches)...');
      const metrics = benchmark.run({ matches: 10000 });
      console.log(benchmark.formatReport(metrics));
    }
  } catch {
    // 忽略静默捕获
  }
}

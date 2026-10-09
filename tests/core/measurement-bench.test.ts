import { describe, it, expect } from 'vitest';
import { BoardState, WuXing } from '../../src/core/types/domain.js';
import { measureBoardDiff, countBoardDamage } from '../../src/core/logic/State.js';
import { HeadlessMatch } from '../../src/core/headless/HeadlessMatch.js';
import {
  runMeasurementMatrix,
  runAiPreferenceScan,
  runScoreLeverScan,
  runHeadToHeadScan,
  formatAiPreferenceReport,
  formatScoreLeverReport,
  formatHeadToHeadReport,
  formatMeasurementReport,
  DEFAULT_STRATEGY_VARIANTS,
  DEFAULT_SCORE_CONFIG_VARIANTS,
  SCORE_LEVER_CONFIG_VARIANTS,
  SCORE_LEVER_STRATEGY_TEMPLATES
} from '../../src/core/headless/MeasurementBench.js';
import { balancedStrategy, pureSuppressStrategy } from '../../src/core/ai/Strategy.js';

/** 构造仅覆盖被测节点的棋盘，其余节点保持虚空 (0,0) */
function boardWith(overrides: Partial<Record<WuXing, { yin: -1 | 0 | 1 | 2; yang: -1 | 0 | 1 | 2 }>>): BoardState {
  const board = {
    [WuXing.WOOD]: { yin: 0, yang: 0 },
    [WuXing.FIRE]: { yin: 0, yang: 0 },
    [WuXing.EARTH]: { yin: 0, yang: 0 },
    [WuXing.METAL]: { yin: 0, yang: 0 },
    [WuXing.WATER]: { yin: 0, yang: 0 }
  } as Record<WuXing, { yin: -1 | 0 | 1 | 2; yang: -1 | 0 | 1 | 2 }>;
  for (const [element, node] of Object.entries(overrides)) {
    board[element as WuXing] = node;
  }
  return board as BoardState;
}

describe('measureBoardDiff (Ticket 03 board-diff measurement)', () => {
  it('counts a blessed side weakened 2 -> 1 as exactly 1 suppression (NOT 0 unlit-side)', () => {
    // 回归陷阱：若按“未点亮侧数”统计，(2,2) -> (1,2) 会被记为 0 削弱。
    // 正确口径必须按等级下降量统计：加持 2 降到点亮 1 记 1 次削弱。
    const prev = boardWith({ [WuXing.WOOD]: { yin: 2, yang: 2 } });
    const next = boardWith({ [WuXing.WOOD]: { yin: 1, yang: 2 } });

    const diff = measureBoardDiff(prev, next);

    expect(diff.suppressionLevels).toBe(1);
    expect(diff.constructionLevels).toBe(0);
  });

  it('counts 1 -> 0 and 0 -> -1 as one suppression level each', () => {
    const prev = boardWith({
      [WuXing.WOOD]: { yin: 1, yang: 0 },
      [WuXing.FIRE]: { yin: 0, yang: 0 }
    });
    const next = boardWith({
      [WuXing.WOOD]: { yin: 0, yang: 0 },
      [WuXing.FIRE]: { yin: -1, yang: 0 }
    });

    const diff = measureBoardDiff(prev, next);

    expect(diff.suppressionLevels).toBe(2);
    expect(diff.constructionLevels).toBe(0);
  });

  it('counts own construction increases across both polarities', () => {
    const prev = boardWith({});
    const next = boardWith({ [WuXing.WATER]: { yin: 1, yang: 2 } });

    const diff = measureBoardDiff(prev, next);

    expect(diff.constructionLevels).toBe(3);
    expect(diff.suppressionLevels).toBe(0);
  });

  it('separates simultaneous construction and suppression on the same board', () => {
    const prev = boardWith({ [WuXing.WOOD]: { yin: 2, yang: 0 } });
    const next = boardWith({ [WuXing.WOOD]: { yin: 1, yang: 1 } });

    const diff = measureBoardDiff(prev, next);

    expect(diff.suppressionLevels).toBe(1);
    expect(diff.constructionLevels).toBe(1);
  });

  it('returns zeroes for an unchanged board', () => {
    const board = boardWith({ [WuXing.METAL]: { yin: 1, yang: -1 } });
    const diff = measureBoardDiff(board, board);
    expect(diff).toEqual({ constructionLevels: 0, suppressionLevels: 0 });
  });
});

describe('HeadlessMatch per-match stats (Ticket 03 instrumentation)', () => {
  it('leaves stats undefined by default so the default path is unaffected', () => {
    const result = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
      seed: 4242,
      maxRounds: 30
    });
    expect(result.stats).toBeUndefined();
  });

  it('score composition sums exactly to the final score for both players across many endings', () => {
    const match = new HeadlessMatch();
    let sawMaxRounds = false;

    for (let i = 0; i < 60; i++) {
      const result = match.run(balancedStrategy, balancedStrategy, {
        seed: 10000 + i,
        maxRounds: 30,
        collectStats: true
      });
      if (result.endReason === 'MAX_ROUNDS') sawMaxRounds = true;

      const stats = result.stats!;
      const sumP1 =
        stats.P1.scoreComposition.constructionPoints +
        stats.P1.scoreComposition.suppressionPoints +
        stats.P1.scoreComposition.milestonePoints +
        stats.P1.scoreComposition.damagePenalty;
      const sumP2 =
        stats.P2.scoreComposition.constructionPoints +
        stats.P2.scoreComposition.suppressionPoints +
        stats.P2.scoreComposition.milestonePoints +
        stats.P2.scoreComposition.damagePenalty;

      expect(sumP1).toBe(result.finalP1Score);
      expect(sumP2).toBe(result.finalP2Score);
    }

    // 确保至少覆盖一局 MAX_ROUNDS 终局（含终局道损惩罚归因）
    expect(sawMaxRounds).toBe(true);
  });

  it('reports residual damage matching the final boards', () => {
    const result = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
      seed: 777,
      maxRounds: 30,
      collectStats: true
    });
    const stats = result.stats!;
    expect(stats.residualDamage.P1).toBe(countBoardDamage(result.finalState.players.P1.board));
    expect(stats.residualDamage.P2).toBe(countBoardDamage(result.finalState.players.P2.board));
  });

  it('accumulates suppression levels above zero for a suppression-focused match', () => {
    const result = new HeadlessMatch().run(pureSuppressStrategy, pureSuppressStrategy, {
      seed: 12345,
      maxRounds: 30,
      collectStats: true
    });
    const stats = result.stats!;
    expect(stats.P1.suppressionLevels + stats.P2.suppressionLevels).toBeGreaterThan(0);
  });
});

describe('MeasurementBench (Ticket 03 matrix)', () => {
  it('reproduces the known baseline within 1.5pp with variant B off + balanced strategy', () => {
    const balanced = DEFAULT_STRATEGY_VARIANTS.find(variant => variant.name === '平衡')!;
    const defaultConfig = DEFAULT_SCORE_CONFIG_VARIANTS.find(variant => variant.name === 'default')!;

    const report = runMeasurementMatrix({
      modes: ['off'],
      scoreConfigs: [defaultConfig],
      strategies: [balanced],
      matches: 10000,
      baseSeed: 10000,
      maxRounds: 30
    });

    expect(report.cells).toHaveLength(1);
    const cell = report.cells[0];
    expect(cell.guiYuanRate).toBeCloseTo(0.885, 2);
    expect(Math.abs(cell.guiYuanRate - 0.885)).toBeLessThanOrEqual(0.015);
    expect(Math.abs(cell.showdownRate - 0.33)).toBeLessThanOrEqual(0.015);
    expect(Math.abs(cell.avgRounds - 20)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(cell.p1WinRate - 0.52)).toBeLessThanOrEqual(0.015);
  });

  it('runs the full cross-product of modes × score configs × strategy families', () => {
    const report = runMeasurementMatrix({ matches: 20, baseSeed: 10000, maxRounds: 30 });

    const expectedCells =
      report.modes.length * report.scoreConfigNames.length * report.strategyNames.length;
    expect(report.cells).toHaveLength(expectedCells);
    expect(report.strategyNames).toEqual(['平衡', '纯推进', '纯压制']);

    // 每个格都携带种子、样本量与策略名
    for (const cell of report.cells) {
      expect(cell.seed).toBe(10000);
      expect(cell.matches).toBe(20);
      expect(['off', 'full']).toContain(cell.mode);
      expect(report.strategyNames).toContain(cell.strategyName);
    }
  });

  it('reports positive suppression for the pure-suppression family (trap guard end-to-end)', () => {
    const pureSuppress = DEFAULT_STRATEGY_VARIANTS.find(variant => variant.name === '纯压制')!;
    const defaultConfig = DEFAULT_SCORE_CONFIG_VARIANTS.find(variant => variant.name === 'default')!;
    const report = runMeasurementMatrix({
      modes: ['off'],
      scoreConfigs: [defaultConfig],
      strategies: [pureSuppress],
      matches: 200,
      baseSeed: 10000,
      maxRounds: 30
    });
    expect(report.cells[0].suppressionLevels).toBeGreaterThan(0);
  });

  it('formats a markdown table carrying mode, config, strategy, seed and sample size', () => {
    const report = runMeasurementMatrix({ matches: 5, baseSeed: 10000, maxRounds: 30 });
    const markdown = formatMeasurementReport(report);

    expect(markdown).toContain('| 模式 | 计分配置 | 策略 | 种子 | 样本 | 归元率 |');
    expect(markdown).toContain('| 压制度量 |');
    expect(markdown).toContain('| off |');
    expect(markdown).toContain('| full |');
    expect(markdown).toContain('| 平衡 |');
    expect(markdown).toContain('| 纯推进 |');
    expect(markdown).toContain('| 纯压制 |');
    expect(markdown).toContain('种子基数: 10000');

    const bodyRows = markdown
      .split('\n')
      .filter(line => line.startsWith('| off ') || line.startsWith('| full '));
    expect(bodyRows).toHaveLength(report.cells.length);
  });

  it('is deterministic given the same seed', () => {
    const first = runMeasurementMatrix({ matches: 30, baseSeed: 4242, maxRounds: 30 });
    const second = runMeasurementMatrix({ matches: 30, baseSeed: 4242, maxRounds: 30 });
    expect(first.cells).toEqual(second.cells);
  });
});

describe('MeasurementBench score-lever scan (Ticket 05)', () => {
  it('cross-products every candidate config × strategy × mode', () => {
    const report = runScoreLeverScan({ matches: 5, baseSeed: 10000, maxRounds: 30 });

    expect(report.modes).toEqual(['off', 'full']);
    expect(report.scoreConfigNames).toEqual([
      '现状',
      '撤销攻击强化',
      '道损惩罚下调',
      '组合',
      '攻击净收益归零',
      '组合·攻击归零'
    ]);
    expect(report.strategyNames).toEqual([
      '平衡',
      '归元冲刺',
      '激进压制',
      '保守自保',
      '纯推进',
      '纯压制'
    ]);
    expect(report.cells).toHaveLength(
      report.scoreConfigNames.length * report.strategyNames.length * report.modes.length
    );
  });

  it('reproduces the existing matrix result for the 现状 config (binding the default config is a no-op)', () => {
    const baseline = DEFAULT_SCORE_CONFIG_VARIANTS.find(variant => variant.name === 'default')!;
    const balanced = DEFAULT_STRATEGY_VARIANTS.find(variant => variant.name === '平衡')!;
    const matrix = runMeasurementMatrix({
      modes: ['off'],
      scoreConfigs: [baseline],
      strategies: [balanced],
      matches: 200,
      baseSeed: 10000,
      maxRounds: 30
    });

    const lever = runScoreLeverScan({
      modes: ['off'],
      scoreConfigs: [SCORE_LEVER_CONFIG_VARIANTS[0]],
      strategyTemplates: [SCORE_LEVER_STRATEGY_TEMPLATES[0]],
      matches: 200,
      baseSeed: 10000,
      maxRounds: 30
    });

    expect(lever.cells).toHaveLength(1);
    const { scoreConfigName: _matrixConfigName, ...matrixCell } = matrix.cells[0];
    const { scoreConfigName: _leverConfigName, ...leverCell } = lever.cells[0];
    expect(leverCell).toEqual(matrixCell);
  });

  it('wires the candidate config into the AI evaluator so the rule change moves behavior', () => {
    // 关键回归：若计分配置只影响终局判据而不影响 AI 估值，归元率会逐格相同。
    // 攻击净收益归零后，full 模式的平衡策略应显著回升（远离 30 回合分数结算）。
    const report = runScoreLeverScan({
      modes: ['full'],
      scoreConfigs: [SCORE_LEVER_CONFIG_VARIANTS[0], SCORE_LEVER_CONFIG_VARIANTS[4]],
      strategyTemplates: [SCORE_LEVER_STRATEGY_TEMPLATES[0]],
      matches: 400,
      baseSeed: 10000,
      maxRounds: 30
    });

    const baseline = report.cells.find(cell => cell.scoreConfigName === '现状')!;
    const attackZero = report.cells.find(cell => cell.scoreConfigName === '攻击净收益归零')!;
    expect(attackZero.guiYuanRate).toBeGreaterThan(baseline.guiYuanRate);
    expect(attackZero.avgRounds).toBeLessThan(baseline.avgRounds);
  });

  it('formats a markdown report with per-config detail and full-mode strategy matrices', () => {
    const report = runScoreLeverScan({ matches: 3, baseSeed: 10000, maxRounds: 30 });
    const markdown = formatScoreLeverReport(report);

    expect(markdown).toContain('| 计分配置 | 策略 | 模式 | 归元率 |');
    expect(markdown).toContain('full 模式归元率矩阵');
    expect(markdown).toContain('full 模式回合上限率矩阵');
    for (const name of report.scoreConfigNames) {
      expect(markdown).toContain(`| ${name} |`);
    }
    for (const name of report.strategyNames) {
      expect(markdown).toContain(`| ${name} |`);
    }
    expect(markdown).toContain('种子基数: 10000');
  });

  it('is deterministic given the same seed', () => {
    const options = {
      scoreConfigs: SCORE_LEVER_CONFIG_VARIANTS.slice(0, 2),
      strategyTemplates: SCORE_LEVER_STRATEGY_TEMPLATES.slice(0, 2),
      matches: 10,
      baseSeed: 4242,
      maxRounds: 30
    } as const;
    const first = runScoreLeverScan(options);
    const second = runScoreLeverScan(options);
    expect(first.cells).toEqual(second.cells);
  });
});

describe('MeasurementBench head-to-head scan (Ticket 05 pure-strategy dominance)', () => {
  it('cross-products every ordered strategy pair × config × mode', () => {
    const report = runHeadToHeadScan({ matches: 3, baseSeed: 10000, maxRounds: 30 });

    const strategies = SCORE_LEVER_STRATEGY_TEMPLATES.length;
    const pairs = strategies * (strategies - 1);
    expect(report.cells).toHaveLength(
      report.scoreConfigNames.length * report.modes.length * pairs
    );
    // 每个有序对都在场，且 A ≠ B
    for (const cell of report.cells) {
      expect(cell.strategyA).not.toBe(cell.strategyB);
      expect(cell.aWinRate + cell.bWinRate + cell.drawRate).toBeCloseTo(1, 6);
    }
  });

  it('carries cross-play signal: pure rush beats balanced in full mode under 现状', () => {
    const report = runHeadToHeadScan({
      modes: ['full'],
      scoreConfigs: [SCORE_LEVER_CONFIG_VARIANTS[0]],
      strategyTemplates: SCORE_LEVER_STRATEGY_TEMPLATES.filter(
        template => template.name === '纯推进' || template.name === '平衡'
      ),
      matches: 400,
      baseSeed: 10000,
      maxRounds: 30
    });

    const pureRushVsBalanced = report.cells.find(
      cell => cell.strategyA === '纯推进' && cell.strategyB === '平衡'
    )!;
    expect(pureRushVsBalanced.aWinRate).toBeGreaterThan(0.5);
  });

  it('formats a head-to-head matrix per config and mode', () => {
    const report = runHeadToHeadScan({
      scoreConfigs: SCORE_LEVER_CONFIG_VARIANTS.slice(0, 1),
      strategyTemplates: SCORE_LEVER_STRATEGY_TEMPLATES.slice(0, 3),
      matches: 3,
      baseSeed: 10000,
      maxRounds: 30
    });
    const markdown = formatHeadToHeadReport(report);

    expect(markdown).toContain('策略对拼矩阵');
    expect(markdown).toContain('现状 · off · 原始');
    expect(markdown).toContain('现状 · full · 原始');
    expect(markdown).toContain('座次平衡');
    expect(markdown).toContain('| A \\ B |');
  });

  it('is deterministic given the same seed', () => {
    const options = {
      modes: ['off'] as const,
      scoreConfigs: SCORE_LEVER_CONFIG_VARIANTS.slice(0, 1),
      strategyTemplates: SCORE_LEVER_STRATEGY_TEMPLATES.slice(0, 2),
      matches: 10,
      baseSeed: 4242,
      maxRounds: 30
    };
    const first = runHeadToHeadScan(options);
    const second = runHeadToHeadScan(options);
    expect(first.cells).toEqual(second.cells);
  });
});

describe('MeasurementBench AI-preference scan (Ticket 04)', () => {
  it('scans the four weight presets across off/full with supplementary pure strategies', () => {
    const report = runAiPreferenceScan({ matches: 20, baseSeed: 10000, maxRounds: 30 });

    expect(report.modes).toEqual(['off', 'full']);
    expect(report.strategyNames).toEqual(['平衡', '归元冲刺', '激进压制', '保守自保', '纯推进', '纯压制']);
    expect(report.cells).toHaveLength(report.modes.length * report.strategyNames.length);

    for (const cell of report.cells) {
      expect(cell.lowStateDecisions).toBeGreaterThan(0);
      const lowStateTotal = Object.values(cell.lowStateChoices).reduce(
        (sum, count) => sum + count,
        0
      );
      expect(lowStateTotal).toBeCloseTo(cell.lowStateDecisions, 6);
      const actionTotal = Object.values(cell.actionTypeCounts).reduce((sum, count) => sum + count, 0);
      expect(actionTotal).toBeGreaterThan(0);
    }
  });

  it('formats a preset comparison table with off-to-full deltas and a low-state distribution', () => {
    const report = runAiPreferenceScan({ matches: 5, baseSeed: 10000, maxRounds: 30 });
    const markdown = formatAiPreferenceReport(report);

    expect(markdown).toContain('| 策略 | 模式 | 归元率 |');
    expect(markdown).toContain('off→full');
    expect(markdown).toContain('低位态决策分布');
    expect(markdown).toContain('| 平衡 |');
    expect(markdown).toContain('| 归元冲刺 |');
    expect(markdown).toContain('| 激进压制 |');
    expect(markdown).toContain('| 保守自保 |');
    expect(markdown).toContain('| 纯推进 |');
    expect(markdown).toContain('| 纯压制 |');
    expect(markdown).toContain('种子基数: 10000');
  });

  it('is deterministic given the same seed', () => {
    const first = runAiPreferenceScan({ matches: 15, baseSeed: 4242, maxRounds: 30 });
    const second = runAiPreferenceScan({ matches: 15, baseSeed: 4242, maxRounds: 30 });
    expect(first.cells).toEqual(second.cells);
  });
});

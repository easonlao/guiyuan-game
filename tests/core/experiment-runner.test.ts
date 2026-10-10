import { describe, it, expect } from 'vitest';
import {
  runExperimentMatrix,
  runHeadToHeadMatrix,
  findSeatBalancedWinRate,
  toHeadToHeadMatrix,
  formatExperimentReport,
  formatHeadToHeadReport,
  formatDominanceSection,
  formatCombinedReport,
  parseExperimentArgs,
  ruleSwitchesFor,
  DEFAULT_STRATEGY_VARIANTS,
  DEFAULT_SCORE_CONFIG_VARIANTS,
  DEFAULT_RULE_MODES,
  DEFAULT_MATCHES_PER_CELL
} from '../../src/core/headless/ExperimentRunner.js';
import {
  balancedStrategy,
  pureRushStrategy,
  pureSuppressStrategy,
  scoreStrippedStrategy
} from '../../src/core/ai/Strategy.js';
import { HeadlessBenchmark } from '../../src/core/headless/HeadlessBenchmark.js';
import { HeadlessMatch } from '../../src/core/headless/HeadlessMatch.js';

const MAX_ROUNDS = 30;
const BASE_SEED = 10000;

describe('Ticket 06 - 策略族 (strategy family)', () => {
  it('把四个权重预设、纯推进、纯压制与剥离计分并列为七个一等策略', () => {
    expect(DEFAULT_STRATEGY_VARIANTS.map(variant => variant.name)).toEqual([
      '平衡',
      '归元冲刺',
      '激进压制',
      '保守自保',
      '纯推进',
      '纯压制',
      '剥离计分'
    ]);
    for (const strategy of [pureRushStrategy, pureSuppressStrategy, scoreStrippedStrategy]) {
      expect(typeof strategy).toBe('function');
    }
  });

  it('纯压制自对弈的压制度量显著高于纯推进 (两个极端确实作用在相反的轴上)', () => {
    const rush = DEFAULT_STRATEGY_VARIANTS.find(variant => variant.name === '纯推进')!;
    const suppress = DEFAULT_STRATEGY_VARIANTS.find(variant => variant.name === '纯压制')!;
    const report = runExperimentMatrix({
      modes: ['scoring'],
      scoreConfigs: [DEFAULT_SCORE_CONFIG_VARIANTS[0]],
      strategies: [rush, suppress],
      matches: 200,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });

    const rushCell = report.cells.find(cell => cell.strategyName === '纯推进')!;
    const suppressCell = report.cells.find(cell => cell.strategyName === '纯压制')!;

    expect(suppressCell.suppressionLevels).toBeGreaterThan(rushCell.suppressionLevels);
    expect(rushCell.guiYuanRate).toBeGreaterThan(suppressCell.guiYuanRate);
  });

  it('剥离计分策略与平衡策略的决策轨迹不同 (计分轴确实被剥离)', () => {
    const match = new HeadlessMatch();
    const scored = match.run(balancedStrategy, balancedStrategy, {
      seed: 4242,
      maxRounds: MAX_ROUNDS
    });
    const stripped = match.run(scoreStrippedStrategy, scoreStrippedStrategy, {
      seed: 4242,
      maxRounds: MAX_ROUNDS
    });

    expect(stripped.record).not.toEqual(scored.record);
  });
});

describe('Ticket 06 - 声明式矩阵 (strategy × scoreConfig × rule mode)', () => {
  it('跑完 axes 的全交叉，且每个格携带种子与样本量', () => {
    const modes = ['scoring', 'board-only'] as const;
    const configs = DEFAULT_SCORE_CONFIG_VARIANTS.slice(0, 2);
    const strategies = DEFAULT_STRATEGY_VARIANTS.slice(0, 3);
    const report = runExperimentMatrix({
      modes,
      scoreConfigs: configs,
      strategies,
      matches: 5,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });

    expect(report.cells).toHaveLength(modes.length * configs.length * strategies.length);
    for (const cell of report.cells) {
      expect(cell.seed).toBe(BASE_SEED);
      expect(cell.matches).toBe(5);
      expect(modes).toContain(cell.mode);
      expect(report.scoreConfigNames).toContain(cell.scoreConfigName);
      expect(report.strategyNames).toContain(cell.strategyName);
    }
  });

  it('计分配置轴是活的：攻击净收益归零后归元率明显偏离现状', () => {
    const defaultConfig = DEFAULT_SCORE_CONFIG_VARIANTS.find(
      variant => variant.name === 'default'
    )!;
    const attackZero = DEFAULT_SCORE_CONFIG_VARIANTS.find(
      variant => variant.name === 'attack-zero'
    )!;
    const balanced = DEFAULT_STRATEGY_VARIANTS.find(variant => variant.name === '平衡')!;

    const report = runExperimentMatrix({
      modes: ['scoring'],
      scoreConfigs: [defaultConfig, attackZero],
      strategies: [balanced],
      matches: 200,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });

    const baseline = report.cells.find(cell => cell.scoreConfigName === 'default')!;
    const zeroed = report.cells.find(cell => cell.scoreConfigName === 'attack-zero')!;

    expect(Math.abs(zeroed.guiYuanRate - baseline.guiYuanRate)).toBeGreaterThan(0.01);
  });

  it('规则模式轴是活的：board-only 改变平衡策略的指标', () => {
    const balanced = DEFAULT_STRATEGY_VARIANTS.find(variant => variant.name === '平衡')!;
    const defaultConfig = DEFAULT_SCORE_CONFIG_VARIANTS[0];

    const report = runExperimentMatrix({
      modes: DEFAULT_RULE_MODES,
      scoreConfigs: [defaultConfig],
      strategies: [balanced],
      matches: 100,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });

    const scored = report.cells.find(cell => cell.mode === 'scoring')!;
    const boardOnly = report.cells.find(cell => cell.mode === 'board-only')!;

    expect(ruleSwitchesFor('board-only')).toEqual({ boardOnly: true });
    expect(ruleSwitchesFor('scoring')).toEqual({ boardOnly: false });
    expect(
      scored.guiYuanRate !== boardOnly.guiYuanRate ||
        scored.avgRounds !== boardOnly.avgRounds
    ).toBe(true);
  });

  it('同一随机种子与同一矩阵输入产出同一结果 (确定性)', () => {
    const options = {
      modes: DEFAULT_RULE_MODES,
      scoreConfigs: DEFAULT_SCORE_CONFIG_VARIANTS.slice(0, 2),
      strategies: DEFAULT_STRATEGY_VARIANTS.slice(0, 2),
      matches: 10,
      baseSeed: 4242,
      maxRounds: MAX_ROUNDS
    } as const;
    expect(runExperimentMatrix(options).cells).toEqual(runExperimentMatrix(options).cells);
  });
});

describe('Ticket 06 - 基线复现 (self-distortion alarm)', () => {
  it('默认参数下复现 88.64% / 20.20 / 52.02%，容差 ≤1.5 个百分点', () => {
    const balanced = DEFAULT_STRATEGY_VARIANTS.find(variant => variant.name === '平衡')!;
    const defaultConfig = DEFAULT_SCORE_CONFIG_VARIANTS.find(
      variant => variant.name === 'default'
    )!;
    const report = runExperimentMatrix({
      modes: ['scoring'],
      scoreConfigs: [defaultConfig],
      strategies: [balanced],
      matches: 2000,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });

    expect(report.cells).toHaveLength(1);
    const cell = report.cells[0];
    expect(Math.abs(cell.guiYuanRate - 0.8864)).toBeLessThanOrEqual(0.015);
    expect(Math.abs(cell.avgRounds - 20.2)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(cell.p1WinRate - 0.5202)).toBeLessThanOrEqual(0.015);
  });

  it('矩阵自对弈格与直接调用 HeadlessBenchmark 完全一致 (薄层不引入偏差)', () => {
    const balanced = DEFAULT_STRATEGY_VARIANTS.find(variant => variant.name === '平衡')!;
    const defaultConfig = DEFAULT_SCORE_CONFIG_VARIANTS[0];
    const options = { matches: 50, baseSeed: 4242, maxRounds: MAX_ROUNDS };

    const cell = runExperimentMatrix({
      modes: ['scoring'],
      scoreConfigs: [defaultConfig],
      strategies: [balanced],
      ...options
    }).cells[0];

    const direct = new HeadlessBenchmark().run({
      ...options,
      strategyP1: balancedStrategy,
      strategyP2: balancedStrategy,
      scoreConfig: defaultConfig.config,
      rules: ruleSwitchesFor('scoring')
    });

    expect(cell.guiYuanRate).toBe(direct.guiYuanRate);
    expect(cell.drawRate).toBe(direct.drawRate);
    expect(cell.avgRounds).toBe(direct.avgRounds);
    expect(cell.p1WinRate).toBe(direct.p1WinRate);
    expect(cell.p2WinRate).toBe(direct.p2WinRate);
    expect(cell.opponentResidualDamage).toBe(direct.opponentResidualDamage);
  });
});

describe('Ticket 06 - 对拼矩阵座次平衡 (seat balancing)', () => {
  it('覆盖全部有序策略对，且每对打两个座次', () => {
    const strategies = DEFAULT_STRATEGY_VARIANTS.slice(0, 4);
    const report = runHeadToHeadMatrix({
      strategies,
      matches: 3,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });

    const n = strategies.length;
    expect(report.matchups).toHaveLength(n * (n - 1));
    for (const matchup of report.matchups) {
      expect(matchup.strategyA).not.toBe(matchup.strategyB);
      expect(matchup.matches).toBe(matchup.matchesPerSeat * 2);
      expect(matchup.seatBalancedWinRate).toBeGreaterThanOrEqual(0);
      expect(matchup.seatBalancedWinRate).toBeLessThanOrEqual(1);
    }
  });

  it('座次平衡对称性：A 对 B 与 B 对 A 的胜率互补 (和为 1)', () => {
    const report = runHeadToHeadMatrix({
      matches: 50,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });

    for (const a of report.strategies) {
      for (const b of report.strategies) {
        if (a === b) continue;
        const ab = findSeatBalancedWinRate(report, a, b)!;
        const ba = findSeatBalancedWinRate(report, b, a)!;
        expect(ab + ba).toBeCloseTo(1, 10);
      }
    }
  });

  it('座次平衡胜率是两座次的平均，能抵消先手优势', () => {
    const report = runHeadToHeadMatrix({
      strategies: DEFAULT_STRATEGY_VARIANTS.slice(0, 2),
      matches: 50,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });
    const matchup = report.matchups[0];

    // 座次平衡胜率 = 两个座次胜率的平均 + 半场流局（保证互补）
    expect(matchup.seatBalancedWinRate).toBeCloseTo(
      (matchup.aWinRateAsP1 + matchup.aWinRateAsP2) / 2 + 0.5 * matchup.drawRate,
      10
    );
  });

  it('对拼报告可适配为 Metrics.ts 的 HeadToHeadMatrix，覆盖每个有序对', () => {
    const report = runHeadToHeadMatrix({
      strategies: DEFAULT_STRATEGY_VARIANTS.slice(0, 3),
      matches: 3,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });
    const matrix = toHeadToHeadMatrix(report);

    expect(matrix.strategies).toEqual(report.strategies);
    expect(matrix.cells).toHaveLength(report.matchups.length);
    for (const cell of matrix.cells) {
      expect(report.strategies).toContain(cell.p1Strategy);
      expect(report.strategies).toContain(cell.p2Strategy);
    }
  });

  it('同一随机种子产出同一对拼矩阵 (确定性)', () => {
    const options = {
      strategies: DEFAULT_STRATEGY_VARIANTS.slice(0, 3),
      matches: 10,
      baseSeed: 4242,
      maxRounds: MAX_ROUNDS
    } as const;
    expect(runHeadToHeadMatrix(options).matchups).toEqual(
      runHeadToHeadMatrix(options).matchups
    );
  });
});

describe('Ticket 06 - 报告输出 (paste-able markdown)', () => {
  it('对照表含归元率、平均大回合、对手残留道损，且流局率与先后手胜率成对出现', () => {
    const report = runExperimentMatrix({
      modes: ['scoring'],
      scoreConfigs: [DEFAULT_SCORE_CONFIG_VARIANTS[0]],
      strategies: DEFAULT_STRATEGY_VARIANTS.slice(0, 2),
      matches: 3,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });
    const markdown = formatExperimentReport(report);

    expect(markdown).toContain('| 规则模式 | 计分配置 | 策略 | 归元率 |');
    expect(markdown).toContain('平均大回合');
    expect(markdown).toContain('对手残留道损');
    // 每个数据行都同时携带流局率、先手胜率与后手胜率
    const bodyRows = markdown.split('\n').filter(line => line.startsWith('| scoring '));
    expect(bodyRows.length).toBe(report.cells.length);
    for (const row of bodyRows) {
      expect(row).toContain('流局率');
      expect(row).toContain('先手胜率');
      expect(row).toContain('后手胜率');
    }
  });

  it('对拼报告含座次平衡矩阵、逐对明细与由矩阵守卫支撑的占优结论', () => {
    const report = runHeadToHeadMatrix({
      strategies: DEFAULT_STRATEGY_VARIANTS.slice(0, 3),
      matches: 3,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });
    const markdown = formatHeadToHeadReport(report);

    expect(markdown).toContain('座次平衡胜率矩阵');
    expect(markdown).toContain('逐对明细');
    expect(markdown).toContain('座次平衡');
    expect(markdown).toContain('流局率');
    expect(markdown).toContain('先手胜率');
    expect(markdown).toContain('占优结论');
    // 占优结论段落始终由 Metrics.ts 守卫消费矩阵
    expect(formatDominanceSection(report)).toMatch(/占优|矩阵/);
  });

  it('组合报告同时包含对照表与对拼矩阵', () => {
    const experiment = runExperimentMatrix({
      modes: ['scoring'],
      scoreConfigs: [DEFAULT_SCORE_CONFIG_VARIANTS[0]],
      strategies: DEFAULT_STRATEGY_VARIANTS.slice(0, 2),
      matches: 3,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });
    const headToHead = runHeadToHeadMatrix({
      strategies: DEFAULT_STRATEGY_VARIANTS.slice(0, 2),
      matches: 3,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });
    const markdown = formatCombinedReport(experiment, headToHead);

    expect(markdown).toContain('策略 × 计分配置 × 规则模式 对照表');
    expect(markdown).toContain('跨策略对拼矩阵');
  });

  it('CLI 参数解析：默认 all、支持 --scan/--matches/--seed/--max-rounds，未知参数抛错', () => {
    expect(parseExperimentArgs([])).toEqual({
      help: false,
      scan: 'all',
      matches: undefined,
      baseSeed: undefined,
      maxRounds: undefined
    });
    expect(
      parseExperimentArgs(['--scan', 'head-to-head', '--matches', '50', '--seed', '7', '--max-rounds', '30'])
    ).toEqual({ help: false, scan: 'head-to-head', matches: 50, baseSeed: 7, maxRounds: 30 });
    expect(parseExperimentArgs(['--help']).help).toBe(true);
    expect(() => parseExperimentArgs(['--scan', 'nope'])).toThrow(/未知扫描类型/);
    expect(() => parseExperimentArgs(['--bogus'])).toThrow(/未知参数/);
  });

  it('默认每格样本量足以复现基线且 CLI 默认值有定义', () => {
    expect(DEFAULT_MATCHES_PER_CELL).toBeGreaterThanOrEqual(2000);
  });
});

import { describe, it, expect } from 'vitest';
import {
  runExperimentMatrix,
  runHeadToHeadMatrix,
  findSeatBalancedWinRate,
  toHeadToHeadMatrix,
  computeDominanceVerdicts,
  compareHeadToHeadMatrices,
  formatExperimentReport,
  formatHeadToHeadReport,
  formatHeadToHeadComparisonReport,
  formatDominanceSection,
  formatCombinedReport,
  parseExperimentArgs,
  ruleSwitchesFor,
  isBoardSettlementFor,
  DEFAULT_STRATEGY_VARIANTS,
  DEFAULT_SCORE_CONFIG_VARIANTS,
  DEFAULT_RULE_MODES,
  DEFAULT_MATCHES_PER_CELL
} from '../../src/core/headless/ExperimentRunner.js';
import type {
  HeadToHeadMatchup,
  HeadToHeadReport,
  RuleMode
} from '../../src/core/headless/ExperimentRunner.js';
import {
  balancedStrategy,
  aggressiveStrategy,
  pureRushStrategy,
  pureSuppressStrategy,
  scoreStrippedStrategy
} from '../../src/core/ai/Strategy.js';
import { HeadlessBenchmark } from '../../src/core/headless/HeadlessBenchmark.js';
import { HeadlessMatch, defaultBaselineStrategy } from '../../src/core/headless/HeadlessMatch.js';
import { isDirectRun } from '../../src/core/headless/cli.js';
import { countBoardDamage, countBoardGuiYi, countUnlightedSides } from '../../src/core/logic/State.js';
import { pathToFileURL } from 'node:url';

const MAX_ROUNDS = 30;
const BASE_SEED = 10000;

/** 构造一个仅用于逐格对照纯函数测试的合成对拼矩阵。 */
function syntheticMatchup(strategyA: string, strategyB: string, rate: number): HeadToHeadMatchup {
  return {
    strategyA,
    strategyB,
    matches: 100,
    matchesPerSeat: 50,
    seatBalancedWinRate: rate,
    aWinRateAsP1: rate,
    aWinRateAsP2: rate,
    bWinRateAsP1: 1 - rate,
    bWinRateAsP2: 1 - rate,
    drawRate: 0,
    trueDrawRate: 0,
    guiYuanRate: 1,
    avgRounds: 20,
    p1WinRate: 0.5,
    p2WinRate: 0.5,
    opponentResidualDamage: 0
  };
}

function syntheticReport(
  mode: RuleMode,
  pairs: readonly (readonly [string, string, number])[]
): HeadToHeadReport {
  const strategies = [...new Set(pairs.flatMap(([a, b]) => [a, b]))];
  return {
    strategies,
    matchups: pairs.map(([a, b, rate]) => syntheticMatchup(a, b, rate)),
    matchesPerSeat: 50,
    baseSeed: 1,
    maxRounds: MAX_ROUNDS,
    mode,
    scoreConfigName: 'default'
  };
}

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

    expect(ruleSwitchesFor('board-only')).toEqual({ isBoardOnly: true });
    expect(ruleSwitchesFor('scoring')).toEqual({ isBoardOnly: false });
    // board-only 同时剥离终局计分结算（ticket 09 强化隔离）
    expect(isBoardSettlementFor('board-only')).toBe(true);
    expect(isBoardSettlementFor('scoring')).toBe(false);
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

    // 座次平衡胜率 = 两个座次胜率的平均 + 半场平局（保证互补）
    expect(matchup.seatBalancedWinRate).toBeCloseTo(
      (matchup.aWinRateAsP1 + matchup.aWinRateAsP2) / 2 + 0.5 * matchup.trueDrawRate,
      10
    );
  });

  it('对拼矩阵的 drawRate 是流局率（= 1 - 归元率），不是平局率', () => {
    const report = runHeadToHeadMatrix({
      strategies: DEFAULT_STRATEGY_VARIANTS.slice(0, 3),
      matches: 100,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });

    for (const matchup of report.matchups) {
      expect(matchup.drawRate).toBeCloseTo(1 - matchup.guiYuanRate, 10);
    }
    // 压制型对局存在回合上限结算，流局率必须非零（旧实现误报为 0）
    expect(report.matchups.some(matchup => matchup.drawRate > 0)).toBe(true);
  });

  it('对拼矩阵可指定 board-only 规则模式', () => {
    const report = runHeadToHeadMatrix({
      strategies: DEFAULT_STRATEGY_VARIANTS.slice(0, 2),
      matches: 5,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS,
      mode: 'board-only'
    });
    expect(report.mode).toBe('board-only');
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

  it('CLI 参数解析：默认 all/scoring、支持 --scan/--mode/--matches/--seed/--max-rounds，未知参数抛错', () => {
    expect(parseExperimentArgs([])).toEqual({
      isHelp: false,
      scan: 'all',
      mode: 'scoring',
      matches: undefined,
      baseSeed: undefined,
      maxRounds: undefined
    });
    expect(
      parseExperimentArgs(['--scan', 'head-to-head', '--matches', '50', '--seed', '7', '--max-rounds', '30'])
    ).toEqual({
      isHelp: false,
      scan: 'head-to-head',
      mode: 'scoring',
      matches: 50,
      baseSeed: 7,
      maxRounds: 30
    });
    expect(parseExperimentArgs(['--mode', 'board-only']).mode).toBe('board-only');
    expect(parseExperimentArgs(['--mode', 'both']).mode).toBe('both');
    expect(parseExperimentArgs(['--help']).isHelp).toBe(true);
    expect(() => parseExperimentArgs(['--scan', 'nope'])).toThrow(/未知扫描类型/);
    expect(() => parseExperimentArgs(['--mode', 'nope'])).toThrow(/未知规则模式/);
    expect(() => parseExperimentArgs(['--bogus'])).toThrow(/未知参数/);
  });

  it('默认每格样本量足以复现基线且 CLI 默认值有定义', () => {
    expect(DEFAULT_MATCHES_PER_CELL).toBeGreaterThanOrEqual(2000);
  });
});

describe('Ticket 09 - 计分轴开启 vs 关闭 (board-only) 逐格对照', () => {
  const scoringPairs = [
    ['A', 'B', 0.6],
    ['B', 'A', 0.4],
    ['A', 'C', 0.5],
    ['C', 'A', 0.5],
    ['B', 'C', 0.7],
    ['C', 'B', 0.3]
  ] as const;
  const boardPairs = [
    ['A', 'B', 0.4],
    ['B', 'A', 0.6],
    ['A', 'C', 0.5],
    ['C', 'A', 0.5],
    ['B', 'C', 0.7],
    ['C', 'B', 0.3]
  ] as const;

  it('逐格对照识别强弱翻转，tie 保持不变，互补对同时翻转', () => {
    const comparison = compareHeadToHeadMatrices(
      syntheticReport('scoring', scoringPairs),
      syntheticReport('board-only', boardPairs)
    );

    expect(comparison.matchups).toHaveLength(6);
    expect(comparison.flips.map(flip => `${flip.strategyA}->${flip.strategyB}`)).toEqual([
      'A->B',
      'B->A'
    ]);
    const ab = comparison.flips.find(flip => flip.strategyA === 'A')!;
    expect(ab.scoringRelation).toBe('strong');
    expect(ab.boardOnlyRelation).toBe('weak');
    expect(ab.delta).toBeCloseTo(-0.2, 10);
    // A 对 C 两模式都是 50%，不是翻转
    expect(comparison.flips.some(flip => flip.strategyB === 'C')).toBe(false);
  });

  it('逐格对照的占优集合与矩阵一致，并由矩阵守卫支撑', () => {
    const comparison = compareHeadToHeadMatrices(
      syntheticReport('scoring', scoringPairs),
      syntheticReport('board-only', boardPairs)
    );
    const b = comparison.dominance.find(verdict => verdict.strategy === 'B')!;
    expect(b.scoringDominates).toEqual(['C']);
    expect(b.boardOnlyDominates).toEqual(['A', 'C']);
    expect(b.scoringDominatesAll).toBe(false);
    expect(b.boardOnlyDominatesAll).toBe(true);

    const markdown = formatHeadToHeadComparisonReport(comparison);
    expect(markdown).toContain('计分轴开启 (scoring)');
    expect(markdown).toContain('计分轴关闭 (board-only)');
    expect(markdown).toContain('强弱关系翻转');
    expect(markdown).toContain('流局率与先手胜率对照');
    expect(markdown).toContain('占优结论对照');
    expect(markdown).toContain('| A | B |');
  });

  it('computeDominanceVerdicts 为每个策略给出严格占优对象', () => {
    const verdicts = computeDominanceVerdicts(
      syntheticReport('scoring', scoringPairs)
    );
    expect(verdicts.map(verdict => verdict.strategy)).toEqual(['A', 'B', 'C']);
    const c = verdicts.find(verdict => verdict.strategy === 'C')!;
    expect(c.dominates).toEqual([]);
  });

  it('策略族不一致时拒绝逐格对照', () => {
    expect(() =>
      compareHeadToHeadMatrices(
        syntheticReport('scoring', [['A', 'B', 0.6], ['B', 'A', 0.4]]),
        syntheticReport('board-only', [['A', 'C', 0.4], ['C', 'A', 0.6]])
      )
    ).toThrow(/同一策略族/);
  });
});

// ---------------------------------------------------------------------------
// Ticket E - 共享 CLI 直接执行守卫
// ---------------------------------------------------------------------------
describe('共享 CLI 直接执行守卫 (isDirectRun)', () => {
  const modulePath = '/repo/src/core/headless/ExperimentRunner.ts';
  const moduleUrl = pathToFileURL(modulePath).href;

  it('模块 URL 与 argv[1] 指向同一文件时为直接执行', () => {
    expect(isDirectRun(moduleUrl, ['node', modulePath])).toBe(true);
  });

  it('模块 URL 与 argv[1] 不同、或缺少 argv[1] 时不是直接执行', () => {
    expect(isDirectRun('file:///other/module.ts', ['node', modulePath])).toBe(false);
    expect(isDirectRun(moduleUrl, ['node'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ticket 09 强化：board-only 终局结算剥离计分
// ---------------------------------------------------------------------------
describe('Ticket 09 - board-only 终局结算按盘面进度（剥离计分）', () => {
  /** 盘面进度口径 = Metrics.countActionsToGuiYuan = 未点亮侧数 + 道损数 */
  const boardProgress = (result: ReturnType<HeadlessMatch['run']>, id: 'P1' | 'P2'): number =>
    countUnlightedSides(result.finalState.players[id].board) +
    countBoardDamage(result.finalState.players[id].board);

  /** 与实现一致的盘面结算：进度少者胜 → 归一节点多者胜 → 全同判 DRAW */
  const expectedBoardWinner = (result: ReturnType<HeadlessMatch['run']>): 'P1' | 'P2' | 'DRAW' => {
    const p1 = boardProgress(result, 'P1');
    const p2 = boardProgress(result, 'P2');
    if (p1 !== p2) return p1 < p2 ? 'P1' : 'P2';
    const g1 = countBoardGuiYi(result.finalState.players.P1.board);
    const g2 = countBoardGuiYi(result.finalState.players.P2.board);
    if (g1 !== g2) return g1 > g2 ? 'P1' : 'P2';
    return 'DRAW';
  };

  it('回合上限时按盘面进度判定胜负（不读计分；盘面全同则 DRAW）', () => {
    const match = new HeadlessMatch();
    let maxRoundsGames = 0;
    for (let seed = 10000; seed < 10030; seed++) {
      const result = match.run(defaultBaselineStrategy, defaultBaselineStrategy, {
        seed,
        maxRounds: 1,
        isBoardSettlement: true
      });
      expect(result.endReason).toBe('MAX_ROUNDS');
      maxRoundsGames++;
      expect(result.winner).toBe(expectedBoardWinner(result));
    }
    expect(maxRoundsGames).toBe(30);
  });

  it('默认（计分）结算与盘面结算确实不同：同一对局批次的胜负分布改变', () => {
    const benchmark = new HeadlessBenchmark();
    const base = {
      matches: 300,
      baseSeed: 10000,
      maxRounds: MAX_ROUNDS,
      strategyP1: aggressiveStrategy,
      strategyP2: pureSuppressStrategy,
      rules: { isBoardOnly: true }
    };
    const scored = benchmark.run(base);
    const board = benchmark.run({ ...base, isBoardSettlement: true });
    expect(scored.maxRoundsCount).toBeGreaterThan(0);
    expect([board.p1Wins, board.p2Wins]).not.toEqual([scored.p1Wins, scored.p2Wins]);
  });

  it('默认路径不受影响：不传 isBoardSettlement 时与历史逐字节一致', () => {
    const match = new HeadlessMatch();
    const a = match.run(balancedStrategy, balancedStrategy, { seed: 4242, maxRounds: MAX_ROUNDS });
    const b = match.run(balancedStrategy, balancedStrategy, {
      seed: 4242,
      maxRounds: MAX_ROUNDS,
      isBoardSettlement: false
    });
    expect(b.winner).toBe(a.winner);
    expect(b.record).toEqual(a.record);
  });
});

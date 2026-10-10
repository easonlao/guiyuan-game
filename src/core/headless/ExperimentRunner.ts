/**
 * 归元弈 (Guiyuan) - 实验运行器 (ExperimentRunner)
 *
 * 永久基础设施 (spec Implementation Decisions #6, #8, #20-21)：
 *   1. 声明式矩阵「策略 × 计分配置 × 规则模式」的全交叉对照表；
 *   2. 覆盖全部有序策略对、带座次平衡的对拼矩阵。
 *
 * 本模块是既有主接缝之上的薄层：所有对局都通过 HeadlessBenchmark.run 发起，
 * 所有指标都取自 HeadlessMatch.run 的 MatchResult 派生出的 GameMetrics
 * (唯一口径在 Metrics.ts)，不引入第三个可替换接缝，也不自行重算指标。
 *
 * 座次平衡口径：同一对策略打两个座次 (A 执先手 / A 执后手)，
 * 座次平衡胜率 = (胜场 + 0.5 × 平局) / 总局数。因此 A 对 B 与 B 对 A 严格互补 (和为 1)。
 *
 * 指标口径陷阱：`drawRate` 是流局率（回合上限结算率，别名 `maxRoundsRate`），
 * 不是平局率（`winner === 'DRAW'`）。两者是不同概念，见 Metrics.ts 口径表。
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { HeadlessBenchmark } from './HeadlessBenchmark.js';
import {
  assertDominanceVerdictHasMatrix,
  formatDominanceVerdict,
  formatDrawRateWithWinRates,
  type DominanceVerdict,
  type HeadToHeadMatrix
} from './Metrics.js';
import {
  BALANCED_WEIGHTS,
  RUSH_GUIYUAN_WEIGHTS,
  AGGRESSIVE_WEIGHTS,
  DEFENSIVE_WEIGHTS,
  PURE_RUSH_WEIGHTS,
  PURE_SUPPRESS_WEIGHTS,
  SCORE_STRIPPED_WEIGHTS,
  createScoreBoundStrategy
} from '../ai/Strategy.js';
import type { StrategyWeights } from '../ai/types.js';
import { POINTS_CONFIG, type PointsConfig } from '../logic/ScoreCalculator.js';
import type { RuleSwitches } from '../logic/ActionCandidates.js';

// ---------------------------------------------------------------------------
// 声明式矩阵输入
// ---------------------------------------------------------------------------

/**
 * 规则模式：计分轴开关。
 * - `scoring`   : 计分轴开启（AI 估值读取规则得分），生产默认。
 * - `board-only`: 计分轴关闭（AI 只按盘面判优），对应 RuleSwitches.boardOnly = true。
 */
export type RuleMode = 'scoring' | 'board-only';

export const DEFAULT_RULE_MODES: readonly RuleMode[] = ['scoring', 'board-only'];

/** 规则模式 -> 规则开关（唯一映射处） */
export function ruleSwitchesFor(mode: RuleMode): RuleSwitches {
  return { boardOnly: mode === 'board-only' };
}

/** 策略族变体：名称 + 权重模板。运行时由 createScoreBoundStrategy 绑定计分配置。 */
export interface StrategyVariant {
  readonly name: string;
  readonly weights: StrategyWeights;
}

/** 计分配置变体：名称 + PointsConfig。 */
export interface ScoreConfigVariant {
  readonly name: string;
  readonly config: PointsConfig;
}

/**
 * 压制强化计分配置（对照用，非生产默认）：仅提高对敌破坏的状态分，
 * 用于验证计分配置轴确实到达 AI 估值一侧。
 */
export const SUPPRESS_BOOST_POINTS_CONFIG: PointsConfig = {
  ...POINTS_CONFIG,
  STATE_CHANGE: {
    ...POINTS_CONFIG.STATE_CHANGE,
    CAUSE_DMG: { yang: 450, yin: 375 },
    BREAK_LIGHT: { yang: 300, yin: 225 },
    WEAKEN: 300
  }
};

/** 攻击净收益归零配置（对照用，非生产默认）：【破】/【强破】行为分与攻击状态分全部清零。 */
export const ATTACK_ZERO_POINTS_CONFIG: PointsConfig = {
  ...POINTS_CONFIG,
  ACTION: {
    ...POINTS_CONFIG.ACTION,
    ATK: 0,
    BURST_ATK: 0
  },
  STATE_CHANGE: {
    ...POINTS_CONFIG.STATE_CHANGE,
    CAUSE_DMG: { yang: 0, yin: 0 },
    BREAK_LIGHT: { yang: 0, yin: 0 },
    WEAKEN: 0
  }
};

export const DEFAULT_SCORE_CONFIG_VARIANTS: readonly ScoreConfigVariant[] = [
  { name: 'default', config: POINTS_CONFIG },
  { name: 'suppress-boost', config: SUPPRESS_BOOST_POINTS_CONFIG },
  { name: 'attack-zero', config: ATTACK_ZERO_POINTS_CONFIG }
];

/**
 * 策略族 (Ticket 06)：既有四个权重预设 + 纯推进 + 纯压制 + 剥离计分，共七个一等策略。
 * 对拼矩阵与对照表都以这份清单为唯一定义处。
 */
export const DEFAULT_STRATEGY_VARIANTS: readonly StrategyVariant[] = [
  { name: '平衡', weights: BALANCED_WEIGHTS },
  { name: '归元冲刺', weights: RUSH_GUIYUAN_WEIGHTS },
  { name: '激进压制', weights: AGGRESSIVE_WEIGHTS },
  { name: '保守自保', weights: DEFENSIVE_WEIGHTS },
  { name: '纯推进', weights: PURE_RUSH_WEIGHTS },
  { name: '纯压制', weights: PURE_SUPPRESS_WEIGHTS },
  { name: '剥离计分', weights: SCORE_STRIPPED_WEIGHTS }
];

export const DEFAULT_MATCHES_PER_CELL = 2000;
export const DEFAULT_BASE_SEED = 10000;
export const DEFAULT_MAX_ROUNDS = 30;

export interface ExperimentMatrixOptions {
  readonly modes?: readonly RuleMode[];
  readonly scoreConfigs?: readonly ScoreConfigVariant[];
  readonly strategies?: readonly StrategyVariant[];
  readonly matches?: number;
  readonly baseSeed?: number;
  readonly maxRounds?: number;
}

// ---------------------------------------------------------------------------
// 对照矩阵 (策略 × 计分配置 × 规则模式)
// ---------------------------------------------------------------------------

/** 单个对照格的聚合结果；指标口径全部来自 Metrics.ts。 */
export interface ExperimentCell {
  readonly mode: RuleMode;
  readonly scoreConfigName: string;
  readonly strategyName: string;
  readonly seed: number;
  readonly matches: number;
  readonly guiYuanRate: number;
  /** 流局率（回合上限结算率） */
  readonly drawRate: number;
  readonly avgRounds: number;
  readonly p1WinRate: number;
  readonly p2WinRate: number;
  readonly opponentResidualDamage: number;
  readonly suppressionLevels: number;
  readonly constructionLevels: number;
}

export interface ExperimentReport {
  readonly modes: readonly RuleMode[];
  readonly scoreConfigNames: readonly string[];
  readonly strategyNames: readonly string[];
  readonly matches: number;
  readonly baseSeed: number;
  readonly maxRounds: number;
  readonly cells: readonly ExperimentCell[];
}

/** 运行单个对照格：同一策略在同一配置/模式下自对弈 N 局。 */
function runCell(
  mode: RuleMode,
  scoreConfigVariant: ScoreConfigVariant,
  strategyVariant: StrategyVariant,
  matches: number,
  baseSeed: number,
  maxRounds: number
): ExperimentCell {
  const rules = ruleSwitchesFor(mode);
  const strategy = createScoreBoundStrategy(
    strategyVariant.weights,
    scoreConfigVariant.config,
    rules
  );
  const benchmark = new HeadlessBenchmark();
  const metrics = benchmark.run({
    matches,
    baseSeed,
    maxRounds,
    strategyP1: strategy,
    strategyP2: strategy,
    scoreConfig: scoreConfigVariant.config,
    rules
  });

  return {
    mode,
    scoreConfigName: scoreConfigVariant.name,
    strategyName: strategyVariant.name,
    seed: baseSeed,
    matches,
    guiYuanRate: metrics.guiYuanRate,
    drawRate: metrics.drawRate,
    avgRounds: metrics.avgRounds,
    p1WinRate: metrics.p1WinRate,
    p2WinRate: metrics.p2WinRate,
    opponentResidualDamage: metrics.opponentResidualDamage,
    suppressionLevels: metrics.suppressionLevels,
    constructionLevels: metrics.constructionLevels
  };
}

/** 运行「策略 × 计分配置 × 规则模式」全交叉对照矩阵。 */
export function runExperimentMatrix(options: ExperimentMatrixOptions = {}): ExperimentReport {
  const modes = options.modes ?? DEFAULT_RULE_MODES;
  const scoreConfigs = options.scoreConfigs ?? DEFAULT_SCORE_CONFIG_VARIANTS;
  const strategies = options.strategies ?? DEFAULT_STRATEGY_VARIANTS;
  const matches = options.matches ?? DEFAULT_MATCHES_PER_CELL;
  const baseSeed = options.baseSeed ?? DEFAULT_BASE_SEED;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;

  const cells: ExperimentCell[] = [];
  for (const mode of modes) {
    for (const scoreConfig of scoreConfigs) {
      for (const strategy of strategies) {
        cells.push(runCell(mode, scoreConfig, strategy, matches, baseSeed, maxRounds));
      }
    }
  }

  return {
    modes,
    scoreConfigNames: scoreConfigs.map(variant => variant.name),
    strategyNames: strategies.map(variant => variant.name),
    matches,
    baseSeed,
    maxRounds,
    cells
  };
}

// ---------------------------------------------------------------------------
// 对拼矩阵 (全部有序策略对 + 座次平衡)
// ---------------------------------------------------------------------------

/**
 * 单个有序对 (A 对 B) 的聚合结果。
 * `seatBalancedWinRate` 为 A 的座次平衡胜率 = (A 胜场 + 0.5 × 流局) / 总局数。
 */
export interface HeadToHeadMatchup {
  readonly strategyA: string;
  readonly strategyB: string;
  /** 两个座次合计的对局数 */
  readonly matches: number;
  /** 单个座次的对局数 */
  readonly matchesPerSeat: number;
  readonly seatBalancedWinRate: number;
  /** A 执先手时的胜率 */
  readonly aWinRateAsP1: number;
  /** A 执后手时的胜率 */
  readonly aWinRateAsP2: number;
  /** B 执先手时的胜率 */
  readonly bWinRateAsP1: number;
  /** B 执后手时的胜率 */
  readonly bWinRateAsP2: number;
  /** 流局率（回合上限结算率），口径同 Metrics.ts 的 `drawRate` = `maxRoundsRate` */
  readonly drawRate: number;
  /** 平局率（`winner === 'DRAW'`），与流局率是两回事；仅用于座次平衡公式 */
  readonly trueDrawRate: number;
  readonly guiYuanRate: number;
  readonly avgRounds: number;
  /** 先手 (P1) 胜率，两个座次合并 */
  readonly p1WinRate: number;
  /** 后手 (P2) 胜率，两个座次合并 */
  readonly p2WinRate: number;
  readonly opponentResidualDamage: number;
}

export interface HeadToHeadReport {
  readonly strategies: readonly string[];
  readonly matchups: readonly HeadToHeadMatchup[];
  readonly matchesPerSeat: number;
  readonly baseSeed: number;
  readonly maxRounds: number;
  readonly mode: RuleMode;
  readonly scoreConfigName: string;
}

export interface HeadToHeadMatrixOptions {
  readonly strategies?: readonly StrategyVariant[];
  readonly mode?: RuleMode;
  readonly scoreConfig?: ScoreConfigVariant;
  readonly matches?: number;
  readonly baseSeed?: number;
  readonly maxRounds?: number;
}

interface SeatRun {
  readonly totalMatches: number;
  readonly p1Wins: number;
  readonly p2Wins: number;
  /** 平局数（`winner === 'DRAW'`），不是流局数 */
  readonly trueDraws: number;
  /** 流局率（回合上限结算率），口径同 Metrics.ts 的 `maxRoundsRate` */
  readonly drawRate: number;
  readonly guiYuanCount: number;
  readonly avgRounds: number;
  readonly opponentResidualDamage: number;
}

function runSeat(
  strategyP1: StrategyVariant,
  strategyP2: StrategyVariant,
  mode: RuleMode,
  scoreConfig: ScoreConfigVariant,
  matches: number,
  baseSeed: number,
  maxRounds: number
): SeatRun {
  const rules = ruleSwitchesFor(mode);
  const benchmark = new HeadlessBenchmark();
  const metrics = benchmark.run({
    matches,
    baseSeed,
    maxRounds,
    strategyP1: createScoreBoundStrategy(strategyP1.weights, scoreConfig.config, rules),
    strategyP2: createScoreBoundStrategy(strategyP2.weights, scoreConfig.config, rules),
    scoreConfig: scoreConfig.config,
    rules
  });
  return {
    totalMatches: metrics.totalMatches,
    p1Wins: metrics.p1Wins,
    p2Wins: metrics.p2Wins,
    trueDraws: metrics.draws,
    drawRate: metrics.drawRate,
    guiYuanCount: metrics.guiYuanCount,
    avgRounds: metrics.avgRounds,
    opponentResidualDamage: metrics.opponentResidualDamage
  };
}

/**
 * 运行覆盖全部有序策略对的对拼矩阵，并做座次平衡。
 * 每个无序对只计算一次 (打两个座次)，再据此派生两个互补的有序对结果。
 */
export function runHeadToHeadMatrix(options: HeadToHeadMatrixOptions = {}): HeadToHeadReport {
  const strategies = options.strategies ?? DEFAULT_STRATEGY_VARIANTS;
  const mode = options.mode ?? DEFAULT_RULE_MODES[0];
  const scoreConfig = options.scoreConfig ?? DEFAULT_SCORE_CONFIG_VARIANTS[0];
  const matches = options.matches ?? DEFAULT_MATCHES_PER_CELL;
  const baseSeed = options.baseSeed ?? DEFAULT_BASE_SEED;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;

  const matchups: HeadToHeadMatchup[] = [];
  for (let i = 0; i < strategies.length; i++) {
    for (let j = i + 1; j < strategies.length; j++) {
      const a = strategies[i];
      const b = strategies[j];

      // 座次 1：A 执先手；座次 2：B 执先手。两个座次使用同一随机种子序列。
      const aAsP1 = runSeat(a, b, mode, scoreConfig, matches, baseSeed, maxRounds);
      const bAsP1 = runSeat(b, a, mode, scoreConfig, matches, baseSeed, maxRounds);

      const total = aAsP1.totalMatches + bAsP1.totalMatches;
      const aWins = aAsP1.p1Wins + bAsP1.p2Wins;
      const bWins = aAsP1.p2Wins + bAsP1.p1Wins;
      const trueDraws = aAsP1.trueDraws + bAsP1.trueDraws;
      const safe = (value: number): number => (total > 0 ? value / total : 0);
      const safePerSeat = (value: number): number =>
        matches > 0 ? value / matches : 0;
      const weightedAvgRounds = safe(
        aAsP1.avgRounds * aAsP1.totalMatches + bAsP1.avgRounds * bAsP1.totalMatches
      );
      const opponentResidualDamage = safe(
        aAsP1.opponentResidualDamage * aAsP1.totalMatches +
          bAsP1.opponentResidualDamage * bAsP1.totalMatches
      );
      // 流局率（回合上限结算率）按座次样本量加权；口径同 Metrics.ts 的 drawRate。
      const drawRate = safe(
        aAsP1.drawRate * aAsP1.totalMatches + bAsP1.drawRate * bAsP1.totalMatches
      );

      const common = {
        matches: total,
        matchesPerSeat: matches,
        drawRate,
        trueDrawRate: safe(trueDraws),
        guiYuanRate: safe(aAsP1.guiYuanCount + bAsP1.guiYuanCount),
        avgRounds: weightedAvgRounds,
        p1WinRate: safe(aAsP1.p1Wins + bAsP1.p1Wins),
        p2WinRate: safe(aAsP1.p2Wins + bAsP1.p2Wins),
        opponentResidualDamage
      };

      matchups.push({
        strategyA: a.name,
        strategyB: b.name,
        // 座次平衡：胜场 + 半场平局，保证 A 对 B 与 B 对 A 严格互补。
        seatBalancedWinRate: safe(aWins + 0.5 * trueDraws),
        aWinRateAsP1: safePerSeat(aAsP1.p1Wins),
        aWinRateAsP2: safePerSeat(bAsP1.p2Wins),
        bWinRateAsP1: safePerSeat(bAsP1.p1Wins),
        bWinRateAsP2: safePerSeat(aAsP1.p2Wins),
        ...common
      });
      matchups.push({
        strategyA: b.name,
        strategyB: a.name,
        seatBalancedWinRate: safe(bWins + 0.5 * trueDraws),
        aWinRateAsP1: safePerSeat(bAsP1.p1Wins),
        aWinRateAsP2: safePerSeat(aAsP1.p2Wins),
        bWinRateAsP1: safePerSeat(aAsP1.p1Wins),
        bWinRateAsP2: safePerSeat(bAsP1.p2Wins),
        ...common
      });
    }
  }

  return {
    strategies: strategies.map(variant => variant.name),
    matchups,
    matchesPerSeat: matches,
    baseSeed,
    maxRounds,
    mode,
    scoreConfigName: scoreConfig.name
  };
}

/** 在报告中查找有序对 A 对 B 的座次平衡胜率。 */
export function findSeatBalancedWinRate(
  report: HeadToHeadReport,
  strategyA: string,
  strategyB: string
): number | undefined {
  return report.matchups.find(
    matchup => matchup.strategyA === strategyA && matchup.strategyB === strategyB
  )?.seatBalancedWinRate;
}

/** 把对拼报告适配成 Metrics.ts 的 HeadToHeadMatrix，供占优结论守卫使用。 */
export function toHeadToHeadMatrix(report: HeadToHeadReport): HeadToHeadMatrix {
  return {
    strategies: report.strategies,
    cells: report.matchups.map(matchup => ({
      p1Strategy: matchup.strategyA,
      p2Strategy: matchup.strategyB,
      matches: matchup.matches,
      seatBalancedWinRate: matchup.seatBalancedWinRate
    }))
  };
}

// ---------------------------------------------------------------------------
// 报告格式化（可直接粘贴进工单的 markdown）
// ---------------------------------------------------------------------------

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

const RULE_MODE_NOTES: Readonly<Record<RuleMode, string>> = {
  scoring: '`scoring` = 计分轴开启（AI 估值读取规则得分，生产默认）',
  'board-only': '`board-only` = 计分轴关闭（AI 只按盘面判优，RuleSwitches.boardOnly）'
};

const SCORE_CONFIG_NOTES: Readonly<Record<string, string>> = {
  default: '生产默认 POINTS_CONFIG',
  'suppress-boost': '对敌破坏状态分放大（验证计分配置轴到达 AI 估值）',
  'attack-zero': '【破】/【强破】行为分与攻击状态分归零'
};

/** 对照矩阵的 markdown 报告；流局率始终与先后手胜率成对输出。 */
export function formatExperimentReport(report: ExperimentReport): string {
  const lines: string[] = [];
  lines.push('## 策略 × 计分配置 × 规则模式 对照表');
  lines.push('');
  lines.push(`- 种子基数: ${report.baseSeed} (每格连续 ${report.matches} 局)`);
  lines.push(`- 每格样本量: ${report.matches}`);
  lines.push(`- 回合上限: ${report.maxRounds}`);
  lines.push('- 规则模式:');
  for (const mode of report.modes) {
    lines.push(`  - ${RULE_MODE_NOTES[mode]}`);
  }
  lines.push('- 计分配置:');
  for (const name of report.scoreConfigNames) {
    lines.push(`  - \`${name}\`: ${SCORE_CONFIG_NOTES[name] ?? ''}`);
  }
  lines.push('- 指标口径: 唯一来源 Metrics.ts（归元率 = 五行归元终局占比；流局率 = 回合上限结算占比；平均大回合 = roundsPlayed 均值）');
  lines.push('- 座次平衡口径: 对拼矩阵中 A 对 B 胜率 = (A 胜场 + 0.5 × 流局) / 两座次总局数');
  lines.push('');
  lines.push(
    '| 规则模式 | 计分配置 | 策略 | 归元率 | 平均大回合 | 对手残留道损 | 压制度量 | 流局率 / 先后手胜率 |'
  );
  lines.push(
    '| --- | --- | --- | ---: | ---: | ---: | ---: | --- |'
  );
  for (const cell of report.cells) {
    // 流局率必须与先后手胜率成对输出（Metrics.ts 守卫）。
    const drawPaired = formatDrawRateWithWinRates({
      drawRate: cell.drawRate,
      p1WinRate: cell.p1WinRate,
      p2WinRate: cell.p2WinRate
    });
    lines.push(
      `| ${cell.mode} | ${cell.scoreConfigName} | ${cell.strategyName} | ${formatPercent(
        cell.guiYuanRate
      )} | ${cell.avgRounds.toFixed(2)} | ${cell.opponentResidualDamage.toFixed(
        2
      )} | ${cell.suppressionLevels.toFixed(2)} | ${drawPaired} |`
    );
  }
  return lines.join('\n');
}

/** 座次平衡胜率矩阵（行 A vs 列 B）；对拼报告与计分/盘面对照报告复用。 */
export function formatSeatBalancedMatrix(report: HeadToHeadReport): string {
  const lines: string[] = [];
  lines.push('### 座次平衡胜率矩阵 (行 A vs 列 B，单元格 = A 对 B 的座次平衡胜率)');
  lines.push('');
  lines.push(`| A \\ B | ${report.strategies.join(' | ')} |`);
  lines.push(`| --- | ${report.strategies.map(() => '---:').join(' | ')} |`);
  for (const strategyA of report.strategies) {
    const row = report.strategies.map(strategyB => {
      if (strategyA === strategyB) return '—';
      const rate = findSeatBalancedWinRate(report, strategyA, strategyB);
      return rate === undefined ? '—' : formatPercent(rate);
    });
    lines.push(`| ${strategyA} | ${row.join(' | ')} |`);
  }
  return lines.join('\n');
}

/** 计算每个策略严格占优的对手列表（座次平衡胜率 > 50%）。 */
export function computeDominanceVerdicts(report: HeadToHeadReport): DominanceVerdict[] {
  return report.strategies.map(strategy => ({
    strategy,
    dominates: report.strategies.filter(
      opponent =>
        opponent !== strategy &&
        (findSeatBalancedWinRate(report, strategy, opponent) ?? 0) > 0.5
    )
  }));
}

/** 占优结论段落：每个结论都由对拼矩阵守卫支撑。 */
export function formatDominanceSection(report: HeadToHeadReport): string {
  const matrix = toHeadToHeadMatrix(report);
  const lines: string[] = [];
  lines.push('### 占优结论');
  lines.push('');

  const verdicts: DominanceVerdict[] = computeDominanceVerdicts(report).filter(
    verdict => verdict.dominates.length > 0
  );

  if (verdicts.length === 0) {
    // 即使结论是「无占优」，也必须先由矩阵守卫确认矩阵在场。
    assertDominanceVerdictHasMatrix(
      { strategy: report.strategies[0] ?? '', dominates: [] },
      matrix
    );
    lines.push('本对拼矩阵未发现任何策略对全部其它策略严格占优。');
    return lines.join('\n');
  }

  for (const verdict of verdicts) {
    lines.push(`- ${formatDominanceVerdict(verdict, matrix)}`);
  }
  return lines.join('\n');
}

/** 对拼矩阵的 markdown 报告；流局率始终与先后手胜率成对输出。 */
export function formatHeadToHeadReport(report: HeadToHeadReport): string {
  const lines: string[] = [];
  lines.push('## 跨策略对拼矩阵（全部有序对，座次平衡）');
  lines.push('');
  lines.push(`- 种子基数: ${report.baseSeed} (每座次连续 ${report.matchesPerSeat} 局)`);
  lines.push(`- 每座次样本量: ${report.matchesPerSeat} (每个有序对合计 ${report.matchesPerSeat * 2} 局)`);
  lines.push(`- 回合上限: ${report.maxRounds}`);
  lines.push(`- 计分配置: \`${report.scoreConfigName}\` (${SCORE_CONFIG_NOTES[report.scoreConfigName] ?? ''})`);
  lines.push(`- 规则模式: ${RULE_MODE_NOTES[report.mode]}`);
  lines.push('- 座次平衡: 同一对策略打两个座次取平均，消除先手优势；A 对 B 与 B 对 A 严格互补');
  lines.push('- 座次平衡胜率口径: (A 胜场 + 0.5 × 平局) / 两座次总局数');
  lines.push('');
  lines.push(formatSeatBalancedMatrix(report));
  lines.push('');
  lines.push('### 逐对明细');
  lines.push('');
  lines.push(
    '| A | B | 两座次样本 | 座次平衡胜率 | A执先手胜率 | A执后手胜率 | B执先手胜率 | B执后手胜率 | 归元率 | 平均大回合 | 对手残留道损 | 流局率 / 先后手胜率 |'
  );
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const matchup of report.matchups) {
    const drawPaired = formatDrawRateWithWinRates({
      drawRate: matchup.drawRate,
      p1WinRate: matchup.p1WinRate,
      p2WinRate: matchup.p2WinRate
    });
    lines.push(
      `| ${matchup.strategyA} | ${matchup.strategyB} | ${matchup.matches} | ${formatPercent(
        matchup.seatBalancedWinRate
      )} | ${formatPercent(matchup.aWinRateAsP1)} | ${formatPercent(
        matchup.aWinRateAsP2
      )} | ${formatPercent(matchup.bWinRateAsP1)} | ${formatPercent(
        matchup.bWinRateAsP2
      )} | ${formatPercent(matchup.guiYuanRate)} | ${matchup.avgRounds.toFixed(
        2
      )} | ${matchup.opponentResidualDamage.toFixed(2)} | ${drawPaired} |`
    );
  }
  lines.push('');
  lines.push(formatDominanceSection(report));
  return lines.join('\n');
}

/** 一次性输出对照表与对拼矩阵（同一命令的可粘贴报告）。 */
export function formatCombinedReport(
  experiment: ExperimentReport,
  headToHead: HeadToHeadReport
): string {
  return [formatExperimentReport(experiment), '', '---', '', formatHeadToHeadReport(headToHead)].join(
    '\n'
  );
}

// ---------------------------------------------------------------------------
// 计分轴开启 vs 关闭 (board-only) 逐格对照
// ---------------------------------------------------------------------------

/** 单个格子的强弱关系（座次平衡胜率相对 50%）。 */
export type MatchupRelation = 'strong' | 'weak' | 'tie';

/** 单个有序对在两模式间的对照。 */
export interface MatchupComparison {
  readonly strategyA: string;
  readonly strategyB: string;
  readonly scoringWinRate: number;
  readonly boardOnlyWinRate: number;
  /** board-only 减 scoring（正数 = 关闭计分后 A 对 B 更强） */
  readonly delta: number;
  readonly scoringRelation: MatchupRelation;
  readonly boardOnlyRelation: MatchupRelation;
  /** 强弱关系是否翻转（tie 也算一种关系） */
  readonly flipped: boolean;
  /** 流局率（回合上限结算率）对照 */
  readonly scoringDrawRate: number;
  readonly boardOnlyDrawRate: number;
  /** 先手 (P1) 胜率对照 */
  readonly scoringP1WinRate: number;
  readonly boardOnlyP1WinRate: number;
}

/** 单个策略在两模式下的占优集合对照。 */
export interface DominanceComparison {
  readonly strategy: string;
  readonly scoringDominates: readonly string[];
  readonly boardOnlyDominates: readonly string[];
  readonly scoringDominatesAll: boolean;
  readonly boardOnlyDominatesAll: boolean;
}

/** 计分轴开启与关闭两个对拼矩阵的逐格对照结果。 */
export interface HeadToHeadComparison {
  readonly scoring: HeadToHeadReport;
  readonly boardOnly: HeadToHeadReport;
  readonly matchups: readonly MatchupComparison[];
  readonly flips: readonly MatchupComparison[];
  readonly dominance: readonly DominanceComparison[];
}

function relationOf(rate: number): MatchupRelation {
  if (rate > 0.5) return 'strong';
  if (rate < 0.5) return 'weak';
  return 'tie';
}

/**
 * 逐格对照计分轴开启与关闭的对拼矩阵，列出强弱关系发生翻转的格子。
 * 两个矩阵必须使用同一策略族；否则无法逐格对照，直接拒绝。
 */
export function compareHeadToHeadMatrices(
  scoring: HeadToHeadReport,
  boardOnly: HeadToHeadReport
): HeadToHeadComparison {
  if (scoring.strategies.join('\u0000') !== boardOnly.strategies.join('\u0000')) {
    throw new Error('逐格对照要求两个对拼矩阵使用同一策略族');
  }

  const matchups: MatchupComparison[] = [];
  for (const strategyA of scoring.strategies) {
    for (const strategyB of scoring.strategies) {
      if (strategyA === strategyB) continue;
      const scoringWinRate = findSeatBalancedWinRate(scoring, strategyA, strategyB);
      const boardOnlyWinRate = findSeatBalancedWinRate(boardOnly, strategyA, strategyB);
      if (scoringWinRate === undefined || boardOnlyWinRate === undefined) {
        throw new Error(`对拼矩阵缺少 ${strategyA} vs ${strategyB} 的数据`);
      }
      const scoringMatchup = scoring.matchups.find(
        matchup => matchup.strategyA === strategyA && matchup.strategyB === strategyB
      )!;
      const boardOnlyMatchup = boardOnly.matchups.find(
        matchup => matchup.strategyA === strategyA && matchup.strategyB === strategyB
      )!;
      const scoringRelation = relationOf(scoringWinRate);
      const boardOnlyRelation = relationOf(boardOnlyWinRate);
      matchups.push({
        strategyA,
        strategyB,
        scoringWinRate,
        boardOnlyWinRate,
        delta: boardOnlyWinRate - scoringWinRate,
        scoringRelation,
        boardOnlyRelation,
        flipped: scoringRelation !== boardOnlyRelation,
        scoringDrawRate: scoringMatchup.drawRate,
        boardOnlyDrawRate: boardOnlyMatchup.drawRate,
        scoringP1WinRate: scoringMatchup.p1WinRate,
        boardOnlyP1WinRate: boardOnlyMatchup.p1WinRate
      });
    }
  }

  const scoringVerdicts = computeDominanceVerdicts(scoring);
  const boardOnlyVerdicts = computeDominanceVerdicts(boardOnly);
  const allCount = scoring.strategies.length - 1;
  const dominance: DominanceComparison[] = scoring.strategies.map((strategy, index) => ({
    strategy,
    scoringDominates: scoringVerdicts[index].dominates,
    boardOnlyDominates: boardOnlyVerdicts[index].dominates,
    scoringDominatesAll: scoringVerdicts[index].dominates.length === allCount,
    boardOnlyDominatesAll: boardOnlyVerdicts[index].dominates.length === allCount
  }));

  return {
    scoring,
    boardOnly,
    matchups,
    flips: matchups.filter(matchup => matchup.flipped),
    dominance
  };
}

const RELATION_LABEL: Readonly<Record<MatchupRelation, string>> = {
  strong: '强 (A 胜)',
  weak: '弱 (A 负)',
  tie: '平 (50%)'
};

function formatRelationLabel(relation: MatchupRelation): string {
  return RELATION_LABEL[relation];
}

function formatSignedPercentPoints(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${(delta * 100).toFixed(2)}pp`;
}

/**
 * 计分轴开启 vs 关闭 (board-only) 的完整对照报告：两张矩阵 + 翻转清单 + 占优对照。
 * 每个占优结论都先经 Metrics.ts 的矩阵守卫确认矩阵在场（陷阱 B）。
 */
export function formatHeadToHeadComparisonReport(comparison: HeadToHeadComparison): string {
  const { scoring, boardOnly, flips } = comparison;
  const lines: string[] = [];
  lines.push('## 计分轴开启 vs 关闭 (board-only) 对拼矩阵逐格对照');
  lines.push('');
  lines.push(`- 种子基数: ${scoring.baseSeed} (每座次连续 ${scoring.matchesPerSeat} 局)`);
  lines.push(
    `- 每座次样本量: ${scoring.matchesPerSeat} (每个有序对合计 ${scoring.matchesPerSeat * 2} 局)`
  );
  lines.push(`- 回合上限: ${scoring.maxRounds}`);
  lines.push(`- 计分配置: \`${scoring.scoreConfigName}\` (两模式相同)`);
  lines.push('- 规则模式: `scoring` = 计分轴开启；`board-only` = 计分轴关闭（AI 只按盘面判优）');
  lines.push('- 座次平衡胜率口径: (A 胜场 + 0.5 × 平局) / 两座次总局数；A 对 B 与 B 对 A 严格互补');
  lines.push('');
  lines.push('### 计分轴开启 (scoring)');
  lines.push('');
  lines.push(formatSeatBalancedMatrix(scoring));
  lines.push('');
  lines.push('### 计分轴关闭 (board-only)');
  lines.push('');
  lines.push(formatSeatBalancedMatrix(boardOnly));
  lines.push('');
  lines.push('### 强弱关系翻转 (逐格)');
  lines.push('');
  if (flips.length === 0) {
    lines.push('无：所有格子的强弱关系在两模式间一致。');
  } else {
    lines.push(
      '| A | B | scoring 胜率 | scoring 关系 | board-only 胜率 | board-only 关系 | Δ (board − scoring) |'
    );
    lines.push('| --- | --- | ---: | --- | ---: | --- | ---: |');
    for (const flip of flips) {
      lines.push(
        `| ${flip.strategyA} | ${flip.strategyB} | ${formatPercent(
          flip.scoringWinRate
        )} | ${formatRelationLabel(flip.scoringRelation)} | ${formatPercent(
          flip.boardOnlyWinRate
        )} | ${formatRelationLabel(flip.boardOnlyRelation)} | ${formatSignedPercentPoints(
          flip.delta
        )} |`
      );
    }
  }
  lines.push('');
  lines.push('### 流局率与先手胜率对照 (逐格)');
  lines.push('');
  lines.push(
    '| A | B | scoring 流局率 | board-only 流局率 | scoring 先手胜率 | board-only 先手胜率 |'
  );
  lines.push('| --- | --- | ---: | ---: | ---: | ---: |');
  for (const matchup of comparison.matchups) {
    lines.push(
      `| ${matchup.strategyA} | ${matchup.strategyB} | ${formatPercent(
        matchup.scoringDrawRate
      )} | ${formatPercent(matchup.boardOnlyDrawRate)} | ${formatPercent(
        matchup.scoringP1WinRate
      )} | ${formatPercent(matchup.boardOnlyP1WinRate)} |`
    );
  }
  lines.push('');
  lines.push('### 占优结论对照');
  lines.push('');
  lines.push('| 策略 | scoring 占优对象 | board-only 占优对象 |');
  lines.push('| --- | --- | --- |');
  const scoringMatrix = toHeadToHeadMatrix(scoring);
  const boardOnlyMatrix = toHeadToHeadMatrix(boardOnly);
  for (const verdict of comparison.dominance) {
    // 陷阱 B 守卫：占优结论必须由矩阵支撑。
    assertDominanceVerdictHasMatrix(
      { strategy: verdict.strategy, dominates: verdict.scoringDominates },
      scoringMatrix
    );
    assertDominanceVerdictHasMatrix(
      { strategy: verdict.strategy, dominates: verdict.boardOnlyDominates },
      boardOnlyMatrix
    );
    const scoringList = verdict.scoringDominates.length
      ? verdict.scoringDominates.join('、')
      : '—';
    const boardOnlyList = verdict.boardOnlyDominates.length
      ? verdict.boardOnlyDominates.join('、')
      : '—';
    lines.push(`| ${verdict.strategy} | ${scoringList} | ${boardOnlyList} |`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export type ScanKind = 'matrix' | 'head-to-head' | 'all';

/** CLI 规则模式选择：两个单模式，或 'both'（跑两次并输出逐格对照）。 */
export type ModeArg = RuleMode | 'both';

const HELP_TEXT = `归元弈 (Guiyuan) 平衡实验运行器

用法:
  npm run benchmark:experiment -- [选项]
  npm run benchmark:head-to-head -- [选项]
  npm run benchmark:board-only -- [选项]
  npm run benchmark:board-value -- [选项]

选项:
  --scan <kind>       扫描类型: all (默认) / matrix / head-to-head
  --mode <mode>       规则模式: scoring (默认) / board-only / both
                      (head-to-head 与 all 有效；both = 跑两次并输出逐格对照)
  --matches <N>       每个对照格 / 每座次的样本量 (默认 ${DEFAULT_MATCHES_PER_CELL})
  --seed <N>          种子基数，每格使用 seed + i (默认 ${DEFAULT_BASE_SEED})
  --max-rounds <N>    回合上限 (默认 ${DEFAULT_MAX_ROUNDS})
  --help, -h          显示本帮助

说明:
  matrix        策略 × 计分配置 × 规则模式 全交叉对照表
  head-to-head  覆盖全部有序策略对、带座次平衡的对拼矩阵
  all           两者都跑，输出可直接粘贴进工单的 markdown
`;

export interface ParsedArgs {
  readonly help: boolean;
  readonly scan: ScanKind;
  readonly mode: ModeArg;
  readonly matches?: number;
  readonly baseSeed?: number;
  readonly maxRounds?: number;
}

/** 解析 CLI 参数；未知参数或非法值抛错。 */
export function parseExperimentArgs(argv: readonly string[]): ParsedArgs {
  let help = false;
  let scan: ScanKind = 'all';
  let mode: ModeArg = 'scoring';
  let matches: number | undefined;
  let baseSeed: number | undefined;
  let maxRounds: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--scan') {
      const value = argv[++i];
      if (value !== 'matrix' && value !== 'head-to-head' && value !== 'all') {
        throw new Error(`未知扫描类型: ${value}`);
      }
      scan = value;
      continue;
    }
    if (arg === '--mode') {
      const value = argv[++i];
      if (value !== 'scoring' && value !== 'board-only' && value !== 'both') {
        throw new Error(`未知规则模式: ${value}`);
      }
      mode = value;
      continue;
    }
    if (arg === '--matches') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`--matches 需要非负数字: ${argv[i]}`);
      matches = Math.floor(value);
      continue;
    }
    if (arg === '--seed') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value)) throw new Error(`--seed 需要数字: ${argv[i]}`);
      baseSeed = Math.floor(value);
      continue;
    }
    if (arg === '--max-rounds') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 1) throw new Error(`--max-rounds 需要正数: ${argv[i]}`);
      maxRounds = Math.floor(value);
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  return { help, scan, mode, matches, baseSeed, maxRounds };
}

// 支持 CLI 命令行直接执行
if (typeof process !== 'undefined' && process.argv && process.argv[1]) {
  try {
    const isDirectRun =
      import.meta.url === pathToFileURL(process.argv[1]).href ||
      import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
    if (isDirectRun) {
      const parsed = parseExperimentArgs(process.argv.slice(2));
      if (parsed.help) {
        console.log(HELP_TEXT);
      } else {
        const matches = parsed.matches ?? DEFAULT_MATCHES_PER_CELL;
        const baseSeed = parsed.baseSeed ?? DEFAULT_BASE_SEED;
        const maxRounds = parsed.maxRounds ?? DEFAULT_MAX_ROUNDS;
        const mode = parsed.mode;
        const runHeadToHead = (ruleMode: RuleMode): HeadToHeadReport =>
          runHeadToHeadMatrix({ matches, baseSeed, maxRounds, mode: ruleMode });
        console.log(
          `🚀 运行平衡实验运行器 (${parsed.scan}, ${mode}): ${matches} 局/格, 种子基数 ${baseSeed}, 回合上限 ${maxRounds}...`
        );
        if (parsed.scan === 'matrix') {
          console.log(formatExperimentReport(runExperimentMatrix({ matches, baseSeed, maxRounds })));
        } else if (parsed.scan === 'head-to-head') {
          console.log(
            mode === 'both'
              ? formatHeadToHeadComparisonReport(
                  compareHeadToHeadMatrices(runHeadToHead('scoring'), runHeadToHead('board-only'))
                )
              : formatHeadToHeadReport(runHeadToHead(mode))
          );
        } else {
          const experiment = runExperimentMatrix({ matches, baseSeed, maxRounds });
          if (mode === 'both') {
            console.log(formatExperimentReport(experiment));
            console.log('---');
            console.log(
              formatHeadToHeadComparisonReport(
                compareHeadToHeadMatrices(runHeadToHead('scoring'), runHeadToHead('board-only'))
              )
            );
          } else {
            console.log(formatCombinedReport(experiment, runHeadToHead(mode)));
          }
        }
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

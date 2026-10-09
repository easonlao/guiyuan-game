/**
 * 归元弈 (Guiyuan) - 模式 × 计分配置 × 策略族对照测量台 (MeasurementBench)
 * 纯 TS 核心，零 DOM/BOM 依赖。产出可直接粘贴进工单的 markdown 对照表。
 *
 * 第一要务是工具忠实：默认参数下 off + 平衡策略必须复现已知基线。
 * 压制度量按“对手盘面等级下降量之和”统计（2 -> 1 记 1），而非“未点亮侧数”。
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { HeadlessMatch, ScoreComposition } from './HeadlessMatch.js';
import type { DecisionStrategy } from '../ai/types.js';
import { PointsConfig, POINTS_CONFIG } from '../logic/ScoreCalculator.js';
import { balancedStrategy, pureRushStrategy, pureSuppressStrategy } from '../ai/Strategy.js';

/** 规则模式：off = 变体 B 关闭（默认），full = 变体 B 开启 */
export type RuleMode = 'off' | 'full';

export const DEFAULT_MODES: readonly RuleMode[] = ['off', 'full'];

/** 计分配置变体（仅用于对照测量，不改变生产默认） */
export interface ScoreConfigVariant {
  readonly name: string;
  readonly config: PointsConfig;
}

/** 策略族变体 */
export interface StrategyVariant {
  readonly name: string;
  readonly strategy: DecisionStrategy;
}

/**
 * 压制强化计分配置变体（实验用，非生产默认）：
 * 仅提高对敌破坏的状态分，用于验证计分配置轴在测量台上确实生效。
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

export const DEFAULT_SCORE_CONFIG_VARIANTS: readonly ScoreConfigVariant[] = [
  { name: 'default', config: POINTS_CONFIG },
  { name: 'suppress-boost', config: SUPPRESS_BOOST_POINTS_CONFIG }
];

export const DEFAULT_STRATEGY_VARIANTS: readonly StrategyVariant[] = [
  { name: '平衡', strategy: balancedStrategy },
  { name: '纯推进', strategy: pureRushStrategy },
  { name: '纯压制', strategy: pureSuppressStrategy }
];

export const DEFAULT_MATCHES_PER_CELL = 2000;
export const DEFAULT_BASE_SEED = 10000;
export const DEFAULT_MAX_ROUNDS = 30;

/** 单个对照格（模式 × 计分配置 × 策略族）的聚合结果 */
export interface MeasurementCell {
  readonly mode: RuleMode;
  readonly scoreConfigName: string;
  readonly strategyName: string;
  readonly seed: number;
  readonly matches: number;
  readonly guiYuanRate: number;
  readonly showdownRate: number;
  readonly maxRoundsRate: number;
  readonly avgRounds: number;
  readonly p1WinRate: number;
  readonly p2WinRate: number;
  /** 对手残留道损：双方盘面残留道损均值（自对弈对称） */
  readonly opponentResidualDamage: number;
  /** 压制度量：对手盘面等级下降量之和的场均（2 -> 1 记 1） */
  readonly suppressionLevels: number;
  /** 建设度量：己方盘面等级上升量之和的场均 */
  readonly constructionLevels: number;
  /** 分数构成：双方构成均值的场均 */
  readonly scoreComposition: ScoreComposition;
}

export interface MeasurementReport {
  readonly modes: readonly RuleMode[];
  readonly scoreConfigNames: readonly string[];
  readonly strategyNames: readonly string[];
  readonly matches: number;
  readonly baseSeed: number;
  readonly maxRounds: number;
  readonly cells: readonly MeasurementCell[];
}

export interface MeasurementMatrixOptions {
  readonly modes?: readonly RuleMode[];
  readonly scoreConfigs?: readonly ScoreConfigVariant[];
  readonly strategies?: readonly StrategyVariant[];
  readonly matches?: number;
  readonly baseSeed?: number;
  readonly maxRounds?: number;
}

interface MutableScoreComposition {
  constructionPoints: number;
  suppressionPoints: number;
  milestonePoints: number;
  damagePenalty: number;
}

function createEmptyComposition(): MutableScoreComposition {
  return { constructionPoints: 0, suppressionPoints: 0, milestonePoints: 0, damagePenalty: 0 };
}

/** 运行单个对照格：同一策略族自对弈 N 局 */
function runCell(
  mode: RuleMode,
  scoreConfig: ScoreConfigVariant,
  strategyVariant: StrategyVariant,
  matches: number,
  baseSeed: number,
  maxRounds: number
): MeasurementCell {
  const match = new HeadlessMatch();

  let p1Wins = 0;
  let p2Wins = 0;
  let guiYuanCount = 0;
  let showdownCount = 0;
  let maxRoundsCount = 0;
  let totalRounds = 0;
  let residualDamageTotal = 0;
  let suppressionTotal = 0;
  let constructionTotal = 0;
  const composition = createEmptyComposition();

  for (let i = 0; i < matches; i++) {
    const result = match.run(strategyVariant.strategy, strategyVariant.strategy, {
      seed: baseSeed + i,
      maxRounds,
      recordActions: false,
      lowStateRedirect: mode === 'full',
      scoreConfig: scoreConfig.config,
      collectStats: true
    });

    if (result.winner === 'P1') p1Wins++;
    else if (result.winner === 'P2') p2Wins++;
    if (result.endReason === 'GUI_YUAN') guiYuanCount++;
    else if (result.endReason === 'MAX_ROUNDS') maxRoundsCount++;
    if (result.showdownOccurred) showdownCount++;
    totalRounds += result.roundsPlayed;

    const stats = result.stats!;
    residualDamageTotal += (stats.residualDamage.P1 + stats.residualDamage.P2) / 2;
    suppressionTotal += (stats.P1.suppressionLevels + stats.P2.suppressionLevels) / 2;
    constructionTotal += (stats.P1.constructionLevels + stats.P2.constructionLevels) / 2;

    composition.constructionPoints +=
      (stats.P1.scoreComposition.constructionPoints + stats.P2.scoreComposition.constructionPoints) / 2;
    composition.suppressionPoints +=
      (stats.P1.scoreComposition.suppressionPoints + stats.P2.scoreComposition.suppressionPoints) / 2;
    composition.milestonePoints +=
      (stats.P1.scoreComposition.milestonePoints + stats.P2.scoreComposition.milestonePoints) / 2;
    composition.damagePenalty +=
      (stats.P1.scoreComposition.damagePenalty + stats.P2.scoreComposition.damagePenalty) / 2;
  }

  const safe = (value: number) => (matches > 0 ? value / matches : 0);

  return {
    mode,
    scoreConfigName: scoreConfig.name,
    strategyName: strategyVariant.name,
    seed: baseSeed,
    matches,
    guiYuanRate: safe(guiYuanCount),
    showdownRate: safe(showdownCount),
    maxRoundsRate: safe(maxRoundsCount),
    avgRounds: safe(totalRounds),
    p1WinRate: safe(p1Wins),
    p2WinRate: safe(p2Wins),
    opponentResidualDamage: safe(residualDamageTotal),
    suppressionLevels: safe(suppressionTotal),
    constructionLevels: safe(constructionTotal),
    scoreComposition: {
      constructionPoints: safe(composition.constructionPoints),
      suppressionPoints: safe(composition.suppressionPoints),
      milestonePoints: safe(composition.milestonePoints),
      damagePenalty: safe(composition.damagePenalty)
    }
  };
}

/** 运行“模式 × 计分配置 × 策略族”全交叉对照矩阵 */
export function runMeasurementMatrix(options: MeasurementMatrixOptions = {}): MeasurementReport {
  const modes = options.modes ?? DEFAULT_MODES;
  const scoreConfigs = options.scoreConfigs ?? DEFAULT_SCORE_CONFIG_VARIANTS;
  const strategies = options.strategies ?? DEFAULT_STRATEGY_VARIANTS;
  const matches = options.matches ?? DEFAULT_MATCHES_PER_CELL;
  const baseSeed = options.baseSeed ?? DEFAULT_BASE_SEED;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;

  const cells: MeasurementCell[] = [];
  for (const mode of modes) {
    for (const scoreConfig of scoreConfigs) {
      for (const strategyVariant of strategies) {
        cells.push(runCell(mode, scoreConfig, strategyVariant, matches, baseSeed, maxRounds));
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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatComposition(composition: ScoreComposition): string {
  return [
    `建设 ${composition.constructionPoints.toFixed(1)}`,
    `压制 ${composition.suppressionPoints.toFixed(1)}`,
    `里程碑 ${composition.milestonePoints.toFixed(1)}`,
    `终局罚 ${composition.damagePenalty.toFixed(1)}`
  ].join(' / ');
}

/** 将对照报告格式化为可直接粘贴进工单的 markdown 表格 */
export function formatMeasurementReport(report: MeasurementReport): string {
  const header =
    '| 模式 | 计分配置 | 策略 | 种子 | 样本 | 归元率 | 天命揭牌率 | 回合上限率 | 平均回合 | P1胜率 | P2胜率 | 对手残留道损 | 压制度量 | 分数构成 |';
  const separator =
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |';

  const rows = report.cells.map(cell =>
    [
      cell.mode,
      cell.scoreConfigName,
      cell.strategyName,
      String(cell.seed),
      String(cell.matches),
      formatPercent(cell.guiYuanRate),
      formatPercent(cell.showdownRate),
      formatPercent(cell.maxRoundsRate),
      cell.avgRounds.toFixed(2),
      formatPercent(cell.p1WinRate),
      formatPercent(cell.p2WinRate),
      cell.opponentResidualDamage.toFixed(2),
      cell.suppressionLevels.toFixed(2),
      formatComposition(cell.scoreComposition)
    ].join(' | ')
  );

  const meta = [
    '## 测量台对照表 (模式 × 计分配置 × 策略族)',
    '',
    `- 种子基数: ${report.baseSeed} (每格连续 ${report.matches} 局)`,
    `- 每格样本量: ${report.matches}`,
    `- 回合上限: ${report.maxRounds}`,
    '- 模式: `off` = 变体 B 关闭, `full` = 变体 B 开启',
    '- 压制度量口径: 对手盘面等级下降量之和 (加持 2 -> 点亮 1 记 1)',
    '- 分数构成: 建设分 / 压制分 / 里程碑分 / 终局道损罚分',
    '',
    header,
    separator,
    ...rows.map(row => `| ${row} |`)
  ];

  return meta.join('\n');
}

const HELP_TEXT = `归元弈 (Guiyuan) 测量台 - 模式 × 计分配置 × 策略族对照

用法:
  npm run benchmark:matrix -- [选项]

选项:
  --matches <N>        每个对照格的样本量 (默认 ${DEFAULT_MATCHES_PER_CELL})
  --seed <N>           种子基数，每格使用 seed + i (默认 ${DEFAULT_BASE_SEED})
  --max-rounds <N>     回合上限 (默认 ${DEFAULT_MAX_ROUNDS})
  --modes <list>       逗号分隔的规则模式，可选 off,full (默认 off,full)
  --help, -h           显示本帮助

输出:
  可直接粘贴进工单的 markdown 对照表 (含种子、样本量、策略名与压制度量)。
`;

interface ParsedArgs {
  readonly help: boolean;
  readonly options: MeasurementMatrixOptions;
}

/** 解析 CLI 参数；未知参数抛错，--help 时提前返回 */
export function parseMatrixArgs(argv: readonly string[]): ParsedArgs {
  const options: {
    matches?: number;
    baseSeed?: number;
    maxRounds?: number;
    modes?: readonly RuleMode[];
  } = {};
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--matches') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`--matches 需要非负数字: ${argv[i]}`);
      options.matches = Math.floor(value);
      continue;
    }
    if (arg === '--seed') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value)) throw new Error(`--seed 需要数字: ${argv[i]}`);
      options.baseSeed = Math.floor(value);
      continue;
    }
    if (arg === '--max-rounds') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 1) throw new Error(`--max-rounds 需要正数: ${argv[i]}`);
      options.maxRounds = Math.floor(value);
      continue;
    }
    if (arg === '--modes') {
      const raw = (argv[++i] ?? '').split(',').map(part => part.trim()).filter(Boolean);
      const parsed = raw.map(part => {
        if (part !== 'off' && part !== 'full') throw new Error(`未知模式: ${part}`);
        return part as RuleMode;
      });
      options.modes = parsed;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  return { help, options };
}

// 支持 CLI 命令行直接执行
if (typeof process !== 'undefined' && process.argv && process.argv[1]) {
  try {
    const isDirectRun =
      import.meta.url === pathToFileURL(process.argv[1]).href ||
      import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
    if (isDirectRun) {
      const { help, options } = parseMatrixArgs(process.argv.slice(2));
      if (help) {
        console.log(HELP_TEXT);
      } else {
        console.log(
          `🚀 运行测量台: ${options.matches ?? DEFAULT_MATCHES_PER_CELL} 局/格, 种子基数 ${options.baseSeed ?? DEFAULT_BASE_SEED}...`
        );
        const report = runMeasurementMatrix(options);
        console.log(formatMeasurementReport(report));
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

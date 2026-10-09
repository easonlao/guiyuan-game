/**
 * 归元弈 (Guiyuan) - 模式 × 计分配置 × 策略族对照测量台 (MeasurementBench)
 * 纯 TS 核心，零 DOM/BOM 依赖。产出可直接粘贴进工单的 markdown 对照表。
 *
 * 第一要务是工具忠实：默认参数下 off + 平衡策略必须复现已知基线。
 * 压制度量按“对手盘面等级下降量之和”统计（2 -> 1 记 1），而非“未点亮侧数”。
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ActionType } from '../types/domain.js';
import { ActionTypeCounts, HeadlessMatch, ScoreComposition } from './HeadlessMatch.js';
import type { DecisionStrategy, StrategyWeights } from '../ai/types.js';
import { PointsConfig, POINTS_CONFIG, ScoreCalculator } from '../logic/ScoreCalculator.js';
import { ActionResolver } from '../logic/ActionResolver.js';
import { ActionEvaluator } from '../ai/ActionEvaluator.js';
import {
  createStrategy,
  balancedStrategy,
  rushGuiyuanStrategy,
  aggressiveStrategy,
  defensiveStrategy,
  pureRushStrategy,
  pureSuppressStrategy,
  BALANCED_WEIGHTS,
  RUSH_GUIYUAN_WEIGHTS,
  AGGRESSIVE_WEIGHTS,
  DEFENSIVE_WEIGHTS,
  PURE_RUSH_WEIGHTS,
  PURE_SUPPRESS_WEIGHTS
} from '../ai/Strategy.js';

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

/**
 * 规则计分杠杆（Ticket 05）候选配置。
 * 所有配置都只改计分数值，不改动作/状态转移规则；生产默认 POINTS_CONFIG 保持不变。
 *
 * 关键前提：计分同时是 AI 动作估值的输入与回合上限时的胜负判据，
 * 因此扫描时每个配置会同时绑定到 AI 的 ActionEvaluator（见 createScoreBoundStrategy），
 * 否则改数值只会影响终局判据，而不会改变 AI 行为，实验将失去意义。
 */

/** 撤销 ADR 0002 硬编码的 2.5 倍攻击压制强化（还原为强化前数值） */
export const UNDO_ATTACK_BUFF_POINTS_CONFIG: PointsConfig = {
  ...POINTS_CONFIG,
  STATE_CHANGE: {
    ...POINTS_CONFIG.STATE_CHANGE,
    CAUSE_DMG: { yang: 120, yin: 100 },
    BREAK_LIGHT: { yang: 80, yin: 60 },
    WEAKEN: 80
  }
};

/** 终局残留道损惩罚下调（50 -> 0） */
export const LOWER_DAMAGE_PENALTY_POINTS_CONFIG: PointsConfig = {
  ...POINTS_CONFIG,
  DAMAGE_PENALTY: 0
};

/** 组合：撤销攻击强化 + 道损惩罚下调 */
export const COMBINED_POINTS_CONFIG: PointsConfig = {
  ...UNDO_ATTACK_BUFF_POINTS_CONFIG,
  DAMAGE_PENALTY: 0
};

/** 攻击净收益归零：【破】/【强破】行为分与全部攻击状态分清零 */
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

/** 组合：攻击净收益归零 + 道损惩罚下调 */
export const ATTACK_ZERO_LOWER_PENALTY_POINTS_CONFIG: PointsConfig = {
  ...ATTACK_ZERO_POINTS_CONFIG,
  DAMAGE_PENALTY: 0
};

/** 规则计分杠杆的对照配置（Ticket 05）：现状 / 撤销攻击强化 / 道损惩罚下调 / 组合 / 攻击净收益归零 / 组合·攻击归零 */
export const SCORE_LEVER_CONFIG_VARIANTS: readonly ScoreConfigVariant[] = [
  { name: '现状', config: POINTS_CONFIG },
  { name: '撤销攻击强化', config: UNDO_ATTACK_BUFF_POINTS_CONFIG },
  { name: '道损惩罚下调', config: LOWER_DAMAGE_PENALTY_POINTS_CONFIG },
  { name: '组合', config: COMBINED_POINTS_CONFIG },
  { name: '攻击净收益归零', config: ATTACK_ZERO_POINTS_CONFIG },
  { name: '组合·攻击归零', config: ATTACK_ZERO_LOWER_PENALTY_POINTS_CONFIG }
];

/** 规则计分杠杆扫描的策略权重模板（6 组：4 组预设 + 2 组纯极端对照） */
export interface ScoreLeverStrategyTemplate {
  readonly name: string;
  readonly weights: StrategyWeights;
}

export const SCORE_LEVER_STRATEGY_TEMPLATES: readonly ScoreLeverStrategyTemplate[] = [
  { name: '平衡', weights: BALANCED_WEIGHTS },
  { name: '归元冲刺', weights: RUSH_GUIYUAN_WEIGHTS },
  { name: '激进压制', weights: AGGRESSIVE_WEIGHTS },
  { name: '保守自保', weights: DEFENSIVE_WEIGHTS },
  { name: '纯推进', weights: PURE_RUSH_WEIGHTS },
  { name: '纯压制', weights: PURE_SUPPRESS_WEIGHTS }
];

/**
 * 把计分配置绑定到 AI 动作估值器：使同一套规则数值既是终局判据，也是 AI 决策输入。
 * 默认（POINTS_CONFIG）下与 createStrategy(weights) 等价，保证现状行可复现既有基线。
 */
export function createScoreBoundStrategy(
  weights: StrategyWeights,
  config: PointsConfig
): DecisionStrategy {
  return createStrategy(weights, {
    evaluator: new ActionEvaluator(new ActionResolver(new ScoreCalculator(config)))
  });
}

export const DEFAULT_STRATEGY_VARIANTS: readonly StrategyVariant[] = [
  { name: '平衡', strategy: balancedStrategy },
  { name: '纯推进', strategy: pureRushStrategy },
  { name: '纯压制', strategy: pureSuppressStrategy }
];

/**
 * AI 偏好扫描（Ticket 04）的 4 组既有权重预设。
 * 仅调整 AI 决策权重，不改动任何规则或计分默认值。
 */
export const WEIGHT_PRESET_VARIANTS: readonly StrategyVariant[] = [
  { name: '平衡', strategy: balancedStrategy },
  { name: '归元冲刺', strategy: rushGuiyuanStrategy },
  { name: '激进压制', strategy: aggressiveStrategy },
  { name: '保守自保', strategy: defensiveStrategy }
];

/** 补充对照的纯极端策略（不作为 4 组预设的一部分） */
export const SUPPLEMENTARY_STRATEGY_VARIANTS: readonly StrategyVariant[] = [
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
  /** 全局动作类型分布（场均次数，Ticket 04） */
  readonly actionTypeCounts: ActionTypeCounts;
  /** 低位态决策分布（场均次数，Ticket 04） */
  readonly lowStateChoices: ActionTypeCounts;
  /** 低位态决策总次数（场均，Ticket 04） */
  readonly lowStateDecisions: number;
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

/** 全动作类型计数表（可变）；显式列出以保持键集合稳定 */
function createEmptyActionTypeCounts(): Record<ActionType, number> {
  return {
    [ActionType.AUTO]: 0,
    [ActionType.CONVERT]: 0,
    [ActionType.TRANS]: 0,
    [ActionType.ATK]: 0,
    [ActionType.BURST]: 0,
    [ActionType.BURST_ATK]: 0,
    [ActionType.DISSIPATE]: 0,
    [ActionType.PASS]: 0
  };
}

/** 将累计的动作计数取场均，返回不可变分布 */
function averageActionTypeCounts(
  counts: Readonly<Record<ActionType, number>>,
  matches: number
): ActionTypeCounts {
  const safe = (value: number) => (matches > 0 ? value / matches : 0);
  const averaged = {} as Record<ActionType, number>;
  for (const actionType of Object.values(ActionType)) {
    averaged[actionType] = safe(counts[actionType]);
  }
  return averaged;
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
  let lowStateDecisionsTotal = 0;
  const composition = createEmptyComposition();
  const actionTypeCounts = createEmptyActionTypeCounts();
  const lowStateChoices = createEmptyActionTypeCounts();

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

    for (const actionType of Object.values(ActionType)) {
      actionTypeCounts[actionType] += stats.actionTypeCounts[actionType];
      lowStateChoices[actionType] += stats.lowStateChoices[actionType];
    }
    lowStateDecisionsTotal += stats.lowStateDecisions;
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
    },
    actionTypeCounts: averageActionTypeCounts(actionTypeCounts, matches),
    lowStateChoices: averageActionTypeCounts(lowStateChoices, matches),
    lowStateDecisions: safe(lowStateDecisionsTotal)
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

export interface AiPreferenceScanOptions {
  readonly modes?: readonly RuleMode[];
  readonly presets?: readonly StrategyVariant[];
  readonly supplementary?: readonly StrategyVariant[];
  readonly matches?: number;
  readonly baseSeed?: number;
  readonly maxRounds?: number;
}

/**
 * AI 偏好扫描（Ticket 04）：4 组既有权重预设 × off/full，
 * 固定使用生产默认计分配置（POINTS_CONFIG），不改动任何规则。
 * 复用 runMeasurementMatrix，仅通过 StrategyVariant 注入权重预设。
 */
export function runAiPreferenceScan(options: AiPreferenceScanOptions = {}): MeasurementReport {
  const presets = options.presets ?? WEIGHT_PRESET_VARIANTS;
  const supplementary = options.supplementary ?? SUPPLEMENTARY_STRATEGY_VARIANTS;
  const defaultConfig = DEFAULT_SCORE_CONFIG_VARIANTS[0];

  return runMeasurementMatrix({
    modes: options.modes ?? DEFAULT_MODES,
    scoreConfigs: [defaultConfig],
    strategies: [...presets, ...supplementary],
    matches: options.matches ?? DEFAULT_MATCHES_PER_CELL,
    baseSeed: options.baseSeed ?? DEFAULT_BASE_SEED,
    maxRounds: options.maxRounds ?? DEFAULT_MAX_ROUNDS
  });
}

function findCell(
  report: MeasurementReport,
  strategyName: string,
  mode: RuleMode
): MeasurementCell | undefined {
  return report.cells.find(cell => cell.strategyName === strategyName && cell.mode === mode);
}

function signedPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${(Math.abs(value) * 100).toFixed(2)}pp`;
}

function signedNumber(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${Math.abs(value).toFixed(2)}`;
}

/** 将 AI 偏好扫描格式化为可粘贴的 markdown：预设对照 + off→full 变化量 + 低位态分布 */
export function formatAiPreferenceReport(report: MeasurementReport): string {
  const lines: string[] = [];
  lines.push('## AI 偏好杠杆对照表 (4 组权重预设 × off/full)');
  lines.push('');
  lines.push(`- 种子基数: ${report.baseSeed} (每格连续 ${report.matches} 局)`);
  lines.push(`- 每格样本量: ${report.matches}`);
  lines.push(`- 回合上限: ${report.maxRounds}`);
  lines.push('- 模式: `off` = 变体 B 关闭, `full` = 变体 B 开启');
  lines.push('- 计分配置: 生产默认 `POINTS_CONFIG` (本扫描不改任何规则/计分默认)');
  lines.push('- 压制度量口径: 对手盘面等级下降量之和 (加持 2 -> 点亮 1 记 1)');
  lines.push('- `纯推进` / `纯压制` 为补充对照行，不计入 4 组权重预设');
  lines.push('');
  lines.push('| 策略 | 模式 | 归元率 | 回合上限率 | 平均回合 | P1胜率 | P2胜率 | 对手残留道损 | 压制度量 |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const name of report.strategyNames) {
    for (const mode of report.modes) {
      const cell = findCell(report, name, mode);
      if (!cell) continue;
      lines.push(
        `| ${name} | ${mode} | ${formatPercent(cell.guiYuanRate)} | ${formatPercent(
          cell.maxRoundsRate
        )} | ${cell.avgRounds.toFixed(2)} | ${formatPercent(cell.p1WinRate)} | ${formatPercent(
          cell.p2WinRate
        )} | ${cell.opponentResidualDamage.toFixed(2)} | ${cell.suppressionLevels.toFixed(2)} |`
      );
    }
  }
  lines.push('');
  lines.push('### off→full 变化量 (full − off)');
  lines.push('');
  lines.push('| 策略 | 归元率 | 回合上限率 | 平均回合 | P1胜率 | P2胜率 | 对手残留道损 | 压制度量 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const name of report.strategyNames) {
    const off = findCell(report, name, 'off');
    const full = findCell(report, name, 'full');
    if (!off || !full) continue;
    lines.push(
      `| ${name} | ${signedPercent(full.guiYuanRate - off.guiYuanRate)} | ${signedPercent(
        full.maxRoundsRate - off.maxRoundsRate
      )} | ${signedNumber(full.avgRounds - off.avgRounds)} | ${signedPercent(
        full.p1WinRate - off.p1WinRate
      )} | ${signedPercent(full.p2WinRate - off.p2WinRate)} | ${signedNumber(
        full.opponentResidualDamage - off.opponentResidualDamage
      )} | ${signedNumber(full.suppressionLevels - off.suppressionLevels)} |`
    );
  }
  lines.push('');
  lines.push('### 低位态决策分布 (full 模式，场均)');
  lines.push('');
  const actionTypes = Object.values(ActionType);
  lines.push(`| 策略 | 低位决策/局 | ${actionTypes.join(' | ')} |`);
  lines.push(`| --- | ---: | ${actionTypes.map(() => '---:').join(' | ')} |`);
  for (const name of report.strategyNames) {
    const cell = findCell(report, name, 'full');
    if (!cell) continue;
    const counts = actionTypes.map(actionType => {
      const count = cell.lowStateChoices[actionType];
      const pct = cell.lowStateDecisions > 0 ? (count / cell.lowStateDecisions) * 100 : 0;
      return `${count.toFixed(2)} (${pct.toFixed(1)}%)`;
    });
    lines.push(
      `| ${name} | ${cell.lowStateDecisions.toFixed(2)} | ${counts.join(' | ')} |`
    );
  }
  return lines.join('\n');
}

export interface ScoreLeverScanOptions {
  readonly modes?: readonly RuleMode[];
  readonly scoreConfigs?: readonly ScoreConfigVariant[];
  readonly strategyTemplates?: readonly ScoreLeverStrategyTemplate[];
  readonly matches?: number;
  readonly baseSeed?: number;
  readonly maxRounds?: number;
}

/**
 * 规则计分杠杆扫描（Ticket 05）：候选计分配置 × off/full × 策略族。
 * 与 AI 偏好扫描的关键区别：每个计分配置同时绑定到 AI 估值器，
 * 因此改数值会同时改变 AI 行为与回合上限判据（计分的双重角色）。
 */
export function runScoreLeverScan(options: ScoreLeverScanOptions = {}): MeasurementReport {
  const modes = options.modes ?? DEFAULT_MODES;
  const scoreConfigs = options.scoreConfigs ?? SCORE_LEVER_CONFIG_VARIANTS;
  const templates = options.strategyTemplates ?? SCORE_LEVER_STRATEGY_TEMPLATES;
  const matches = options.matches ?? DEFAULT_MATCHES_PER_CELL;
  const baseSeed = options.baseSeed ?? DEFAULT_BASE_SEED;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;

  const cells: MeasurementCell[] = [];
  for (const scoreConfig of scoreConfigs) {
    const strategies: StrategyVariant[] = templates.map(template => ({
      name: template.name,
      strategy: createScoreBoundStrategy(template.weights, scoreConfig.config)
    }));
    const report = runMeasurementMatrix({
      modes,
      scoreConfigs: [scoreConfig],
      strategies,
      matches,
      baseSeed,
      maxRounds
    });
    cells.push(...report.cells);
  }

  return {
    modes,
    scoreConfigNames: scoreConfigs.map(scoreConfig => scoreConfig.name),
    strategyNames: templates.map(template => template.name),
    matches,
    baseSeed,
    maxRounds,
    cells
  };
}

/** 单场对拼（A 执先手 P1，B 执后手 P2）的聚合结果（Ticket 05 纯极端策略占优判定） */
export interface HeadToHeadCell {
  readonly mode: RuleMode;
  readonly scoreConfigName: string;
  readonly strategyA: string;
  readonly strategyB: string;
  readonly seed: number;
  readonly matches: number;
  readonly aWinRate: number;
  readonly bWinRate: number;
  readonly drawRate: number;
  readonly guiYuanRate: number;
  readonly maxRoundsRate: number;
  readonly avgRounds: number;
}

export interface HeadToHeadReport {
  readonly modes: readonly RuleMode[];
  readonly scoreConfigNames: readonly string[];
  readonly strategyNames: readonly string[];
  readonly matches: number;
  readonly baseSeed: number;
  readonly maxRounds: number;
  readonly cells: readonly HeadToHeadCell[];
}

export interface HeadToHeadScanOptions {
  readonly modes?: readonly RuleMode[];
  readonly scoreConfigs?: readonly ScoreConfigVariant[];
  readonly strategyTemplates?: readonly ScoreLeverStrategyTemplate[];
  readonly matches?: number;
  readonly baseSeed?: number;
  readonly maxRounds?: number;
}

/**
 * 策略对拼扫描（Ticket 05）：有序对 (A vs B)，A 执先手、B 执后手。
 * 自对弈的归元率不能回答"某纯极端策略是否占优"，必须看跨策略胜率。
 * 所有有序对同时覆盖两种座次，故无需额外交换先手。
 */
export function runHeadToHeadScan(options: HeadToHeadScanOptions = {}): HeadToHeadReport {
  const modes = options.modes ?? DEFAULT_MODES;
  const scoreConfigs = options.scoreConfigs ?? SCORE_LEVER_CONFIG_VARIANTS;
  const templates = options.strategyTemplates ?? SCORE_LEVER_STRATEGY_TEMPLATES;
  const matches = options.matches ?? DEFAULT_MATCHES_PER_CELL;
  const baseSeed = options.baseSeed ?? DEFAULT_BASE_SEED;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;

  const cells: HeadToHeadCell[] = [];
  for (const mode of modes) {
    for (const scoreConfig of scoreConfigs) {
      for (const templateA of templates) {
        for (const templateB of templates) {
          if (templateA.name === templateB.name) continue;
          cells.push(
            runHeadToHeadCell(
              mode,
              scoreConfig,
              templateA,
              templateB,
              matches,
              baseSeed,
              maxRounds
            )
          );
        }
      }
    }
  }

  return {
    modes,
    scoreConfigNames: scoreConfigs.map(scoreConfig => scoreConfig.name),
    strategyNames: templates.map(template => template.name),
    matches,
    baseSeed,
    maxRounds,
    cells
  };
}

function runHeadToHeadCell(
  mode: RuleMode,
  scoreConfig: ScoreConfigVariant,
  templateA: ScoreLeverStrategyTemplate,
  templateB: ScoreLeverStrategyTemplate,
  matches: number,
  baseSeed: number,
  maxRounds: number
): HeadToHeadCell {
  const match = new HeadlessMatch();
  const strategyA = createScoreBoundStrategy(templateA.weights, scoreConfig.config);
  const strategyB = createScoreBoundStrategy(templateB.weights, scoreConfig.config);

  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  let guiYuanCount = 0;
  let maxRoundsCount = 0;
  let totalRounds = 0;

  for (let i = 0; i < matches; i++) {
    const result = match.run(strategyA, strategyB, {
      seed: baseSeed + i,
      maxRounds,
      recordActions: false,
      lowStateRedirect: mode === 'full',
      scoreConfig: scoreConfig.config
    });
    if (result.winner === 'P1') aWins++;
    else if (result.winner === 'P2') bWins++;
    else draws++;
    if (result.endReason === 'GUI_YUAN') guiYuanCount++;
    else if (result.endReason === 'MAX_ROUNDS') maxRoundsCount++;
    totalRounds += result.roundsPlayed;
  }

  const safe = (value: number) => (matches > 0 ? value / matches : 0);
  return {
    mode,
    scoreConfigName: scoreConfig.name,
    strategyA: templateA.name,
    strategyB: templateB.name,
    seed: baseSeed,
    matches,
    aWinRate: safe(aWins),
    bWinRate: safe(bWins),
    drawRate: safe(draws),
    guiYuanRate: safe(guiYuanCount),
    maxRoundsRate: safe(maxRoundsCount),
    avgRounds: safe(totalRounds)
  };
}

function findHeadToHeadCell(
  report: HeadToHeadReport,
  scoreConfigName: string,
  strategyA: string,
  strategyB: string,
  mode: RuleMode
): HeadToHeadCell | undefined {
  return report.cells.find(
    cell =>
      cell.scoreConfigName === scoreConfigName &&
      cell.strategyA === strategyA &&
      cell.strategyB === strategyB &&
      cell.mode === mode
  );
}

/**
 * 座次平衡对拼胜率：把 A 执先手与 A 执后手两种座次平均，
 * 消除先手优势后 A 相对 B 的真实胜率。A === B 时返回 undefined。
 */
function seatBalancedWinRate(
  report: HeadToHeadReport,
  scoreConfigName: string,
  strategyA: string,
  strategyB: string,
  mode: RuleMode
): number | undefined {
  if (strategyA === strategyB) return undefined;
  const aAsP1 = findHeadToHeadCell(report, scoreConfigName, strategyA, strategyB, mode);
  const bAsP1 = findHeadToHeadCell(report, scoreConfigName, strategyB, strategyA, mode);
  if (!aAsP1 || !bAsP1) return undefined;
  const aAsP2 = 1 - bAsP1.aWinRate - bAsP1.drawRate;
  return (aAsP1.aWinRate + aAsP2) / 2;
}

/** 将策略对拼扫描格式化为 markdown：每个配置 × 模式一张 A→B 胜率矩阵 + 座次平衡矩阵 */
export function formatHeadToHeadReport(report: HeadToHeadReport): string {
  const lines: string[] = [];
  lines.push('## 策略对拼矩阵 (计分配置 × 模式，行 A vs 列 B，单元格 = A 胜率)');
  lines.push('');
  lines.push(`- 种子基数: ${report.baseSeed} (每格连续 ${report.matches} 局)`);
  lines.push(`- 每格样本量: ${report.matches}`);
  lines.push(`- 回合上限: ${report.maxRounds}`);
  lines.push('- A 执先手 P1，B 执后手 P2；全部有序对已覆盖两种座次');
  lines.push('- 单元格为 A 胜率；平局归入双方未胜，故行内 A+B 胜率可略小于 100%');
  lines.push('- “座次平衡”矩阵把 A 执先手与 A 执后手两种座次平均，用于判定纯极端策略是否占优');
  for (const scoreConfigName of report.scoreConfigNames) {
    for (const mode of report.modes) {
      lines.push('');
      lines.push(`### ${scoreConfigName} · ${mode} · 原始（A 执先手）`);
      lines.push('');
      lines.push(`| A \\ B | ${report.strategyNames.join(' | ')} |`);
      lines.push(`| --- | ${report.strategyNames.map(() => '---:').join(' | ')} |`);
      for (const strategyA of report.strategyNames) {
        const row = report.strategyNames.map(strategyB => {
          if (strategyA === strategyB) return '—';
          const cell = findHeadToHeadCell(report, scoreConfigName, strategyA, strategyB, mode);
          return cell ? formatPercent(cell.aWinRate) : '—';
        });
        lines.push(`| ${strategyA} | ${row.join(' | ')} |`);
      }
      lines.push('');
      lines.push(`### ${scoreConfigName} · ${mode} · 座次平衡（A 相对 B 胜率）`);
      lines.push('');
      lines.push(`| A \\ B | ${report.strategyNames.join(' | ')} |`);
      lines.push(`| --- | ${report.strategyNames.map(() => '---:').join(' | ')} |`);
      for (const strategyA of report.strategyNames) {
        const row = report.strategyNames.map(strategyB => {
          const rate = seatBalancedWinRate(report, scoreConfigName, strategyA, strategyB, mode);
          return rate === undefined ? '—' : formatPercent(rate);
        });
        lines.push(`| ${strategyA} | ${row.join(' | ')} |`);
      }
    }
  }
  return lines.join('\n');
}

function findLeverCell(
  report: MeasurementReport,
  scoreConfigName: string,
  strategyName: string,
  mode: RuleMode
): MeasurementCell | undefined {
  return report.cells.find(
    cell =>
      cell.scoreConfigName === scoreConfigName &&
      cell.strategyName === strategyName &&
      cell.mode === mode
  );
}

const SCORE_LEVER_CONFIG_NOTES: Readonly<Record<string, string>> = {
  现状: '生产默认 POINTS_CONFIG（含硬编码 2.5 倍攻击强化）',
  撤销攻击强化: 'CAUSE_DMG 300/250→120/100, BREAK_LIGHT 200/150→80/60, WEAKEN 200→80',
  道损惩罚下调: 'DAMAGE_PENALTY 50→0',
  组合: '撤销攻击强化 + 道损惩罚下调',
  '攻击净收益归零': 'ACTION.ATK 40→0、ACTION.BURST_ATK 80→0，攻击状态分全部→0',
  '组合·攻击归零': '攻击净收益归零 + 道损惩罚下调'
};

/** 将规则计分杠杆扫描格式化为可粘贴的 markdown：明细 + full 模式策略矩阵 */
export function formatScoreLeverReport(report: MeasurementReport): string {
  const lines: string[] = [];
  lines.push('## 规则计分杠杆对照表 (计分配置 × 模式 × 策略族)');
  lines.push('');
  lines.push(`- 种子基数: ${report.baseSeed} (每格连续 ${report.matches} 局)`);
  lines.push(`- 每格样本量: ${report.matches}`);
  lines.push(`- 回合上限: ${report.maxRounds}`);
  lines.push('- 模式: `off` = 变体 B 关闭, `full` = 变体 B 开启');
  lines.push('- AI 估值绑定: 每个计分配置同时绑定到 `ActionEvaluator`（计分既是估值输入，也是回合上限判据）');
  lines.push('- 压制度量口径: 对手盘面等级下降量之和 (加持 2 -> 点亮 1 记 1)');
  lines.push('');
  lines.push('计分配置定义：');
  for (const name of report.scoreConfigNames) {
    lines.push(`- \`${name}\`: ${SCORE_LEVER_CONFIG_NOTES[name] ?? ''}`);
  }
  lines.push('');
  lines.push('### 配置 × 策略 × 模式 明细');
  lines.push('');
  lines.push(
    '| 计分配置 | 策略 | 模式 | 归元率 | 回合上限率 | 平均回合 | P1胜率 | P2胜率 | 对手残留道损 | 压制度量 |'
  );
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const configName of report.scoreConfigNames) {
    for (const strategyName of report.strategyNames) {
      for (const mode of report.modes) {
        const cell = findLeverCell(report, configName, strategyName, mode);
        if (!cell) continue;
        lines.push(
          `| ${configName} | ${strategyName} | ${mode} | ${formatPercent(
            cell.guiYuanRate
          )} | ${formatPercent(cell.maxRoundsRate)} | ${cell.avgRounds.toFixed(
            2
          )} | ${formatPercent(cell.p1WinRate)} | ${formatPercent(cell.p2WinRate)} | ${cell.opponentResidualDamage.toFixed(
            2
          )} | ${cell.suppressionLevels.toFixed(2)} |`
        );
      }
    }
  }
  lines.push('');
  lines.push('### full 模式归元率矩阵 (行 = 计分配置, 列 = 策略)');
  lines.push('');
  lines.push(formatLeverMatrix(report, 'full', cell => formatPercent(cell.guiYuanRate)));
  lines.push('');
  lines.push('### full 模式回合上限率矩阵 (行 = 计分配置, 列 = 策略)');
  lines.push('');
  lines.push(formatLeverMatrix(report, 'full', cell => formatPercent(cell.maxRoundsRate)));
  lines.push('');
  lines.push('### off 模式归元率矩阵 (行 = 计分配置, 列 = 策略)');
  lines.push('');
  lines.push(formatLeverMatrix(report, 'off', cell => formatPercent(cell.guiYuanRate)));
  return lines.join('\n');
}

function formatLeverMatrix(
  report: MeasurementReport,
  mode: RuleMode,
  render: (cell: MeasurementCell) => string
): string {
  const header = `| 计分配置 | ${report.strategyNames.join(' | ')} |`;
  const separator = `| --- | ${report.strategyNames.map(() => '---:').join(' | ')} |`;
  const rows = report.scoreConfigNames.map(configName => {
    const cells = report.strategyNames.map(strategyName => {
      const cell = findLeverCell(report, configName, strategyName, mode);
      return cell ? render(cell) : '—';
    });
    return `| ${configName} | ${cells.join(' | ')} |`;
  });
  return [header, separator, ...rows].join('\n');
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
  npm run benchmark:ai-preference -- [选项]
  npm run benchmark:score-lever -- [选项]

选项:
  --scan <kind>        扫描类型: matrix (默认) / ai-preference / score-lever / head-to-head
  --matches <N>        每个对照格的样本量 (默认 ${DEFAULT_MATCHES_PER_CELL})
  --seed <N>           种子基数，每格使用 seed + i (默认 ${DEFAULT_BASE_SEED})
  --max-rounds <N>     回合上限 (默认 ${DEFAULT_MAX_ROUNDS})
  --modes <list>       逗号分隔的规则模式，可选 off,full (默认 off,full)
  --help, -h           显示本帮助

扫描类型:
  matrix          模式 × 计分配置 × 策略族 全交叉对照
  ai-preference   4 组既有权重预设 × off/full (Ticket 04，仅调 AI 偏好)
  score-lever     规则计分杠杆候选配置 × off/full × 策略族 (Ticket 05，改数值)
  head-to-head    策略对拼矩阵，判定纯极端策略是否占优 (Ticket 05)

输出:
  可直接粘贴进工单的 markdown 对照表 (含种子、样本量、策略名与压制度量)。
`;

/** 扫描类型：默认全矩阵，或 Ticket 04/05 的专项扫描 */
export type ScanKind = 'matrix' | 'ai-preference' | 'score-lever' | 'head-to-head';

interface ParsedArgs {
  readonly help: boolean;
  readonly scan: ScanKind;
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
  let scan: ScanKind = 'matrix';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--scan') {
      const value = argv[++i];
      if (value !== 'matrix' && value !== 'ai-preference' && value !== 'score-lever' && value !== 'head-to-head') {
        throw new Error(`未知扫描类型: ${value}`);
      }
      scan = value;
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

  return { help, scan, options };
}

// 支持 CLI 命令行直接执行
if (typeof process !== 'undefined' && process.argv && process.argv[1]) {
  try {
    const isDirectRun =
      import.meta.url === pathToFileURL(process.argv[1]).href ||
      import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
    if (isDirectRun) {
      const { help, scan, options } = parseMatrixArgs(process.argv.slice(2));
      if (help) {
        console.log(HELP_TEXT);
      } else {
        console.log(
          `🚀 运行${
            scan === 'ai-preference'
              ? 'AI 偏好扫描'
              : scan === 'score-lever'
                ? '规则计分杠杆扫描'
                : scan === 'head-to-head'
                  ? '策略对拼扫描'
                  : '测量台'
          }: ${options.matches ?? DEFAULT_MATCHES_PER_CELL} 局/格, 种子基数 ${
            options.baseSeed ?? DEFAULT_BASE_SEED
          }...`
        );
        if (scan === 'ai-preference') {
          console.log(formatAiPreferenceReport(runAiPreferenceScan(options)));
        } else if (scan === 'score-lever') {
          console.log(formatScoreLeverReport(runScoreLeverScan(options)));
        } else if (scan === 'head-to-head') {
          console.log(formatHeadToHeadReport(runHeadToHeadScan(options)));
        } else {
          console.log(formatMeasurementReport(runMeasurementMatrix(options)));
        }
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

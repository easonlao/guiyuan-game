/**
 * 归元弈 (Guiyuan) - 候选验证命令 (Candidate Validation)
 *
 * Ticket 05 / spec `dominance-guard-and-route-fix` Implementation Decisions #4：
 * 「一条命令跑完四条验收标准并输出对照报告」。
 *
 * 本模块是**测量台**的一部分：它消费既有的无头推演接缝，不新增第三处可替换接缝，
 * 也不重算任何指标。
 *
 * 四条验收标准（缺一不可，各自独立计算、独立可失败）：
 *   1. 无严格占优      —— 候选计分/规则下，对拼矩阵中不存在对全部对手严格占优的策略。
 *                          判定用显著性证据（z=1.96，每格 ≥ 100 局），不是裸 `rate > 0.5`。
 *   2. 每个行为都有价值 —— 动作价值普查中没有在所有被测盘面上都被支配的动作。
 *   3. 护栏全绿        —— 500 局平衡自对弈、种子 10000、回合上限 30 下，
 *                          归元率 ∈ [0.75, 0.95]、先手胜率 ∈ [0.45, 0.55]、堆内存增量 < 15MB。
 *   4. 动态策略全胜    —— 动态切换策略对全部静态预设的座次平衡胜率显著高于 50%（非裸 >50%）。
 *
 * 报告另外携带（ticket 清单）：
 *   - 流局率始终与先后手胜率成对输出（陷阱 C，`formatDrawRateWithWinRates`）；
 *   - 相对生产配置的逐格强弱关系翻转对照（`compareHeadToHeadMatrices`）。
 *
 * 确定性：同一候选 + 同一选项 → 同一报告。唯一例外是 `guardrails.heapUsedDeltaMB`，
 * 它是运行期内存诊断，天然带噪声；所有决策字段均可复现。
 *
 * 复跑命令见 package.json：`npm run benchmark:candidate-validation`。
 */

import { type ActionType } from '../types/domain.js';
import type { RuleSwitches } from '../logic/ActionCandidates.js';
import { POINTS_CONFIG, type PointsConfig } from '../logic/ScoreCalculator.js';
import { BALANCED_WEIGHTS } from '../ai/Strategy.js';
import { HeadlessBenchmark } from './HeadlessBenchmark.js';
import { runCliIfDirect } from './cli.js';
import {
  DEFAULT_BASE_SEED,
  DEFAULT_MAX_ROUNDS,
  DEFAULT_STRATEGY_VARIANTS,
  buildVariantStrategy,
  compareHeadToHeadMatrices,
  formatSeatBalancedMatrix,
  isBoardSettlementFor,
  ruleSwitchesFor,
  runHeadToHeadMatrix,
  toHeadToHeadMatrix,
  type HeadToHeadComparison,
  type HeadToHeadReport,
  type MatchupComparison,
  type RuleMode,
  type StrategyVariant
} from './ExperimentRunner.js';
import {
  DOMINANCE_SIGNIFICANCE_Z,
  MIN_DOMINANCE_MATCHES,
  analyzeDominanceMatrix,
  evaluateDominanceEvidence,
  formatDominanceVerdict,
  formatDrawRateWithWinRates,
  type DominanceVerdict,
  type HeadToHeadMatrix,
  type UndecidableMatchup
} from './Metrics.js';
import {
  runActionValueCensus,
  type ActionTypeCensus,
  type ActionValueCensusReport
} from './ActionValueCensus.js';
import {
  DEFAULT_DYNAMIC_POLICY,
  runDynamicSwitchingExperiment,
  type DynamicPolicyReport,
  type DynamicSwitchPolicy,
  type DynamicSwitchingReport
} from './DynamicSwitching.js';

// ---------------------------------------------------------------------------
// 验收标准常量
// ---------------------------------------------------------------------------

/** 护栏：归元率下界（500 局平衡自对弈，唯一 live 红线，见 ADR 0011 决策 2）。 */
export const GUARDRAIL_GUIYUAN_MIN = 0.75;
/** 护栏：归元率上界。 */
export const GUARDRAIL_GUIYUAN_MAX = 0.95;
/** 护栏：先手胜率下界。 */
export const GUARDRAIL_P1_WIN_MIN = 0.45;
/** 护栏：先手胜率上界。 */
export const GUARDRAIL_P1_WIN_MAX = 0.55;
/** 护栏：500 局堆内存增量上界（MB）。 */
export const GUARDRAIL_HEAP_MAX_MB = 15;

/** 护栏样本量（固定口径）。 */
export const DEFAULT_GUARDRAIL_MATCHES = 500;
/** 护栏种子（固定口径）。 */
export const DEFAULT_GUARDRAIL_SEED = 10000;
/** 对拼矩阵默认每座次样本量；搜索可下调做快速通过。 */
export const DEFAULT_VALIDATION_MATCHES_PER_SEAT = 500;

// ---------------------------------------------------------------------------
// 候选描述
// ---------------------------------------------------------------------------

/**
 * 终局结算方式。当前实现 `scoring`（读计分结算）与 `board-only`（回合上限按盘面进度判负），
 * 与 `RuleMode` 同一联合类型；未来若新增结算机制（如残留道损少者胜），在此扩展即可。
 */
export type SettlementMode = RuleMode;

/**
 * 一个候选改动：名称、说明、可选的计分配置、规则开关与终局结算方式。
 *
 * 计分配置通常由 `POINTS_CONFIG` 派生（`{ ...POINTS_CONFIG, ACTION: { ... } }`），
 * 候选只改需要改的旋钮，不复制整张表。规则开关与结算方式用于表达非计分轴改动。
 */
export interface CandidateSpec {
  readonly name: string;
  readonly description: string;
  /** 候选计分配置；缺省为生产 `POINTS_CONFIG`。 */
  readonly pointsConfig?: PointsConfig;
  /** 候选规则开关（如 board-only）；缺省由 `settlementMode` 推导。 */
  readonly rules?: RuleSwitches;
  /** 候选终局结算方式；缺省由 `rules.isBoardOnly` 推导，再缺省为 `scoring`。 */
  readonly settlementMode?: SettlementMode;
}

/** 解析后的候选：计分配置/规则/结算全部落实，供运行器直接消费。 */
export interface ResolvedCandidate {
  readonly name: string;
  readonly description: string;
  readonly pointsConfig: PointsConfig;
  readonly rules: RuleSwitches;
  readonly settlementMode: SettlementMode;
  readonly isBoardSettlement: boolean;
}

/** 把候选声明解析为可运行配置。 */
export function resolveCandidate(spec: CandidateSpec): ResolvedCandidate {
  const settlementMode: SettlementMode =
    spec.settlementMode ?? (spec.rules?.isBoardOnly ? 'board-only' : 'scoring');
  return {
    name: spec.name,
    description: spec.description,
    pointsConfig: spec.pointsConfig ?? POINTS_CONFIG,
    rules: spec.rules ?? ruleSwitchesFor(settlementMode),
    settlementMode,
    isBoardSettlement: isBoardSettlementFor(settlementMode)
  };
}

/** 生产配置候选（对照基线，也是 CLI 默认值）。 */
export const PRODUCTION_CANDIDATE: CandidateSpec = {
  name: 'production',
  description: '生产默认 POINTS_CONFIG（scoring 结算）',
  pointsConfig: POINTS_CONFIG,
  rules: {},
  settlementMode: 'scoring'
};

// ---------------------------------------------------------------------------
// 选项
// ---------------------------------------------------------------------------

export interface CandidateValidationOptions {
  /** 对拼矩阵（标准 1 与 4）每座次样本量；默认 500，搜索可下调做快速通过。 */
  readonly matchesPerSeat?: number;
  /** 对拼矩阵种子基数；默认 10000。 */
  readonly seed?: number;
  /** 回合上限；默认 30。 */
  readonly maxRounds?: number;
  /** 护栏样本量；默认 500（固定口径，测试可下调）。 */
  readonly guardrailMatches?: number;
  /** 护栏种子；默认 10000。 */
  readonly guardrailSeed?: number;
  /** 标准 1 的策略族；默认全部 7 个预设。 */
  readonly strategies?: readonly StrategyVariant[];
  /** 标准 4 的静态预设；默认全部 7 个预设。 */
  readonly statics?: readonly StrategyVariant[];
  /** 标准 4 的动态策略；默认 `DEFAULT_DYNAMIC_POLICY`。 */
  readonly dynamicPolicies?: readonly DynamicSwitchPolicy[];
  /** 是否采集标准 4 的逐决策统计；默认 false（验证不需要，且更慢）。 */
  readonly shouldCollectDynamicStats?: boolean;
  /** 对照基线候选；默认生产配置。 */
  readonly baseline?: CandidateSpec;
  /** 预计算的生产对拼矩阵（复用接缝，避免重复跑一遍矩阵）。 */
  readonly baselineHeadToHead?: HeadToHeadReport;
}

export interface ResolvedValidationOptions {
  readonly matchesPerSeat: number;
  readonly seed: number;
  readonly maxRounds: number;
  readonly guardrailMatches: number;
  readonly guardrailSeed: number;
  readonly strategies: readonly string[];
  readonly statics: readonly string[];
  readonly dynamicPolicies: readonly string[];
  readonly shouldCollectDynamicStats: boolean;
}

// ---------------------------------------------------------------------------
// 报告结构
// ---------------------------------------------------------------------------

/** 标准 1：无严格占优。 */
export interface NoStrictDominanceResult {
  readonly passed: boolean;
  /** 每个策略严格占优全部对手的列表；为空即通过。 */
  readonly strictDominators: readonly string[];
  /** 对拼矩阵（全部有序对、座次平衡）；占优结论的强制附件。 */
  readonly matrix: HeadToHeadMatrix;
  /** 完整对拼报告（含逐格流局率/先后手胜率）。 */
  readonly headToHead: HeadToHeadReport;
  readonly verdicts: readonly DominanceVerdict[];
  /** 缺格 / 样本不足 / 与 50% 无法区分；非空时「无占优」结论不完整。 */
  readonly undecidable: readonly UndecidableMatchup[];
  readonly fullyDecided: boolean;
  readonly strategies: readonly string[];
  readonly matchesPerSeat: number;
  readonly seed: number;
  readonly maxRounds: number;
}

/** 标准 2：每个行为都有价值。 */
export interface EveryActionHasValueResult {
  readonly passed: boolean;
  readonly census: ActionValueCensusReport;
  readonly globallyDominated: readonly ActionType[];
  /** 逐动作类型结论表（报告正文使用）。 */
  readonly actions: readonly ActionTypeCensus[];
}

/** 单条护栏断言。 */
export interface GuardrailCheck {
  readonly key: string;
  readonly label: string;
  readonly actual: number;
  readonly min?: number;
  readonly max?: number;
  readonly passed: boolean;
}

/** 标准 3：护栏全绿。 */
export interface GuardrailResult {
  readonly passed: boolean;
  readonly matches: number;
  readonly seed: number;
  readonly maxRounds: number;
  readonly guiYuanRate: number;
  readonly p1WinRate: number;
  readonly p2WinRate: number;
  /** 流局率（回合上限结算率）；始终与 p1/p2 成对报告（陷阱 C）。 */
  readonly drawRate: number;
  readonly heapUsedDeltaMB: number;
  readonly checks: readonly GuardrailCheck[];
}

/** 标准 4：单条动态 vs 静态的显著性证据。 */
export interface DynamicAdvantageEvidence {
  readonly policy: string;
  readonly staticStrategy: string;
  readonly matches: number;
  readonly dynamicWinRate: number;
  /** dynamicWinRate - 0.5。 */
  readonly margin: number;
  /** 二项标准误 0.5 / sqrt(matches)。 */
  readonly standardError: number;
  /** 显著性阈值 z × SE。 */
  readonly threshold: number;
  /** 95% 置信区间下界 = rate - z×SE。 */
  readonly lowerBound: number;
  /** 95% 置信区间上界 = rate + z×SE。 */
  readonly upperBound: number;
  /** 样本量足够且 margin ≥ threshold。 */
  readonly significant: boolean;
}

/** 标准 4：动态策略打赢全部静态预设。 */
export interface DynamicBeatsStaticsResult {
  readonly passed: boolean;
  readonly report: DynamicSwitchingReport;
  readonly policies: readonly string[];
  readonly statics: readonly string[];
  readonly evidence: readonly DynamicAdvantageEvidence[];
  readonly significantBeats: readonly string[];
  readonly nonSignificant: readonly string[];
}

/** 改动前后逐格对照。 */
export interface BaselineComparisonResult {
  readonly baselineName: string;
  readonly baselineDescription: string;
  /** 候选与基线配置一致时复用候选矩阵，不重复运行。 */
  readonly reusedCandidateMatrix: boolean;
  readonly comparison: HeadToHeadComparison;
  readonly flips: readonly MatchupComparison[];
}

/** 完整候选验证报告。 */
export interface CandidateValidationReport {
  readonly candidate: ResolvedCandidate;
  readonly options: ResolvedValidationOptions;
  readonly noStrictDominance: NoStrictDominanceResult;
  readonly everyActionHasValue: EveryActionHasValueResult;
  readonly guardrails: GuardrailResult;
  readonly dynamicBeatsStatics: DynamicBeatsStaticsResult;
  readonly baselineComparison: BaselineComparisonResult;
  /** 四条标准全部通过。 */
  readonly allPassed: boolean;
}

// ---------------------------------------------------------------------------
// 标准 1：无严格占优
// ---------------------------------------------------------------------------

function runNoStrictDominance(
  candidate: ResolvedCandidate,
  strategies: readonly StrategyVariant[],
  matchesPerSeat: number,
  seed: number,
  maxRounds: number
): NoStrictDominanceResult {
  const headToHead = runHeadToHeadMatrix({
    strategies,
    mode: candidate.settlementMode,
    scoreConfig: { name: candidate.name, config: candidate.pointsConfig },
    rules: candidate.rules,
    isBoardSettlement: candidate.isBoardSettlement,
    matches: matchesPerSeat,
    baseSeed: seed,
    maxRounds
  });
  const matrix = toHeadToHeadMatrix(headToHead);
  const analysis = analyzeDominanceMatrix(matrix);
  const allCount = headToHead.strategies.length - 1;
  const strictDominators = analysis.verdicts
    .filter(verdict => verdict.dominates.length === allCount && allCount > 0)
    .map(verdict => verdict.strategy);

  return {
    passed: strictDominators.length === 0,
    strictDominators,
    matrix,
    headToHead,
    verdicts: analysis.verdicts,
    undecidable: analysis.undecidable,
    fullyDecided: analysis.undecidable.length === 0,
    strategies: headToHead.strategies,
    matchesPerSeat,
    seed,
    maxRounds
  };
}

// ---------------------------------------------------------------------------
// 标准 2：每个行为都有价值
// ---------------------------------------------------------------------------

function runEveryActionHasValue(candidate: ResolvedCandidate): EveryActionHasValueResult {
  const census = runActionValueCensus({
    pointsConfig: candidate.pointsConfig,
    rules: candidate.rules
  });
  return {
    passed: census.globallyDominated.length === 0,
    census,
    globallyDominated: census.globallyDominated,
    actions: census.actions
  };
}

// ---------------------------------------------------------------------------
// 标准 3：护栏全绿
// ---------------------------------------------------------------------------

function runGuardrails(
  candidate: ResolvedCandidate,
  guardrailMatches: number,
  guardrailSeed: number,
  maxRounds: number
): GuardrailResult {
  const benchmark = new HeadlessBenchmark();
  const balanced: StrategyVariant = { name: '平衡', weights: BALANCED_WEIGHTS };
  const metrics = benchmark.run({
    matches: guardrailMatches,
    baseSeed: guardrailSeed,
    maxRounds,
    strategyP1: buildVariantStrategy(balanced, candidate.pointsConfig, candidate.rules),
    strategyP2: buildVariantStrategy(balanced, candidate.pointsConfig, candidate.rules),
    scoreConfig: candidate.pointsConfig,
    rules: candidate.rules,
    isBoardSettlement: candidate.isBoardSettlement
  });

  const guiYuanCheck: GuardrailCheck = {
    key: 'guiYuanRate',
    label: '归元率',
    actual: metrics.guiYuanRate,
    min: GUARDRAIL_GUIYUAN_MIN,
    max: GUARDRAIL_GUIYUAN_MAX,
    passed:
      metrics.guiYuanRate >= GUARDRAIL_GUIYUAN_MIN &&
      metrics.guiYuanRate <= GUARDRAIL_GUIYUAN_MAX
  };
  const p1Check: GuardrailCheck = {
    key: 'p1WinRate',
    label: '先手胜率',
    actual: metrics.p1WinRate,
    min: GUARDRAIL_P1_WIN_MIN,
    max: GUARDRAIL_P1_WIN_MAX,
    passed:
      metrics.p1WinRate >= GUARDRAIL_P1_WIN_MIN && metrics.p1WinRate <= GUARDRAIL_P1_WIN_MAX
  };
  const heapCheck: GuardrailCheck = {
    key: 'heapUsedDeltaMB',
    label: '堆内存增量 (MB)',
    actual: metrics.heapUsedDeltaMB,
    max: GUARDRAIL_HEAP_MAX_MB,
    passed: metrics.heapUsedDeltaMB < GUARDRAIL_HEAP_MAX_MB
  };
  const checks = [guiYuanCheck, p1Check, heapCheck];

  return {
    passed: checks.every(check => check.passed),
    matches: guardrailMatches,
    seed: guardrailSeed,
    maxRounds,
    guiYuanRate: metrics.guiYuanRate,
    p1WinRate: metrics.p1WinRate,
    p2WinRate: metrics.p2WinRate,
    drawRate: metrics.drawRate,
    heapUsedDeltaMB: metrics.heapUsedDeltaMB,
    checks
  };
}

// ---------------------------------------------------------------------------
// 标准 4：动态策略打赢全部静态预设
// ---------------------------------------------------------------------------

/** 把动态报告适配成显著性判定用的对拼矩阵（动态策略为 p1）。 */
function toDynamicMatrix(policyReport: DynamicPolicyReport): HeadToHeadMatrix {
  return {
    strategies: [
      policyReport.policy.name,
      ...policyReport.matchups.map(matchup => matchup.staticStrategy)
    ],
    cells: policyReport.matchups.map(matchup => ({
      p1Strategy: policyReport.policy.name,
      p2Strategy: matchup.staticStrategy,
      matches: matchup.matches,
      seatBalancedWinRate: matchup.dynamicWinRate
    }))
  };
}

function evidenceFor(
  policyReport: DynamicPolicyReport,
  matrix: HeadToHeadMatrix
): DynamicAdvantageEvidence[] {
  return policyReport.matchups.map(matchup => {
    const matches = matchup.matches;
    const rate = matchup.dynamicWinRate;
    const margin = rate - 0.5;
    const standardError = matches > 0 ? 0.5 / Math.sqrt(matches) : Number.POSITIVE_INFINITY;
    const threshold = DOMINANCE_SIGNIFICANCE_Z * standardError;
    const evidence = evaluateDominanceEvidence(matrix, policyReport.policy.name, matchup.staticStrategy);
    return {
      policy: policyReport.policy.name,
      staticStrategy: matchup.staticStrategy,
      matches,
      dynamicWinRate: rate,
      margin,
      standardError,
      threshold,
      lowerBound: rate - threshold,
      upperBound: rate + threshold,
      significant: evidence.kind === 'supported'
    };
  });
}

function runDynamicBeatsStatics(
  candidate: ResolvedCandidate,
  statics: readonly StrategyVariant[],
  policies: readonly DynamicSwitchPolicy[],
  shouldCollectStats: boolean,
  matchesPerSeat: number,
  seed: number,
  maxRounds: number
): DynamicBeatsStaticsResult {
  const report = runDynamicSwitchingExperiment({
    policies,
    statics,
    mode: candidate.settlementMode,
    scoreConfig: { name: candidate.name, config: candidate.pointsConfig },
    rules: candidate.rules,
    isBoardSettlement: candidate.isBoardSettlement,
    matches: matchesPerSeat,
    baseSeed: seed,
    maxRounds,
    shouldCollectStats
  });

  const evidence = report.policies.flatMap(policyReport =>
    evidenceFor(policyReport, toDynamicMatrix(policyReport))
  );
  const significantBeats = evidence
    .filter(item => item.significant)
    .map(item => `${item.policy} vs ${item.staticStrategy}`);
  const nonSignificant = evidence
    .filter(item => !item.significant)
    .map(item => `${item.policy} vs ${item.staticStrategy}`);

  return {
    passed: evidence.length > 0 && evidence.every(item => item.significant),
    report,
    policies: report.policies.map(policyReport => policyReport.policy.name),
    statics: report.statics,
    evidence,
    significantBeats,
    nonSignificant
  };
}

// ---------------------------------------------------------------------------
// 改动前后逐格对照
// ---------------------------------------------------------------------------

function configsMatch(a: ResolvedCandidate, b: ResolvedCandidate): boolean {
  return (
    a.pointsConfig === b.pointsConfig &&
    a.settlementMode === b.settlementMode &&
    (a.rules.isBoardOnly ?? false) === (b.rules.isBoardOnly ?? false)
  );
}

function runBaselineComparison(
  candidate: ResolvedCandidate,
  baseline: ResolvedCandidate,
  strategies: readonly StrategyVariant[],
  candidateHeadToHead: HeadToHeadReport,
  baselineHeadToHead: HeadToHeadReport | undefined,
  matchesPerSeat: number,
  seed: number,
  maxRounds: number
): BaselineComparisonResult {
  const reusedCandidateMatrix = configsMatch(candidate, baseline);
  const baselineReport =
    baselineHeadToHead ??
    (reusedCandidateMatrix
      ? candidateHeadToHead
      : runHeadToHeadMatrix({
          strategies,
          mode: baseline.settlementMode,
          scoreConfig: { name: baseline.name, config: baseline.pointsConfig },
          rules: baseline.rules,
          isBoardSettlement: baseline.isBoardSettlement,
          matches: matchesPerSeat,
          baseSeed: seed,
          maxRounds
        }));

  const comparison = compareHeadToHeadMatrices(baselineReport, candidateHeadToHead);

  return {
    baselineName: baseline.name,
    baselineDescription: baseline.description,
    reusedCandidateMatrix,
    comparison,
    flips: comparison.flips
  };
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 对单个候选跑完四条验收标准，返回结构化报告。
 *
 * 四条标准独立计算：任一条失败不会短路其余三条。同一候选 + 同一选项 → 同一报告
 * （唯一例外是 `guardrails.heapUsedDeltaMB` 这一运行期内存诊断）。
 */
export function validateCandidate(
  spec: CandidateSpec,
  options: CandidateValidationOptions = {}
): CandidateValidationReport {
  const candidate = resolveCandidate(spec);
  const baseline = resolveCandidate(options.baseline ?? PRODUCTION_CANDIDATE);
  const matchesPerSeat = options.matchesPerSeat ?? DEFAULT_VALIDATION_MATCHES_PER_SEAT;
  const seed = options.seed ?? DEFAULT_BASE_SEED;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const guardrailMatches = options.guardrailMatches ?? DEFAULT_GUARDRAIL_MATCHES;
  const guardrailSeed = options.guardrailSeed ?? DEFAULT_GUARDRAIL_SEED;
  const strategies = options.strategies ?? DEFAULT_STRATEGY_VARIANTS;
  const statics = options.statics ?? DEFAULT_STRATEGY_VARIANTS;
  const dynamicPolicies = options.dynamicPolicies ?? [DEFAULT_DYNAMIC_POLICY];
  const shouldCollectDynamicStats = options.shouldCollectDynamicStats ?? false;

  const noStrictDominance = runNoStrictDominance(
    candidate,
    strategies,
    matchesPerSeat,
    seed,
    maxRounds
  );
  const everyActionHasValue = runEveryActionHasValue(candidate);
  const guardrails = runGuardrails(candidate, guardrailMatches, guardrailSeed, maxRounds);
  const dynamicBeatsStatics = runDynamicBeatsStatics(
    candidate,
    statics,
    dynamicPolicies,
    shouldCollectDynamicStats,
    matchesPerSeat,
    seed,
    maxRounds
  );
  const baselineComparison = runBaselineComparison(
    candidate,
    baseline,
    strategies,
    noStrictDominance.headToHead,
    options.baselineHeadToHead,
    matchesPerSeat,
    seed,
    maxRounds
  );

  const resolvedOptions: ResolvedValidationOptions = {
    matchesPerSeat,
    seed,
    maxRounds,
    guardrailMatches,
    guardrailSeed,
    strategies: noStrictDominance.strategies,
    statics: dynamicBeatsStatics.statics,
    dynamicPolicies: dynamicBeatsStatics.policies,
    shouldCollectDynamicStats
  };

  return {
    candidate,
    options: resolvedOptions,
    noStrictDominance,
    everyActionHasValue,
    guardrails,
    dynamicBeatsStatics,
    baselineComparison,
    allPassed:
      noStrictDominance.passed &&
      everyActionHasValue.passed &&
      guardrails.passed &&
      dynamicBeatsStatics.passed
  };
}

// ---------------------------------------------------------------------------
// 报告格式化（可直接粘贴进工单的 markdown）
// ---------------------------------------------------------------------------

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function passLabel(passed: boolean): string {
  return passed ? '通过' : '**失败**';
}

function formatCensusActionTable(actions: readonly ActionTypeCensus[]): string {
  const lines: string[] = [];
  lines.push('| 动作类型 | 可用 | 观测数 | 最优盘面数 | 被支配盘面数 | 全局被支配 |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- |');
  for (const action of actions) {
    lines.push(
      `| ${action.actionType} | ${action.available ? '是' : '否'} | ${action.observationCount} | ${
        action.optimalBoardKeys.length
      } | ${action.dominatedBoardKeys.length} | ${action.globallyDominated ? '**是**' : '否'} |`
    );
  }
  return lines.join('\n');
}

function formatDrawPairedMatchups(report: HeadToHeadReport): string {
  const lines: string[] = [];
  lines.push('| A | B | 两座次样本 | 座次平衡胜率 | 流局率 / 先后手胜率 |');
  lines.push('| --- | --- | ---: | ---: | --- |');
  for (const matchup of report.matchups) {
    lines.push(
      `| ${matchup.strategyA} | ${matchup.strategyB} | ${matchup.matches} | ${percent(
        matchup.seatBalancedWinRate
      )} | ${formatDrawRateWithWinRates({
        drawRate: matchup.drawRate,
        p1WinRate: matchup.p1WinRate,
        p2WinRate: matchup.p2WinRate
      })} |`
    );
  }
  return lines.join('\n');
}

function formatDominanceConclusion(result: NoStrictDominanceResult): string {
  const lines: string[] = [];
  lines.push(`结果：${passLabel(result.passed)}`);
  lines.push('');
  if (result.passed) {
    lines.push('对拼矩阵中不存在对全部对手严格占优的策略。');
  } else {
    lines.push(
      `存在对全部对手严格占优的策略：**${result.strictDominators.join('、')}**（样本量足够且显著高于 50%）。`
    );
  }
  if (!result.fullyDecided) {
    lines.push('');
    lines.push(
      `> 注意：有 ${result.undecidable.length} 对无法判定（缺格 / 样本不足 / 与 50% 无法区分），「无占优」结论并不完整。`
    );
  }
  lines.push('');
  const dominated = result.verdicts.filter(verdict => verdict.dominates.length > 0);
  if (dominated.length === 0) {
    lines.push('无任何被矩阵支撑的占优结论。');
  } else {
    for (const verdict of dominated) {
      // 陷阱 B：占优结论必须由矩阵支撑，`formatDominanceVerdict` 内部会强制校验。
      lines.push(`- ${formatDominanceVerdict(verdict, result.matrix)}`);
    }
  }
  if (result.undecidable.length > 0) {
    lines.push('');
    lines.push('无法判定的对（不能作为占优证据，也不能当作「已确认无占优」）：');
    for (const item of result.undecidable) {
      lines.push(`- ${item.strategy} vs ${item.opponent}：${item.reason}`);
    }
  }
  return lines.join('\n');
}

function formatGuardrailSection(result: GuardrailResult): string {
  const lines: string[] = [];
  lines.push(`结果：${passLabel(result.passed)}`);
  lines.push('');
  lines.push(`- 样本：${result.matches} 局平衡自对弈，种子 ${result.seed}，回合上限 ${result.maxRounds}`);
  lines.push(
    `- 流局率与先后手胜率（陷阱 C：必须成对报告）：${formatDrawRateWithWinRates({
      drawRate: result.drawRate,
      p1WinRate: result.p1WinRate,
      p2WinRate: result.p2WinRate
    })}`
  );
  lines.push('');
  lines.push('| 护栏 | 实测 | 带 | 结果 |');
  lines.push('| --- | ---: | --- | --- |');
  for (const check of result.checks) {
    const band =
      check.min !== undefined && check.max !== undefined
        ? `[${percent(check.min)}, ${percent(check.max)}]`
        : check.max !== undefined
          ? `< ${check.max}`
          : '—';
    const actual =
      check.key === 'heapUsedDeltaMB' ? check.actual.toFixed(2) : percent(check.actual);
    lines.push(`| ${check.label} | ${actual} | ${band} | ${passLabel(check.passed)} |`);
  }
  return lines.join('\n');
}

function formatDynamicSection(result: DynamicBeatsStaticsResult): string {
  const lines: string[] = [];
  lines.push(`结果：${passLabel(result.passed)}`);
  lines.push('');
  lines.push(
    `- 动态策略：${result.policies.join('、')}；静态预设：${result.statics.join('、')}`
  );
  lines.push(
    `- 判定：座次平衡胜率需显著高于 50%（z = ${DOMINANCE_SIGNIFICANCE_Z}，每格 ≥ ${MIN_DOMINANCE_MATCHES} 局）。`
  );
  lines.push('');
  lines.push('| 动态策略 | 静态预设 | 样本 | 动态胜率 | 边际 | 标准误 | 阈值 | 95% CI 下界 | 显著 |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const item of result.evidence) {
    lines.push(
      `| ${item.policy} | ${item.staticStrategy} | ${item.matches} | ${percent(
        item.dynamicWinRate
      )} | ${percent(item.margin)} | ${percent(item.standardError)} | ${percent(
        item.threshold
      )} | ${percent(item.lowerBound)} | ${item.significant ? '是' : '否'} |`
    );
  }
  if (result.nonSignificant.length > 0) {
    lines.push('');
    lines.push(
      `未显著打赢的对：${result.nonSignificant.join('、')}。这不等于「设计意图不成立」——也可能是该动态实现不足，需区分。`
    );
  }
  return lines.join('\n');
}

const RELATION_LABEL: Readonly<Record<string, string>> = {
  strong: '强 (A 胜)',
  weak: '弱 (A 负)',
  tie: '平 (50%)'
};

function formatRelation(relation: string): string {
  return RELATION_LABEL[relation] ?? relation;
}

function formatBaselineComparisonSection(result: BaselineComparisonResult): string {
  const lines: string[] = [];
  lines.push(
    `对照基线：\`${result.baselineName}\`（${result.baselineDescription}）${
      result.reusedCandidateMatrix ? '；候选与基线配置一致，复用候选矩阵。' : '。'
    }`
  );
  lines.push('');
  lines.push(`**强弱关系翻转 ${result.flips.length} 格**`);
  lines.push('');
  if (result.flips.length === 0) {
    lines.push('无：所有格子的强弱关系与基线一致。');
  } else {
    lines.push('| A | B | 基线胜率 | 基线关系 | 候选胜率 | 候选关系 | Δ (候选 − 基线) |');
    lines.push('| --- | --- | ---: | --- | ---: | --- | ---: |');
    for (const flip of result.flips) {
      lines.push(
        `| ${flip.strategyA} | ${flip.strategyB} | ${percent(flip.scoringWinRate)} | ${
          formatRelation(flip.scoringRelation)
        } | ${percent(flip.boardOnlyWinRate)} | ${formatRelation(flip.boardOnlyRelation)} | ${percent(
          flip.delta
        )} |`
      );
    }
  }
  lines.push('');
  lines.push('### 逐格对照（全部有序对）');
  lines.push('');
  lines.push('| A | B | 基线胜率 | 候选胜率 | Δ | 翻转 |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- |');
  for (const matchup of result.comparison.matchups) {
    lines.push(
      `| ${matchup.strategyA} | ${matchup.strategyB} | ${percent(
        matchup.scoringWinRate
      )} | ${percent(matchup.boardOnlyWinRate)} | ${percent(matchup.delta)} | ${
        matchup.flipped ? '是' : '否'
      } |`
    );
  }
  return lines.join('\n');
}

/** 把候选验证报告格式化为可直接粘贴的 markdown。 */
export function formatCandidateValidationReport(report: CandidateValidationReport): string {
  const lines: string[] = [];
  const { candidate, options } = report;

  lines.push(`# 候选验证报告：${candidate.name}`);
  lines.push('');
  lines.push(candidate.description);
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push('| # | 验收标准 | 结果 |');
  lines.push('| --- | --- | --- |');
  lines.push(`| 1 | 无严格占优 | ${passLabel(report.noStrictDominance.passed)} |`);
  lines.push(`| 2 | 每个行为都有价值 | ${passLabel(report.everyActionHasValue.passed)} |`);
  lines.push(`| 3 | 护栏全绿 | ${passLabel(report.guardrails.passed)} |`);
  lines.push(
    `| 4 | 动态策略打赢全部静态预设 | ${passLabel(report.dynamicBeatsStatics.passed)} |`
  );
  lines.push('');
  lines.push(`**四条全部通过：${report.allPassed ? '是' : '否'}**`);
  lines.push('');
  lines.push(
    `- 对拼样本：${options.matchesPerSeat} 局/座次（每格 ${options.matchesPerSeat * 2} 局），种子 ${options.seed}，回合上限 ${options.maxRounds}`
  );
  lines.push(
    `- 护栏样本：${options.guardrailMatches} 局，种子 ${options.guardrailSeed}`
  );
  lines.push(
    `- 计分配置：${candidate.pointsConfig === POINTS_CONFIG ? 'POINTS_CONFIG（生产默认）' : '自定义 PointsConfig'}`
  );
  lines.push(`- 规则开关：${JSON.stringify(candidate.rules)}`);
  lines.push(`- 终局结算：${candidate.settlementMode}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 1. 无严格占优');
  lines.push('');
  lines.push(formatDominanceConclusion(report.noStrictDominance));
  lines.push('');
  lines.push(formatSeatBalancedMatrix(report.noStrictDominance.headToHead));
  lines.push('');
  lines.push('### 逐对明细（流局率与先后手胜率成对）');
  lines.push('');
  lines.push(formatDrawPairedMatchups(report.noStrictDominance.headToHead));
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 2. 每个行为都有价值');
  lines.push('');
  lines.push(`结果：${passLabel(report.everyActionHasValue.passed)}`);
  lines.push('');
  if (report.everyActionHasValue.passed) {
    lines.push('没有动作在所有被测盘面状态下都被支配。');
  } else {
    lines.push(
      `全局被支配动作：**${report.everyActionHasValue.globallyDominated.join('、')}**。`
    );
  }
  lines.push('');
  lines.push(formatCensusActionTable(report.everyActionHasValue.actions));
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 3. 护栏全绿');
  lines.push('');
  lines.push(formatGuardrailSection(report.guardrails));
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 4. 动态策略打赢全部静态预设');
  lines.push('');
  lines.push(formatDynamicSection(report.dynamicBeatsStatics));
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 5. 改动前后逐格对照');
  lines.push('');
  lines.push(formatBaselineComparisonSection(report.baselineComparison));

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP_TEXT = `归元弈 (Guiyuan) 候选验证命令 (Ticket 05)

用法:
  npm run benchmark:candidate-validation -- [选项]

选项:
  --name <name>         候选名称 (默认 production)
  --description <text>  候选说明
  --mode <mode>         终局结算方式: scoring (默认) / board-only
  --matches <N>         对拼矩阵每座次样本量 (默认 ${DEFAULT_VALIDATION_MATCHES_PER_SEAT})
  --seed <N>            对拼矩阵种子基数 (默认 ${DEFAULT_BASE_SEED})
  --max-rounds <N>      回合上限 (默认 ${DEFAULT_MAX_ROUNDS})
  --guardrail-matches <N>  护栏样本量 (默认 ${DEFAULT_GUARDRAIL_MATCHES})
  --guardrail-seed <N>     护栏种子 (默认 ${DEFAULT_GUARDRAIL_SEED})
  --help, -h            显示本帮助

说明:
  一次跑完四条验收标准并输出对照报告：
    1. 无严格占优 (显著性证据 + 对拼矩阵)
    2. 每个行为都有价值 (动作价值普查)
    3. 护栏全绿 (归元率 / 先手胜率 / 堆内存增量)
    4. 动态策略打赢全部静态预设 (显著性检验)
  CLI 默认使用生产 POINTS_CONFIG；程序化调用可传入自定义 PointsConfig 做搜索。
`;

export interface ParsedCandidateArgs {
  readonly isHelp: boolean;
  readonly name: string;
  readonly description: string;
  readonly mode: SettlementMode;
  readonly matches?: number;
  readonly seed?: number;
  readonly maxRounds?: number;
  readonly guardrailMatches?: number;
  readonly guardrailSeed?: number;
}

/** 解析 CLI 参数；未知参数或非法值抛错。 */
export function parseCandidateArgs(argv: readonly string[]): ParsedCandidateArgs {
  let isHelp = false;
  let name = PRODUCTION_CANDIDATE.name;
  let description = PRODUCTION_CANDIDATE.description;
  let mode: SettlementMode = 'scoring';
  let matches: number | undefined;
  let seed: number | undefined;
  let maxRounds: number | undefined;
  let guardrailMatches: number | undefined;
  let guardrailSeed: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      isHelp = true;
      continue;
    }
    if (arg === '--name') {
      name = argv[++i] ?? name;
      continue;
    }
    if (arg === '--description') {
      description = argv[++i] ?? description;
      continue;
    }
    if (arg === '--mode') {
      const value = argv[++i];
      if (value !== 'scoring' && value !== 'board-only') {
        throw new Error(`未知结算方式: ${value}`);
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
      seed = Math.floor(value);
      continue;
    }
    if (arg === '--max-rounds') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 1) throw new Error(`--max-rounds 需要正数: ${argv[i]}`);
      maxRounds = Math.floor(value);
      continue;
    }
    if (arg === '--guardrail-matches') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`--guardrail-matches 需要非负数字: ${argv[i]}`);
      }
      guardrailMatches = Math.floor(value);
      continue;
    }
    if (arg === '--guardrail-seed') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value)) throw new Error(`--guardrail-seed 需要数字: ${argv[i]}`);
      guardrailSeed = Math.floor(value);
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  return { isHelp, name, description, mode, matches, seed, maxRounds, guardrailMatches, guardrailSeed };
}

runCliIfDirect(import.meta.url, () => {
  const parsed = parseCandidateArgs(process.argv.slice(2));
  if (parsed.isHelp) {
    console.log(HELP_TEXT);
    return;
  }
  const matches = parsed.matches ?? DEFAULT_VALIDATION_MATCHES_PER_SEAT;
  const seed = parsed.seed ?? DEFAULT_BASE_SEED;
  const maxRounds = parsed.maxRounds ?? DEFAULT_MAX_ROUNDS;
  console.log(
    `🚀 候选验证 (${parsed.name}, ${parsed.mode}): 对拼 ${matches} 局/座次, 种子 ${seed}, 回合上限 ${maxRounds}...`
  );
  const report = validateCandidate(
    {
      name: parsed.name,
      description: parsed.description,
      settlementMode: parsed.mode
    },
    {
      matchesPerSeat: matches,
      seed,
      maxRounds,
      guardrailMatches: parsed.guardrailMatches,
      guardrailSeed: parsed.guardrailSeed
    }
  );
  console.log(formatCandidateValidationReport(report));
});

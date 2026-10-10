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
 *   1. 无严格占优      —— 候选计分/规则下，对拼矩阵中不存在对全部对手严格占优的策略，
 *                          且矩阵完全可判定。判定用显著性证据（z=1.96，每格 ≥ 100 局），
 *                          不是裸 `rate > 0.5`。矩阵缺格 / 样本不足 / 有与 50% 无法区分的对时，
 *                          标准 1 报「无法判定」（`inconclusive`），不静默通过。
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
import {
  DEFAULT_BASE_SEED,
  DEFAULT_MAX_ROUNDS,
  DEFAULT_STRATEGY_VARIANTS,
  buildVariantStrategy,
  compareHeadToHeadMatrices,
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
  analyzeDominanceMatrix,
  evaluateDominanceEvidence,
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
  TUNED_DYNAMIC_POLICY,
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
  /**
   * 终局结算口径覆盖（ticket 05 候选 E）：`scoring` 计分不变，但回合上限按盘面进度结算。
   * 缺省由 `settlementMode` 经 `isBoardSettlementFor` 推导。不扩展 `RuleMode`。
   */
  readonly isBoardSettlement?: boolean;
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
    isBoardSettlement: spec.isBoardSettlement ?? isBoardSettlementFor(settlementMode)
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

/**
 * Ticket 05 候选 A 的计分配置：攻击进度定价。
 * 工单 06 已把同一配置采纳进生产 `POINTS_CONFIG`，因此候选 A 与生产逐旋钮一致；
 * 本常量保留给搜索报告与对照使用。
 */
export const ATTACK_PROGRESS_SCALE_POINTS_CONFIG: PointsConfig = {
  ...POINTS_CONFIG,
  ATTACK_PROGRESS_SCALE: { floor: 0.3, span: 0.9 }
};

/** Ticket 05 候选 A（进度定价）的完整声明。 */
export const TICKET_05_CANDIDATE: CandidateSpec = {
  name: 'progress-pricing',
  description: '攻击进度定价（floor=0.3 / span=0.9）：压制的相对回报随对手归一进度上升',
  pointsConfig: ATTACK_PROGRESS_SCALE_POINTS_CONFIG,
  settlementMode: 'scoring'
};

/**
 * 搜索基线：工单 06 采纳前的生产计分（无攻击进度定价）。
 *
 * 候选 B/C/D/E 都是相对这个基线的改动，与工单 05 实际搜索时一致；
 * 候选 A 则是把它替换为进度定价。这样五个候选共享同一基线，避免把 A 的改动
 * 混进 B–E 的四标准结果。
 */
export const SEARCH_BASELINE_POINTS_CONFIG: PointsConfig = {
  ...POINTS_CONFIG,
  ATTACK_PROGRESS_SCALE: undefined
};

/** 候选 B：空枪定价（`WEAKEN: 200 → 0`）。 */
export const WEAKEN_ZERO_POINTS_CONFIG: PointsConfig = {
  ...SEARCH_BASELINE_POINTS_CONFIG,
  STATE_CHANGE: { ...SEARCH_BASELINE_POINTS_CONFIG.STATE_CHANGE, WEAKEN: 0 }
};

/**
 * 候选 C：赛跑差定价（实际测试出的最佳变体，g120 且无 cap）。
 * 攻击动作附加 `120 × (己方落后量 − 对手落后量)`。
 */
export const RACE_DIFF_POINTS_CONFIG: PointsConfig = {
  ...SEARCH_BASELINE_POINTS_CONFIG,
  RACE_DIFF_PRICING: { gain: 120 }
};

/** 候选 D：结构化下调（`WEAKEN → 0` + `CAUSE_DMG → 120/100`）。 */
export const STRUCTURED_REDUCTION_POINTS_CONFIG: PointsConfig = {
  ...SEARCH_BASELINE_POINTS_CONFIG,
  STATE_CHANGE: {
    ...SEARCH_BASELINE_POINTS_CONFIG.STATE_CHANGE,
    WEAKEN: 0,
    CAUSE_DMG: { yang: 120, yin: 100 }
  }
};

export const CANDIDATE_A: CandidateSpec = TICKET_05_CANDIDATE;

/** 候选 B：空枪定价。 */
export const CANDIDATE_B: CandidateSpec = {
  name: 'weaken-zero',
  description: '空枪定价：WEAKEN 200 → 0（搜索基线 + 只改这一旋钮）',
  pointsConfig: WEAKEN_ZERO_POINTS_CONFIG,
  settlementMode: 'scoring'
};

/** 候选 C：赛跑差定价。 */
export const CANDIDATE_C: CandidateSpec = {
  name: 'race-diff',
  description: '赛跑差定价：攻击动作附加 gain × (己方落后量 − 对手落后量)，gain=120 无 cap',
  pointsConfig: RACE_DIFF_POINTS_CONFIG,
  settlementMode: 'scoring'
};

/** 候选 D：结构化下调。 */
export const CANDIDATE_D: CandidateSpec = {
  name: 'structured-reduction',
  description: '结构化下调：WEAKEN → 0 + CAUSE_DMG → 120/100（搜索基线 + 只改这两项）',
  pointsConfig: STRUCTURED_REDUCTION_POINTS_CONFIG,
  settlementMode: 'scoring'
};

/** 候选 E：盘面进度终局结算（计分不变，AI 估值不变，回合上限按盘面进度判负）。 */
export const CANDIDATE_E: CandidateSpec = {
  name: 'board-progress-settlement',
  description: '盘面进度终局结算：scoring 计分不变，回合上限按盘面进度判负',
  pointsConfig: SEARCH_BASELINE_POINTS_CONFIG,
  settlementMode: 'scoring',
  isBoardSettlement: true
};

/** CLI 可选择的注册候选：候选声明 + 标准 4 使用的动态策略。 */
export interface RegisteredCandidate {
  readonly spec: CandidateSpec;
  readonly dynamicPolicies: readonly DynamicSwitchPolicy[];
}

/**
 * 已登记候选：生产基线（默认动态策略）+ ticket 05 的五个候选 A–E。
 * 候选 A（`progress-pricing`）标准 4 使用调优动态策略（dyn-v3-self7）；
 * B–E 使用默认动态策略。默认行为不被改变。
 */
export const CANDIDATE_REGISTRY: Readonly<Record<string, RegisteredCandidate>> = {
  [PRODUCTION_CANDIDATE.name]: {
    spec: PRODUCTION_CANDIDATE,
    dynamicPolicies: [DEFAULT_DYNAMIC_POLICY]
  },
  [TICKET_05_CANDIDATE.name]: {
    spec: TICKET_05_CANDIDATE,
    dynamicPolicies: [TUNED_DYNAMIC_POLICY]
  },
  [CANDIDATE_B.name]: {
    spec: CANDIDATE_B,
    dynamicPolicies: [DEFAULT_DYNAMIC_POLICY]
  },
  [CANDIDATE_C.name]: {
    spec: CANDIDATE_C,
    dynamicPolicies: [DEFAULT_DYNAMIC_POLICY]
  },
  [CANDIDATE_D.name]: {
    spec: CANDIDATE_D,
    dynamicPolicies: [DEFAULT_DYNAMIC_POLICY]
  },
  [CANDIDATE_E.name]: {
    spec: CANDIDATE_E,
    dynamicPolicies: [DEFAULT_DYNAMIC_POLICY]
  }
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

/** 单条验收标准的结论：通过 / 失败 / 无法判定（矩阵不完整）。 */
export type CriterionVerdict = 'pass' | 'fail' | 'inconclusive';

/** 标准 1：无严格占优。 */
export interface NoStrictDominanceResult {
  readonly passed: boolean;
  /**
   * 三态结论。`pass` 要求**既无严格占优者、矩阵又完全可判定**；
   * 无占优但有缺格 / 样本不足 / 与 50% 无法区分的对时为 `inconclusive`，
   * 不能读作「已确认无占优」。
   */
  readonly verdict: CriterionVerdict;
  /** 每个策略严格占优全部对手的列表；为空即无严格占优。 */
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
  const fullyDecided = analysis.undecidable.length === 0;
  const verdict: CriterionVerdict =
    strictDominators.length > 0 ? 'fail' : fullyDecided ? 'pass' : 'inconclusive';

  return {
    passed: verdict === 'pass',
    verdict,
    strictDominators,
    matrix,
    headToHead,
    verdicts: analysis.verdicts,
    undecidable: analysis.undecidable,
    fullyDecided,
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
    a.isBoardSettlement === b.isBoardSettlement &&
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
// 报告格式化与 CLI（拆出到独立模块）
// ---------------------------------------------------------------------------
// `formatCandidateValidationReport` 保留在原导入路径以稳定既有调用方；
// CLI（`parseCandidateArgs`）在 `CandidateValidationCli.ts`，避免运行期循环依赖。

export { formatCandidateValidationReport } from './CandidateValidationReport.js';

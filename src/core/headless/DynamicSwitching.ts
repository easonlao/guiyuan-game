/**
 * 归元弈 (Guiyuan) - 实验：按盘面动态切换推进/压制 (Dynamic Switching Policy)
 *
 * Ticket 10。本模块是**实验脚手架**：它检验「根据盘面在推进与压制之间动态切换」这一设计意图，
 * 用 ticket 08/09 的实测变量作为切换依据，并与 ticket 06 的静态预设做完整座次平衡对拼。
 *
 * 设计意图（项目负责人确认）：
 *   归一是推进的自然结果；不阻碍对手就会输；双方都阻碍则流局变多；
 *   期望玩法是在过程中根据盘面，在「我更快归一」与「阻碍对手并拿高分」之间切换。
 *
 * 现有六个预设全部是固定权重，用它们检验动态意图不对等；本模块补上动态一侧。
 *
 * 切换依据（来自 ticket 08/09 的实测变量）：
 *   - `countActionsToGuiYuan`（ticket 07 口径，ticket 08/09 使用）：己方/对手「还差几次行动到五行归元」。
 *   - `atkTempoGain`（ticket 08 口径）：一次【破】对对手盘面进度的边际收益，逐侧为阶跃函数
 *     `0->-1 = +1`、`1->0 = +1`、`2->1 = 0`、已道损 = 0。
 *   - 规则：默认压制；仅当 (a) 己方距归元 <= 阈值，或 (b) 本回合最佳【破】的盘面收益为 0
 *     （打加持侧或全道损无目标）时，切换到推进。理由见报告 `docs/headless/dynamic-switching-policy.md`。
 *
 * 接缝：只使用既有主接缝 `HeadlessMatch.run` / `HeadlessBenchmark.run` 与 ticket 06 的
 * `runHeadToHeadMatrix`；策略是标准 `DecisionStrategy`，不新增第三处接缝，也不新增指标定义。
 */

import { GameState, OVERCOMING_CYCLE, PlayerId, Polarity, TianGanInfo } from '../types/domain.js';
import { getMinusTargetPolarity, type RuleSwitches } from '../logic/ActionCandidates.js';
import { POINTS_CONFIG, type PointsConfig } from '../logic/ScoreCalculator.js';
import { AGGRESSIVE_WEIGHTS, RUSH_GUIYUAN_WEIGHTS } from '../ai/Strategy.js';
import type { DecisionStrategy, StrategyWeights } from '../ai/types.js';
import { HeadlessMatch } from './HeadlessMatch.js';
import { countActionsToGuiYuan } from './Metrics.js';
import { runCliIfDirect } from './cli.js';
import {
  DEFAULT_BASE_SEED,
  DEFAULT_MATCHES_PER_CELL,
  DEFAULT_MAX_ROUNDS,
  DEFAULT_RULE_MODES,
  DEFAULT_SCORE_CONFIG_VARIANTS,
  DEFAULT_STRATEGY_VARIANTS,
  buildVariantStrategy,
  isBoardSettlementFor,
  ruleSwitchesFor,
  runHeadToHeadMatrix,
  type RuleMode,
  type RunConfig,
  type ScoreConfigVariant,
  type StrategyVariant
} from './ExperimentRunner.js';

// ---------------------------------------------------------------------------
// 切换依据
// ---------------------------------------------------------------------------

/** 切换模式：推进 / 压制 */
export type SwitchMode = 'advance' | 'suppress';

/** 触发推进的原因 */
export type SwitchReason =
  | 'close-to-guiyuan'
  | 'suppression-saturated'
  | 'race-lead'
  | 'suppression-has-no-board-tempo'
  | 'suppress-default';

/** 单次决策的盘面快照（切换依据的全部输入） */
export interface SwitchCriterion {
  readonly selfActionsToGuiYuan: number;
  readonly opponentActionsToGuiYuan: number;
  /** 赛跑领先量 = 对手还差行动 - 己方还差行动（正数 = 己方更快归一） */
  readonly lead: number;
  /**
   * 本回合最佳合法【破】的盘面边际收益：
   *   `1` = 命中虚空 0 或点亮 1（+1）；`0` = 只能命中加持 2；`null` = 无合法【破】（阴天干或全道损）。
   */
  readonly bestAtkTempoGain: number | null;
}

/** 单次切换决策 */
export interface SwitchDecision {
  readonly mode: SwitchMode;
  readonly reason: SwitchReason;
  readonly criterion: SwitchCriterion;
}

/**
 * 本回合最佳合法【破】的盘面边际收益（ticket 08 口径的盘面查表）。
 *
 * - 阳天干：目标为 `OVERCOMING_CYCLE[天干]` 节点上 `getMinusTargetPolarity` 选中的侧。
 *   该侧等级为 0 或 1 时收益 +1；为 2（加持）时收益 0；全部道损时无合法目标（null）。
 * - 阴天干：无【破】动作，返回 null。
 *
 * 这里只做盘面查表，不模拟动作、不读取分数，与 `Metrics.atkTempoGain` 的口径一致。
 */
export function bestAvailableAtkTempoGain(
  state: GameState,
  tianGan: TianGanInfo
): number | null {
  if (tianGan.polarity !== Polarity.YANG) {
    return null;
  }
  const me = state.currentPlayer;
  const opponentId: PlayerId = me === 'P1' ? 'P2' : 'P1';
  const targetElement = OVERCOMING_CYCLE[tianGan.element];
  const targetNode = state.players[opponentId].board[targetElement];
  const targetPolarity = getMinusTargetPolarity(targetNode);
  if (targetPolarity === null) {
    return null;
  }
  const level = targetNode[targetPolarity];
  return level >= 0 && level <= 1 ? 1 : 0;
}

/**
 * 动态切换策略的参数。
 *
 * `advanceSelfMax` 与 `shouldAdvanceWhenNoAtkTempo` 是实验旋钮：报告用不同取值做对照，
 * 以区分「设计意图不成立」与「本实现不足」。
 */
export interface DynamicSwitchPolicy {
  readonly name: string;
  /** 己方 `actionsToGuiYuan <= advanceSelfMax` 时切换到推进；设负数表示关闭该条件 */
  readonly advanceSelfMax: number;
  /** 赛跑领先量（对手 - 己方）必须 >= 此值才允许因「快归一」推进；默认 0 */
  readonly minLeadForAdvance: number;
  /** 对手还差行动 >= 此值时切换到推进（压制饱和代理，ticket 08 封顶）；默认 Infinity 表示关闭 */
  readonly advanceWhenOpponentActionsAtLeast: number;
  /** 赛跑领先量 >= 此值时切换到推进（大幅领先）；默认 Infinity 表示关闭 */
  readonly advanceWhenLeadAtLeast: number;
  /** 本回合最佳【破】无盘面收益（0 或 null）时切换到推进 */
  readonly shouldAdvanceWhenNoAtkTempo: boolean;
  /** 本回合最佳【破】盘面收益恰为 0（只能打加持侧，ticket 08 软拐点）时切换到推进 */
  readonly shouldAdvanceWhenAtkTempoZero: boolean;
  /** 推进模式权重 */
  readonly advanceWeights: StrategyWeights;
  /** 压制模式权重 */
  readonly suppressWeights: StrategyWeights;
}

/** 计算切换决策（纯函数，可单测） */
export function decideSwitchMode(
  state: GameState,
  tianGan: TianGanInfo,
  policy: DynamicSwitchPolicy
): SwitchDecision {
  const me = state.currentPlayer;
  const opponentId: PlayerId = me === 'P1' ? 'P2' : 'P1';
  const selfActionsToGuiYuan = countActionsToGuiYuan(state.players[me].board);
  const opponentActionsToGuiYuan = countActionsToGuiYuan(state.players[opponentId].board);
  const bestAtkTempoGain = bestAvailableAtkTempoGain(state, tianGan);
  const criterion: SwitchCriterion = {
    selfActionsToGuiYuan,
    opponentActionsToGuiYuan,
    lead: opponentActionsToGuiYuan - selfActionsToGuiYuan,
    bestAtkTempoGain
  };

  if (
    selfActionsToGuiYuan <= policy.advanceSelfMax &&
    criterion.lead >= policy.minLeadForAdvance
  ) {
    return { mode: 'advance', reason: 'close-to-guiyuan', criterion };
  }
  if (criterion.opponentActionsToGuiYuan >= policy.advanceWhenOpponentActionsAtLeast) {
    return { mode: 'advance', reason: 'suppression-saturated', criterion };
  }
  if (criterion.lead >= policy.advanceWhenLeadAtLeast) {
    return { mode: 'advance', reason: 'race-lead', criterion };
  }
  if (policy.shouldAdvanceWhenNoAtkTempo && bestAtkTempoGain !== 1) {
    return { mode: 'advance', reason: 'suppression-has-no-board-tempo', criterion };
  }
  if (policy.shouldAdvanceWhenAtkTempoZero && bestAtkTempoGain === 0) {
    return { mode: 'advance', reason: 'suppression-has-no-board-tempo', criterion };
  }
  return { mode: 'suppress', reason: 'suppress-default', criterion };
}

// ---------------------------------------------------------------------------
// 切换统计（过程中的实际切换频率与依据分布）
// ---------------------------------------------------------------------------

/** 一次被记录的动态决策 */
export interface SwitchRecord extends SwitchDecision {
  readonly player: PlayerId;
}

/** 切换统计快照（可格式化、可断言） */
export interface DynamicSwitchStatsSnapshot {
  readonly matches: number;
  readonly decisions: number;
  readonly advanceDecisions: number;
  readonly suppressDecisions: number;
  readonly advanceRate: number;
  readonly switches: number;
  readonly switchesPerMatch: number;
  readonly leadHistogram: ReadonlyArray<readonly [number, number]>;
  readonly selfActionsHistogram: ReadonlyArray<readonly [number, number]>;
  readonly opponentActionsHistogram: ReadonlyArray<readonly [number, number]>;
  readonly atkTempoHistogram: ReadonlyArray<readonly [string, number]>;
  readonly reasonCounts: ReadonlyArray<readonly [SwitchReason, number]>;
}

function bump(histogram: Map<number, number>, key: number): void {
  histogram.set(key, (histogram.get(key) ?? 0) + 1);
}

function sortedEntries(histogram: Map<number, number>): ReadonlyArray<readonly [number, number]> {
  return [...histogram.entries()].sort((a, b) => a[0] - b[0]);
}

/** 动态切换策略的累计统计；策略每次决策调用 `record`。 */
export class DynamicSwitchStats {
  private matchCount = 0;
  private decisionCount = 0;
  private advanceCount = 0;
  private suppressCount = 0;
  private switchCount = 0;
  private readonly lastMode: Record<PlayerId, SwitchMode | null> = { P1: null, P2: null };
  private readonly lead = new Map<number, number>();
  private readonly selfActions = new Map<number, number>();
  private readonly opponentActions = new Map<number, number>();
  private readonly atkTempo = new Map<string, number>();
  private readonly reasons = new Map<SwitchReason, number>();

  /** 标记一局开始：重置逐玩家的上一次模式，使「切换」按局内连续决策统计。 */
  beginMatch(): void {
    this.matchCount++;
    this.lastMode.P1 = null;
    this.lastMode.P2 = null;
  }

  record(record: SwitchRecord): void {
    this.decisionCount++;
    if (record.mode === 'advance') this.advanceCount++;
    else this.suppressCount++;

    const previous = this.lastMode[record.player];
    if (previous !== null && previous !== record.mode) {
      this.switchCount++;
    }
    this.lastMode[record.player] = record.mode;

    const { criterion } = record;
    bump(this.lead, criterion.lead);
    bump(this.selfActions, criterion.selfActionsToGuiYuan);
    bump(this.opponentActions, criterion.opponentActionsToGuiYuan);
    const atkKey = criterion.bestAtkTempoGain === null ? 'none' : String(criterion.bestAtkTempoGain);
    this.atkTempo.set(atkKey, (this.atkTempo.get(atkKey) ?? 0) + 1);
    this.reasons.set(record.reason, (this.reasons.get(record.reason) ?? 0) + 1);
  }

  snapshot(): DynamicSwitchStatsSnapshot {
    return {
      matches: this.matchCount,
      decisions: this.decisionCount,
      advanceDecisions: this.advanceCount,
      suppressDecisions: this.suppressCount,
      advanceRate: this.decisionCount > 0 ? this.advanceCount / this.decisionCount : 0,
      switches: this.switchCount,
      switchesPerMatch: this.matchCount > 0 ? this.switchCount / this.matchCount : 0,
      leadHistogram: sortedEntries(this.lead),
      selfActionsHistogram: sortedEntries(this.selfActions),
      opponentActionsHistogram: sortedEntries(this.opponentActions),
      atkTempoHistogram: [...this.atkTempo.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      reasonCounts: [...this.reasons.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    };
  }
}

/** 空统计快照（未采集时使用） */
export function emptyDynamicSwitchStats(): DynamicSwitchStatsSnapshot {
  return new DynamicSwitchStats().snapshot();
}

// ---------------------------------------------------------------------------
// 动态策略工厂
// ---------------------------------------------------------------------------

/**
 * 构造动态切换策略。返回标准 `DecisionStrategy`（主接缝可直接注入）。
 * 两个子策略用同一份计分配置与规则开关构造，保证切换只改变权重、不改变估值口径。
 */
export function createDynamicSwitchingStrategy(
  policy: DynamicSwitchPolicy,
  config: PointsConfig = POINTS_CONFIG,
  rules: RuleSwitches = {},
  stats?: DynamicSwitchStats
): DecisionStrategy {
  const advanceStrategy = buildVariantStrategy(
    { name: policy.name, weights: policy.advanceWeights },
    config,
    rules
  );
  const suppressStrategy = buildVariantStrategy(
    { name: policy.name, weights: policy.suppressWeights },
    config,
    rules
  );

  return (state, tianGan, availableActions) => {
    const decision = decideSwitchMode(state, tianGan, policy);
    if (stats) {
      stats.record({ ...decision, player: state.currentPlayer });
    }
    const chosen = decision.mode === 'advance' ? advanceStrategy : suppressStrategy;
    return chosen(state, tianGan, availableActions);
  };
}

/** 把动态策略包装成 `StrategyVariant`，供 ticket 06 的对拼矩阵消费。 */
export function dynamicStrategyVariant(
  policy: DynamicSwitchPolicy,
  stats?: DynamicSwitchStats
): StrategyVariant {
  return {
    name: policy.name,
    // 名义权重仅为满足 `StrategyVariant` 形状；实际由 `create` 覆盖。
    weights: policy.suppressWeights,
    create: (config, rules) => createDynamicSwitchingStrategy(policy, config, rules, stats)
  };
}

// ---------------------------------------------------------------------------
// 预设实验策略
// ---------------------------------------------------------------------------

/**
 * 主实验策略：赛跑 + 【破】节奏 双条件。
 * 默认压制（ticket 09：盘面本身就让压制占优），仅在「己方快归一」或「本回合打不出盘面收益」时推进。
 */
export const DEFAULT_DYNAMIC_POLICY: DynamicSwitchPolicy = {
  name: '动态切换',
  advanceSelfMax: 2,
  minLeadForAdvance: 1,
  advanceWhenOpponentActionsAtLeast: Number.POSITIVE_INFINITY,
  advanceWhenLeadAtLeast: Number.POSITIVE_INFINITY,
  shouldAdvanceWhenNoAtkTempo: false,
  shouldAdvanceWhenAtkTempoZero: true,
  advanceWeights: RUSH_GUIYUAN_WEIGHTS,
  suppressWeights: AGGRESSIVE_WEIGHTS
};

/**
 * Ticket 05 调优动态策略（dyn-v3-self7）。
 *
 * 候选 A（攻击进度定价）下 `DEFAULT_DYNAMIC_POLICY` 的推进模式（归元冲刺权重）打不过平衡，
 * 属「该实现不足」而非「设计意图不成立」。把推进模式换成「激进骨架 + 建设项上调」，
 * 并放宽切换阈值（己方还差行动 <= 7 即推进）后，动态策略对全部 7 个静态预设显著全胜。
 * 只使用既有旋钮；不进入 `ALL_DYNAMIC_POLICIES`，不改动生产默认。
 */
export const TUNED_DYNAMIC_POLICY: DynamicSwitchPolicy = {
  name: '动态切换(调优v3)',
  advanceSelfMax: 7,
  minLeadForAdvance: 0,
  advanceWhenOpponentActionsAtLeast: Number.POSITIVE_INFINITY,
  advanceWhenLeadAtLeast: Number.POSITIVE_INFINITY,
  shouldAdvanceWhenNoAtkTempo: false,
  shouldAdvanceWhenAtkTempoZero: true,
  advanceWeights: {
    ...AGGRESSIVE_WEIGHTS,
    repairDamage: 100,
    lightVoid: 100,
    reachGuiYi: 100,
    guiyuanProgress: 80
  },
  suppressWeights: AGGRESSIVE_WEIGHTS
};

/** 对照策略 A：只看赛跑（己方快归一且领先才推进），忽略【破】节奏。 */
export const RACE_ONLY_POLICY: DynamicSwitchPolicy = {
  name: '动态切换(仅赛跑)',
  advanceSelfMax: 2,
  minLeadForAdvance: 1,
  advanceWhenOpponentActionsAtLeast: Number.POSITIVE_INFINITY,
  advanceWhenLeadAtLeast: Number.POSITIVE_INFINITY,
  shouldAdvanceWhenNoAtkTempo: false,
  shouldAdvanceWhenAtkTempoZero: false,
  advanceWeights: RUSH_GUIYUAN_WEIGHTS,
  suppressWeights: AGGRESSIVE_WEIGHTS
};

/** 对照策略 B：只看【破】节奏（只能打加持侧才推进），忽略赛跑领先。 */
export const TEMPO_ONLY_POLICY: DynamicSwitchPolicy = {
  name: '动态切换(仅破节奏)',
  advanceSelfMax: -1,
  minLeadForAdvance: 0,
  advanceWhenOpponentActionsAtLeast: Number.POSITIVE_INFINITY,
  advanceWhenLeadAtLeast: Number.POSITIVE_INFINITY,
  shouldAdvanceWhenNoAtkTempo: false,
  shouldAdvanceWhenAtkTempoZero: true,
  advanceWeights: RUSH_GUIYUAN_WEIGHTS,
  suppressWeights: AGGRESSIVE_WEIGHTS
};

/** 对照策略 C：两个子策略都换成极端纯推进/纯压制（关闭计分轴），检验是否切换本身不足。 */
export const PURE_EXTREMES_POLICY: DynamicSwitchPolicy = {
  name: '动态切换(纯推进/纯压制)',
  advanceSelfMax: 2,
  minLeadForAdvance: 1,
  advanceWhenOpponentActionsAtLeast: Number.POSITIVE_INFINITY,
  advanceWhenLeadAtLeast: Number.POSITIVE_INFINITY,
  shouldAdvanceWhenNoAtkTempo: false,
  shouldAdvanceWhenAtkTempoZero: true,
  advanceWeights: {
    repairDamage: 120,
    reachGuiYi: 300,
    lightVoid: 120,
    reachKangJi: 60,
    guiyuanProgress: 200,
    burstExtraTurn: 120,
    breakOpponentGuiYi: 0,
    causeDamage: 0,
    suppressNode: 0,
    scoreDeltaWeight: 0,
    winReward: 10000,
    baseActionBias: {}
  },
  suppressWeights: {
    repairDamage: 0,
    reachGuiYi: 0,
    lightVoid: 0,
    reachKangJi: 0,
    guiyuanProgress: 0,
    burstExtraTurn: 0,
    breakOpponentGuiYi: 300,
    causeDamage: 200,
    suppressNode: 100,
    scoreDeltaWeight: 0,
    winReward: 0,
    baseActionBias: {}
  }
};

/**
 * 对照策略 D：对手尚未建设（`opponentActionsToGuiYuan >= 8`）时推进，否则压制。
 * 这是扫描中表现最好的非退化切换条件，用来逼近动态策略的上限。
 */
export const OPPONENT_UNDEVELOPED_POLICY: DynamicSwitchPolicy = {
  name: '动态切换(对手未建设)',
  advanceSelfMax: -1,
  minLeadForAdvance: 0,
  advanceWhenOpponentActionsAtLeast: 8,
  advanceWhenLeadAtLeast: Number.POSITIVE_INFINITY,
  shouldAdvanceWhenNoAtkTempo: false,
  shouldAdvanceWhenAtkTempoZero: false,
  advanceWeights: RUSH_GUIYUAN_WEIGHTS,
  suppressWeights: AGGRESSIVE_WEIGHTS
};

/**
 * 对照策略 E：从不切换（退化对照）。等价于始终执行压制子策略。
 * 若动态策略无法优于它，说明切换本身没有产生正收益。
 */
export const NEVER_SWITCH_POLICY: DynamicSwitchPolicy = {
  name: '对照(从不切换)',
  advanceSelfMax: -1,
  minLeadForAdvance: 0,
  advanceWhenOpponentActionsAtLeast: Number.POSITIVE_INFINITY,
  advanceWhenLeadAtLeast: Number.POSITIVE_INFINITY,
  shouldAdvanceWhenNoAtkTempo: false,
  shouldAdvanceWhenAtkTempoZero: false,
  advanceWeights: RUSH_GUIYUAN_WEIGHTS,
  suppressWeights: AGGRESSIVE_WEIGHTS
};

export const ALL_DYNAMIC_POLICIES: readonly DynamicSwitchPolicy[] = [
  DEFAULT_DYNAMIC_POLICY,
  RACE_ONLY_POLICY,
  TEMPO_ONLY_POLICY,
  PURE_EXTREMES_POLICY,
  OPPONENT_UNDEVELOPED_POLICY,
  NEVER_SWITCH_POLICY
];

// ---------------------------------------------------------------------------
// 实验运行
// ---------------------------------------------------------------------------

/** 动态策略对单个静态预设的座次平衡对拼结果。 */
export interface DynamicMatchup {
  readonly staticStrategy: string;
  readonly dynamicWinRate: number;
  readonly staticWinRate: number;
  readonly matches: number;
  readonly drawRate: number;
  readonly p1WinRate: number;
  readonly p2WinRate: number;
  readonly guiYuanRate: number;
  readonly avgRounds: number;
  readonly opponentResidualDamage: number;
}

/** 单个动态策略的完整结果。 */
export interface DynamicPolicyReport {
  readonly policy: DynamicSwitchPolicy;
  readonly matchups: readonly DynamicMatchup[];
  readonly dynamicDominatesAll: boolean;
  readonly stats: DynamicSwitchStatsSnapshot;
}

export interface DynamicSwitchingReport {
  readonly mode: RuleMode;
  readonly scoreConfigName: string;
  readonly matchesPerSeat: number;
  readonly baseSeed: number;
  readonly maxRounds: number;
  readonly statics: readonly string[];
  readonly policies: readonly DynamicPolicyReport[];
}

export interface DynamicSwitchingExperimentOptions extends RunConfig {
  readonly policies?: readonly DynamicSwitchPolicy[];
  readonly statics?: readonly StrategyVariant[];
  readonly mode?: RuleMode;
  readonly scoreConfig?: ScoreConfigVariant;
  /** 显式规则开关覆盖；缺省时由 `mode` 推导。 */
  readonly rules?: RuleSwitches;
  /** 显式终局结算覆盖；缺省时由 `mode` 推导。 */
  readonly isBoardSettlement?: boolean;
  /** 是否运行逐决策统计采集（默认 true） */
  readonly shouldCollectStats?: boolean;
}

/**
 * 采集动态策略在真实对局中的逐决策统计。
 * 使用 `HeadlessMatch.run`（既有主接缝）逐局推演，并在每局开始重置「上一次模式」，
 * 从而把切换频率按局内连续决策统计。与对拼矩阵使用完全相同的种子序列。
 */
export function collectDynamicSwitchStats(
  policy: DynamicSwitchPolicy,
  statics: readonly StrategyVariant[],
  mode: RuleMode,
  scoreConfig: ScoreConfigVariant,
  matches: number,
  baseSeed: number,
  maxRounds: number,
  overrides: { readonly rules?: RuleSwitches; readonly isBoardSettlement?: boolean } = {}
): DynamicSwitchStatsSnapshot {
  const stats = new DynamicSwitchStats();
  const rules = overrides.rules ?? ruleSwitchesFor(mode);
  const isBoardSettlement = overrides.isBoardSettlement ?? isBoardSettlementFor(mode);
  const dynamic = createDynamicSwitchingStrategy(policy, scoreConfig.config, rules, stats);
  const match = new HeadlessMatch();

  for (const staticVariant of statics) {
    const staticStrategy = buildVariantStrategy(staticVariant, scoreConfig.config, rules);
    for (let i = 0; i < matches; i++) {
      const seed = baseSeed + i;
      stats.beginMatch();
      match.run(dynamic, staticStrategy, { seed, maxRounds, rules, isBoardSettlement });
      stats.beginMatch();
      match.run(staticStrategy, dynamic, { seed, maxRounds, rules, isBoardSettlement });
    }
  }

  return stats.snapshot();
}

/**
 * 运行「动态策略 vs 全部静态预设」的完整座次平衡对拼，并采集逐决策统计。
 * 每个动态策略 × 每个静态预设调用一次 ticket 06 的 `runHeadToHeadMatrix`（两个座次）。
 */
export function runDynamicSwitchingExperiment(
  options: DynamicSwitchingExperimentOptions = {}
): DynamicSwitchingReport {
  const policies = options.policies ?? [DEFAULT_DYNAMIC_POLICY];
  const statics = options.statics ?? DEFAULT_STRATEGY_VARIANTS;
  const mode = options.mode ?? DEFAULT_RULE_MODES[0];
  const scoreConfig = options.scoreConfig ?? DEFAULT_SCORE_CONFIG_VARIANTS[0];
  const matches = options.matches ?? DEFAULT_MATCHES_PER_CELL;
  const baseSeed = options.baseSeed ?? DEFAULT_BASE_SEED;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const shouldCollectStats = options.shouldCollectStats ?? true;
  const rules = options.rules ?? ruleSwitchesFor(mode);
  const isBoardSettlement = options.isBoardSettlement ?? isBoardSettlementFor(mode);

  const policyReports: DynamicPolicyReport[] = policies.map(policy => {
    const dynamicVariant = dynamicStrategyVariant(policy);
    const matchups: DynamicMatchup[] = statics.map(staticVariant => {
      const report = runHeadToHeadMatrix({
        strategies: [dynamicVariant, staticVariant],
        mode,
        scoreConfig,
        rules,
        isBoardSettlement,
        matches,
        baseSeed,
        maxRounds
      });
      const matchup = report.matchups.find(
        entry => entry.strategyA === policy.name && entry.strategyB === staticVariant.name
      );
      if (!matchup) {
        throw new Error(`对拼矩阵缺少 ${policy.name} vs ${staticVariant.name} 的数据`);
      }
      return {
        staticStrategy: staticVariant.name,
        dynamicWinRate: matchup.seatBalancedWinRate,
        staticWinRate: 1 - matchup.seatBalancedWinRate,
        matches: matchup.matches,
        drawRate: matchup.drawRate,
        p1WinRate: matchup.p1WinRate,
        p2WinRate: matchup.p2WinRate,
        guiYuanRate: matchup.guiYuanRate,
        avgRounds: matchup.avgRounds,
        opponentResidualDamage: matchup.opponentResidualDamage
      };
    });

    const stats = shouldCollectStats
      ? collectDynamicSwitchStats(
          policy,
          statics,
          mode,
          scoreConfig,
          matches,
          baseSeed,
          maxRounds,
          { rules, isBoardSettlement }
        )
      : emptyDynamicSwitchStats();

    return {
      policy,
      matchups,
      dynamicDominatesAll: matchups.every(entry => entry.dynamicWinRate > 0.5),
      stats
    };
  });

  return {
    mode,
    scoreConfigName: scoreConfig.name,
    matchesPerSeat: matches,
    baseSeed,
    maxRounds,
    statics: statics.map(variant => variant.name),
    policies: policyReports
  };
}

// ---------------------------------------------------------------------------
// 报告格式化
// ---------------------------------------------------------------------------

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

/** 动态策略 vs 静态预设的座次平衡胜率矩阵（行 = 动态策略，列 = 静态预设）。 */
export function formatDynamicMatrix(report: DynamicSwitchingReport): string {
  const lines: string[] = [];
  lines.push('### 座次平衡胜率矩阵 (行 = 动态策略，列 = 静态预设，单元格 = 动态策略胜率)');
  lines.push('');
  lines.push(`| 动态策略 \\ 静态预设 | ${report.statics.join(' | ')} | 全胜? |`);
  lines.push(`| --- | ${report.statics.map(() => '---:').join(' | ')} | --- |`);
  for (const policyReport of report.policies) {
    const cells = policyReport.matchups.map(matchup => percent(matchup.dynamicWinRate));
    lines.push(
      `| ${policyReport.policy.name} | ${cells.join(' | ')} | ${
        policyReport.dynamicDominatesAll ? '是' : '否'
      } |`
    );
  }
  return lines.join('\n');
}

function formatHistogram(
  entries: ReadonlyArray<readonly [number, number]>,
  total: number
): string {
  return entries
    .map(([value, count]) => `${value}: ${count} (${percent(count / total)})`)
    .join(' / ');
}

/** 主动态策略的逐决策切换频率与依据分布。 */
export function formatSwitchStats(policyReport: DynamicPolicyReport): string {
  const stats = policyReport.stats;
  const lines: string[] = [];
  lines.push('### 过程中的实际切换频率与依据分布');
  lines.push('');
  lines.push(`- 动态策略: ${policyReport.policy.name}`);
  lines.push(`- 采样对局: ${stats.matches} 局（动态 vs 全部静态预设，两座次合计）`);
  lines.push(`- 动态决策总数: ${stats.decisions}`);
  lines.push(
    `- 推进决策: ${stats.advanceDecisions} (${percent(stats.advanceRate)}) / 压制决策: ${
      stats.suppressDecisions
    } (${percent(1 - stats.advanceRate)})`
  );
  lines.push(
    `- 模式切换次数: ${stats.switches}，平均每局 ${stats.switchesPerMatch.toFixed(2)} 次`
  );
  lines.push('');
  if (stats.decisions === 0) {
    lines.push('（未采集到决策）');
    return lines.join('\n');
  }
  lines.push(
    `- 切换依据（reason）: ${stats.reasonCounts
      .map(([reason, count]) => `${reason}=${count} (${percent(count / stats.decisions)})`)
      .join(' / ')}`
  );
  lines.push(
    `- 最佳【破】盘面收益分布: ${stats.atkTempoHistogram
      .map(([value, count]) => `${value}=${count} (${percent(count / stats.decisions)})`)
      .join(' / ')}`
  );
  lines.push(
    `- 己方还差行动分布 (actionsToGuiYuan): ${formatHistogram(
      stats.selfActionsHistogram,
      stats.decisions
    )}`
  );
  lines.push(
    `- 对手还差行动分布: ${formatHistogram(stats.opponentActionsHistogram, stats.decisions)}`
  );
  lines.push(
    `- 赛跑领先量分布 (对手 - 己方): ${formatHistogram(stats.leadHistogram, stats.decisions)}`
  );
  return lines.join('\n');
}

/** 主策略的逐对明细（含流局率与先后手胜率，遵守陷阱 C 守卫）。 */
export function formatDynamicMatchupDetail(policyReport: DynamicPolicyReport): string {
  const lines: string[] = [];
  lines.push('### 逐对明细（动态 vs 静态）');
  lines.push('');
  lines.push(
    '| 静态预设 | 动态胜率 | 静态胜率 | 样本 | 归元率 | 平均大回合 | 对手残留道损 | 流局率 / 先后手胜率 |'
  );
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const matchup of policyReport.matchups) {
    const drawPaired = `流局率 ${percent(matchup.drawRate)} / 先手胜率 ${percent(
      matchup.p1WinRate
    )} / 后手胜率 ${percent(matchup.p2WinRate)}`;
    lines.push(
      `| ${matchup.staticStrategy} | ${percent(matchup.dynamicWinRate)} | ${percent(
        matchup.staticWinRate
      )} | ${matchup.matches} | ${percent(matchup.guiYuanRate)} | ${matchup.avgRounds.toFixed(
        2
      )} | ${matchup.opponentResidualDamage.toFixed(2)} | ${drawPaired} |`
    );
  }
  return lines.join('\n');
}

/** 完整 markdown 报告。 */
export function formatDynamicSwitchingReport(report: DynamicSwitchingReport): string {
  const lines: string[] = [];
  lines.push('## 动态切换策略 vs 静态预设（实验）');
  lines.push('');
  lines.push(`- 种子基数: ${report.baseSeed} (每座次连续 ${report.matchesPerSeat} 局)`);
  lines.push(`- 每座次样本量: ${report.matchesPerSeat}`);
  lines.push(`- 回合上限: ${report.maxRounds}`);
  lines.push(`- 计分配置: \`${report.scoreConfigName}\``);
  lines.push(`- 规则模式: \`${report.mode}\``);
  lines.push('- 座次平衡胜率口径: (胜场 + 0.5 × 平局) / 两座次总局数');
  lines.push('');
  lines.push(formatDynamicMatrix(report));
  lines.push('');
  const primary = report.policies[0];
  if (primary) {
    lines.push(formatDynamicMatchupDetail(primary));
    lines.push('');
    lines.push(formatSwitchStats(primary));
  }
  if (report.policies.length > 1) {
    lines.push('');
    lines.push('### 对照策略（改进方向探针）');
    lines.push('');
    lines.push('| 动态策略 | 对全部静态是否全胜 | 最低胜率 | 最高胜率 | 推进决策占比 |');
    lines.push('| --- | --- | ---: | ---: | ---: |');
    for (const policyReport of report.policies) {
      const rates = policyReport.matchups.map(entry => entry.dynamicWinRate);
      const min = Math.min(...rates);
      const max = Math.max(...rates);
      lines.push(
        `| ${policyReport.policy.name} | ${
          policyReport.dynamicDominatesAll ? '是' : '否'
        } | ${percent(min)} | ${percent(max)} | ${percent(policyReport.stats.advanceRate)} |`
      );
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP_TEXT = `归元弈 (Guiyuan) 动态切换策略实验 (Ticket 10)

用法:
  npm run benchmark:dynamic-switching -- [选项]

选项:
  --matches <N>       每座次样本量 (默认 ${DEFAULT_MATCHES_PER_CELL})
  --seed <N>          种子基数，每局使用 seed + i (默认 ${DEFAULT_BASE_SEED})
  --max-rounds <N>    回合上限 (默认 ${DEFAULT_MAX_ROUNDS})
  --mode <mode>       规则模式: scoring (默认) / board-only
                      board-only = 关闭 AI 计分读取，且回合上限按盘面进度判定胜负
  --policy <name>     只跑单个动态策略 (动态切换 / 动态切换(仅赛跑) / 动态切换(仅破节奏) / 动态切换(纯推进/纯压制))
  --no-sweep          只跑主策略（默认跑全部对照策略）
  --help, -h          显示本帮助
`;

export interface ParsedDynamicArgs {
  readonly isHelp: boolean;
  readonly matches?: number;
  readonly baseSeed?: number;
  readonly maxRounds?: number;
  readonly mode: RuleMode;
  readonly policy?: string;
  readonly sweep: boolean;
}

/** 解析 CLI 参数；未知参数或非法值抛错。 */
export function parseDynamicArgs(argv: readonly string[]): ParsedDynamicArgs {
  let isHelp = false;
  let matches: number | undefined;
  let baseSeed: number | undefined;
  let maxRounds: number | undefined;
  let mode: RuleMode = DEFAULT_RULE_MODES[0];
  let policy: string | undefined;
  let sweep = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      isHelp = true;
      continue;
    }
    if (arg === '--no-sweep') {
      sweep = false;
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
    if (arg === '--mode') {
      const value = argv[++i];
      if (value !== 'scoring' && value !== 'board-only') {
        throw new Error(`未知规则模式: ${value}`);
      }
      mode = value;
      continue;
    }
    if (arg === '--policy') {
      policy = argv[++i];
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  return { isHelp, matches, baseSeed, maxRounds, mode, policy, sweep };
}

function selectPolicies(parsed: ParsedDynamicArgs): readonly DynamicSwitchPolicy[] {
  if (parsed.policy) {
    const found = ALL_DYNAMIC_POLICIES.find(candidate => candidate.name === parsed.policy);
    if (!found) {
      throw new Error(
        `未知动态策略: ${parsed.policy}（可选: ${ALL_DYNAMIC_POLICIES.map(p => p.name).join(' / ')}）`
      );
    }
    return [found];
  }
  return parsed.sweep ? ALL_DYNAMIC_POLICIES : [DEFAULT_DYNAMIC_POLICY];
}

// 支持 CLI 命令行直接执行
runCliIfDirect(import.meta.url, () => {
  const parsed = parseDynamicArgs(process.argv.slice(2));
  if (parsed.isHelp) {
    console.log(HELP_TEXT);
  } else {
    const matches = parsed.matches ?? DEFAULT_MATCHES_PER_CELL;
    const baseSeed = parsed.baseSeed ?? DEFAULT_BASE_SEED;
    const maxRounds = parsed.maxRounds ?? DEFAULT_MAX_ROUNDS;
    const policies = selectPolicies(parsed);
    console.log(
      `🚀 运行动态切换策略实验: ${matches} 局/座次, 种子基数 ${baseSeed}, 回合上限 ${maxRounds}, 模式 ${parsed.mode}, ${policies.length} 个动态策略...`
    );
    const report = runDynamicSwitchingExperiment({
      policies,
      mode: parsed.mode,
      matches,
      baseSeed,
      maxRounds
    });
    console.log(formatDynamicSwitchingReport(report));
  }
});

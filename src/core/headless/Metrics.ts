/**
 * 归元弈 (Guiyuan) - 指标口径模块 (Metric Definitions)
 *
 * 本模块是测量台所有指标的唯一定义处 (spec Implementation Decisions #7)。
 * 每个指标都只从 HeadlessMatch.run 的返回值 MatchResult 派生：
 *   - 终局形态 / 胜负 / 回合数 / 天命揭牌：直接读 MatchResult 字段；
 *   - 盘面进度指标（未点亮侧数、归一节点数、听牌临界态、道损数）：读 finalState；
 *   - 压制度量 / 建设度量：读 MatchResult.stats（需 shouldCollectStats: true）。
 *
 * 口径陷阱见 docs/headless/metric-definitions.md 与 tests/core/metric-definitions.test.ts。
 */

import { BoardState, PlayerId } from '../types/domain.js';
import {
  countBoardDamage,
  countBoardGuiYi,
  countUnlightedSides,
  isBoardTingPai
} from '../logic/State.js';
import type { ClosureType, MatchResult } from './HeadlessMatch.js';

// ---------------------------------------------------------------------------
// 盘面进度指标
// ---------------------------------------------------------------------------

/**
 * 盘面进度指标：还差几次行动到五行归元。
 *
 * 每侧达到点亮 (>= 1) 至少需要 (1 - level) 次单侧提升行动：
 * 虚空 0 需 1 次，道损 -1 需 2 次。因此：
 *
 *   actionsToGuiYuan = 未点亮侧数 + 道损数
 *
 * 它是「最少行动数」下界：假设每次行动只把一侧提升 1 级。
 * 五行归元已完成（10 侧均 >= 1）时，未点亮侧数与道损数均为 0，恒返回 0。
 *
 * 口径陷阱：听牌临界态（未点亮侧数 == 1）若唯一未点亮侧处于道损 -1，
 * 则仍需 2 次行动，而非 1 次（见 docs/headless/metric-definitions.md）。
 */
export function countActionsToGuiYuan(board: BoardState): number {
  return countUnlightedSides(board) + countBoardDamage(board);
}

/**
 * 【破】(ATK) 的盘面边际收益口径（ticket 08）。
 *
 * 一次【破】对对手盘面的盘面价值 = 它使对手「还差几次行动到五行归元」增加的次数：
 *
 *   atkTempoGain(opponentBefore, opponentAfter)
 *     = countActionsToGuiYuan(opponentAfter) - countActionsToGuiYuan(opponentBefore)
 *
 * 逐侧取值（由 `countActionsToGuiYuan` 的逐侧口径 `max(0, 1 - level)` 直接推出）：
 *   0 -> -1（虚空打到道损）：+1
 *   1 ->  0（点亮打回虚空）：+1
 *   2 ->  1（加持削到点亮）： 0（未点亮侧数与道损数均不变，加持吸收了这次打击）
 *   -1 已道损（封顶）：      0
 *
 * 为什么它隔离盘面价值：本函数只读盘面等级，输入是两张 `BoardState`，不接触任何
 * 分数、权重、稀有度或计分配置。`ActionResolver.resolve` 对【破】只改动对手一侧等级，
 * 因此该差值恰好等于这一次盘面扰动的节奏价值；计分轴的作用由 ticket 09 单独测量。
 */
export function atkTempoGain(
  opponentBefore: BoardState,
  opponentAfter: BoardState
): number {
  return countActionsToGuiYuan(opponentAfter) - countActionsToGuiYuan(opponentBefore);
}

// ---------------------------------------------------------------------------
// 单局指标
// ---------------------------------------------------------------------------

/** 单个玩家的盘面进度度量（全部由 MatchResult.finalState 派生） */
export interface PlayerBoardMetrics {
  /** 未点亮侧数：等级 < 1 的侧数（虚空 0 与道损 -1 都算未点亮），满分 10 侧 */
  readonly unlightedSides: number;
  /** 归一节点数：阴阳两侧均 >= 1 的节点数 */
  readonly guiYiNodes: number;
  /** 听牌临界态：未点亮侧数严格等于 1 */
  readonly isTingPai: boolean;
  /** 道损数：等级为 -1 的侧数 */
  readonly residualDamage: number;
  /**
   * 盘面进度：还差几次行动到五行归元（未点亮侧数 + 道损数）。
   * 五行归元已完成时为 0。详见 `countActionsToGuiYuan` 与指标口径表。
   */
  readonly actionsToGuiYuan: number;
}

/** 单局指标快照 */
export interface MatchMetrics {
  readonly winner: PlayerId | 'DRAW' | null;
  readonly endReason: 'GUI_YUAN' | 'MAX_ROUNDS' | null;
  readonly closureType?: ClosureType;
  /** 五行归元终局 */
  readonly isGuiYuan: boolean;
  /** 回合上限结算（即流局） */
  readonly isMaxRounds: boolean;
  /** 大回合数（先手半回合 + 后手半回合闭合为 1 大回合） */
  readonly roundsPlayed: number;
  readonly showdownOccurred: boolean;
  readonly showdownSuccess: boolean;
  readonly board: Readonly<Record<PlayerId, PlayerBoardMetrics>>;
  /**
   * 压制度量：本局施加于对手盘面的等级下降量之和（2 -> 1 记 1）。
   * 需要 MatchOptions.shouldCollectStats 为 true；未采集时为 null。
   */
  readonly suppressionLevels: Readonly<Record<PlayerId, number>> | null;
  /**
   * 建设度量：本局己方盘面等级上升量之和。
   * 需要 MatchOptions.shouldCollectStats 为 true；未采集时为 null。
   */
  readonly constructionLevels: Readonly<Record<PlayerId, number>> | null;
}

/** 从单局结果派生全部单局指标（纯函数） */
export function deriveMatchMetrics(result: MatchResult): MatchMetrics {
  const finalState = result.finalState;

  const playerBoard = (id: PlayerId): PlayerBoardMetrics => {
    const board = finalState.players[id].board;
    return {
      unlightedSides: countUnlightedSides(board),
      guiYiNodes: countBoardGuiYi(board),
      isTingPai: isBoardTingPai(board),
      residualDamage: countBoardDamage(board),
      actionsToGuiYuan: countActionsToGuiYuan(board)
    };
  };

  const stats = result.stats;

  return {
    winner: result.winner,
    endReason: result.endReason,
    closureType: result.closureType,
    isGuiYuan: result.endReason === 'GUI_YUAN',
    isMaxRounds: result.endReason === 'MAX_ROUNDS',
    roundsPlayed: result.roundsPlayed,
    showdownOccurred: result.showdownOccurred ?? false,
    showdownSuccess: result.showdownSuccess ?? false,
    board: { P1: playerBoard('P1'), P2: playerBoard('P2') },
    suppressionLevels: stats
      ? { P1: stats.P1.suppressionLevels, P2: stats.P2.suppressionLevels }
      : null,
    constructionLevels: stats
      ? { P1: stats.P1.constructionLevels, P2: stats.P2.constructionLevels }
      : null
  };
}

// ---------------------------------------------------------------------------
// 批量聚合指标
// ---------------------------------------------------------------------------

/** 批量推演的聚合指标（不含耗时与内存等运行期指标） */
export interface GameMetrics {
  readonly totalMatches: number;
  readonly p1Wins: number;
  readonly p2Wins: number;
  readonly draws: number;
  readonly p1WinRate: number;
  readonly p2WinRate: number;
  /** 流局率（回合上限结算率），数值等于 maxRoundsRate */
  readonly drawRate: number;
  readonly guiYuanCount: number;
  readonly guiYuanRate: number;
  readonly maxRoundsCount: number;
  readonly maxRoundsRate: number;
  /** 平均大回合数 */
  readonly avgRounds: number;
  readonly doubleGuiYuanCount: number;
  readonly doubleGuiYuanRate: number;
  readonly suddenDeathCount: number;
  readonly suddenDeathRate: number;
  readonly catchupFailCount: number;
  readonly catchupFailRate: number;
  readonly p2DirectCount: number;
  readonly p2DirectRate: number;
  readonly showdownCount: number;
  readonly showdownRate: number;
  readonly showdownSuccessCount: number;
  readonly showdownSuccessRate: number;
  readonly showdownFailCount: number;
  readonly showdownFailRate: number;
  /** 对手残留道损：双方终局盘面残留道损的场均（自对弈对称） */
  readonly opponentResidualDamage: number;
  /** 压制度量：每局双方压制等级下降量之和的均值（2 -> 1 记 1） */
  readonly suppressionLevels: number;
  /** 建设度量：每局双方建设等级上升量之和的均值 */
  readonly constructionLevels: number;
}

export interface GameMetricsAccumulator {
  totalMatches: number;
  p1Wins: number;
  p2Wins: number;
  draws: number;
  guiYuanCount: number;
  maxRoundsCount: number;
  totalRounds: number;
  doubleGuiYuanCount: number;
  suddenDeathCount: number;
  catchupFailCount: number;
  p2DirectCount: number;
  showdownCount: number;
  showdownSuccessCount: number;
  showdownFailCount: number;
  residualDamageTotal: number;
  suppressionLevelsTotal: number;
  suppressionMatchCount: number;
  constructionLevelsTotal: number;
  constructionMatchCount: number;
}

export function createGameMetricsAccumulator(): GameMetricsAccumulator {
  return {
    totalMatches: 0,
    p1Wins: 0,
    p2Wins: 0,
    draws: 0,
    guiYuanCount: 0,
    maxRoundsCount: 0,
    totalRounds: 0,
    doubleGuiYuanCount: 0,
    suddenDeathCount: 0,
    catchupFailCount: 0,
    p2DirectCount: 0,
    showdownCount: 0,
    showdownSuccessCount: 0,
    showdownFailCount: 0,
    residualDamageTotal: 0,
    suppressionLevelsTotal: 0,
    suppressionMatchCount: 0,
    constructionLevelsTotal: 0,
    constructionMatchCount: 0
  };
}

/** 将一局的单局指标并入聚合累加器 */
export function accumulateMatchMetrics(
  acc: GameMetricsAccumulator,
  match: MatchMetrics
): void {
  acc.totalMatches++;

  if (match.winner === 'P1') acc.p1Wins++;
  else if (match.winner === 'P2') acc.p2Wins++;
  else acc.draws++;

  if (match.isGuiYuan) acc.guiYuanCount++;
  if (match.isMaxRounds) acc.maxRoundsCount++;

  acc.totalRounds += match.roundsPlayed;

  switch (match.closureType) {
    case 'DOUBLE_GUIYUAN':
      acc.doubleGuiYuanCount++;
      break;
    case 'SUDDEN_DEATH':
      acc.suddenDeathCount++;
      break;
    case 'CATCHUP_FAIL':
      acc.catchupFailCount++;
      break;
    case 'P2_DIRECT_GUIYUAN':
      acc.p2DirectCount++;
      break;
    default:
      break;
  }

  if (match.showdownOccurred) {
    acc.showdownCount++;
    if (match.showdownSuccess) acc.showdownSuccessCount++;
    else acc.showdownFailCount++;
  }

  acc.residualDamageTotal +=
    (match.board.P1.residualDamage + match.board.P2.residualDamage) / 2;

  if (match.suppressionLevels) {
    acc.suppressionLevelsTotal +=
      (match.suppressionLevels.P1 + match.suppressionLevels.P2) / 2;
    acc.suppressionMatchCount++;
  }
  if (match.constructionLevels) {
    acc.constructionLevelsTotal +=
      (match.constructionLevels.P1 + match.constructionLevels.P2) / 2;
    acc.constructionMatchCount++;
  }
}

/** 由累加器结算聚合指标 */
export function finalizeGameMetrics(acc: GameMetricsAccumulator): GameMetrics {
  const safe = (value: number): number => (acc.totalMatches > 0 ? value / acc.totalMatches : 0);
  const meanOfCollected = (total: number, count: number): number =>
    count > 0 ? total / count : 0;

  return {
    totalMatches: acc.totalMatches,
    p1Wins: acc.p1Wins,
    p2Wins: acc.p2Wins,
    draws: acc.draws,
    p1WinRate: safe(acc.p1Wins),
    p2WinRate: safe(acc.p2Wins),
    drawRate: safe(acc.maxRoundsCount),
    guiYuanCount: acc.guiYuanCount,
    guiYuanRate: safe(acc.guiYuanCount),
    maxRoundsCount: acc.maxRoundsCount,
    maxRoundsRate: safe(acc.maxRoundsCount),
    avgRounds: safe(acc.totalRounds),
    doubleGuiYuanCount: acc.doubleGuiYuanCount,
    doubleGuiYuanRate: safe(acc.doubleGuiYuanCount),
    suddenDeathCount: acc.suddenDeathCount,
    suddenDeathRate: safe(acc.suddenDeathCount),
    catchupFailCount: acc.catchupFailCount,
    catchupFailRate: safe(acc.catchupFailCount),
    p2DirectCount: acc.p2DirectCount,
    p2DirectRate: safe(acc.p2DirectCount),
    showdownCount: acc.showdownCount,
    showdownRate: safe(acc.showdownCount),
    showdownSuccessCount: acc.showdownSuccessCount,
    showdownSuccessRate: safe(acc.showdownSuccessCount),
    showdownFailCount: acc.showdownFailCount,
    showdownFailRate: safe(acc.showdownFailCount),
    opponentResidualDamage: safe(acc.residualDamageTotal),
    suppressionLevels: meanOfCollected(acc.suppressionLevelsTotal, acc.suppressionMatchCount),
    constructionLevels: meanOfCollected(acc.constructionLevelsTotal, acc.constructionMatchCount)
  };
}

/** 便捷入口：对一组单局指标做聚合 */
export function aggregateMatchMetrics(matches: readonly MatchMetrics[]): GameMetrics {
  const acc = createGameMetricsAccumulator();
  for (const match of matches) {
    accumulateMatchMetrics(acc, match);
  }
  return finalizeGameMetrics(acc);
}

// ---------------------------------------------------------------------------
// 陷阱 B 守卫：占优结论必须附带跨策略对拼矩阵
// ---------------------------------------------------------------------------

/** 对拼矩阵中的一个有序对（p1Strategy 对 p2Strategy） */
export interface HeadToHeadCell {
  readonly p1Strategy: string;
  readonly p2Strategy: string;
  readonly matches: number;
  /** 座次平衡胜率：p1Strategy 对 p2Strategy 的胜率（同一对打两个座次取平均） */
  readonly seatBalancedWinRate: number;
}

/** 跨策略对拼矩阵；覆盖全部有序策略对并做座次平衡 */
export interface HeadToHeadMatrix {
  readonly strategies: readonly string[];
  readonly cells: readonly HeadToHeadCell[];
}

/** 占优结论：strategy 对 dominates 中的每个策略都占优 */
export interface DominanceVerdict {
  readonly strategy: string;
  readonly dominates: readonly string[];
}

/**
 * 守卫：任何「占优 / 严格占优」结论都必须由跨策略对拼矩阵支撑。
 * 自对弈归元率不能回答「某策略是否占优」——缺少矩阵时必须拒绝输出结论。
 */
export function assertDominanceVerdictHasMatrix(
  verdict: DominanceVerdict,
  matrix?: HeadToHeadMatrix
): void {
  if (!matrix || matrix.cells.length === 0) {
    throw new Error('占优结论必须附带跨策略对拼矩阵：缺少矩阵数据');
  }

  for (const opponent of verdict.dominates) {
    const hasCell = matrix.cells.some(
      cell =>
        (cell.p1Strategy === verdict.strategy && cell.p2Strategy === opponent) ||
        (cell.p1Strategy === opponent && cell.p2Strategy === verdict.strategy)
    );
    if (!hasCell) {
      throw new Error(
        `占优结论缺少对拼数据：${verdict.strategy} vs ${opponent}`
      );
    }
  }
}

/** 格式化占优结论；缺少对拼矩阵时抛错（守卫的前置条件） */
export function formatDominanceVerdict(
  verdict: DominanceVerdict,
  matrix?: HeadToHeadMatrix
): string {
  assertDominanceVerdictHasMatrix(verdict, matrix);
  const list = verdict.dominates.join('、');
  return `${verdict.strategy} 对 ${list} 占优（已由跨策略对拼矩阵支撑）`;
}

// ---------------------------------------------------------------------------
// 陷阱 C 守卫：流局率必须与先后手胜率成对输出
// ---------------------------------------------------------------------------

/** 流局率输出所需的成对字段 */
export interface DrawRateWithWinRates {
  /** 流局率（回合上限结算率） */
  readonly drawRate: number;
  readonly p1WinRate?: number;
  readonly p2WinRate?: number;
}

/**
 * 守卫：单独输出流局率是禁止的——必须同时给出先后手胜率。
 * 压制型策略会同时表现为高流局率与偏离 50% 的先手胜率，两者是同一现象的两面。
 */
export function assertDrawRatePaired(input: DrawRateWithWinRates): void {
  if (input.p1WinRate === undefined || input.p2WinRate === undefined) {
    throw new Error('流局率必须与先后手胜率成对输出：缺少先手胜率或后手胜率');
  }
}

/** 格式化流局率 + 先后手胜率；缺少任一胜率时抛错 */
export function formatDrawRateWithWinRates(input: DrawRateWithWinRates): string {
  assertDrawRatePaired(input);
  const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;
  return `流局率 ${pct(input.drawRate)} / 先手胜率 ${pct(input.p1WinRate as number)} / 后手胜率 ${pct(input.p2WinRate as number)}`;
}

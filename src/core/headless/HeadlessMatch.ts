/**
 * 归元弈 (Guiyuan) - 无头推演模拟器 (HeadlessMatch)
 * 脱离任何 UI 引擎，纯在 Node.js 中执行批量对弈与平衡性/性能验证
 */

import { ActionType, ActionPayload, ActionResult, BoardState, GameState, PlayerId, Polarity, TianGanInfo, WuXing } from '../types/domain.js';
import { GameRecord, ActionRecord } from '../types/record.js';
import {
  createInitialGameState,
  canTianGanLightUnlightedSide,
  getUnlightedSide,
  clampNodeLevel,
  measureBoardDiff,
  isNodeGuiYi,
  countBoardDamage
} from '../logic/State.js';
import { ActionResolver } from '../logic/ActionResolver.js';
import { ScoreCalculator, PointsConfig } from '../logic/ScoreCalculator.js';
import { getAvailableActions } from '../logic/ActionCandidates.js';
import { createPRNG, drawTianGan, PRNG } from '../utils/prng.js';
import type { DecisionStrategy } from '../ai/types.js';

export type { DecisionStrategy };

/**
 * 实例级注入配置：可在构造时替换解析器或计分器。
 * 两者均不传时退化为 new ActionResolver()，与历史行为逐字节一致。
 */
export interface HeadlessMatchConfig {
  /** 直接注入解析器；与 scoreCalculator 同时提供时优先使用 resolver */
  readonly resolver?: ActionResolver;
  /** 注入计分器；用于按指定 PointsConfig 结算 */
  readonly scoreCalculator?: ScoreCalculator;
}

export interface MatchOptions {
  readonly seed?: number;
  readonly maxRounds?: number;
  readonly recordActions?: boolean;
  /** 变体 B：对称低位改道开关，默认关闭 */
  readonly lowStateRedirect?: boolean;
  /** 单局级计分配置覆盖；提供时优先于构造函数注入的解析器 */
  readonly scoreConfig?: PointsConfig;
  /** 是否累计单局聚合统计（建设/压制/分数构成）。默认关闭以保持默认路径逐字节不变 */
  readonly collectStats?: boolean;
}

export type ClosureType =
  | 'DOUBLE_GUIYUAN'
  | 'SUDDEN_DEATH'
  | 'CATCHUP_FAIL'
  | 'P2_DIRECT_GUIYUAN'
  | 'MAX_ROUNDS';

/**
 * 单局分数构成分解。四项之和等于该玩家的最终得分。
 * damagePenalty 为负值（终局道损惩罚的扣分贡献）。
 */
export interface ScoreComposition {
  /** 建设分：己方等级提升的转换分 + 非攻击动作行为分 */
  readonly constructionPoints: number;
  /** 压制分：对手等级下降的转换分 + 攻击动作行为分 */
  readonly suppressionPoints: number;
  /** 里程碑分：单节点归一里程碑奖励 */
  readonly milestonePoints: number;
  /** 终局残留道损惩罚（负值） */
  readonly damagePenalty: number;
}

/** 单个玩家在对局中的聚合统计 */
export interface PlayerMatchStats {
  /** 己方盘面等级上升量之和（建设） */
  readonly constructionLevels: number;
  /** 对手盘面等级下降量之和（压制，2 -> 1 记 1） */
  readonly suppressionLevels: number;
  readonly scoreComposition: ScoreComposition;
}

/** 单局聚合统计；仅在 MatchOptions.collectStats 为 true 时返回 */
export interface MatchStats {
  readonly P1: PlayerMatchStats;
  readonly P2: PlayerMatchStats;
  /** 终局时各玩家己方盘面的残留道损 */
  readonly residualDamage: Readonly<Record<PlayerId, number>>;
}

export interface MatchResult {
  readonly winner: PlayerId | 'DRAW' | null;
  readonly endReason: 'GUI_YUAN' | 'MAX_ROUNDS' | null;
  readonly closureType?: ClosureType;
  readonly showdownOccurred?: boolean;
  readonly showdownSuccess?: boolean;
  readonly roundsPlayed: number;
  readonly finalP1Score: number;
  readonly finalP2Score: number;
  readonly finalState: GameState;
  readonly record: GameRecord;
  /** 可选聚合统计（Ticket 03）；默认关闭时为 undefined，不影响既有调用方 */
  readonly stats?: MatchStats;
}

/** 内部可变累加器 */
interface MutablePlayerStats {
  constructionLevels: number;
  suppressionLevels: number;
  constructionPoints: number;
  suppressionPoints: number;
  milestonePoints: number;
  damagePenalty: number;
}

function createEmptyMutablePlayerStats(): MutablePlayerStats {
  return {
    constructionLevels: 0,
    suppressionLevels: 0,
    constructionPoints: 0,
    suppressionPoints: 0,
    milestonePoints: 0,
    damagePenalty: 0
  };
}

/**
 * 用计分器口径度量两张盘面之间的状态变化分。
 * isAttack=false 统计己方建设提升；isAttack=true 统计对敌压制破坏。
 */
function calculateBoardTransitionPoints(
  prevBoard: BoardState,
  nextBoard: BoardState,
  calculator: ScoreCalculator,
  isAttack: boolean
): number {
  let total = 0;
  for (const element of Object.values(WuXing)) {
    const prevNode = prevBoard[element];
    const nextNode = nextBoard[element];
    total += calculator.calculateTransitionPoints(prevNode.yin, nextNode.yin, Polarity.YIN, isAttack);
    total += calculator.calculateTransitionPoints(prevNode.yang, nextNode.yang, Polarity.YANG, isAttack);
  }
  return total;
}

/**
 * 单步动作统计累加：从 result.scoreDelta 中拆解出建设分、压制分、里程碑分。
 * 行为分 = scoreDelta - 己方转换分 - 对手转换分 - 里程碑分，无需改动 ActionResolver。
 */
function accumulateActionStats(
  acc: Readonly<Record<PlayerId, MutablePlayerStats>>,
  prevState: GameState,
  action: ActionPayload,
  result: ActionResult,
  calculator: ScoreCalculator
): void {
  const activeId = prevState.currentPlayer;
  const opponentId: PlayerId = activeId === 'P1' ? 'P2' : 'P1';

  const prevActiveBoard = prevState.players[activeId].board;
  const nextActiveBoard = result.nextState.players[activeId].board;
  const prevOpponentBoard = prevState.players[opponentId].board;
  const nextOpponentBoard = result.nextState.players[opponentId].board;

  const ownDiff = measureBoardDiff(prevActiveBoard, nextActiveBoard);
  const opponentDiff = measureBoardDiff(prevOpponentBoard, nextOpponentBoard);

  const ownTransition = calculateBoardTransitionPoints(prevActiveBoard, nextActiveBoard, calculator, false);
  const opponentTransition = calculateBoardTransitionPoints(prevOpponentBoard, nextOpponentBoard, calculator, true);

  let guiYiDelta = 0;
  for (const element of Object.values(WuXing)) {
    if (!isNodeGuiYi(prevActiveBoard[element]) && isNodeGuiYi(nextActiveBoard[element])) {
      guiYiDelta++;
    }
  }
  const milestonePoints = calculator.calculateGuiYiMilestonePoints(guiYiDelta);

  const actionPoints = result.scoreDelta - ownTransition - opponentTransition - milestonePoints;
  const isAttackAction =
    action.actionType === ActionType.ATK || action.actionType === ActionType.BURST_ATK;
  const attackActionPoints = isAttackAction ? actionPoints : 0;
  const nonAttackActionPoints = actionPoints - attackActionPoints;

  const playerAcc = acc[activeId];
  playerAcc.constructionLevels += ownDiff.constructionLevels;
  playerAcc.suppressionLevels += opponentDiff.suppressionLevels;
  playerAcc.constructionPoints += ownTransition + nonAttackActionPoints;
  playerAcc.suppressionPoints += opponentTransition + attackActionPoints;
  playerAcc.milestonePoints += milestonePoints;
}

function finalizePlayerStats(acc: MutablePlayerStats): PlayerMatchStats {
  return {
    constructionLevels: acc.constructionLevels,
    suppressionLevels: acc.suppressionLevels,
    scoreComposition: {
      constructionPoints: acc.constructionPoints,
      suppressionPoints: acc.suppressionPoints,
      milestonePoints: acc.milestonePoints,
      damagePenalty: acc.damagePenalty
    }
  };
}

/** 随机天干生成器 (兼容旧调用或使用显式 PRNG) */
export function getRandomTianGan(prng?: PRNG): TianGanInfo {
  if (prng) {
    return drawTianGan(prng);
  }
  const defaultPrng = createPRNG();
  return drawTianGan(defaultPrng);
}

/** 极简基础策略：优先吸纳 AUTO */
export const defaultBaselineStrategy: DecisionStrategy = (state, tianGan) => {
  return {
    actionType: ActionType.AUTO,
    player: state.currentPlayer,
    element: tianGan.element,
    polarity: tianGan.polarity
  };
};

export class HeadlessMatch {
  /**
   * 计分注入设计（Ticket 01）：构造函数提供实例级注入（resolver / scoreCalculator），
   * MatchOptions.scoreConfig 提供单局级覆盖。
   * 之所以同时保留两条路径：批量推演可一次注入、复用同一解析器；
   * 单局推演则可在不重建实例的情况下临时换一套计分。
   * 默认不传时两者均退化为 new ActionResolver()，保证默认路径逐字节不变。
   */
  private readonly resolver: ActionResolver;
  private readonly scoreCalculator: ScoreCalculator;

  constructor(config: HeadlessMatchConfig = {}) {
    this.scoreCalculator = config.scoreCalculator ?? new ScoreCalculator();
    this.resolver = config.resolver ?? new ActionResolver(this.scoreCalculator);
  }

  run(
    strategyP1: DecisionStrategy = defaultBaselineStrategy,
    strategyP2: DecisionStrategy = defaultBaselineStrategy,
    optionsOrMaxRounds: number | MatchOptions = 30
  ): MatchResult {
    const options: MatchOptions =
      typeof optionsOrMaxRounds === 'number'
        ? { maxRounds: optionsOrMaxRounds }
        : optionsOrMaxRounds;

    const maxRounds = options.maxRounds ?? 30;
    const seed = options.seed ?? 123456789;
    const lowStateRedirect = options.lowStateRedirect ?? false;
    const collectStats = options.collectStats ?? false;
    const prng = createPRNG(seed);

    // 单局级计分配置优先：临时构造解析器，不影响实例级注入与默认行为
    const resolver = options.scoreConfig
      ? new ActionResolver(new ScoreCalculator(options.scoreConfig))
      : this.resolver;
    const statsCalculator = options.scoreConfig
      ? new ScoreCalculator(options.scoreConfig)
      : this.scoreCalculator;

    let state = createInitialGameState(maxRounds);
    const recordActions = options.recordActions ?? true;
    const actionRecords: ActionRecord[] = [];
    const statsAcc: Record<PlayerId, MutablePlayerStats> | null = collectStats
      ? { P1: createEmptyMutablePlayerStats(), P2: createEmptyMutablePlayerStats() }
      : null;
    let isExtraTurn = false;
    let isShowdown = false;
    let showdownSuccess = false;

    while (!state.isGameOver && state.round <= maxRounds) {
      // 终轮天命揭牌决胜阶段判定：先手 P1 已锁定五行归元且当前轮到后手 P2 (听牌临界态)
      if (state.lockedGuiYuan?.P1 && state.currentPlayer === 'P2') {
        const tianGan = drawTianGan(prng);
        const p2Board = state.players.P2.board;
        const success = canTianGanLightUnlightedSide(p2Board, tianGan);

        let nextP2Board = p2Board;
        let nextLockedGuiYuan = {
          P1: true,
          P2: false
        };
        let winner: PlayerId = 'P1';

        if (success) {
          winner = 'P2';
          nextLockedGuiYuan = {
            P1: true,
            P2: true
          };
          const unlighted = getUnlightedSide(p2Board);
          if (unlighted) {
            nextP2Board = {
              ...p2Board,
              [unlighted.element]: {
                ...p2Board[unlighted.element],
                [unlighted.polarity]: clampNodeLevel(p2Board[unlighted.element][unlighted.polarity] + 1)
              }
            };
          }
        } else {
          winner = 'P1';
        }

        // 天命揭牌使 P2 盘面点亮一侧属建设行为，纳入统计（该路径无计分）
        if (statsAcc) {
          statsAcc.P2.constructionLevels += measureBoardDiff(p2Board, nextP2Board).constructionLevels;
        }

        state = {
          ...state,
          currentTianGan: tianGan,
          isGameOver: true,
          winner,
          endReason: 'GUI_YUAN',
          lockedGuiYuan: nextLockedGuiYuan,
          players: {
            ...state.players,
            P2: {
              ...state.players.P2,
              board: nextP2Board
            }
          }
        };

        isShowdown = true;
        showdownSuccess = success;
        break;
      }

      const tianGan = drawTianGan(prng);
      const candidates = getAvailableActions(state, tianGan, { isExtraTurn, lowStateRedirect });
      const currentStrategy = state.currentPlayer === 'P1' ? strategyP1 : strategyP2;
      let action = currentStrategy(state, tianGan, candidates);

      // 连动锁防线：额外回合中禁止二次爆发，若策略违规返回爆发动作则降级为首个合法动作
      if (
        isExtraTurn &&
        (action.actionType === ActionType.BURST || action.actionType === ActionType.BURST_ATK)
      ) {
        action = candidates[0] ?? {
          actionType: ActionType.AUTO,
          player: state.currentPlayer,
          element: tianGan.element,
          polarity: tianGan.polarity
        };
      }

      if (recordActions) {
        actionRecords.push({
          round: state.round,
          player: state.currentPlayer,
          action
        });
      }

      const result = resolver.resolve(
        { ...state, currentTianGan: tianGan },
        action
      );

      if (statsAcc) {
        accumulateActionStats(statsAcc, state, action, result, statsCalculator);
      }

      // 处理连动状态追踪
      if (result.extraTurn && !isExtraTurn) {
        isExtraTurn = true;
      } else {
        isExtraTurn = false;
      }

      state = result.nextState;
    }

    let closureType: ClosureType | undefined;
    if (state.endReason === 'MAX_ROUNDS') {
      closureType = 'MAX_ROUNDS';
    } else if (state.endReason === 'GUI_YUAN') {
      const p1Gui = state.lockedGuiYuan?.P1 ?? false;
      const p2Gui = state.lockedGuiYuan?.P2 ?? false;
      if (p1Gui && p2Gui) {
        closureType = 'DOUBLE_GUIYUAN';
      } else if (!p1Gui && p2Gui) {
        closureType = 'P2_DIRECT_GUIYUAN';
      } else if (p1Gui && !p2Gui) {
        closureType = isShowdown ? 'CATCHUP_FAIL' : 'SUDDEN_DEATH';
      }
    }

    const record: GameRecord = {
      seed,
      maxRounds,
      actions: actionRecords
    };

    let stats: MatchStats | undefined;
    if (statsAcc) {
      if (state.endReason === 'MAX_ROUNDS') {
        // 终局道损惩罚：在结算时对双方分别扣分，此处单独归因（负值）
        const penaltyPerDamage = statsCalculator.damagePenalty;
        for (const id of ['P1', 'P2'] as const) {
          const damage = countBoardDamage(state.players[id].board);
          statsAcc[id].damagePenalty -= damage * penaltyPerDamage;
        }
      }
      stats = {
        P1: finalizePlayerStats(statsAcc.P1),
        P2: finalizePlayerStats(statsAcc.P2),
        residualDamage: {
          P1: countBoardDamage(state.players.P1.board),
          P2: countBoardDamage(state.players.P2.board)
        }
      };
    }

    return {
      winner: state.winner,
      endReason: state.endReason,
      closureType,
      showdownOccurred: isShowdown,
      showdownSuccess: isShowdown ? showdownSuccess : undefined,
      roundsPlayed: state.round,
      finalP1Score: state.players.P1.score,
      finalP2Score: state.players.P2.score,
      finalState: state,
      record,
      ...(stats ? { stats } : {})
    };
  }
}

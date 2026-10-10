/**
 * 归元弈 (Guiyuan) - 无头推演模拟器 (HeadlessMatch)
 * 脱离任何 UI 引擎，纯在 Node.js 中执行批量对弈与平衡性/性能验证
 */

import { ActionType, GameState, PlayerId, TianGanInfo } from '../types/domain.js';
import { GameRecord, ActionRecord } from '../types/record.js';
import {
  createInitialGameState,
  canTianGanLightUnlightedSide,
  getUnlightedSide,
  clampNodeLevel,
  measureBoardDiff,
  countBoardDamage,
  countBoardGuiYi,
  countUnlightedSides
} from '../logic/State.js';
import { ActionResolver } from '../logic/ActionResolver.js';
import { ScoreCalculator, PointsConfig, POINTS_CONFIG } from '../logic/ScoreCalculator.js';
import { getAvailableActions, RuleSwitches } from '../logic/ActionCandidates.js';
import { createScoreBoundStrategy } from '../ai/Strategy.js';
import { createPRNG, drawTianGan, PRNG } from '../utils/prng.js';
import type { DecisionStrategy, StrategyWeights } from '../ai/types.js';

export type { DecisionStrategy };

/**
 * 策略规格 (Ticket 01 / 04)：无头入口既接受已构造的 `DecisionStrategy`，
 * 也接受 `StrategyWeights` 权重模板。
 *
 * 权重模板由无头入口用同一份注入的 `scoreConfig` / `rules` 构造 score-bound 策略，
 * 使一份配置**同时**到达 AI 动作估值器与动作解析器（spec Problem §3.2、
 * Solution 第 1 条、Implementation Decision 4）。已构造的函数按自身估值器运行，
 * 显式优先，不被入口配置改写。
 */
export type StrategySpec = DecisionStrategy | StrategyWeights;

/** 把策略规格解析为可执行的 DecisionStrategy；权重模板绑定注入的配置与规则。 */
export function resolveStrategy(
  spec: StrategySpec,
  config: PointsConfig,
  rules: RuleSwitches
): DecisionStrategy {
  return typeof spec === 'function' ? spec : createScoreBoundStrategy(spec, config, rules);
}

/**
 * board-only 终局结算：回合上限时按**盘面进度**判定胜负，不读取任何计分。
 *
 * 依次比较（ticket 07 的盘面口径，不引入新指标）：
 *   1. `actionsToGuiYuan`（未点亮侧数 + 道损数）少者胜；
 *   2. 若相同，`guiYiNodes`（阴阳均 >= 1 的节点数）多者胜；
 *   3. 若仍相同，盘面无法区分，判 `DRAW`。
 *
 * 第 3 级用 DRAW 而不是「平局后手胜」：若沿用后手胜，在盘面完全对称的对局中
 * 胜负会被平局规则而非盘面价值决定（实测部分对局平局率高达 ~87%），结论会失真。
 *
 * 仅在 `MatchOptions.isBoardSettlement` 为 true 时使用（ticket 09 board-only 实验模式），
 * 默认路径不触发，生产规则不变。
 */
function settleMaxRoundsByBoard(state: GameState): PlayerId | 'DRAW' {
  const progress = (id: PlayerId): number =>
    countUnlightedSides(state.players[id].board) + countBoardDamage(state.players[id].board);
  const p1 = progress('P1');
  const p2 = progress('P2');
  if (p1 !== p2) {
    return p1 < p2 ? 'P1' : 'P2';
  }
  const guiYi = (id: PlayerId): number => countBoardGuiYi(state.players[id].board);
  const g1 = guiYi('P1');
  const g2 = guiYi('P2');
  if (g1 !== g2) {
    return g1 > g2 ? 'P1' : 'P2';
  }
  return 'DRAW';
}

/**
 * 实例级注入配置：可在构造时替换解析器或计分器。
 * 两者均不传时退化为 new ActionResolver()，与历史行为逐字节一致。
 */
export interface HeadlessMatchConfig {
  /** 直接注入解析器；与 scoreCalculator 同时提供时优先使用 resolver */
  readonly resolver?: ActionResolver;
  /** 注入计分器；用于按指定 PointsConfig 结算 */
  readonly scoreCalculator?: ScoreCalculator;
  /** AI 估值路径使用的计分配置；不传时取 scoreCalculator.config，再退回 POINTS_CONFIG */
  readonly scoreConfig?: PointsConfig;
  /** 实例级规则开关；被 MatchOptions.rules 覆盖，默认恒等 */
  readonly rules?: RuleSwitches;
}

export interface MatchOptions {
  readonly seed?: number;
  readonly maxRounds?: number;
  readonly recordActions?: boolean;
  /** 单局级计分配置覆盖；同时到达解析器与（权重模板策略的）AI 估值器 */
  readonly scoreConfig?: PointsConfig;
  /** 单局级规则开关覆盖；同时到达候选生成与（权重模板策略的）AI 估值器 */
  readonly rules?: RuleSwitches;
  /** 是否累计单局聚合统计（建设/压制/残留道损）。默认关闭以保持默认路径逐字节不变 */
  readonly shouldCollectStats?: boolean;
  /**
   * board-only 终局结算：回合上限时按盘面进度判定胜负，不读取计分。
   * 仅在 board-only 实验模式使用；默认 false，生产规则不变。
   */
  readonly isBoardSettlement?: boolean;
}

export type ClosureType =
  | 'DOUBLE_GUIYUAN'
  | 'SUDDEN_DEATH'
  | 'CATCHUP_FAIL'
  | 'P2_DIRECT_GUIYUAN'
  | 'MAX_ROUNDS';

/** 单个玩家在对局中的聚合统计 */
export interface PlayerMatchStats {
  /** 己方盘面等级上升量之和（建设） */
  readonly constructionLevels: number;
  /** 对手盘面等级下降量之和（压制，2 -> 1 记 1） */
  readonly suppressionLevels: number;
}

/** 单局聚合统计；仅在 MatchOptions.shouldCollectStats 为 true 时返回 */
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
  /** 可选聚合统计；默认关闭时为 undefined，不影响既有调用方 */
  readonly stats?: MatchStats;
}

/** 内部可变累加器 */
interface MutablePlayerMatchStats {
  constructionLevels: number;
  suppressionLevels: number;
}

interface MutableMatchStatsAccumulator {
  readonly players: Record<PlayerId, MutablePlayerMatchStats>;
}

function createEmptyMatchStatsAccumulator(): MutableMatchStatsAccumulator {
  return {
    players: {
      P1: { constructionLevels: 0, suppressionLevels: 0 },
      P2: { constructionLevels: 0, suppressionLevels: 0 }
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
   * 默认不传时退化为 new ActionResolver()，保证默认路径逐字节不变。
   */
  private readonly resolver: ActionResolver;
  private readonly rules: RuleSwitches;
  private readonly scoreConfig: PointsConfig;

  constructor(config: HeadlessMatchConfig = {}) {
    this.resolver =
      config.resolver ??
      (config.scoreCalculator ? new ActionResolver(config.scoreCalculator) : new ActionResolver());
    this.rules = config.rules ?? {};
    this.scoreConfig = config.scoreConfig ?? config.scoreCalculator?.config ?? POINTS_CONFIG;
  }

  run(
    strategyP1: StrategySpec = defaultBaselineStrategy,
    strategyP2: StrategySpec = defaultBaselineStrategy,
    optionsOrMaxRounds: number | MatchOptions = 30
  ): MatchResult {
    const options: MatchOptions =
      typeof optionsOrMaxRounds === 'number'
        ? { maxRounds: optionsOrMaxRounds }
        : optionsOrMaxRounds;

    const maxRounds = options.maxRounds ?? 30;
    const seed = options.seed ?? 123456789;
    const shouldCollectStats = options.shouldCollectStats ?? false;
    const isBoardSettlement = options.isBoardSettlement ?? false;
    const prng = createPRNG(seed);

    // 单局级计分配置优先：临时构造解析器，不影响实例级注入与默认行为
    const resolver = options.scoreConfig
      ? new ActionResolver(new ScoreCalculator(options.scoreConfig))
      : this.resolver;
    const rules = options.rules ?? this.rules;
    // 同一份有效配置同时绑定解析器与 AI 估值器（权重模板策略）
    const effectiveScoreConfig = options.scoreConfig ?? this.scoreConfig;
    const resolvedP1 = resolveStrategy(strategyP1, effectiveScoreConfig, rules);
    const resolvedP2 = resolveStrategy(strategyP2, effectiveScoreConfig, rules);

    let state = createInitialGameState(maxRounds);
    const recordActions = options.recordActions ?? true;
    const actionRecords: ActionRecord[] = [];
    const statsAcc = shouldCollectStats ? createEmptyMatchStatsAccumulator() : null;
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

        // 天命揭牌使 P2 盘面点亮一侧属建设行为，纳入统计
        if (statsAcc) {
          statsAcc.players.P2.constructionLevels += measureBoardDiff(p2Board, nextP2Board).constructionLevels;
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
      const candidates = getAvailableActions(state, tianGan, { isExtraTurn, rules });
      const currentStrategy = state.currentPlayer === 'P1' ? resolvedP1 : resolvedP2;
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
        const activeId = state.currentPlayer;
        const opponentId: PlayerId = activeId === 'P1' ? 'P2' : 'P1';
        const ownDiff = measureBoardDiff(
          state.players[activeId].board,
          result.nextState.players[activeId].board
        );
        const opponentDiff = measureBoardDiff(
          state.players[opponentId].board,
          result.nextState.players[opponentId].board
        );
        statsAcc.players[activeId].constructionLevels += ownDiff.constructionLevels;
        statsAcc.players[activeId].suppressionLevels += opponentDiff.suppressionLevels;
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
    if (isBoardSettlement && state.endReason === 'MAX_ROUNDS') {
      // board-only 实验模式：终局胜负只按盘面进度判定，不读取计分
      state = { ...state, winner: settleMaxRoundsByBoard(state) };
    }
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
      stats = {
        P1: {
          constructionLevels: statsAcc.players.P1.constructionLevels,
          suppressionLevels: statsAcc.players.P1.suppressionLevels
        },
        P2: {
          constructionLevels: statsAcc.players.P2.constructionLevels,
          suppressionLevels: statsAcc.players.P2.suppressionLevels
        },
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

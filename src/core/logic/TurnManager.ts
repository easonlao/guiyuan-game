/**
 * 归元弈 (Guiyuan) - 回合生命周期引擎 (TurnManager)
 * 状态机与调度器：驱动抽天干、合法性动作校验、连动限制与终局胜负判定
 * 纯 TypeScript 核心逻辑，零外部运行时依赖，遵循不可变与确定性架构
 */

import {
  ActionPayload,
  ActionResult,
  ActionType,
  GameState,
  PlayerId,
  TianGanInfo
} from '../types/domain.js';
import {
  createInitialGameState,
  canTianGanLightUnlightedSide,
  getUnlightedSide,
  clampNodeLevel
} from './State.js';
import { ActionResolver } from './ActionResolver.js';
import { EventBus } from './EventBus.js';
import { PRNG, createPRNG, drawTianGan } from '../utils/prng.js';
import { getAvailableActions } from './ActionCandidates.js';

/**
 * 回合生命周期阶段
 */
export enum TurnPhase {
  START_TURN = 'START_TURN',
  EXECUTE_ACTION = 'EXECUTE_ACTION',
  RESOLVE_BURST = 'RESOLVE_BURST',
  END_TURN = 'END_TURN',
  GAME_OVER = 'GAME_OVER'
}

/**
 * TurnManager 初始化配置
 */
export interface TurnManagerOptions {
  readonly initialState?: GameState;
  readonly prng?: PRNG;
  readonly resolver?: ActionResolver;
  readonly eventBus?: EventBus;
  /** 变体 B：对称低位改道开关，默认关闭 */
  readonly lowStateRedirect?: boolean;
}

/**
 * 回合决策策略函数签名
 */
export type TurnStrategy = (
  state: GameState,
  tianGan: TianGanInfo,
  actions: ActionPayload[]
) => ActionPayload;

export class TurnManager {
  private state: GameState;
  private readonly prng: PRNG;
  private readonly resolver: ActionResolver;
  private readonly eventBus: EventBus;
  private readonly lowStateRedirect: boolean;

  private phase: TurnPhase;
  private currentTianGan: TianGanInfo | null = null;
  private isExtraTurn: boolean = false;
  private candidateActions: ActionPayload[] = [];

  constructor(options: TurnManagerOptions = {}) {
    this.state = options.initialState ?? createInitialGameState();
    this.prng = options.prng ?? createPRNG();
    this.resolver = options.resolver ?? new ActionResolver();
    this.eventBus = options.eventBus ?? new EventBus();
    this.lowStateRedirect = options.lowStateRedirect ?? false;
    this.phase = this.state.isGameOver ? TurnPhase.GAME_OVER : TurnPhase.START_TURN;
    this.currentTianGan = this.state.currentTianGan ?? null;
  }

  /**
   * 获取当前游戏全局状态
   */
  getState(): GameState {
    return this.state;
  }

  /**
   * 获取当前抽取的天干信息
   */
  getCurrentTianGan(): TianGanInfo | null {
    return this.currentTianGan;
  }

  /**
   * 当前是否处于爆发连动带来的额外行动中
   */
  isExtraTurnActive(): boolean {
    return this.isExtraTurn;
  }

  /**
   * 获取当前回合所处的生命周期阶段
   */
  getCurrentPhase(): TurnPhase {
    return this.phase;
  }

  /**
   * 获取当前阶段的合法候选动作列表
   */
  getAvailableActions(): ActionPayload[] {
    return [...this.candidateActions];
  }

  /**
   * 获取当前使用的 EventBus 实例
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * 获取当前使用的 PRNG 实例
   */
  getPRNG(): PRNG {
    return this.prng;
  }

  /**
   * 开始新回合：抽取天干并生成合法候选动作列表
   * 若当前处于连动额外行动 (isExtraTurn=true)，会自动过滤掉 BURST 与 BURST_ATK
   */
  startTurn(): ActionPayload[] {
    if (this.state.isGameOver) {
      this.phase = TurnPhase.GAME_OVER;
      this.candidateActions = [];
      return [];
    }

    // 终轮天命揭牌决胜阶段判定：先手 P1 已锁定五行归元且当前轮到后手 P2
    if (this.state.lockedGuiYuan?.P1 && this.state.currentPlayer === 'P2') {
      this.phase = TurnPhase.START_TURN;
      this.eventBus.emit('turn:start', {
        round: this.state.round,
        player: 'P2',
        isExtraTurn: false
      });

      // 确定性抽取天干
      const tianGan = drawTianGan(this.prng);
      this.currentTianGan = tianGan;
      this.state = {
        ...this.state,
        currentTianGan: tianGan
      };
      this.eventBus.emit('tiangan:draw', {
        tianGan
      });

      const p2Board = this.state.players.P2.board;
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
        // 成功时将最后一侧点亮
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

      // 派发 showdown:draw 事件
      this.eventBus.emit('showdown:draw', {
        round: this.state.round,
        player: 'P2',
        tianGan,
        success,
        winner
      });

      const prevState = this.state;
      this.state = {
        ...this.state,
        isGameOver: true,
        winner,
        endReason: 'GUI_YUAN',
        lockedGuiYuan: nextLockedGuiYuan,
        players: {
          ...this.state.players,
          P2: {
            ...this.state.players.P2,
            board: nextP2Board
          }
        }
      };

      this.phase = TurnPhase.GAME_OVER;
      this.candidateActions = [];
      this.isExtraTurn = false;

      this.eventBus.diffAndEmit(prevState, this.state);
      this.eventBus.emit('turn:end', {
        round: prevState.round,
        player: 'P2'
      });

      return [];
    }

    this.phase = TurnPhase.START_TURN;
    this.eventBus.emit('turn:start', {
      round: this.state.round,
      player: this.state.currentPlayer,
      isExtraTurn: this.isExtraTurn
    });

    // 确定性抽取天干并注入游戏状态
    this.currentTianGan = drawTianGan(this.prng);
    this.state = {
      ...this.state,
      currentTianGan: this.currentTianGan
    };

    this.eventBus.emit('tiangan:draw', {
      tianGan: this.currentTianGan
    });

    // 生成合法候选列表，若为连动额外行动则严格过滤爆发动作；低位改道开关仅影响非连动回合
    this.candidateActions = getAvailableActions(this.state, this.currentTianGan, {
      isExtraTurn: this.isExtraTurn,
      lowStateRedirect: this.lowStateRedirect
    });

    this.phase = TurnPhase.EXECUTE_ACTION;
    return [...this.candidateActions];
  }

  /**
   * 执行指定动作
   * 包含合法性校验、爆发连动限制、状态递增与事件广播
   */
  executeAction(action: ActionPayload): ActionResult {
    if (this.state.isGameOver) {
      this.phase = TurnPhase.GAME_OVER;
      return {
        nextState: this.state,
        success: false,
        scoreDelta: 0,
        extraTurn: false,
        message: '对局已结束'
      };
    }

    if (this.phase !== TurnPhase.EXECUTE_ACTION || !this.currentTianGan) {
      return {
        nextState: this.state,
        success: false,
        scoreDelta: 0,
        extraTurn: false,
        message: '当前不在动作执行阶段，请先调用 startTurn()'
      };
    }

    // 校验执行玩家是否为当前行动方
    if (action.player && action.player !== this.state.currentPlayer) {
      return {
        nextState: this.state,
        success: false,
        scoreDelta: 0,
        extraTurn: false,
        message: `当前不是玩家 ${action.player} 的行动回合`
      };
    }

    // 校验连动限制：在连动额外行动中严禁二次爆发
    if (
      this.isExtraTurn &&
      (action.actionType === ActionType.BURST || action.actionType === ActionType.BURST_ATK)
    ) {
      return {
        nextState: this.state,
        success: false,
        scoreDelta: 0,
        extraTurn: false,
        message: '连动行动中禁止再次使用爆发动作'
      };
    }

    // 校验动作是否在合法候选列表中
    const matchedCandidate = this.candidateActions.find((c) => this.isActionMatch(c, action));
    if (!matchedCandidate) {
      return {
        nextState: this.state,
        success: false,
        scoreDelta: 0,
        extraTurn: false,
        message: '非法动作：不在当前合法候选列表中'
      };
    }

    const fullAction: ActionPayload = {
      ...matchedCandidate,
      ...action,
      player: this.state.currentPlayer
    };

    this.eventBus.emit('action:execute', { action: fullAction });

    const prevState = this.state;
    const result = this.resolver.resolve(this.state, fullAction);

    if (!result.success) {
      return result;
    }

    // 进入 RESOLVE_BURST 阶段处理连动与回合转移
    this.phase = TurnPhase.RESOLVE_BURST;

    const wasExtraTurn = this.isExtraTurn;
    if (result.extraTurn && !wasExtraTurn) {
      // 触发爆发连动：获得额外行动机会，保持当前玩家
      this.isExtraTurn = true;
      this.eventBus.emit('burst:extra_turn', { player: fullAction.player });
    } else if (wasExtraTurn) {
      // 连动额外行动已执行完毕，重置连动锁
      this.isExtraTurn = false;
    }

    this.state = result.nextState;

    this.eventBus.emit('action:executed', {
      player: fullAction.player,
      actionType: fullAction.actionType,
      scoreDelta: result.scoreDelta,
      extraTurn: result.extraTurn
    });

    this.eventBus.diffAndEmit(prevState, this.state);

    this.eventBus.emit('turn:end', {
      round: prevState.round,
      player: prevState.currentPlayer
    });

    if (this.state.isGameOver) {
      this.phase = TurnPhase.GAME_OVER;
      this.isExtraTurn = false;
    } else {
      this.phase = TurnPhase.END_TURN;
    }

    return result;
  }

  /**
   * 手动结束当前回合，将状态推进至 START_TURN 准备下一回合
   */
  endTurn(): void {
    if (this.state.isGameOver) {
      this.phase = TurnPhase.GAME_OVER;
      return;
    }
    this.phase = TurnPhase.START_TURN;
  }

  /**
   * 单步执行驱动方法：自动完成 startTurn 与 executeAction
   * 若未提供 action，则默认选择首个候选动作 (通常为 AUTO)
   */
  step(action?: ActionPayload): ActionResult {
    if (this.state.isGameOver) {
      this.phase = TurnPhase.GAME_OVER;
      return {
        nextState: this.state,
        success: false,
        scoreDelta: 0,
        extraTurn: false,
        message: '对局已结束'
      };
    }

    if (this.phase === TurnPhase.START_TURN || this.phase === TurnPhase.END_TURN) {
      this.startTurn();
    }

    if (this.state.isGameOver) {
      return {
        nextState: this.state,
        success: true,
        scoreDelta: 0,
        extraTurn: false,
        message: '终轮天命揭牌决胜已完成'
      };
    }

    const actionToExecute = action ?? this.candidateActions[0];
    if (!actionToExecute) {
      return {
        nextState: this.state,
        success: false,
        scoreDelta: 0,
        extraTurn: false,
        message: '无可用动作'
      };
    }

    return this.executeAction(actionToExecute);
  }

  /**
   * 策略驱动执行：根据传入的决策策略函数完成当前回合
   */
  executeTurn(strategy: TurnStrategy): ActionResult {
    if (this.state.isGameOver) {
      this.phase = TurnPhase.GAME_OVER;
      return {
        nextState: this.state,
        success: false,
        scoreDelta: 0,
        extraTurn: false,
        message: '对局已结束'
      };
    }

    if (this.phase === TurnPhase.START_TURN || this.phase === TurnPhase.END_TURN) {
      this.startTurn();
    }

    if (this.state.isGameOver) {
      return {
        nextState: this.state,
        success: true,
        scoreDelta: 0,
        extraTurn: false,
        message: '终轮天命揭牌决胜已完成'
      };
    }

    const chosenAction = strategy(this.state, this.currentTianGan!, this.candidateActions);
    return this.executeAction(chosenAction);
  }

  /**
   * 策略驱动执行别名
   */
  executeTurnWithStrategy(strategy: TurnStrategy): ActionResult {
    return this.executeTurn(strategy);
  }

  /**
   * 匹配候选动作与传入动作的合法性
   */
  private isActionMatch(candidate: ActionPayload, action: ActionPayload): boolean {
    if (candidate.actionType !== action.actionType) {
      return false;
    }
    const player = action.player ?? this.state.currentPlayer;
    if (candidate.player !== player) {
      return false;
    }

    if (action.element !== undefined && candidate.element !== action.element) {
      return false;
    }
    if (action.sourceElement !== undefined && candidate.sourceElement !== action.sourceElement) {
      return false;
    }
    if (action.targetElement !== undefined && candidate.targetElement !== action.targetElement) {
      return false;
    }
    if (action.polarity !== undefined && candidate.polarity !== action.polarity) {
      return false;
    }
    if (action.consumePolarity !== undefined && candidate.consumePolarity !== action.consumePolarity) {
      return false;
    }

    if (
      (candidate.actionType === ActionType.BURST || candidate.actionType === ActionType.BURST_ATK) &&
      action.sourceElement === undefined
    ) {
      return false;
    }

    return true;
  }
}

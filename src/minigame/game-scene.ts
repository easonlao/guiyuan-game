/**
 * 对局主场景（Layer 3）：把五行法盘、操作面板、双方角色卡与天干飞行动效串成一条自闭环对局。
 *
 * 职责边界（契约见 `docs/LLD.md` §4、`docs/HLD.md` §2 Layer 3）：
 * - **只读投影**：本类只通过 `TurnManager` 的公开 API 读取状态，把快照投影到各视图，绝不写回游戏状态；
 *   动作的唯一出口是 `ActionBarView`（玩家点击）与内部的 AI 决策，两者都走 `turnManager.executeAction()`。
 * - **表现层时钟**：`update(dt)` 由主循环驱动，`Tween` 不掌握帧循环；动效与倒计时因此可在测试里用模拟时钟复现。
 * - **唯一候选自动流转**（ADR 0006 / ADR 0008）：`getAvailableActions().length === 1` 时不渲染任何交互按钮，
 *   缓冲 `autoExecuteDelay` 秒后自动执行；期间点屏幕任意处可加速结算。
 *
 * 生命周期：抽天干 -> 符文降临 -> （玩家抉择 | 天道决策）-> 符文飞行 -> 棋盘投影 -> 连动 / 终局判定。
 */

import { RuleSwitches } from '../core/logic/ActionCandidates.js';
import { TurnManager } from '../core/logic/TurnManager.js';
import { isNodeGuiYi } from '../core/logic/State.js';
import { BALANCED_WEIGHTS, createStrategy } from '../core/ai/Strategy.js';
import { DecisionStrategy } from '../core/ai/types.js';
import { createPRNG, PRNG } from '../core/utils/prng.js';
import {
  ActionPayload,
  ActionType,
  GameState,
  NodeLevel,
  PlayerId,
  Polarity,
  TianGanInfo,
  WuXing,
} from '../core/types/domain.js';
import { getActionTargetElement } from './action-button-formatter.js';
import { isAttackAction } from './action-semantics.js';
import { WUXING_PALETTE } from './pixel-art.js';
import { drawLandscape, THEME } from './theme.js';
import { Container } from './scene/container.js';
import { ActionBarView } from './views/action-bar-view.js';
import {
  BoardActivePath,
  BoardView,
  drawYinYangFish,
  resolveActionPath,
} from './views/board-view.js';
import { CharacterView } from './views/character-view.js';
import {
  ActionResultView,
  ACTION_LABEL,
  changedNodes,
  describeNodeChange,
  LEVEL_LABEL,
  NodeChange,
} from './views/action-result-view.js';
import { RuneFlightView } from './views/rune-flight-view.js';

/** 场景所处的表现阶段。 */
export type GameScenePhase =
  /** 尚未 `start()`。 */
  | 'idle'
  /** 天干符文降临中。 */
  | 'entrance'
  /** 玩家面临多重抉择，按钮可点。 */
  | 'awaiting-player'
  /** 唯一候选的缓冲倒计时中（无按钮，可点击加速）。 */
  | 'auto-pending'
  /** 天道推演决策中。 */
  | 'ai-thinking'
  /** 符文飞行与命中波纹播放中。 */
  | 'flying'
  | 'result'
  /** 终局结算展示。 */
  | 'game-over';

export interface GameSceneOptions {
  /** 视口宽度（屏幕坐标）。 */
  readonly width: number;
  /** 视口高度（屏幕坐标）。 */
  readonly height: number;
  /** 安全区顶部偏移（刘海屏），默认 24。 */
  readonly safeTop?: number;
  /** 安全区底部偏移，默认 12。 */
  readonly safeBottom?: number;
  /** 随机种子（未传 `prng` 时使用）。 */
  readonly seed?: number;
  /** 确定性伪随机源。 */
  readonly prng?: PRNG;
  /** 受控初始状态（测试与复盘用）。 */
  readonly initialState?: GameState;
  /** 规则开关：绑定到内置 AI 的估值路径。 */
  readonly rules?: RuleSwitches;
  /** 注入回合管理器（测试接缝）；不传则用 `prng` / `initialState` 自建。 */
  readonly turnManager?: TurnManager;
  /** 唯一候选的缓冲倒计时（秒），对齐 GDD §2.4 的约 0.75 秒，默认 0.75。 */
  readonly autoExecuteDelay?: number;
  /** 天道推演的思考停顿（秒），默认 0.55。 */
  readonly aiThinkDelay?: number;
  /** 角色表情反馈的持续时间（秒），默认 0.6。 */
  readonly expressionHold?: number;
  /** 归一庆祝的持续时间（秒），默认 1.2。 */
  readonly celebrateHold?: number;
  /** 天干降临动效时长（秒），默认 0.44。 */
  readonly entranceDuration?: number;
  /** 符文飞行动效时长（秒），默认 0.55。 */
  readonly flightDuration?: number;
  /** 命中波纹时长（秒），默认 0.35。 */
  readonly impactDuration?: number;
  readonly resultHold?: number;
}

/** 一个动作在法盘上的落点：作用到哪一方的哪个槽位。 */
export interface ActionTarget {
  readonly player: PlayerId;
  readonly element: WuXing;
  readonly polarity: Polarity;
}

const DEFAULT_SAFE_TOP = 24;
const DEFAULT_SAFE_BOTTOM = 12;
const DEFAULT_AUTO_EXECUTE_DELAY = 0.75;
const DEFAULT_AI_THINK_DELAY = 0.55;
const DEFAULT_EXPRESSION_HOLD = 0.6;
const DEFAULT_CELEBRATE_HOLD = 1.2;
/** 底部操作台高度（含按钮最多两行）。 */
const ACTION_BAR_MARGIN = 14;
/** 震屏时长与幅度（像素）。 */

/**
 * 唯一候选自动流转的播报副文案（ADR 0008 / GDD §2.4）。
 * 文案与旧命令式实现逐条对齐，避免玩家感知到的播报回退。
 */
export function describeAutoFlow(actionType: ActionType): string {
  switch (actionType) {
    case ActionType.AUTO:
      return '自动吸纳中';
    case ActionType.DISSIPATE:
      return '亢极满溢·散气回落中';
    case ActionType.PASS:
      return '道法受阻·消散过牌中';
    case ActionType.ATK:
      return '唯一机缘·破';
    case ActionType.TRANS:
      return '唯一机缘·化';
    case ActionType.CONVERT:
      return '势在必行·调息';
    case ActionType.BURST:
      return '势在必行·强化';
    case ActionType.BURST_ATK:
      return '势在必行·强破';
  }
}

/** 终局结算的副文案。 */
function describeEndReason(endReason: GameState['endReason']): string {
  switch (endReason) {
    case 'GUI_YUAN':
      return '五行归元';
    case 'MAX_ROUNDS':
      return '终局回合结算';
    default:
      return '对局结束';
  }
}

export class GameScene extends Container {
  /** 五行法盘视图（与符文层同一父节点、零位移，见 RuneFlightView 的挂载前提）。 */
  public readonly board: BoardView;
  /** 天干降临与飞行动效视图；视口变化时会被重建（见 `resize`）。 */
  public runeFlight: RuneFlightView;
  /** 双方角色卡视图。 */
  public readonly characters: CharacterView;
  /** 操作面板视图；唯一候选时整体隐藏（ADR 0008）。 */
  public actionBar: ActionBarView;

  private _turnManager: TurnManager;
  private readonly strategy: DecisionStrategy;
  private readonly rules: RuleSwitches;
  private readonly autoExecuteDelay: number;
  private readonly aiThinkDelay: number;
  private readonly expressionHold: number;
  private readonly celebrateHold: number;
  private readonly entranceDuration: number;
  private readonly flightDuration: number;
  private readonly impactDuration: number;
  private readonly resultHold: number;
  public readonly lastAction: ActionResultView;
  private visualStem: TianGanInfo | null = null;
  private visualActor: PlayerId | null = null;

  private _phase: GameScenePhase = 'idle';
  private width: number;
  private height: number;
  private safeTop: number;
  private safeBottom: number;

  /** 缓冲倒计时剩余秒数（`auto-pending` / `ai-thinking`）。 */
  private timer = 0;
  /** 缓冲期结束后要提交的动作（唯一候选或 AI 决策）。 */
  private pendingAction: ActionPayload | null = null;
  /** `action:execute` 记录的完整载荷，供 `action:executed` 计算飞行落点。 */
  private actionInFlight: ActionPayload | null = null;
  private readonly pendingCelebrations = new Set<PlayerId>();
  private actionBefore: GameState | null = null;
  private lastShowdown: { tianGan: TianGanInfo; success: boolean } | null = null;
  private unsubscribes: (() => void)[] = [];

  /** 视口在对局中变化时，符文层延到下一个回合开始前重建（不打断当前动效）。 */
  private runeFlightStale = false;

  public constructor(options: GameSceneOptions) {
    super();
    this.width = options.width;
    this.height = options.height;
    this.safeTop = options.safeTop ?? DEFAULT_SAFE_TOP;
    this.safeBottom = options.safeBottom ?? DEFAULT_SAFE_BOTTOM;
    this.rules = options.rules ?? {};
    this.autoExecuteDelay = options.autoExecuteDelay ?? DEFAULT_AUTO_EXECUTE_DELAY;
    this.aiThinkDelay = options.aiThinkDelay ?? DEFAULT_AI_THINK_DELAY;
    this.expressionHold = options.expressionHold ?? DEFAULT_EXPRESSION_HOLD;
    this.celebrateHold = options.celebrateHold ?? DEFAULT_CELEBRATE_HOLD;
    this.entranceDuration = options.entranceDuration ?? 0.44;
    this.flightDuration = options.flightDuration ?? 0.55;
    this.impactDuration = options.impactDuration ?? 0.35;
    this.resultHold = options.resultHold ?? 0.65;
    // 规则开关绑定到 AI 估值器（策略层）；候选生成不读 rules。
    this.strategy = createStrategy(BALANCED_WEIGHTS, { rules: this.rules });
    this._turnManager =
      options.turnManager ??
      new TurnManager({
        prng: options.prng ?? createPRNG(options.seed ?? Date.now()),
        initialState: options.initialState,
      });

    this.board = new BoardView();
    this.layoutBoard();
    this.runeFlight = this.buildRuneFlight();
    this.characters = new CharacterView({
      width: this.width,
      safeTop: this.safeTop,
      compact: this.height < 650 && this.safeTop > 24,
    });
    this.actionBar = this.buildActionBar(this._turnManager);
    this.actionBar.visible = false;
    this.placeActionBar();
    this.lastAction = new ActionResultView(this.width - 20);
    this.lastAction.x = 10;
    this.placeResult();
    this.addChild(this.board);
    this.addChild(this.runeFlight);
    this.addChild(this.characters);
    this.addChild(this.actionBar);
    this.addChild(this.lastAction);
    this.bindTurnManager(this._turnManager);
  }

  /** 核心状态机（只读；`restart()` 会换成新实例）。 */
  public get turnManager(): TurnManager {
    return this._turnManager;
  }

  /** 当前表现阶段。 */
  public get visualTurn(): { player: PlayerId | null; stem: TianGanInfo | null } {
    return { player: this.visualActor, stem: this.visualStem };
  }

  public get phase(): GameScenePhase {
    return this._phase;
  }

  /** 切换表现阶段：连线高亮与阶段一致（只有 `awaiting-player` 的待定动作会点亮连线）。 */
  private setPhase(phase: GameScenePhase): void {
    this._phase = phase;
    this.board.setActivePaths(this.activePathsFor(phase));
    this.placeResult();
  }

  /**
   * 当前阶段该点亮的连线：候选动作各自映射成路径后取并集（同一根天干下最多两类，
   * 分别指向内环相生边与跨环径向线）；非抉择阶段一律为空，避免误导。
   */
  private activePathsFor(phase: GameScenePhase): readonly BoardActivePath[] {
    if (phase !== 'awaiting-player') {
      return [];
    }
    const tianGan = this._turnManager.getCurrentTianGan();
    if (tianGan === null) {
      return [];
    }
    const paths: BoardActivePath[] = [];
    for (const action of this._turnManager.getAvailableActions()) {
      const path = resolveActionPath(action.actionType, tianGan.element);
      if (path !== null) {
        paths.push(path);
      }
    }
    return paths;
  }

  /**
   * 视口自适应：法盘、角色卡与操作台重新排布。
   * 符文层的入场锚点是构造期常量，只能重建；空闲 / 终局时立即重建，对局中则延到下一回合开始前。
   */
  public resize(width: number, height: number, safeTop?: number, safeBottom?: number): void {
    this.width = width;
    this.height = height;
    this.safeTop = safeTop ?? this.safeTop;
    this.safeBottom = safeBottom ?? this.safeBottom;
    this.actionBar.resize(width - ACTION_BAR_MARGIN * 2);
    this.layoutBoard();
    this.runeFlight.syncCenter();
    this.characters.resize(width, this.safeTop, this.height < 650 && this.safeTop > 24);
    this.placeActionBar();
    if (this._phase === 'idle' || this._phase === 'game-over') {
      this.replaceRuneFlight();
      this.runeFlightStale = false;
    } else {
      this.runeFlightStale = true;
    }
  }

  /** 开局：抽第一个天干并播放降临。重复调用无副作用。 */
  public start(): void {
    if (this._phase !== 'idle') {
      return;
    }
    this.beginTurn();
  }

  /** 终局后重新开局：换一颗随机源、重置表现态，从第 1 回合重来。 */
  public restart(seedOrPrng: number | PRNG = Date.now()): void {
    this.unbindTurnManager();
    const prng = typeof seedOrPrng === 'number' ? createPRNG(seedOrPrng) : seedOrPrng;
    this._turnManager = new TurnManager({ prng });
    this.lastShowdown = null;
    this.actionInFlight = null;
    this.pendingCelebrations.clear();
    this.actionBefore = null;
    this.runeFlight.cancel();
    this.x = 0;
    this.y = 0;
    // 终局胜 / 负的持续姿势不跨局残留。
    this.characters.resetFeedback();
    this.lastAction.reset();
    this.visualStem = null;
    this.visualActor = null;
    this.actionBar.dispose();
    this.actionBar.removeFromParent();
    this.actionBar = this.buildActionBar(this._turnManager);
    this.placeActionBar();
    this.addChild(this.actionBar);
    this.bindTurnManager(this._turnManager);
    this.setPhase('idle');
    this.beginTurn();
  }

  /** 退订核心事件（销毁场景时调用）。 */
  public dispose(): void {
    this.unbindTurnManager();
    this.actionBar.dispose();
    this.runeFlight.cancel();
    this.characters.resetFeedback();
    this.lastAction.reset();
    this.timer = 0;
    this.setPhase('idle');
  }

  /**
   * 主循环步进（秒）：推进动效与缓冲倒计时。
   * `Tween` 不掌握帧循环，时钟完全由这里注入。
   */
  public update(dt: number): void {
    const phaseBefore = this._phase;
    this.characters.updateTimers(dt);
    this.runeFlight.update(dt);
    if (this._phase === 'result') {
      if (phaseBefore !== 'result') return;
      this.timer -= dt;
      if (this.timer <= 0) this.finishResult();
      return;
    }
    if (this._phase !== 'auto-pending' && this._phase !== 'ai-thinking') {
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.commitPendingDecision();
    }
  }

  /**
   * 「点击屏幕任意处」的统一入口：
   * - 唯一候选的缓冲期内：立即加速结算（GDD §2.4「允许随时加速」）；
   * - 终局展示：重新开局。
   */
  public handleTap(): void {
    if (this._phase === 'auto-pending') {
      this.commitPendingDecision();
      return;
    }
    if (this._phase === 'game-over') {
      this.restart();
    }
  }

  /** 抽天干并开始一个回合（连动回合由核心层决定仍是同一行动方）。 */
  private beginTurn(): void {
    if (this.runeFlightStale) {
      this.replaceRuneFlight();
      this.runeFlightStale = false;
    }
    this.layoutBoard();
    if (
      Math.abs(this.runeFlight.position.x - this.board.layout.centerX) > 0.1 ||
      Math.abs(this.runeFlight.position.y - this.board.layout.centerY) > 0.1
    )
      this.replaceRuneFlight();
    const before = this._turnManager.getState();
    const actions = this._turnManager.startTurn();
    const state = this._turnManager.getState();
    const tianGan = this._turnManager.getCurrentTianGan();
    this.pendingAction = null;
    this.timer = 0;
    this.visualStem = tianGan;
    this.visualActor = state.currentPlayer;
    this.characters.update(state, { isExtraTurn: this._turnManager.isExtraTurnActive() });

    if (state.isGameOver) {
      this.presentGameOver(before);
      return;
    }
    this.projectBoards(state);
    this.hideActionBar();
    if (actions.length > 1) this.actionBar.refresh();
    this.layoutBoard();
    this.replaceRuneFlight();
    this.announceTurnStart(state, tianGan, actions);

    if (tianGan === null) {
      this.afterEntrance();
      return;
    }
    this.setPhase('entrance');
    this.runeFlight.playEntrance(tianGan, {
      owner: state.currentPlayer,
      onComplete: () => this.afterEntrance(),
    });
  }

  /** 降临结束：进入玩家抉择 / 自动流转 / 天道推演三者之一。 */
  private afterEntrance(): void {
    const state = this._turnManager.getState();
    const actions = this._turnManager.getAvailableActions();
    if (state.currentPlayer === 'P2') {
      this.setPhase('ai-thinking');
      this.timer = this.aiThinkDelay;
      return;
    }
    // ADR 0006 / ADR 0008：唯一候选没有分支决策，不渲染按钮，缓冲后自动执行。
    if (actions.length === 1) {
      this.setPhase('auto-pending');
      this.timer = this.autoExecuteDelay;
      this.pendingAction = actions[0];
      return;
    }
    this.setPhase('awaiting-player');
    this.actionBar.visible = true;
    this.actionBar.interactive = true;
    this.actionBar.refresh();
    this.placeActionBar();
  }

  /** 缓冲结束（或被点击加速）：把待定动作交给核心层结算。 */
  private commitPendingDecision(): void {
    let action = this.pendingAction;
    if (this._phase === 'ai-thinking') {
      action = this.decideAiAction();
    }
    this.pendingAction = null;
    this.timer = 0;
    if (action === null) {
      // 防御：理论上不可达（核心层恒有至少一个候选）。
      this.afterEntrance();
      return;
    }
    const result = this._turnManager.executeAction(action);
    if (!result.success) {
      // 防御：候选动作经核心校验必定成功；失败则退回抉择态以免卡死。
      console.warn(`[Guiyuan] 动作提交被核心拒绝：${result.message ?? ''}`);
      this.afterEntrance();
    }
  }

  /** 天道决策：把只读快照与候选交给注入的策略函数。 */
  private decideAiAction(): ActionPayload | null {
    const state = this._turnManager.getState();
    const tianGan = this._turnManager.getCurrentTianGan();
    const actions = this._turnManager.getAvailableActions();
    if (tianGan === null || actions.length === 0) {
      return null;
    }
    return this.strategy(state, tianGan, actions);
  }

  /** `action:execute`：记录完整载荷（此时核心尚未结算），供 `action:executed` 解析飞行落点。 */
  private handleActionExecute(event: { action: ActionPayload }): void {
    this.pendingCelebrations.clear();
    this.actionBefore = null;
    this.actionBefore = this._turnManager.getState();
    this.actionInFlight = event.action;
  }

  /** `action:executed`：动作已结算，播放符文飞行；法盘已是行动前等级，落点后才投影结算结果。 */
  private handleActionExecuted(event: { player: PlayerId; actionType: ActionType }): void {
    const action = this.actionInFlight;
    this.actionInFlight = null;
    const state = this._turnManager.getState();
    const actor = event.player;
    const resolved = resolveActionTarget(action, event.actionType, actor, this._turnManager);
    const beforeState = this.actionBefore;
    const changes = changedNodes(beforeState, state).sort(
      (a, b) =>
        Number(b.player === resolved.player && b.element === resolved.element) -
        Number(a.player === resolved.player && a.element === resolved.element),
    );
    const targetChanges = changes.filter(
      (change) => change.player === resolved.player && change.element === resolved.element,
    );
    const beforeNode = this.actionBefore?.players[resolved.player].board[resolved.element];
    const afterNode = state.players[resolved.player].board[resolved.element];
    const changedPolarities =
      beforeNode === undefined
        ? []
        : [Polarity.YIN, Polarity.YANG].filter((polarity) =>
            polarity === Polarity.YIN
              ? beforeNode.yin !== afterNode.yin
              : beforeNode.yang !== afterNode.yang,
          );
    const target = { ...resolved, polarity: changedPolarities[0] ?? resolved.polarity };
    const secondaryPolarity = changedPolarities.find((polarity) => polarity !== target.polarity);
    this.actionBefore = null;
    const isAttack = isAttackAction(event.actionType);

    this.hideActionBar();
    const stemLabel = this.visualStem?.name ?? '';
    const actionTitle = `${actor === 'P1' ? '你' : '天道'} · ${ACTION_LABEL[event.actionType]}`;
    const compact = this.height < 650 && this.safeTop > 24;
    this.characters.showBanner(
      actionTitle,
      `${stemLabel} · ${this.visualStem === null ? '' : WUXING_PALETTE[this.visualStem.element].name}${this.visualStem?.polarity === Polarity.YANG ? '阳' : '阴'}\n${event.actionType === ActionType.PASS ? '原地消散 · 无节点变化' : `${compact ? '→ ' : '作用于 '}${target.player === 'P1' ? '你' : '天道'}·${WUXING_PALETTE[target.element].name}${compact ? '' : '·'}${target.polarity === Polarity.YIN ? '阴' : '阳'}`}`,
    );
    this.characters.update(beforeState ?? state, {
      isExtraTurn: this._turnManager.isExtraTurnActive(),
      actingPlayer: actor,
    });
    this.characters.playAction(actor, event.actionType, this.flightDuration, this.impactDuration);

    // 法盘已是双环（行动前等级），飞行期不再换盘；落点后才投影结算结果。
    this.setPhase('flying');
    this.runeFlight.flyTo(target.player, target.element, target.polarity, {
      actionType: event.actionType,
      secondaryPolarity,
      showImpact: targetChanges.length > 0,
      onImpact: () => {
        this.projectBoards(state);
        this.characters.update(
          { ...state, round: beforeState?.round ?? state.round },
          { actingPlayer: actor },
        );
        this.showActionResult(
          actor,
          event.actionType,
          stemLabel,
          changes,
          targetChanges.length === 0,
        );
        if (isAttack && targetChanges.some((change) => change.after < change.before)) {
          this.characters.setExpression(
            opponentOf(actor),
            'hurt',
            Math.max(this.expressionHold, this.impactDuration),
            Math.min(0.08, this.impactDuration * 0.3),
          );
        }
        for (const player of this.pendingCelebrations) {
          this.characters.setExpression(player, 'celebrate', this.celebrateHold, 0.08);
        }
        this.pendingCelebrations.clear();
      },
      onComplete: () => {
        if (event.actionType === ActionType.PASS)
          this.showActionResult(actor, event.actionType, stemLabel, changes);
        this.afterFlight();
      },
    });
  }

  /**
   * `node:stateChanged`：某侧由 <1 变 ≥1 且该节点达成归一（核心真源 `isNodeGuiYi`）——
   * 按归属方在对应角色上播庆祝（票 03）。事件派发时 `turnManager.getState()` 已是新状态。
   */
  private handleNodeStateChanged(event: {
    player: PlayerId;
    element: WuXing;
    polarity: Polarity;
    prevLevel: NodeLevel;
    newLevel: NodeLevel;
  }): void {
    if (event.prevLevel >= 1 || event.newLevel < 1) {
      return;
    }
    const node = this._turnManager.getState().players[event.player].board[event.element];
    if (isNodeGuiYi(node)) {
      if (this._phase === 'flying') this.pendingCelebrations.add(event.player);
      else this.characters.setExpression(event.player, 'celebrate', this.celebrateHold);
    }
  }

  private showActionResult(
    actor: PlayerId,
    action: ActionType,
    stem: string,
    changes: readonly NodeChange[],
    targetUnchanged = false,
  ): void {
    this.lastAction.setResult(
      actor,
      action,
      stem,
      changes,
      targetUnchanged && action !== ActionType.PASS ? '目标阴阳未变' : undefined,
    );
    const compact = this.height < 650 && this.safeTop > 24;
    this.characters.showBanner(
      `${actor === 'P1' ? '你' : '天道'} · ${ACTION_LABEL[action]}${compact ? '' : '已结算'}`,
      changes.length === 0
        ? '未改变阴阳状态'
        : `${targetUnchanged ? '目标阴阳未变\n' : ''}${describeNodeChange(changes[0])}${!compact && changes.length > 1 ? `\n共${changes.length}处 · 下方可展开` : ''}`,
    );
    this.placeResult();
  }

  /** Keep the acting player and stem visible long enough to read the change before handover. */
  private afterFlight(): void {
    this.projectBoards(this._turnManager.getState());
    this.setPhase('result');
    this.timer = this.resultHold;
  }

  private finishResult(): void {
    const state = this._turnManager.getState();
    if (state.isGameOver) this.presentGameOver(null);
    else this.beginTurn();
  }

  /**
   * 终局展示：天命揭牌保留抽牌横幅与符文揭示动效，常规终局用胜负横幅。
   * `beforeShowdown` 是天命揭牌抽牌前的快照（只有揭牌路径传入），用于「落点才点亮」的定格。
   */
  private presentGameOver(beforeShowdown: GameState | null): void {
    const state = this._turnManager.getState();
    this.setPhase('game-over');
    this.pendingAction = null;
    this.timer = 0;
    this.hideActionBar();
    this.characters.update(state, { isExtraTurn: false });

    const showdown = this.lastShowdown;
    if (showdown !== null && beforeShowdown !== null) {
      const elementName = WUXING_PALETTE[showdown.tianGan.element].name;
      const label = `${showdown.tianGan.name}${elementName}`;
      this.characters.showBanner(
        '【终轮绝杀·天命抽牌】',
        showdown.success
          ? `【天命逆转】五行归元·后发制人！(抽中【${label}】)`
          : `【天命难违】差之一线·先手锁定胜局！(抽中【${label}】)`,
      );
      this.characters.setExpression('P2', 'cast', 0);
      // 揭牌：法盘定格在揭晓前的双盘，符文降临后飞向对方盘上抽中的槽位，落点才点亮。
      this.board.update(beforeShowdown.players.P1.board, beforeShowdown.players.P2.board);
      const { element, polarity } = showdown.tianGan;
      this.visualStem = showdown.tianGan;
      this.visualActor = 'P2';
      this.characters.update(state, { actingPlayer: 'P2' });
      this.runeFlight.playEntrance(showdown.tianGan, {
        owner: 'P2',
        onComplete: () => {
          this.runeFlight.flyTo('P2', element, polarity, {
            onImpact: () => {
              this.board.update(state.players.P1.board, state.players.P2.board);
              this.lastAction.setResult(
                'P2',
                'showdown',
                showdown.tianGan.name,
                changedNodes(beforeShowdown, state),
              );
              this.placeResult();
            },
            onComplete: () => {
              this.board.update(state.players.P1.board, state.players.P2.board);
              // 落点后才定格终局姿势，揭牌期间保留施法 / 受击的揭牌动效。
              this.showFinalPoses(state);
            },
          });
        },
      });
      return;
    }

    this.characters.showBanner(
      state.winner === 'P1' ? '★ 五行归元 ★ 玩家大胜！' : '天道通玄 · 遗憾惜败！',
      describeEndReason(state.endReason),
    );
    this.showFinalPoses(state);
    this.projectBoards(state);
  }

  /** 终局姿势：胜方「胜」、负方「负」，持续到重开（`restart()` 清掉）；平局不摆姿势。 */
  private showFinalPoses(state: GameState): void {
    const winner = state.winner;
    if (winner !== 'P1' && winner !== 'P2') {
      return;
    }
    this.characters.setExpression(winner, 'win', 0);
    this.characters.setExpression(opponentOf(winner), 'lose', 0);
  }

  /** 回合开始的播报：连动标记、天干名与「势在必行」的自动流转提示。 */
  private announceTurnStart(
    state: GameState,
    tianGan: TianGanInfo | null,
    actions: readonly ActionPayload[],
  ): void {
    const isExtraTurn = this._turnManager.isExtraTurnActive();
    const isPlayer = state.currentPlayer === 'P1';
    const who = isPlayer ? '你' : '天道';
    const main = isExtraTurn ? `${who}的连动回合` : `${who}的回合`;
    const stemText =
      tianGan === null
        ? ''
        : `${tianGan.name} · ${WUXING_PALETTE[tianGan.element].name}${tianGan.polarity === Polarity.YANG ? '阳' : '阴'}`;
    const prompt = !isPlayer
      ? '天道选择法术'
      : actions.length === 1
        ? ACTION_LABEL[actions[0].actionType]
        : '请选择法术';
    const sub = `${stemText}\n${prompt}`;
    this.characters.showBanner(main, sub);
  }

  /** 一次投影双方的棋盘到法盘双环（只读快照，不写回；ADR 0015）。 */
  private projectBoards(state: GameState): void {
    this.board.update(state.players.P1.board, state.players.P2.board);
  }

  private hideActionBar(): void {
    this.actionBar.visible = false;
    this.actionBar.interactive = false;
  }

  /** 把操作面板底对齐到安全区底部：按钮实测多高就占多高，不留空档。 */
  private placeActionBar(): void {
    this.actionBar.x = ACTION_BAR_MARGIN;
    this.actionBar.y = this.height - this.safeBottom - this.actionBar.contentHeight;
    this.placeResult();
  }

  private layoutBoard(): void {
    const compact = this.height < 650 || this.safeTop > 24;
    const buttonHeight = Math.max(58, this.actionBar?.contentHeight ?? 0);
    this.board.resize(
      this.width,
      this.height,
      compact
        ? {
            top: this.safeTop + (this.height < 650 && this.safeTop > 24 ? 100 : 128),
            bottom: this.height - this.safeBottom - buttonHeight - 64,
          }
        : undefined,
    );
  }

  private buildActionBar(turnManager: TurnManager): ActionBarView {
    return new ActionBarView({
      turnManager,
      width: this.width - ACTION_BAR_MARGIN * 2,
    });
  }

  private buildRuneFlight(): RuneFlightView {
    return new RuneFlightView({
      board: this.board,
      centerX: this.board.layout.centerX,
      centerY: this.board.layout.centerY,
      entranceDuration: this.entranceDuration,
      flightDuration: this.flightDuration,
      impactDuration: this.impactDuration,
    });
  }

  /** 重建符文层（视口变化时），保持挂载顺序：法盘 -> 符文 -> 角色卡 -> 操作台。 */
  private replaceRuneFlight(): void {
    this.runeFlight.removeFromParent();
    this.runeFlight = this.buildRuneFlight();
    this.addChild(this.runeFlight);
    this.addChild(this.characters);
    this.addChild(this.actionBar);
    this.addChild(this.lastAction);
  }

  private bindTurnManager(turnManager: TurnManager): void {
    const bus = turnManager.getEventBus();
    this.unsubscribes.push(
      bus.on('action:execute', (event) => this.handleActionExecute(event)),
      bus.on('action:executed', (event) => this.handleActionExecuted(event)),
      bus.on('node:stateChanged', (event) => this.handleNodeStateChanged(event)),
      bus.on('showdown:draw', (event) => {
        this.lastShowdown = { tianGan: event.tianGan, success: event.success };
      }),
    );
  }

  private unbindTurnManager(): void {
    for (const unsubscribe of this.unsubscribes) {
      unsubscribe();
    }
    this.unsubscribes.length = 0;
  }

  /** 底色与中央道场光晕（各视图画在其上）。 */
  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    drawLandscape(ctx, this.width, this.height);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.gold;
    ctx.font = `bold 18px ${THEME.font}`;
    ctx.fillText('归元弈', 18, this.safeTop + 13);
    this.drawDecisionGuide(ctx);
    ctx.restore();
  }

  private placeResult(): void {
    if (this.lastAction === undefined) return;
    this.lastAction.resize(this.width - 20);
    this.lastAction.y =
      this.height - this.safeBottom - Math.max(58, this.actionBar.contentHeight) - 42;
  }

  /** One permanent legend; the readable last-action strip owns the remaining footer. */
  private drawDecisionGuide(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.muted;
    ctx.font = `11px ${THEME.font}`;
    const y =
      this.board.layout.centerY +
      this.board.layout.outerRadius +
      this.board.layout.sealSize * 1.9 +
      18;
    ctx.fillText('左阴 · 右阳', this.width / 2, y - 5);
    for (const [index, level] of ([-1, 0, 1, 2] as const).entries()) {
      const column = (this.width * (index + 0.5)) / 4;
      drawYinYangFish(ctx, column - 13, y + 13, 7, Polarity.YIN, level, WuXing.WOOD);
      drawYinYangFish(ctx, column - 13, y + 13, 7, Polarity.YANG, level, WuXing.WOOD);
      ctx.fillStyle = THEME.ivory;
      ctx.textAlign = 'left';
      // 文案与上一招变化条共用同一张正名表，结构上保证一致（ADR 0018）。
      ctx.fillText(LEVEL_LABEL[level], column - 2, y + 13);
    }
    // 首格标「木示例」：四档样例都用木色，颜色只表身份、等级只看亮度（ADR 0018）。
    ctx.fillStyle = THEME.muted;
    ctx.textAlign = 'center';
    ctx.fillText('木示例', (this.width * 0.5) / 4 - 13, y - 5);
  }
}

/** 另一个玩家。 */
function opponentOf(player: PlayerId): PlayerId {
  return player === 'P1' ? 'P2' : 'P1';
}

/**
 * 把一个已结算动作解析成法盘上的落点：
 * 相克（破 / 强破）落到对手棋盘，其余动作落到行动方自己的棋盘；
 * 目标五行与极性优先取载荷字段，缺省时按相生/相克环与当前天干推导。
 *
 * 强化 (BURST) 不再携带目标侧：作用侧由解析器逐次按阴优先决定。
 * 载荷缺省时这里对强化取阴侧、对强破取抽中天干的极性，是**近似落点**——
 * 结算事件记录的真实变更会在 handleActionExecuted 中覆盖此缺省侧。
 */
function resolveActionTarget(
  action: ActionPayload | null,
  actionType: ActionType,
  actor: PlayerId,
  turnManager: TurnManager,
): ActionTarget {
  const tianGan = turnManager.getCurrentTianGan();
  const element =
    action === null
      ? (tianGan?.element ?? WuXing.WOOD)
      : getActionTargetElement(action, tianGan?.element);
  const polarity =
    action?.polarity ??
    (actionType === ActionType.BURST ? Polarity.YIN : tianGan?.polarity) ??
    Polarity.YANG;
  const isAttack = isAttackAction(actionType);
  return { player: isAttack ? opponentOf(actor) : actor, element, polarity };
}

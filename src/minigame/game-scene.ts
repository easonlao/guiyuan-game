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
import { BALANCED_WEIGHTS, createStrategy } from '../core/ai/Strategy.js';
import { DecisionStrategy } from '../core/ai/types.js';
import { createPRNG, PRNG } from '../core/utils/prng.js';
import {
  ActionPayload,
  ActionType,
  GameState,
  PlayerId,
  Polarity,
  TianGanInfo,
  WuXing,
} from '../core/types/domain.js';
import { formatActionButton, getActionTargetElement } from './action-button-formatter.js';
import { drawPixelRect, WUXING_PALETTE } from './pixel-art.js';
import { Container } from './scene/container.js';
import { EASINGS, Tween } from './scene/tween.js';
import { ActionBarView } from './views/action-bar-view.js';
import { BoardActivePath, BoardView, resolveActionPath } from './views/board-view.js';
import { CharacterView } from './views/character-view.js';
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
  /** 天干降临动效时长（秒），默认 0.44。 */
  readonly entranceDuration?: number;
  /** 符文飞行动效时长（秒），默认 0.55。 */
  readonly flightDuration?: number;
  /** 命中波纹时长（秒），默认 0.35。 */
  readonly impactDuration?: number;
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
/** 底部操作台高度（含按钮最多两行）。 */
const ACTION_BAR_HEIGHT = 130;
const ACTION_BAR_MARGIN = 14;
/** 震屏时长与幅度（像素）。 */
const SHAKE_DURATION = 0.28;
const SHAKE_BURST = 8;
const SHAKE_ATTACK = 4;
const SHAKE_SHOWDOWN = 6;

/** 场景底色与中央道场光晕。 */
const BACKGROUND_COLOR = '#0a0d14';
const ARENA_GLOW_COLOR = '#1f2937';

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
  private readonly entranceDuration: number;
  private readonly flightDuration: number;
  private readonly impactDuration: number;

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
  private lastShowdown: { tianGan: TianGanInfo; success: boolean } | null = null;
  private unsubscribes: (() => void)[] = [];

  /** 震屏：补间把幅度衰减到 0，`update` 按幅度换算节点偏移。 */
  private readonly shakeState = { amount: 0 };
  private shakeTween: Tween<{ amount: number }> | null = null;
  private elapsed = 0;
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
    this.entranceDuration = options.entranceDuration ?? 0.44;
    this.flightDuration = options.flightDuration ?? 0.55;
    this.impactDuration = options.impactDuration ?? 0.35;
    // 规则开关绑定到 AI 估值器（策略层）；候选生成不读 rules。
    this.strategy = createStrategy(BALANCED_WEIGHTS, { rules: this.rules });
    this._turnManager =
      options.turnManager ??
      new TurnManager({
        prng: options.prng ?? createPRNG(options.seed ?? Date.now()),
        initialState: options.initialState,
      });

    this.board = new BoardView();
    this.board.resize(this.width, this.height);
    this.runeFlight = this.buildRuneFlight();
    this.characters = new CharacterView({
      width: this.width,
      safeTop: this.safeTop,
    });
    this.actionBar = this.buildActionBar(this._turnManager);
    this.actionBar.visible = false;
    this.addChild(this.board);
    this.addChild(this.runeFlight);
    this.addChild(this.characters);
    this.addChild(this.actionBar);
    this.bindTurnManager(this._turnManager);
  }

  /** 核心状态机（只读；`restart()` 会换成新实例）。 */
  public get turnManager(): TurnManager {
    return this._turnManager;
  }

  /** 当前表现阶段。 */
  public get phase(): GameScenePhase {
    return this._phase;
  }

  /** 切换表现阶段：连线高亮与阶段一致（只有 `awaiting-player` 的待定动作会点亮连线）。 */
  private setPhase(phase: GameScenePhase): void {
    this._phase = phase;
    this.board.setActivePaths(this.activePathsFor(phase));
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
    this.board.resize(width, height);
    this.characters.resize(width, this.safeTop);
    this.actionBar.x = ACTION_BAR_MARGIN;
    this.actionBar.y = this.actionBarY();
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
    this.actionBar.dispose();
    this.actionBar.removeFromParent();
    this.actionBar = this.buildActionBar(this._turnManager);
    this.addChild(this.actionBar);
    this.bindTurnManager(this._turnManager);
    this.setPhase('idle');
    this.beginTurn();
  }

  /** 退订核心事件（销毁场景时调用）。 */
  public dispose(): void {
    this.unbindTurnManager();
    this.actionBar.dispose();
  }

  /**
   * 主循环步进（秒）：推进动效与缓冲倒计时。
   * `Tween` 不掌握帧循环，时钟完全由这里注入。
   */
  public update(dt: number): void {
    this.elapsed += dt;
    this.runeFlight.update(dt);
    this.characters.updateTimers(dt);
    this.updateShake(dt);
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
    const before = this._turnManager.getState();
    const actions = this._turnManager.startTurn();
    const state = this._turnManager.getState();
    const tianGan = this._turnManager.getCurrentTianGan();
    this.pendingAction = null;
    this.timer = 0;
    this.characters.update(state, { isExtraTurn: this._turnManager.isExtraTurnActive() });

    if (state.isGameOver) {
      this.presentGameOver(before);
      return;
    }
    this.projectBoards(state);
    this.hideActionBar();
    this.announceTurnStart(state, tianGan, actions);

    if (tianGan === null) {
      this.afterEntrance();
      return;
    }
    this.setPhase('entrance');
    this.runeFlight.playEntrance(tianGan, { onComplete: () => this.afterEntrance() });
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
    this.actionInFlight = event.action;
  }

  /** `action:executed`：动作已结算，播放符文飞行；法盘已是行动前等级，落点后才投影结算结果。 */
  private handleActionExecuted(event: { player: PlayerId; actionType: ActionType }): void {
    const action = this.actionInFlight;
    this.actionInFlight = null;
    const state = this._turnManager.getState();
    const actor = event.player;
    const target = resolveActionTarget(action, event.actionType, actor, this._turnManager);
    const isAttack =
      event.actionType === ActionType.ATK || event.actionType === ActionType.BURST_ATK;

    this.hideActionBar();
    this.characters.update(state, { isExtraTurn: this._turnManager.isExtraTurnActive() });
    this.characters.setExpression(actor, isAttack ? 'attack' : 'cast', this.expressionHold);
    if (action !== null) {
      // 气泡复用动作按钮的命名（同一真源），让「刚才发生了什么」在角色头上可见。
      this.characters.announce(actor, formatActionButton(action).label, this.expressionHold * 2);
    }
    if (isAttack) {
      this.characters.setExpression(opponentOf(actor), 'hurt', this.expressionHold);
      this.shake(event.actionType === ActionType.BURST_ATK ? SHAKE_BURST : SHAKE_ATTACK);
    }

    // 法盘已是双环（行动前等级），飞行期不再换盘；落点后才投影结算结果。
    this.setPhase('flying');
    this.runeFlight.flyTo(target.player, target.element, target.polarity, {
      onComplete: () => this.afterFlight(),
    });
  }

  /** 飞行结束：投影结算后的双盘，然后进入下一回合或终局。 */
  private afterFlight(): void {
    const state = this._turnManager.getState();
    this.projectBoards(state);
    this.characters.update(state, { isExtraTurn: this._turnManager.isExtraTurnActive() });
    if (state.isGameOver) {
      this.presentGameOver(null);
      return;
    }
    this.beginTurn();
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
      this.characters.setExpression(showdown.success ? 'P2' : 'P1', 'cast', this.expressionHold);
      this.characters.setExpression(showdown.success ? 'P1' : 'P2', 'hurt', this.expressionHold);
      if (showdown.success) {
        this.shake(SHAKE_SHOWDOWN);
      }
      // 揭牌：法盘定格在揭晓前的双盘，符文降临后飞向对方盘上抽中的槽位，落点才点亮。
      this.board.update(beforeShowdown.players.P1.board, beforeShowdown.players.P2.board);
      const { element, polarity } = showdown.tianGan;
      this.runeFlight.playEntrance(showdown.tianGan, {
        onComplete: () => {
          this.runeFlight.flyTo('P2', element, polarity, {
            onComplete: () => {
              this.board.update(state.players.P1.board, state.players.P2.board);
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
    this.projectBoards(state);
  }

  /** 回合开始的播报：连动标记、天干名与「势在必行」的自动流转提示。 */
  private announceTurnStart(
    state: GameState,
    tianGan: TianGanInfo | null,
    actions: readonly ActionPayload[],
  ): void {
    const isExtraTurn = this._turnManager.isExtraTurnActive();
    const isPlayer = state.currentPlayer === 'P1';
    const who = isPlayer ? '玩家' : '天道';
    const main = isExtraTurn
      ? `【连动回合】${who}额外行动！`
      : `${who}回合 · 天干【${tianGan?.name ?? ''}】降临`;

    let sub: string;
    if (!isPlayer) {
      sub = '天道推演生克决策中...';
    } else if (actions.length === 1) {
      sub = describeAutoFlow(actions[0].actionType);
    } else {
      const elementName = tianGan === null ? '' : WUXING_PALETTE[tianGan.element].name;
      const polarity = tianGan?.polarity === Polarity.YANG ? '阳' : '阴';
      sub = `属性: ${elementName} (${polarity})`;
    }
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

  private actionBarY(): number {
    return this.height - this.safeBottom - ACTION_BAR_HEIGHT;
  }

  private buildActionBar(turnManager: TurnManager): ActionBarView {
    return new ActionBarView({
      turnManager,
      width: this.width - ACTION_BAR_MARGIN * 2,
      y: this.actionBarY(),
    });
  }

  private buildRuneFlight(): RuneFlightView {
    return new RuneFlightView({
      board: this.board,
      centerX: this.width / 2,
      centerY: this.height / 2,
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
  }

  private bindTurnManager(turnManager: TurnManager): void {
    const bus = turnManager.getEventBus();
    this.unsubscribes.push(
      bus.on('action:execute', (event) => this.handleActionExecute(event)),
      bus.on('action:executed', (event) => this.handleActionExecuted(event)),
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

  /** 触发震屏（幅度补间衰减到 0）。 */
  private shake(magnitude: number): void {
    this.shakeState.amount = magnitude;
    this.shakeTween = new Tween(
      this.shakeState,
      { amount: 0 },
      {
        duration: SHAKE_DURATION,
        easing: EASINGS.outQuad,
      },
    );
  }

  private updateShake(dt: number): void {
    if (this.shakeTween === null) {
      return;
    }
    this.shakeTween.update(dt);
    const amount = this.shakeState.amount;
    if (amount <= 0.01) {
      this.shakeTween = null;
      this.x = 0;
      this.y = 0;
      return;
    }
    this.x = Math.sin(this.elapsed * 62) * amount;
    this.y = Math.cos(this.elapsed * 74) * amount;
  }

  /** 底色与中央道场光晕（各视图画在其上）。 */
  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    drawPixelRect(ctx, 0, 0, this.width, this.height, BACKGROUND_COLOR);
    const radius = Math.min(this.width, this.height) * 0.45;
    const gradient = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      0,
      this.width / 2,
      this.height / 2,
      radius,
    );
    gradient.addColorStop(0, ARENA_GLOW_COLOR);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.width / 2, this.height / 2, radius, 0, Math.PI * 2);
    ctx.fill();
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
  const polarity = action?.polarity ?? tianGan?.polarity ?? Polarity.YANG;
  const isAttack = actionType === ActionType.ATK || actionType === ActionType.BURST_ATK;
  return { player: isAttack ? opponentOf(actor) : actor, element, polarity };
}

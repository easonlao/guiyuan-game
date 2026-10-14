/**
 * 天干飞行动效视图（Layer 3）：中央天干符文的入场浮空、飞向目标五行节点与命中波纹。
 *
 * 三个阶段由独立的补间管线驱动，时钟由调用方每帧传入 `update(dt)`（秒）：
 * 1. 入场：`playEntrance()` 让符文在屏幕中央浮空降临（阳用金乌日冕、阴用玄阴幽光）；
 * 2. 飞行：`flyTo()` 从当前符文位置沿轨迹飞向目标槽位（阳走刚健流星弧线、阴走灵蛇蜿蜒曲线）；
 * 3. 命中：抵达时触发波纹扩散并让符文被吸收，**整段动效结束后**才回调 `onComplete`，
 *    调用方据此把回合控制权交回（`isAnimating` 为 false）。
 *
 * 目标坐标的唯一来源是 `BoardView.getSlot(player, element, polarity)` 的投影（不在这里重算法盘几何），
 * `player` 决定落点在内环（己方盘）还是外环（对方盘）；
 * 因此本视图与 `BoardView` 必须挂在同一父节点下、且两者之间没有额外位移。
 * 数据流与投影契约见 `docs/LLD.md` §4，模块职责见 `docs/HLD.md` §2 Layer 3。
 */

import { ActionType, PlayerId, Polarity, TianGanInfo, WuXing } from '../../core/types/domain.js';
import { BoardView, BoardSlotView } from './board-view.js';
import { drawCenterTianGanRune, WUXING_PALETTE } from '../pixel-art.js';
import { Container } from '../scene/container.js';
import { Node } from '../scene/node.js';
import { EASINGS, Tween, TweenSequence } from '../scene/tween.js';

/** 动效阶段：未开始 / 入场 / 待机浮空 / 飞行 / 命中波纹 / 已被吸收。 */
export type RuneFlightPhase = 'hidden' | 'entering' | 'ready' | 'flying' | 'impact' | 'absorbed';

/** 入场光晕样式：阳为金乌日冕，阴为玄阴幽光。 */
export type RuneHaloStyle = 'corona' | 'moonlight';

export interface RuneFlightViewOptions {
  /** 五行法盘视图：目标槽位坐标的唯一来源。 */
  readonly board: BoardView;
  /** 入场与飞行的起点（父坐标系），通常是屏幕中心；默认 (0, 0)。 */
  readonly centerX?: number;
  readonly centerY?: number;
  /** 入场动效时长（秒），默认 0.8。 */
  readonly entranceDuration?: number;
  /** 符文飞行动效时长（秒），默认 0.55。 */
  readonly flightDuration?: number;
  /** 命中波纹时长（秒），默认 0.35。 */
  readonly impactDuration?: number;
}

/** 入场播放选项。 */
export interface PlayEntranceOptions {
  /** 入场播放完成回调。 */
  readonly onComplete?: () => void;
  /** 抽签归属方（P1 己方内环 / P2 对方外环）。 */
  readonly owner?: PlayerId;
  /** 自定义入场时长（秒），缺省时使用实例的 entranceDuration。 */
  readonly duration?: number;
}

const DEFAULT_ENTRANCE_DURATION = 0.8;
const DEFAULT_FLIGHT_DURATION = 0.55;
const DEFAULT_IMPACT_DURATION = 0.35;

/** 每秒钟折算的动画帧计数：复用 `pixel-art` 的帧驱动绘制例程（其呼吸/旋转按 60fps 调参）。 */
const TICK_RATE = 60;

/** 阳：流星弧线的最大法向偏移（像素）。 */
const METEOR_ARC = 34;
/** 阴：灵蛇曲线的摆动幅度（像素）与摆幅次数（整数保证首尾都落在直线上）。 */
const SERPENTINE_AMPLITUDE = 16;
const SERPENTINE_WAVES = 3;

/** 命中波纹的最大半径（像素）与符文被吸收时的收缩比例。 */
const IMPACT_MAX_RADIUS = 46;
const ABSORB_SHRINK = 0.45;

export class RuneFlightView extends Container {
  private readonly board: BoardView;
  private centerX: number;
  private centerY: number;
  private readonly entranceDuration: number;
  private readonly flightDuration: number;
  private readonly impactDuration: number;

  private readonly vortex: QiVortexNode;
  private readonly rune: RuneNode;
  private readonly ripple: ImpactNode;
  /** 入场补间写入的进度（0~1），符文透明度与缩放是它的纯投影。 */
  private readonly entranceState = { progress: 0 };
  /** 飞行补间写入的进度（0~1），符文位置是它的纯投影。 */
  private readonly flightState = { progress: 0 };
  /** 波纹补间写入的进度（0~1），扩散半径与符文吸收是它的纯投影。 */
  private readonly impactState = { progress: 0 };

  private _phase: RuneFlightPhase = 'hidden';
  private _tianGan: TianGanInfo | null = null;
  private _haloStyle: RuneHaloStyle = 'corona';
  private tick = 0;

  private entrance: Tween<{ progress: number }> | null = null;
  private entranceOnComplete?: () => void;
  private flight: TweenSequence | null = null;
  private flightOnComplete?: () => void;
  private actionType: ActionType | null = null;
  private targetSlot: BoardSlotView | null = null;
  private secondaryTarget: BoardSlotView | null = null;

  /** Reproject through BoardView on resize; waiting glyphs and in-flight targets share its geometry. */
  public syncCenter(): void {
    this.rune.radius = Math.max(
      8,
      Math.min(25, this.board.layout.innerRadius - this.board.layout.sealSize - 16),
    );
    this.centerX = this.board.layout.centerX;
    this.centerY = this.board.layout.centerY;
    if (this._phase === 'entering' || this._phase === 'ready') {
      this.rune.x = this.centerX;
      this.rune.y = this.centerY;
    }
    if (this.secondaryTarget !== null)
      this.secondaryTarget = this.board.getSlot(
        this.secondaryTarget.player,
        this.secondaryTarget.element,
        this.secondaryTarget.polarity,
      );
    if (this._phase === 'impact' && this.targetSlot !== null) {
      const target = this.board.getSlot(
        this.targetSlot.player,
        this.targetSlot.element,
        this.targetSlot.polarity,
      );
      this.ripple.x = target.x;
      this.ripple.y = target.y;
      this.rune.x = target.x;
      this.rune.y = target.y;
    }
  }

  public get actionDuration(): number {
    return this.flightDuration + this.impactDuration;
  }

  public cancel(): void {
    this.entrance = null;
    this.flight = null;
    this.entranceOnComplete = undefined;
    this.flightOnComplete = undefined;
    this.rune.visible = false;
    this.ripple.visible = false;
    this._phase = 'hidden';
  }

  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    if (this._phase === 'impact' && this.secondaryTarget !== null && this.ripple.showImpact) {
      ctx.save();
      ctx.globalAlpha *= 1 - this.impactState.progress;
      ctx.strokeStyle = this.ripple.lightColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        this.secondaryTarget.x,
        this.secondaryTarget.y,
        5 + this.impactState.progress * 11,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  public get owner(): PlayerId | null {
    return this.rune.owner;
  }

  public constructor(options: RuneFlightViewOptions) {
    super();
    this.board = options.board;
    this.centerX = options.centerX ?? 0;
    this.centerY = options.centerY ?? 0;
    this.entranceDuration = options.entranceDuration ?? DEFAULT_ENTRANCE_DURATION;
    this.flightDuration = options.flightDuration ?? DEFAULT_FLIGHT_DURATION;
    this.impactDuration = options.impactDuration ?? DEFAULT_IMPACT_DURATION;
    this.vortex = new QiVortexNode();
    this.vortex.visible = false;
    this.addChild(this.vortex);
    this.rune = new RuneNode();
    this.rune.radius = Math.max(
      8,
      Math.min(25, this.board.layout.innerRadius - this.board.layout.sealSize - 3),
    );
    this.rune.x = this.centerX;
    this.rune.y = this.centerY;
    this.rune.visible = false;
    this.addChild(this.rune);
    // 波纹是独立子节点：飞行的符文缩放进节点里，波纹得留在命中点扩散。
    this.ripple = new ImpactNode();
    this.ripple.visible = false;
    this.addChild(this.ripple);
  }

  /** 获取当前灵气光旋节点。 */
  public get vortexNode(): QiVortexNode {
    return this.vortex;
  }

  /** 当前动效阶段。 */
  public get phase(): RuneFlightPhase {
    return this._phase;
  }

  /** 入场 / 飞行 / 波纹是否仍在播放；为 false 时调用方可交回回合控制权。 */
  public get isAnimating(): boolean {
    return this._phase === 'entering' || this._phase === 'flying' || this._phase === 'impact';
  }

  /** 当前天干（未入场时为 null）。 */
  public get tianGan(): TianGanInfo | null {
    return this._tianGan;
  }

  /** 入场光晕样式（阳：金乌日冕，阴：玄阴幽光）。 */
  public get haloStyle(): RuneHaloStyle {
    return this._haloStyle;
  }

  /** 符文锚点在父坐标系里的位置（浮空摆动是绘制内部的视觉偏移，不体现在这里）。 */
  public get position(): { x: number; y: number } {
    return { x: this.rune.x, y: this.rune.y };
  }

  /**
   * 回合启动：设定本回合天干并从屏幕中央浮空降临。
   * 入场结束后回调 `onComplete`，此时阶段回到 `ready`（可以接受 `flyTo`）。
   */
  public playEntrance(tianGan: TianGanInfo, options: PlayEntranceOptions = {}): void {
    // 新回合直接打断上一段未跑完的飞行动效：旧序列停步、旧回调作废（不再交回控制权）。
    this.flight = null;
    this.flightOnComplete = undefined;
    this.actionType = null;
    this.rune.actionType = null;
    this.secondaryTarget = null;
    this._tianGan = tianGan;
    this._haloStyle = tianGan.polarity === Polarity.YANG ? 'corona' : 'moonlight';
    this.rune.tianGan = tianGan;
    const owner = options.owner ?? 'P1';
    this.rune.owner = owner;
    this.rune.haloStyle = this._haloStyle;
    this.rune.x = this.centerX;
    this.rune.y = this.centerY;
    this.rune.alpha = 0;
    this.rune.scaleX = 0.2;
    this.rune.scaleY = 0.2;
    this.rune.visible = true;
    this.ripple.visible = false;
    this.entranceState.progress = 0;
    this.entranceOnComplete = options.onComplete;
    this._phase = 'entering';

    this.vortex.setup(this.board, owner, tianGan.element, this.centerX, this.centerY);

    const duration = options.duration ?? this.entranceDuration;
    this.entrance = new Tween(
      this.entranceState,
      { progress: 1 },
      {
        duration,
        easing: EASINGS.linear,
        onUpdate: (progress) => this.applyEntrance(progress),
        onComplete: () => {
          this.finishEntrance();
          const onComplete = this.entranceOnComplete;
          this.entranceOnComplete = undefined;
          onComplete?.();
        },
      },
    );
  }

  /** 由调用方每帧驱动；`dt` 单位为秒。 */
  public update(dt: number): void {
    this.tick += dt * TICK_RATE;
    this.rune.tick = this.tick;
    this.entrance?.update(dt);
    this.flight?.update(dt);
  }

  /**
   * 动作选定：符文从当前位置飞向目标槽位（坐标取自 `BoardView.getSlot(player, …)`），
   * 命中后触发波纹并让符文被吸收。**波纹也跑完**才回调 `onComplete`，
   * 此时 `isAnimating` 为 false，调用方可以交回回合控制权。
   *
   * `player` 是被作用方的盘：攻击类（破 / 强破）传对方、其余传己方，落点随之落在对应环上。
   * 入场还没跑完就调用时，先把入场收尾再起飞（玩家点得比动画快也不会丢飞行）；
   * 从未 `playEntrance()` 或已在飞行中则直接报错。
   */
  public flyTo(
    player: PlayerId,
    element: WuXing,
    polarity: Polarity,
    options: {
      actionType?: ActionType;
      secondaryPolarity?: Polarity;
      showImpact?: boolean;
      onImpact?: () => void;
      onComplete?: () => void;
    } = {},
  ): void {
    // 玩家可能点得比入场动效还快：直接把符文落到待机态，不要因此丢掉整段飞行。
    if (this._phase === 'entering') {
      this.finishEntrance();
      this.entranceOnComplete = undefined;
    }
    const tianGan = this._tianGan;
    if (this._phase !== 'ready' || tianGan === null) {
      throw new Error('符文不在待机态，无法起飞；请先 playEntrance() 并等它落地。');
    }
    this.actionType = options.actionType ?? null;
    this.rune.actionType = this.actionType;
    this.ripple.actionType = this.actionType;
    this.ripple.showImpact = options.showImpact ?? true;
    const isPass = this.actionType === ActionType.PASS;
    const target = isPass
      ? { x: this.centerX, y: this.centerY }
      : this.board.getSlot(player, element, polarity);
    this.targetSlot = isPass ? null : this.board.getSlot(player, element, polarity);
    this.secondaryTarget =
      options.secondaryPolarity === undefined
        ? null
        : this.board.getSlot(player, element, options.secondaryPolarity);
    const startX = this.rune.x;
    const startY = this.rune.y;
    const centerAtStartX = this.centerX;
    const centerAtStartY = this.centerY;
    const isYang = tianGan.polarity === Polarity.YANG;

    this.flightState.progress = 0;
    this._phase = 'flying';
    this.flightOnComplete = options.onComplete;
    const flightTween = new Tween(
      this.flightState,
      { progress: 1 },
      {
        duration: this.flightDuration,
        easing: EASINGS.linear,
        onUpdate: (time) => {
          const projected = isPass
            ? { x: this.centerX, y: this.centerY }
            : this.board.getSlot(player, element, polarity);
          const fromX = startX + this.centerX - centerAtStartX;
          const fromY = startY + this.centerY - centerAtStartY;
          const deltaX = projected.x - fromX;
          const deltaY = projected.y - fromY;
          const length = Math.hypot(deltaX, deltaY) || 1;
          const normalX = -deltaY / length;
          const normalY = deltaX / length;

          const progress =
            this.actionType === null
              ? EASINGS.outCubic(time)
              : EASINGS.inOutQuad(Math.max(0, (time - 0.18) / 0.82));
          // 阳：刚健流星弧线（全程偏向一侧）；阴：灵蛇蜿蜒（来回摆动）。
          let curve = isYang
            ? -Math.sin(progress * Math.PI) * METEOR_ARC
            : Math.sin(progress * Math.PI * SERPENTINE_WAVES) * SERPENTINE_AMPLITUDE;
          if (this.actionType === ActionType.ATK || this.actionType === ActionType.BURST_ATK)
            curve *= 0.12;
          if (this.actionType === ActionType.CONVERT) curve = Math.sin(progress * Math.PI * 2) * 23;
          if (this.actionType === ActionType.TRANS) curve = -Math.sin(progress * Math.PI) * 48;
          if (this.actionType === ActionType.AUTO)
            curve = Math.sin(progress * Math.PI * 4) * 12 * (1 - progress);
          this.rune.progress = time;
          if (this.actionType !== null) {
            const release = EASINGS.inOutQuad(Math.min(1, Math.max(0, (time - 0.18) / 0.2)));
            const scale =
              time < 0.18 ? 1 + Math.sin((time / 0.18) * Math.PI) * 0.12 : 1 - 0.38 * release;
            this.rune.scaleX = scale;
            this.rune.scaleY = scale;
            if (isPass) this.rune.alpha = 1 - progress;
          }
          this.rune.x = fromX + deltaX * progress + normalX * curve;
          this.rune.y = fromY + deltaY * progress + normalY * curve;
        },
        onComplete: () => {
          // 落点对齐法盘投影的坐标（不依赖浮点累加的巧合）。
          const arrival = isPass
            ? { x: this.centerX, y: this.centerY }
            : this.board.getSlot(player, element, polarity);
          this.rune.x = arrival.x;
          this.rune.y = arrival.y;
          this.ripple.x = arrival.x;
          this.ripple.y = arrival.y;
          this._phase = 'impact';
          if (!isPass) options.onImpact?.();
        },
      },
    );
    this.flight = new TweenSequence(
      [flightTween, this.buildImpactTween(target.x, target.y, element)],
      () => {
        this.flight = null;
        this.ripple.visible = false;
        this._phase = 'absorbed';
        const onComplete = this.flightOnComplete;
        this.flightOnComplete = undefined;
        onComplete?.();
      },
    );
  }

  /** 命中波纹：以目标槽位为圆心扩散，同时符文被吸收（缩小 + 淡出）。 */
  private buildImpactTween(
    targetX: number,
    targetY: number,
    element: WuXing,
  ): Tween<{ progress: number }> {
    const palette = WUXING_PALETTE[element];
    this.impactState.progress = 0;
    this.ripple.x = targetX;
    this.ripple.y = targetY;
    this.ripple.maxRadius = IMPACT_MAX_RADIUS;
    this.ripple.lightColor = palette.light;
    this.ripple.visible = false;
    return new Tween(
      this.impactState,
      { progress: 1 },
      {
        duration: this.impactDuration,
        easing: EASINGS.outQuad,
        onUpdate: (progress) => this.applyImpact(progress),
      },
    );
  }

  /** 结束入场：符文落到待机态（补间正常跑完与被动作抢跑两条路径共用）。 */
  private finishEntrance(): void {
    this.entrance = null;
    this.vortex.reset();
    this.applyEntrance(1);
    this._phase = 'ready';
  }

  /** 入场进度的投影：灵气光旋粒子推进 + 天元符文展开。 */
  private applyEntrance(progress: number): void {
    this.vortex.progress = progress;
    // 天元符文在气旋凝聚后展开 (0.45 ~ 1.0)
    const runeP = Math.max(0, (progress - 0.45) / 0.55);
    this.rune.alpha = Math.min(1, runeP * 1.8);
    const scale = 0.2 + 0.8 * easeOutBack(runeP);
    this.rune.scaleX = scale;
    this.rune.scaleY = scale;
  }

  /** 命中进度的投影：波纹半径 + 符文被吸收。 */
  private applyImpact(progress: number): void {
    this.ripple.visible = true;
    this.ripple.progress = progress;
    this.ripple.radius = IMPACT_MAX_RADIUS * progress;
    this.ripple.alpha = 1 - progress;
    this.rune.alpha = this.actionType === ActionType.PASS ? 0 : 1 - progress;
    const scale = (this.actionType === null ? 1 : 0.62) * (1 - ABSORB_SHRINK * progress);
    this.rune.scaleX = scale;
    this.rune.scaleY = scale;
  }
}

/** 符文节点：两仪光晕 + 复用 `pixel-art` 的天干符文绘制（坐标为节点原点）。 */
class RuneNode extends Node {
  public tianGan: TianGanInfo | null = null;
  public haloStyle: RuneHaloStyle = 'corona';
  public tick = 0;
  public actionType: ActionType | null = null;
  public progress = 0;
  public owner: PlayerId | null = null;
  public radius = 25;

  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    if (this.tianGan === null) return;
    drawCenterTianGanRune(ctx, 0, 0, this.tianGan, this.tick, this.radius);
  }
}

/** A single quiet target pulse: no extra aura, rays or action particles. */
class ImpactNode extends Node {
  public radius = 0;
  public showImpact = true;
  public maxRadius = IMPACT_MAX_RADIUS;
  public lightColor = '#ffffff';
  public actionType: ActionType | null = null;
  public progress = 0;
  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    if (this.radius <= 0 || this.actionType === ActionType.PASS || !this.showImpact) return;
    ctx.strokeStyle = this.lightColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 5 + this.progress * 11, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function easeOutBack(x: number): number {
  if (x >= 1) return 1;
  if (x <= 0) return 0;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export interface QiParticle {
  element: WuXing;
  lightColor: string;
  startX: number;
  startY: number;
  startAngle: number;
  startDist: number;
  progressOffset: number;
  speedMult: number;
  spreadAngle: number;
  size: number;
  opacity: number;
}

export interface QiSourceInfo {
  x: number;
  y: number;
  element: WuXing;
  sealSize: number;
}

/** 灵气光旋节点：在天干降临前，从行动方五行主印释放灵气光尘，呈正/反向旋涡汇向中心。 */
export class QiVortexNode extends Node {
  public progress = 0;
  public owner: PlayerId = 'P1';
  public targetElement: WuXing = WuXing.WOOD;
  public centerX = 0;
  public centerY = 0;
  public particles: QiParticle[] = [];
  public sources: QiSourceInfo[] = [];

  /** 初始化粒子群（每主印 14 颗，共 70 颗）与发射源坐标。 */
  public setup(
    board: BoardView,
    owner: PlayerId,
    targetElement: WuXing,
    centerX: number,
    centerY: number,
  ): void {
    this.owner = owner;
    this.targetElement = targetElement;
    this.centerX = centerX;
    this.centerY = centerY;
    this.progress = 0;
    this.visible = true;

    // 过滤出当前行动方的 5 个五行主印
    const matched = board.elements.filter((e) => e.player === owner);
    this.sources = matched.map((e) => ({
      x: e.x,
      y: e.y,
      element: e.element,
      sealSize: e.sealSize,
    }));

    // 初始化粒子群（对齐 prototype 的 18 颗/主印、宽散布、自然有机流场）
    this.particles = [];
    const countPerElement = 18;
    for (let i = 0; i < matched.length; i++) {
      const src = matched[i];
      const palette = WUXING_PALETTE[src.element];
      const startAngle = src.angle;
      const startDist = Math.hypot(src.x - centerX, src.y - centerY);

      for (let k = 0; k < countPerElement; k++) {
        this.particles.push({
          element: src.element,
          lightColor: palette.light,
          startX: src.x,
          startY: src.y,
          startAngle,
          startDist,
          progressOffset: (k / countPerElement) * 0.35 + (Math.random() - 0.5) * 0.1,
          speedMult: 0.8 + Math.random() * 0.4,
          spreadAngle: (Math.random() - 0.5) * 0.8,
          size: 1.2 + Math.random() * 1.8,
          opacity: 0.5 + Math.random() * 0.4,
        });
      }
    }
  }

  public reset(): void {
    this.visible = false;
    this.progress = 0;
    this.particles = [];
    this.sources = [];
  }

  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    if (!this.visible || this.progress <= 0 || this.progress >= 1) return;
    const t = this.progress;
    const isP1 = this.owner === 'P1';
    const curlDir = isP1 ? 1 : -1;

    // 1. 起点主印柔光闪烁（对齐 prototype 的柔和呼吸光晕，去除空心气泡圈）
    if (t < 0.5) {
      const glow = Math.sin((t / 0.5) * Math.PI);
      for (let i = 0; i < this.sources.length; i++) {
        const src = this.sources[i];
        const palette = WUXING_PALETTE[src.element];
        ctx.save();
        ctx.fillStyle = palette.light;
        ctx.globalAlpha = glow * 0.38;
        ctx.beginPath();
        ctx.arc(src.x, src.y, src.sealSize * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 2. 灵气微粒向心旋涡流场（短尾彗星火花流，彻底消除气泡球感）
    if (t < 0.75) {
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const rawP = t / 0.6 - p.progressOffset;
        if (rawP <= 0 || rawP >= 1) continue;

        const progress = rawP * rawP * p.speedMult;
        if (progress >= 1) continue;

        const curAngle =
          p.startAngle + progress * Math.PI * 1.1 * curlDir + p.spreadAngle * (1 - progress);
        const curDist = p.startDist * (1 - progress);

        const px = this.centerX + curDist * Math.cos(curAngle);
        const py = this.centerY + curDist * Math.sin(curAngle);
        const alpha = p.opacity * Math.sin(rawP * Math.PI);

        // 彗星短尾
        const tailP = Math.max(0, rawP - 0.05);
        const tailProgress = tailP * tailP * p.speedMult;
        const tailAngle =
          p.startAngle +
          tailProgress * Math.PI * 1.1 * curlDir +
          p.spreadAngle * (1 - tailProgress);
        const tailDist = p.startDist * (1 - tailProgress);
        const tx = this.centerX + tailDist * Math.cos(tailAngle);
        const ty = this.centerY + tailDist * Math.sin(tailAngle);

        ctx.save();
        ctx.strokeStyle = p.lightColor;
        ctx.fillStyle = p.lightColor;
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(px, py);
        ctx.stroke();

        // 头部微亮光核
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha * 0.9));
        ctx.beginPath();
        ctx.arc(px, py, p.size * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 3. 中心天元气旋凝核 (0.4 ~ 0.7)
    if (t >= 0.4 && t <= 0.7) {
      const vortexP = (t - 0.4) / 0.3;
      const targetPalette = WUXING_PALETTE[this.targetElement];
      ctx.save();
      ctx.translate(this.centerX, this.centerY);
      ctx.rotate(t * 12 * curlDir);
      ctx.strokeStyle = targetPalette.main;
      ctx.lineWidth = 2;
      ctx.globalAlpha = (1 - vortexP) * 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, 22 * (1 - vortexP)), 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.restore();
    }
  }
}

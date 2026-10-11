/**
 * 天干飞行动效视图（Layer 3）：中央天干符文的入场浮空、飞向目标五行节点与命中波纹。
 *
 * 三个阶段由独立的补间管线驱动，时钟由调用方每帧传入 `update(dt)`（秒）：
 * 1. 入场：`playEntrance()` 让符文在屏幕中央浮空降临（阳用金乌日冕、阴用玄阴幽光）；
 * 2. 飞行：`flyTo()` 从当前符文位置沿轨迹飞向目标槽位（阳走刚健流星弧线、阴走灵蛇蜿蜒曲线）；
 * 3. 命中：抵达时触发波纹扩散并让符文被吸收，**整段动效结束后**才回调 `onComplete`，
 *    调用方据此把回合控制权交回（`isAnimating` 为 false）。
 *
 * 目标坐标的唯一来源是 `BoardView.getSlot(element, polarity)` 的投影（不在这里重算法盘几何），
 * 因此本视图与 `BoardView` 必须挂在同一父节点下、且两者之间没有额外位移。
 * 数据流与投影契约见 `docs/LLD.md` §4，模块职责见 `docs/HLD.md` §2 Layer 3。
 */

import { Polarity, TianGanInfo, WuXing } from '../../core/types/domain.js';
import { BoardView } from './board-view.js';
import { drawCenterTianGanRune, drawImpactEffect, WUXING_PALETTE } from '../pixel-art.js';
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
  /** 入场动效时长（秒），默认 0.44。 */
  readonly entranceDuration?: number;
  /** 符文飞行动效时长（秒），默认 0.55。 */
  readonly flightDuration?: number;
  /** 命中波纹时长（秒），默认 0.35。 */
  readonly impactDuration?: number;
}

const DEFAULT_ENTRANCE_DURATION = 0.44;
const DEFAULT_FLIGHT_DURATION = 0.55;
const DEFAULT_IMPACT_DURATION = 0.35;

/** 入场起手的缩放（由 0.55 放大到 1）。 */
const ENTRANCE_START_SCALE = 0.55;

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

/* 光晕配色（仅本视图使用，不进共享主题模块）。 */
const CORONA_COLOR = '#f6e05e';
const CORONA_RAY_COUNT = 12;
const CORONA_RADIUS = 54;
const MOONLIGHT_COLOR = '#c3dafe';
const MOON_RADIUS = 48;

export class RuneFlightView extends Container {
  private readonly board: BoardView;
  private readonly centerX: number;
  private readonly centerY: number;
  private readonly entranceDuration: number;
  private readonly flightDuration: number;
  private readonly impactDuration: number;

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

  public constructor(options: RuneFlightViewOptions) {
    super();
    this.board = options.board;
    this.centerX = options.centerX ?? 0;
    this.centerY = options.centerY ?? 0;
    this.entranceDuration = options.entranceDuration ?? DEFAULT_ENTRANCE_DURATION;
    this.flightDuration = options.flightDuration ?? DEFAULT_FLIGHT_DURATION;
    this.impactDuration = options.impactDuration ?? DEFAULT_IMPACT_DURATION;
    this.rune = new RuneNode();
    this.rune.x = this.centerX;
    this.rune.y = this.centerY;
    this.rune.visible = false;
    this.addChild(this.rune);
    // 波纹是独立子节点：飞行的符文缩放进节点里，波纹得留在命中点扩散。
    this.ripple = new ImpactNode();
    this.ripple.visible = false;
    this.addChild(this.ripple);
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
  public playEntrance(tianGan: TianGanInfo, options: { onComplete?: () => void } = {}): void {
    // 新回合直接打断上一段未跑完的飞行动效：旧序列停步、旧回调作废（不再交回控制权）。
    this.flight = null;
    this.flightOnComplete = undefined;
    this._tianGan = tianGan;
    this._haloStyle = tianGan.polarity === Polarity.YANG ? 'corona' : 'moonlight';
    this.rune.tianGan = tianGan;
    this.rune.haloStyle = this._haloStyle;
    this.rune.x = this.centerX;
    this.rune.y = this.centerY;
    this.rune.alpha = 0;
    this.rune.scaleX = ENTRANCE_START_SCALE;
    this.rune.scaleY = ENTRANCE_START_SCALE;
    this.rune.visible = true;
    this.ripple.visible = false;
    this.entranceState.progress = 0;
    this.entranceOnComplete = options.onComplete;
    this._phase = 'entering';
    this.entrance = new Tween(
      this.entranceState,
      { progress: 1 },
      {
        duration: this.entranceDuration,
        easing: EASINGS.outCubic,
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
   * 动作选定：符文从当前位置飞向目标槽位（坐标取自 `BoardView.getSlot()`），
   * 命中后触发波纹并让符文被吸收。**波纹也跑完**才回调 `onComplete`，
   * 此时 `isAnimating` 为 false，调用方可以交回回合控制权。
   *
   * 入场还没跑完就调用时，先把入场收尾再起飞（玩家点得比动画快也不会丢飞行）；
   * 从未 `playEntrance()` 或已在飞行中则直接报错。
   */
  public flyTo(
    element: WuXing,
    polarity: Polarity,
    options: { onComplete?: () => void } = {},
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
    const target = this.board.getSlot(element, polarity);
    const startX = this.rune.x;
    const startY = this.rune.y;
    const deltaX = target.x - startX;
    const deltaY = target.y - startY;
    const length = Math.hypot(deltaX, deltaY) || 1;
    // 轨迹的法向：方向向量逆时针转 90°，用于叠加弧线/蜿蜒偏移。
    const normalX = -deltaY / length;
    const normalY = deltaX / length;
    const isYang = tianGan.polarity === Polarity.YANG;

    this.flightState.progress = 0;
    this._phase = 'flying';
    this.flightOnComplete = options.onComplete;
    const flightTween = new Tween(
      this.flightState,
      { progress: 1 },
      {
        duration: this.flightDuration,
        easing: EASINGS.outCubic,
        onUpdate: (progress) => {
          // 阳：刚健流星弧线（全程偏向一侧）；阴：灵蛇蜿蜒（来回摆动）。
          const curve = isYang
            ? -Math.sin(progress * Math.PI) * METEOR_ARC
            : Math.sin(progress * Math.PI * SERPENTINE_WAVES) * SERPENTINE_AMPLITUDE;
          this.rune.x = startX + deltaX * progress + normalX * curve;
          this.rune.y = startY + deltaY * progress + normalY * curve;
        },
        onComplete: () => {
          // 落点对齐法盘投影的坐标（不依赖浮点累加的巧合）。
          this.rune.x = target.x;
          this.rune.y = target.y;
          this._phase = 'impact';
        },
      },
    );
    this.flight = new TweenSequence(
      [flightTween, this.buildImpactTween(target.x, target.y, tianGan.element)],
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
    this.ripple.visible = true;
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
    this.applyEntrance(1);
    this._phase = 'ready';
  }

  /** 入场进度的投影：透明度与缩放。 */
  private applyEntrance(progress: number): void {
    this.rune.alpha = progress;
    const scale = ENTRANCE_START_SCALE + (1 - ENTRANCE_START_SCALE) * progress;
    this.rune.scaleX = scale;
    this.rune.scaleY = scale;
  }

  /** 命中进度的投影：波纹半径 + 符文被吸收。 */
  private applyImpact(progress: number): void {
    this.ripple.radius = IMPACT_MAX_RADIUS * progress;
    this.ripple.alpha = 1 - progress;
    this.rune.alpha = 1 - progress;
    const scale = 1 - ABSORB_SHRINK * progress;
    this.rune.scaleX = scale;
    this.rune.scaleY = scale;
  }
}

/** 符文节点：两仪光晕 + 复用 `pixel-art` 的天干符文绘制（坐标为节点原点）。 */
class RuneNode extends Node {
  public tianGan: TianGanInfo | null = null;
  public haloStyle: RuneHaloStyle = 'corona';
  /** 动画帧计数，交给 `drawCenterTianGanRune` 驱动呼吸与旋转。 */
  public tick = 0;

  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    const tianGan = this.tianGan;
    if (tianGan === null) {
      return;
    }
    const palette = WUXING_PALETTE[tianGan.element];
    if (this.haloStyle === 'corona') {
      this.drawCorona(ctx, palette.light);
    } else {
      this.drawMoonlight(ctx, palette.light);
    }
    // 符文主体（天干文字、五行色彩、两仪外环）复用既有绘制例程，坐标归到节点原点。
    drawCenterTianGanRune(ctx, 0, 0, tianGan, this.tick);
  }

  /** 金乌日冕：暖金色放射日珥 + 随呼吸胀缩的光晕。 */
  private drawCorona(ctx: CanvasRenderingContext2D, elementLight: string): void {
    const radius = CORONA_RADIUS * (1 + Math.sin(this.tick * 0.08) * 0.06);
    const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, radius);
    grad.addColorStop(0, `${CORONA_COLOR}55`);
    grad.addColorStop(0.55, `${elementLight}33`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `${CORONA_COLOR}aa`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let index = 0; index < CORONA_RAY_COUNT; index += 1) {
      const angle = (index * Math.PI * 2) / CORONA_RAY_COUNT + this.tick * 0.01;
      ctx.moveTo(Math.cos(angle) * radius * 0.74, Math.sin(angle) * radius * 0.74);
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.stroke();
  }

  /** 玄阴幽光：冷月色光晕 + 缓转的弦月弧。 */
  private drawMoonlight(ctx: CanvasRenderingContext2D, elementLight: string): void {
    const radius = MOON_RADIUS * (1 + Math.sin(this.tick * 0.05) * 0.05);
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, radius);
    grad.addColorStop(0, `${MOONLIGHT_COLOR}44`);
    grad.addColorStop(0.6, `${elementLight}22`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    const phase = this.tick * 0.012;
    ctx.strokeStyle = `${MOONLIGHT_COLOR}cc`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.84, phase, phase + Math.PI * 0.9);
    ctx.stroke();
  }
}

/** 命中波纹节点：圆心在节点原点，复用 `pixel-art` 的冲击效果绘制。 */
class ImpactNode extends Node {
  public radius = 0;
  public maxRadius = IMPACT_MAX_RADIUS;
  public lightColor = '#ffffff';

  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    if (this.radius <= 0) {
      return;
    }
    drawImpactEffect(ctx, {
      x: 0,
      y: 0,
      radius: this.radius,
      maxRadius: this.maxRadius,
      lightColor: this.lightColor,
      // 绘制例程直接赋值 `globalAlpha`，这里把节点自身的淡出值传进去。
      alpha: this.alpha,
    });
  }
}

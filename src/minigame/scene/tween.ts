/**
 * 轻量声明式补间引擎（Layer 3）：按调用方给定的 `dt` 步进，把目标对象上的数值属性插值到终值。
 *
 * 时钟由调用方掌握：本模块**不**接触 `requestAnimationFrame` 或任何真实帧循环，
 * 每帧由主循环 / `GameScene` 调用 `update(dt)` 推进。动画因此完全确定性、可在测试里用模拟时钟复现。
 *
 * 契约归 `docs/HLD.md` §2 Layer 3 与 ADR 0005。
 */

/** 缓动曲线：把线性进度 `t`（0~1）映射成插值比例。 */
export type Easing = (t: number) => number;

/** 内置缓动曲线表：把线性进度换算成插值比例。 */
export const EASINGS = {
  /** 线性：进度即比例。 */
  linear: (t: number) => t,
  /** 先快后慢（二次）。 */
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  /** 先快后慢（三次）：入场与飞行的默认手感。 */
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  /** 两头慢、中间快（二次）。 */
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
} as const satisfies Record<string, Easing>;

/** 被补间的属性集合：只允许数值字段。 */
export type NumericProps<T> = { [K in keyof T]?: number };

export interface TweenOptions {
  /** 补间时长（秒）。 */
  readonly duration: number;
  /** 缓动曲线，默认线性。 */
  readonly easing?: Easing;
  /** 每次步进后回调，参数是实际用于插值的（已缓动的）进度。 */
  readonly onUpdate?: (progress: number) => void;
  /** 抵达终值时回调，整条补间只会触发一次。 */
  readonly onComplete?: () => void;
}

export class Tween<T extends object = object> {
  private readonly target: T;
  /** 补间开始（构造）时的起点值：插值始终相对它计算，多次步进不会累积漂移。 */
  private readonly from = new Map<string, number>();
  private readonly to: NumericProps<T>;
  private readonly duration: number;
  private readonly easing: Easing;
  private readonly onUpdate?: (progress: number) => void;
  private readonly onComplete?: () => void;

  private elapsed = 0;
  private done = false;

  public constructor(target: T, to: NumericProps<T>, options: TweenOptions) {
    this.target = target;
    this.to = to;
    if (!(options.duration > 0)) {
      throw new Error(`补间时长必须是正数（秒），收到 ${options.duration}。`);
    }
    this.duration = options.duration;
    this.easing = options.easing ?? EASINGS.linear;
    this.onUpdate = options.onUpdate;
    this.onComplete = options.onComplete;
    const bag = target as Record<string, unknown>;
    for (const key of Object.keys(to)) {
      const start = bag[key];
      if (typeof start !== 'number') {
        throw new Error(`补间目标上没有数值属性 ${key}。`);
      }
      this.from.set(key, start);
    }
  }

  /** 补间是否还在推进（未完成）。 */
  public get isRunning(): boolean {
    return !this.done;
  }

  /** 补间是否已抵达终值。 */
  public get isComplete(): boolean {
    return this.done;
  }

  /** 距终值还差多少秒（已完成为 0）。序列据此把多余的 dt 结转给下一条。 */
  public get remaining(): number {
    return this.done ? 0 : this.duration - this.elapsed;
  }

  /** 用 `dt` 秒推进补间；超出时长的部分会被丢弃（不越过终值）。 */
  public update(dt: number): void {
    if (this.done) {
      return;
    }
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const progress = this.easing(this.elapsed / this.duration);
    this.apply(progress);
    this.onUpdate?.(progress);
    if (this.elapsed >= this.duration) {
      this.done = true;
      this.onComplete?.();
    }
  }

  private apply(progress: number): void {
    const bag = this.target as Record<string, number>;
    for (const [key, start] of this.from) {
      const end = this.to[key as keyof T];
      if (end === undefined) {
        continue;
      }
      bag[key] = start + (end - start) * progress;
    }
  }
}

/**
 * 补间序列：按数组顺序逐条播放，前一条结束后才开始下一条。
 * 一次 `update(dt)` 内跨过前一条终点时，剩余时间会结转给下一条，
 * 因此序列总时长恒等于各条时长之和，与调用方的步长无关。
 */
export class TweenSequence {
  private readonly tweens: readonly Tween<object>[];
  private readonly onComplete?: () => void;
  private index = 0;
  private done = false;

  public constructor(tweens: readonly Tween<object>[], onComplete?: () => void) {
    this.tweens = tweens;
    this.onComplete = onComplete;
  }

  /** 序列是否已跑完（空序列在第一次 `update` 时即算完成）。 */
  public get isComplete(): boolean {
    return this.done;
  }

  public get isRunning(): boolean {
    return !this.done;
  }

  /** 用 `dt` 秒推进：时间依次流过序列里的各条补间，多余的 dt 不会丢弃。 */
  public update(dt: number): void {
    let remaining = dt;
    while (!this.done) {
      const current = this.tweens[this.index];
      if (current === undefined) {
        this.done = true;
        this.onComplete?.();
        return;
      }
      if (current.isComplete) {
        this.index += 1;
        continue;
      }
      if (remaining <= 0) {
        return;
      }
      const step = Math.min(remaining, current.remaining);
      current.update(step);
      remaining -= step;
    }
  }
}

/**
 * 动作特效时间线引擎：事件按 `t` 排序触发；`advanceTimeline(dt)` 是表现层每帧的唯一入口。
 * hit-stop = 冻结整条时钟（冻结期只有目标显示层抖动，不推进运动学）；
 * 击退 = 目标弹簧回位；震屏 = 正弦指数衰减。
 *
 * 引擎零魔法数字：一切数值经 `TimelineTuning` 与事件载荷传入；
 * 本模块不 import 任何 `params/` 文件（依赖方向单向）。
 */
import type { VfxEvent } from './events.js';

/** 引擎全部数值参数，由调用方（配方/场景）注入。 */
export interface TimelineTuning {
  /** 弹簧回拉系数（目标位移 → 加速度）。 */
  readonly springK: number;
  /** 阻尼底数：速度每秒乘以该值（pow(base, dt)）。 */
  readonly dampingBase: number;
  /** 震屏衰减底数：振幅每秒乘以该值。 */
  readonly shakeDecayBase: number;
  /** hit-stop 冻结期目标显示抖动幅度（像素）。 */
  readonly freezeJoltPx: number;
  /** 冻结抖动换向周期（秒）。 */
  readonly freezeJoltPeriod: number;
  /** 事件全部触发后，判定 done 前留给收尾的时间（秒，从最后事件时刻起）。 */
  readonly settleTime: number;
  /** 目标速度绝对值低于此视为回位完成。 */
  readonly minVelocity: number;
  /** 目标位移绝对值低于此视为回位完成（防止在弹簧折返点误判 done）。 */
  readonly settleDistance: number;
}

/** 目标运动学状态。`shake` 是显示层抖动偏移，不污染运动学（x/y/vx/vy）。 */
export interface TargetKinematics {
  x: number;
  y: number;
  vx: number;
  vy: number;
  shake: number;
}

export interface ShakeState {
  amp: number;
  t: number;
}

export interface TimelineState {
  readonly events: readonly VfxEvent[];
  readonly tuning: TimelineTuning;
  time: number;
  stopLeft: number;
  cursor: number;
  done: boolean;
  readonly target: TargetKinematics;
  readonly shake: ShakeState;
}

/** 创建时间线。事件表在此排序一次，之后只读。 */
export function createTimeline(events: readonly VfxEvent[], tuning: TimelineTuning): TimelineState {
  return {
    events: events.slice().sort((a, b) => a.t - b.t),
    tuning,
    time: 0,
    stopLeft: 0,
    cursor: 0,
    done: false,
    target: { x: 0, y: 0, vx: 0, vy: 0, shake: 0 },
    shake: { amp: 0, t: 0 },
  };
}

/**
 * 单点推进。返回本帧触发的事件（调用方据此派生原语绘制）。
 * 传入 dt <= 0 或已 done 时不动作。
 */
export function advanceTimeline(state: TimelineState, dt: number): readonly VfxEvent[] {
  if (state.done || dt <= 0) return [];
  const tuning = state.tuning;

  // hit-stop：时钟冻结，只让目标小幅抖动。
  // 冻结耗尽时把剩余 dt 还给时钟（否则浮点残差会让 stopLeft 永远 > 0）。
  if (state.stopLeft > 0) {
    const frozen = Math.min(dt, state.stopLeft);
    state.stopLeft -= frozen;
    dt -= frozen;
    // [ported from combat-vfx-demo: vfx/combo_stage.gd — PolyForm Noncommercial, 商用前需重写]
    // advance() hit-stop 分支：目标位置不动，只加 ±joltPx 显示抖动，每 freezeJoltPeriod 换向
    state.target.shake =
      Math.floor(Math.max(state.stopLeft, 0) / tuning.freezeJoltPeriod) % 2 === 0
        ? tuning.freezeJoltPx
        : -tuning.freezeJoltPx;
    if (dt <= 0) return [];
  }
  state.target.shake = 0;
  state.time += dt;

  // 到点触发事件；本帧触发的事件返回给调用方（原语绘制挂这里）
  const fired: VfxEvent[] = [];
  while (state.cursor < state.events.length && state.events[state.cursor].t <= state.time) {
    const event = state.events[state.cursor++];
    applyEvent(state, event);
    fired.push(event);
    // 事件引入的 hit-stop 立即生效：本帧不再触发后续事件，时钟下帧起冻结
    if (state.stopLeft > 0) break;
  }

  // 目标运动学：击退 + 弹簧回位（带回弹）
  const tg = state.target;
  tg.vx += -tg.x * tuning.springK * dt;
  tg.vx *= Math.pow(tuning.dampingBase, dt);
  tg.x += tg.vx * dt;

  // 震屏指数衰减
  state.shake.amp *= Math.pow(tuning.shakeDecayBase, dt);
  state.shake.t += dt;

  const lastT = state.events.length > 0 ? state.events[state.events.length - 1].t : 0;
  if (
    state.cursor >= state.events.length &&
    Math.abs(tg.vx) < tuning.minVelocity &&
    Math.abs(tg.x) < tuning.settleDistance &&
    state.time > lastT + tuning.settleTime
  ) {
    state.done = true;
  }
  return fired;
}

/** 引擎只消费事件的运动学字段；视觉字段（angle/heavy/travel…）透传给原语层。 */
function applyEvent(state: TimelineState, event: VfxEvent): void {
  switch (event.do) {
    case 'slash':
    case 'hit':
      state.stopLeft = event.stop;
      state.target.vx += event.push;
      state.shake.amp = Math.max(state.shake.amp, event.shake);
      break;
    case 'move':
    case 'cast':
    case 'bolt':
      break;
  }
}

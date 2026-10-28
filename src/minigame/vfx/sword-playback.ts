import type { MoveEvent } from './engine/events.js';
import {
  advanceTimeline,
  createTimeline,
  type TimelineState,
  type TimelineTuning,
} from './engine/timeline.js';
import { validateRecipe } from './engine/validate.js';
import { COMBAT_PLAYBACK, SWORD_LIMITS, SWORD_TUNING } from './params/sword.js';
import type { SwordEffect, SwordRecipe } from './primitives/sword.js';

/**
 * 表现层播放器。move.dx 是相对累计位移（原型像素），由本层插值，引擎不消费 move。
 * effects 和 move 共用未冻结的时钟；timeline.done 只结束引擎，不能截断存活特效。
 * advance 不读墙钟、不写核心状态。调用方把原型坐标缩放/旋转到实际角色与目标之间。
 */
export class CombatPlayback {
  public readonly timeline: TimelineState;
  public readonly effects: SwordEffect[] = [];
  public attackerX = 0;
  public hits = 0;
  public flash = 0;
  public readonly spells: {
    kind: 'charge' | 'bolt' | 'burst';
    age: number;
    life: number;
    heavy: boolean;
  }[] = [];
  private destination = 0;
  private move: { event: MoveEvent; from: number; to: number; age: number } | null = null;

  public constructor(
    public readonly recipe: SwordRecipe,
    tuning: TimelineTuning = SWORD_TUNING,
  ) {
    const errors = validateRecipe(recipe, SWORD_LIMITS);
    if (errors.length > 0) throw new Error(errors.join('\n'));
    this.timeline = createTimeline(recipe.events, tuning);
  }

  public get done(): boolean {
    return (
      this.timeline.done &&
      this.effects.length === 0 &&
      this.spells.length === 0 &&
      this.move === null
    );
  }

  public advance(dt: number): void {
    if (dt <= 0 || !Number.isFinite(dt) || this.done) return;
    // 每个子步只到下一个事件，避免大 dt 把新生特效直接老化到消失。
    // 子步上限同时保证弹簧在后台恢复/测试大 dt 下稳定。
    while (dt > 0 && !this.done) {
      let step = Math.min(dt, 1 / 120);
      const state = this.timeline;
      const next = state.events[state.cursor];
      if (state.stopLeft > 0) step = Math.min(step, state.stopLeft);
      else if (next !== undefined && next.t > state.time)
        step = Math.min(step, next.t - state.time);
      const wasDone = state.done;
      const before = state.time;
      const events = advanceTimeline(state, step);
      const active = wasDone ? step : Math.max(0, state.time - before);
      this.age(active);
      for (const event of events) {
        if (event.do === 'move') {
          this.move = { event, from: this.attackerX, to: this.destination + event.dx, age: 0 };
          this.destination += event.dx;
        } else if (event.do === 'cast' || event.do === 'bolt') {
          this.spells.push({
            kind: event.do === 'cast' ? 'charge' : 'bolt',
            age: 0,
            life: event.do === 'cast' ? event.hold : event.travel,
            heavy: false,
          });
        } else if (event.do === 'slash' || event.do === 'hit') {
          this.hits++;
          this.flash = 1;
          if (event.do === 'hit')
            this.spells.push({
              kind: 'burst',
              age: event.stop > 0 ? COMBAT_PLAYBACK.impactAge : 0,
              life: COMBAT_PLAYBACK.burstLife,
              heavy: event.heavy ?? false,
            });
          const style = event.heavy ? this.recipe.heavy : this.recipe.normal;
          const common = {
            age: event.stop > 0 ? style.impactAge : 0,
            angle: event.do === 'slash' ? event.angle : 0,
            hit: this.hits,
            style,
          };
          this.effects.push(
            ...(event.do === 'slash'
              ? [{ ...common, kind: 'blade' as const, life: style.bladeLife }]
              : []),
            { ...common, kind: 'star', life: style.starLife },
            { ...common, kind: 'debris', life: style.debrisLife },
          );
        }
      }
      dt = Math.max(0, dt - step);
    }
  }

  private age(dt: number): void {
    this.flash = Math.max(0, this.flash - dt * COMBAT_PLAYBACK.flashDecay);
    for (let i = this.spells.length - 1; i >= 0; i--) {
      this.spells[i].age += dt;
      if (this.spells[i].age >= this.spells[i].life) this.spells.splice(i, 1);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.age += dt;
      if (effect.age >= effect.life) this.effects.splice(i, 1);
    }
    const move = this.move;
    if (move === null) return;
    move.age += dt;
    const t = Math.min(1, move.age / move.event.duration);
    const eased =
      move.event.ease === 'out'
        ? 1 - (1 - t) ** 2
        : move.event.ease === 'in'
          ? t * t
          : t * t * (3 - 2 * t);
    this.attackerX = move.from + (move.to - move.from) * eased;
    if (t >= 1) {
      this.attackerX = move.to;
      this.move = null;
    }
  }
}

/** Compatibility for the original sword playback consumers. */
export { CombatPlayback as SwordPlayback };

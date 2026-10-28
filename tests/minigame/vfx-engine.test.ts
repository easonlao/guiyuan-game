import { describe, expect, it } from 'vitest';
import type { ActionRecipe, VfxEvent } from '../../src/minigame/vfx/engine/events.js';
import {
  advanceTimeline,
  createTimeline,
  type TimelineTuning,
} from '../../src/minigame/vfx/engine/timeline.js';
import { validateRecipe } from '../../src/minigame/vfx/engine/validate.js';

// 测试用调参：数值任意可取，重点是行为关系（冻结停钟、弹簧收敛），不是复刻某个具体手感。
const TUNING: TimelineTuning = {
  springK: 55,
  dampingBase: 0.02,
  shakeDecayBase: 0.0005,
  freezeJoltPx: 3,
  freezeJoltPeriod: 0.02,
  settleTime: 0.6,
  minVelocity: 1,
  settleDistance: 1,
};

const RAMP = ['#ffffff', '#ffcc66', '#cc6622', '#331100'] as const;

function recipe(events: readonly VfxEvent[]): ActionRecipe {
  return { name: 'test', material: { ramp: RAMP }, events };
}

function runUntilDone(events: readonly VfxEvent[], maxSteps = 600) {
  const state = createTimeline(events, TUNING);
  const fired: VfxEvent[] = [];
  for (let i = 0; i < maxSteps && !state.done; i++) {
    fired.push(...advanceTimeline(state, 1 / 60));
  }
  return { state, fired };
}

describe('advanceTimeline', () => {
  it('事件按 t 升序触发，与传入顺序无关', () => {
    const events: VfxEvent[] = [
      { t: 0.5, do: 'move', dx: -220, duration: 0.26 },
      { t: 0.0, do: 'move', dx: 220, duration: 0.14 },
      { t: 0.14, do: 'slash', stop: 0, push: 240, shake: 7, angle: -0.3 },
    ];
    const { fired } = runUntilDone(events);
    expect(fired.map((e) => e.do)).toEqual(['move', 'slash', 'move']);
    expect(fired.map((e) => e.t)).toEqual([0, 0.14, 0.5]);
  });

  it('hit-stop 冻结整条时钟：冻结期间 advance 不推进 time，也不触发后续事件', () => {
    const state = createTimeline(
      [
        { t: 0, do: 'slash', stop: 0.1, push: 100, shake: 5, angle: 0 },
        { t: 0.05, do: 'move', dx: 10, duration: 0.1 },
      ],
      TUNING,
    );
    advanceTimeline(state, 0.01); // 触发 slash，进入冻结
    expect(state.stopLeft).toBeGreaterThan(0);
    advanceTimeline(state, 0.04); // 冻结中
    expect(state.time).toBeCloseTo(0.01, 10);
    expect(state.cursor).toBe(1); // t=0.05 的事件不得在冻结期触发
    // 冻结耗尽后恢复推进（stopLeft 允许浮点残差量级）
    advanceTimeline(state, 0.06);
    expect(state.stopLeft).toBeLessThan(1e-9);
    advanceTimeline(state, 0.05);
    expect(state.cursor).toBe(2);
  });

  it('冻结抖动只动显示层：target.shake 在 ±joltPx 间换向，target.x 不动', () => {
    const state = createTimeline([{ t: 0, do: 'hit', stop: 0.09, push: 200, shake: 4 }], TUNING);
    advanceTimeline(state, 0.001); // 触发 hit
    const xAtFreeze = state.target.x;
    const shakes: number[] = [];
    for (let i = 0; i < 5; i++) {
      advanceTimeline(state, 0.015);
      shakes.push(state.target.shake);
      expect(state.target.x).toBe(xAtFreeze);
    }
    for (const s of shakes) {
      expect(Math.abs(s)).toBe(TUNING.freezeJoltPx);
    }
    expect(new Set(shakes.map(Math.sign)).size).toBe(2); // 换向发生过
  });

  it('击退后弹簧回位收敛，时间线最终 done', () => {
    const { state, fired } = runUntilDone([{ t: 0, do: 'hit', stop: 0, push: 300, shake: 8 }]);
    expect(fired).toHaveLength(1);
    expect(state.done).toBe(true);
    expect(Math.abs(state.target.x)).toBeLessThan(1);
    expect(Math.abs(state.target.vx)).toBeLessThan(TUNING.minVelocity);
  });

  it('冻结结束后震屏振幅按指数衰减', () => {
    const state = createTimeline(
      [{ t: 0, do: 'slash', stop: 0, push: 0, shake: 10, angle: 0 }],
      TUNING,
    );
    advanceTimeline(state, 0.01);
    const amp0 = state.shake.amp;
    advanceTimeline(state, 0.5);
    expect(state.shake.amp).toBeLessThan(amp0);
    expect(state.shake.amp).toBeGreaterThan(0);
  });
});

describe('validateRecipe', () => {
  const LIMITS = { maxStop: 0.3, rampLength: 4 };

  it('合法配方无错误', () => {
    const ok = recipe([
      { t: 0, do: 'cast', hold: 0.25 },
      { t: 0.25, do: 'bolt', travel: 0.28 },
      { t: 0.53, do: 'hit', stop: 0.08, push: 200, shake: 8 },
    ]);
    expect(validateRecipe(ok, LIMITS)).toEqual([]);
  });

  it('故意写错的配方逐条报错', () => {
    const bad: ActionRecipe = {
      name: 'bad',
      material: { ramp: ['#fff', '#000'] }, // ramp 不完整
      events: [
        { t: -0.1, do: 'cast', hold: 0.2 }, // 负时间
        { t: 0.2, do: 'hit', stop: 0.5, push: 1, shake: 1 }, // stop 超上限
        { t: 0.1, do: 'move', dx: 1, duration: 0.1 }, // 时间倒退
        { t: 0.3, do: 'nova' } as unknown as VfxEvent, // 未知事件类型
      ],
    };
    const errors = validateRecipe(bad, LIMITS);
    expect(errors.some((e) => e.includes('负'))).toBe(true);
    expect(errors.some((e) => e.includes('递增'))).toBe(true);
    expect(errors.some((e) => e.includes('stop'))).toBe(true);
    expect(errors.some((e) => e.includes('未知事件类型'))).toBe(true);
    expect(errors.some((e) => e.includes('ramp'))).toBe(true);
  });
});

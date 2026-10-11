import { describe, it, expect } from 'vitest';
import { EASINGS, Tween, TweenSequence } from '../../src/minigame/scene/tween.js';

describe('Minigame Tween: 属性插值', () => {
  it('按调用方步进的 dt 线性插值，累计到 duration 时落在目标值', () => {
    const state = { x: 0 };
    const tween = new Tween(state, { x: 100 }, { duration: 1 });

    tween.update(0.25);
    expect(state.x).toBe(25);

    tween.update(0.5);
    expect(state.x).toBe(75);

    tween.update(0.25);
    expect(state.x).toBe(100);
  });
});

describe('Minigame Tween: 缓动曲线', () => {
  it('outCubic / outQuad / inOutQuad 在关键点上给出手算值', () => {
    // outCubic(t) = 1 - (1-t)^3
    expect(EASINGS.outCubic(0.5)).toBeCloseTo(0.875, 12);
    expect(EASINGS.outCubic(0.25)).toBeCloseTo(0.578125, 12);
    // outQuad(t) = 1 - (1-t)^2
    expect(EASINGS.outQuad(0.5)).toBeCloseTo(0.75, 12);
    // inOutQuad: t < 0.5 ? 2t^2 : 1 - (-2t+2)^2 / 2
    expect(EASINGS.inOutQuad(0.25)).toBeCloseTo(0.125, 12);
    expect(EASINGS.inOutQuad(0.5)).toBeCloseTo(0.5, 12);
    expect(EASINGS.inOutQuad(0.75)).toBeCloseTo(0.875, 12);
  });

  it('每条曲线都固定住两端：0 映射到 0、1 映射到 1', () => {
    for (const easing of Object.values(EASINGS)) {
      expect(easing(0)).toBe(0);
      expect(easing(1)).toBe(1);
    }
  });

  it('补间用所选曲线换算插值比例', () => {
    const state = { x: 0 };
    const tween = new Tween(state, { x: 100 }, { duration: 1, easing: EASINGS.outCubic });

    tween.update(0.5);
    expect(state.x).toBeCloseTo(87.5, 9);

    tween.update(0.5);
    expect(state.x).toBe(100);
  });
});

describe('Minigame Tween: 完成与回调', () => {
  it('onComplete 在恰好抵达终值时才触发，且只会触发一次', () => {
    const state = { x: 0 };
    const events: string[] = [];
    const tween = new Tween(
      state,
      { x: 1 },
      {
        duration: 0.2,
        onUpdate: (progress) => events.push(`update:${progress}`),
        onComplete: () => events.push('complete'),
      },
    );

    tween.update(0.1);
    expect(events).toEqual(['update:0.5']);
    expect(tween.isRunning).toBe(true);
    expect(tween.isComplete).toBe(false);

    tween.update(0.1);
    expect(events).toEqual(['update:0.5', 'update:1', 'complete']);
    expect(tween.isRunning).toBe(false);
    expect(tween.isComplete).toBe(true);

    // 结束后再步进：状态不再变化，回调也不再重复。
    tween.update(5);
    expect(events).toEqual(['update:0.5', 'update:1', 'complete']);
    expect(state.x).toBe(1);
  });

  it('非正数时长直接报错，不会静默写出 NaN', () => {
    expect(() => new Tween({ x: 0 }, { x: 1 }, { duration: 0 })).toThrow();
    expect(() => new Tween({ x: 0 }, { x: 1 }, { duration: -1 })).toThrow();
  });

  it('单次步进跨过时长时停在终值，不越界', () => {
    const state = { x: 0 };
    const tween = new Tween(state, { x: 100 }, { duration: 0.5 });

    tween.update(5);

    expect(state.x).toBe(100);
    expect(tween.isComplete).toBe(true);
  });
});

describe('Minigame Tween: 序列', () => {
  it('按顺序逐条播放，并把当前步进多余的 dt 结转给下一条', () => {
    const state = { a: 0, b: 0 };
    const sequence = new TweenSequence([
      new Tween(state, { a: 10 }, { duration: 0.5 }),
      new Tween(state, { b: 20 }, { duration: 0.5 }),
    ]);

    sequence.update(0.25);
    expect(state).toEqual({ a: 5, b: 0 });

    // 0.75s 跨过第一条的终点，剩下的 0.25s 直接推进第二条。
    sequence.update(0.5);
    expect(state).toEqual({ a: 10, b: 10 });
    expect(sequence.isComplete).toBe(false);

    sequence.update(0.25);
    expect(state).toEqual({ a: 10, b: 20 });
    expect(sequence.isComplete).toBe(true);
  });

  it('onComplete 在最后一条结束时才触发，且只触发一次', () => {
    const state = { a: 0, b: 0 };
    let completions = 0;
    const sequence = new TweenSequence(
      [
        new Tween(state, { a: 10 }, { duration: 0.5 }),
        new Tween(state, { b: 20 }, { duration: 0.5 }),
      ],
      () => {
        completions += 1;
      },
    );

    sequence.update(0.5);
    expect(completions).toBe(0);

    sequence.update(0.5);
    expect(completions).toBe(1);

    sequence.update(1);
    expect(completions).toBe(1);
    expect(state).toEqual({ a: 10, b: 20 });
  });
});

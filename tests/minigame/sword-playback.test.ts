import { describe, expect, it } from 'vitest';
import { SwordPlayback } from '../../src/minigame/vfx/sword-playback.js';
import { SWORD_SINGLE, SWORD_TRIPLE, SWORD_TUNING } from '../../src/minigame/vfx/params/sword.js';

import { drawCrescent, drawStar, drawDebris } from '../../src/minigame/vfx/primitives/sword.js';
import { RecordingContext } from '../core/helpers/recording-context.js';
import { MAGIC_SINGLE, MAGIC_TRIPLE, MAGIC_DISPLAY } from '../../src/minigame/vfx/params/magic.js';
import { drawMagic } from '../../src/minigame/vfx/primitives/magic.js';

describe('剑术播放器的表现时钟', () => {
  it.each([
    [MAGIC_SINGLE, 1],
    [MAGIC_TRIPLE, 3],
  ] as const)('法术命中冻结 burst 几何和闪色，结束后清空', (recipe, hits) => {
    const playback = new SwordPlayback(recipe);
    for (let i = 0; i < 900 && playback.hits < hits; i++) playback.advance(1 / 120);
    expect(playback.hits).toBe(hits);
    expect(playback.attackerX).toBe(0);
    const render = () => {
      const ctx = new RecordingContext();
      for (const spell of playback.spells)
        drawMagic(ctx.asContext(), spell, recipe.material, MAGIC_DISPLAY);
      return { paths: ctx.paths, arcs: ctx.arcs };
    };
    const before = render();
    expect(before.paths.length).toBeGreaterThan(0);
    const flash = playback.flash;
    playback.advance(0.02);
    expect(render()).toEqual(before);
    expect(playback.flash).toBe(flash);
    playback.advance(10);
    expect(playback.done).toBe(true);
    expect(playback.spells).toEqual([]);
  });
  it.each([SWORD_SINGLE, SWORD_TRIPLE])(
    '$name 每次命中冻结时画出刀光、射线和碎屑，冻结不推进几何与位移',
    (recipe) => {
      const playback = new SwordPlayback(recipe);
      const hitCount = recipe.events.filter((event) => event.do === 'slash').length;
      for (let hit = 1; hit <= hitCount; hit++) {
        while (playback.hits < hit) playback.advance(1 / 120);
        const render = () =>
          playback.effects.slice(-3).map((effect) => {
            const ctx = new RecordingContext();
            const draw =
              effect.kind === 'blade'
                ? drawCrescent
                : effect.kind === 'star'
                  ? drawStar
                  : drawDebris;
            draw(ctx.asContext(), effect, recipe.material);
            return ctx.paths.filter((path) => path.points.length > 0);
          });
        const before = render();
        const [blade, star, debris] = before;
        const area = (points: { x: number; y: number }[]) =>
          Math.abs(
            points.reduce((sum, p, i) => {
              const next = points[(i + 1) % points.length];
              return sum + p.x * next.y - next.x * p.y;
            }, 0),
          ) / 2;
        expect(blade.some((path) => area(path.points) > 1)).toBe(true);
        expect(
          star.filter((path) => path.points.length === 3 && area(path.points) > 1),
        ).toHaveLength(playback.effects.at(-1)!.style.rays);
        expect(debris.length).toBeGreaterThan(0);
        expect(
          debris.every(
            (path) =>
              Math.hypot(path.points[1].x - path.points[0].x, path.points[1].y - path.points[0].y) >
              1,
          ),
        ).toBe(true);
        const x = playback.attackerX;
        expect(playback.timeline.stopLeft).toBeGreaterThan(0.02);
        playback.advance(0.02);
        expect(render()).toEqual(before);
        expect(playback.attackerX).toBe(x);
      }
    },
  );

  it('强破完成三个不同方向的命中并以重击收尾', () => {
    const playback = new SwordPlayback(SWORD_TRIPLE);
    for (let i = 0; i < 300 && playback.hits < 3; i++) playback.advance(1 / 120);
    expect(playback.hits).toBe(3);
    expect(playback.effects.find((effect) => effect.kind === 'blade')?.angle).toBe(-0.1);
    expect(playback.timeline.stopLeft).toBeGreaterThan(0.1);
    for (let i = 0; i < 900 && !playback.done; i++) playback.advance(1 / 120);
    expect(playback.done).toBe(true);
    expect(playback.attackerX).toBe(0);
  });

  it('进步后命中，冻结期间位移与特效寿命都不推进，随后收步回位', () => {
    const playback = new SwordPlayback(SWORD_SINGLE);
    playback.advance(0.07);
    expect(playback.attackerX).toBeGreaterThan(0);
    playback.advance(0.07);
    expect(playback.hits).toBe(1);
    const age = playback.effects.map((effect) => effect.age);
    const x = playback.attackerX;
    playback.advance(0.04);
    expect(playback.effects.map((effect) => effect.age)).toEqual(age);
    expect(playback.attackerX).toBe(x);
    for (let i = 0; i < 600 && !playback.done; i++) playback.advance(1 / 120);
    expect(playback.done).toBe(true);
    expect(playback.attackerX).toBe(0);
    expect(playback.effects).toHaveLength(0);
  });

  it('时间线 done 后，已产生的长寿命特效仍推进并自然结束', () => {
    const playback = new SwordPlayback(
      {
        ...SWORD_SINGLE,
        events: [{ t: 0, do: 'slash', stop: 0, push: 0, shake: 0, angle: 0 }],
        normal: { ...SWORD_SINGLE.normal, debrisLife: 2 },
      },
      { ...SWORD_TUNING, settleTime: 0 },
    );
    playback.advance(0.01);
    expect(playback.timeline.done).toBe(true);
    expect(playback.done).toBe(false);
    playback.advance(0.5);
    expect(playback.effects.some((effect) => effect.age >= 0.5)).toBe(true);
    playback.advance(2);
    expect(playback.done).toBe(true);
  });
});

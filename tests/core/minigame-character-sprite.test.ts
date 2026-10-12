import { describe, expect, it } from 'vitest';
import {
  CHARACTER_ATLAS_FRAMES,
  drawCharacterSprite,
} from '../../src/minigame/character-sprite.js';
import { CharacterActionState } from '../../src/minigame/types.js';
import { CharacterView } from '../../src/minigame/views/character-view.js';
import { RecordingContext } from './helpers/recording-context.js';

const image = {} as CanvasImageSource;
const atlas = { image, width: 800, height: 1200 };
const poses: readonly CharacterActionState[] = [
  'idle',
  'attack',
  'hurt',
  'cast',
  'celebrate',
  'win',
  'lose',
];

describe('Character sprite atlas', () => {
  it('selects seven poses per player in the occupied 4×4 cells', () => {
    for (const [column, pose] of poses.entries()) {
      for (const player of ['P1', 'P2'] as const) {
        const ctx = new RecordingContext();
        drawCharacterSprite(ctx.asContext(), atlas, player, pose, 0, 10, 54, 88, 112);
        const drawn = ctx.images[0];
        expect(drawn.image).toBe(image);
        const index = column + (player === 'P1' ? 0 : 7);
        expect(drawn.sx).toBe((index % 4) * 200);
        expect(drawn.sy).toBe(Math.floor(index / 4) * 300);
        expect(drawn.sw).toBe(200);
        expect(drawn.sh).toBe(300);
      }
    }
  });

  it('fits rectangular cells without stretching or clipping during breathing and jumping', () => {
    for (const dimensions of [
      { width: 1400, height: 600 },
      { width: 2100, height: 200 },
    ]) {
      for (const pose of poses) {
        for (const tick of [0, 12, 24, 39]) {
          const ctx = new RecordingContext();
          drawCharacterSprite(
            ctx.asContext(),
            { image, ...dimensions },
            'P1',
            pose,
            tick,
            10,
            54,
            88,
            112,
          );
          const drawn = ctx.images[0];
          expect(drawn.w / drawn.h).toBeCloseTo(drawn.sw / drawn.sh);
          expect(drawn.x).toBeGreaterThanOrEqual(10);
          expect(drawn.x + drawn.w).toBeLessThanOrEqual(98);
          expect(drawn.y).toBeGreaterThanOrEqual(54);
          expect(drawn.y + drawn.h).toBeLessThanOrEqual(166);
        }
      }
    }
  });

  it('uses explicit artwork crops and preserves their individual proportions', () => {
    const ctx = new RecordingContext();
    drawCharacterSprite(
      ctx.asContext(),
      {
        ...atlas,
        frames: { P1: { attack: { x: 208, y: 12, width: 182, height: 276 } } },
      },
      'P1',
      'attack',
      0,
      10,
      54,
      88,
      112,
    );
    const drawn = ctx.images[0];
    expect({ x: drawn.sx, y: drawn.sy, w: drawn.sw, h: drawn.sh }).toEqual({
      x: 208,
      y: 12,
      w: 182,
      h: 276,
    });
    expect(drawn.w / drawn.h).toBeCloseTo(182 / 276);
  });

  it('keeps a common body scale and ground line when sleeves make pose crops wider', () => {
    const characterAtlas = {
      ...atlas,
      frames: {
        P1: {
          idle: { x: 0, y: 0, width: 120, height: 300 },
          attack: { x: 200, y: 0, width: 300, height: 300 },
        },
      },
    };
    const ctx = new RecordingContext();
    drawCharacterSprite(ctx.asContext(), characterAtlas, 'P1', 'idle', 0, 10, 54, 88, 112);
    drawCharacterSprite(ctx.asContext(), characterAtlas, 'P1', 'attack', 0, 10, 54, 88, 112);
    const [idle, attack] = ctx.images;
    expect(idle.w / idle.sw).toBeCloseTo(attack.w / attack.sw);
    expect(idle.h).toBeCloseTo(attack.h);
    // Attack retains its deliberate two-pixel forward-stance lift.
    expect(idle.y + idle.h).toBeCloseTo(attack.y + attack.h + 2);
  });

  it('keeps every packaged-art crop inside the source and avatar frame across all poses', () => {
    const actualAtlas = { image, width: 1254, height: 1254, frames: CHARACTER_ATLAS_FRAMES };
    for (const player of ['P1', 'P2'] as const) {
      for (const pose of poses) {
        for (const tick of [0, 12, 24, 39]) {
          const ctx = new RecordingContext();
          drawCharacterSprite(ctx.asContext(), actualAtlas, player, pose, tick, 10, 54, 88, 112);
          const drawn = ctx.images[0];
          expect(drawn.sx).toBeGreaterThanOrEqual(0);
          expect(drawn.sy).toBeGreaterThanOrEqual(0);
          expect(drawn.sx + drawn.sw).toBeLessThanOrEqual(1254);
          expect(drawn.sy + drawn.sh).toBeLessThanOrEqual(1254);
          expect(drawn.x).toBeGreaterThanOrEqual(10);
          expect(drawn.x + drawn.w).toBeLessThanOrEqual(98);
          expect(drawn.y).toBeGreaterThanOrEqual(54);
          expect(drawn.y + drawn.h).toBeLessThanOrEqual(166);
        }
      }
    }
  });

  it('renders procedural fallback before loading, switches to both sprites and restores fallback after failure', () => {
    const view = new CharacterView({ width: 390, safeTop: 24 });
    const before = new RecordingContext();
    view.render(before.asContext());
    expect(before.images).toHaveLength(0);
    expect(before.calls).toContain('quadraticCurveTo');
    view.setSpriteAtlas(atlas);
    view.setExpression('P1', 'attack', 0);
    view.setExpression('P2', 'hurt', 0);
    const loaded = new RecordingContext();
    view.render(loaded.asContext());
    expect(loaded.images).toHaveLength(2);
    expect(loaded.images[0].sx).toBe(200);
    expect(loaded.images[1].sx).toBe(200);
    expect(loaded.images[1].sy).toBe(600);
    expect(loaded.calls).not.toContain('quadraticCurveTo');
    view.setSpriteAtlas(null);
    const failed = new RecordingContext();
    view.render(failed.asContext());
    expect(failed.images).toHaveLength(0);
    expect(failed.calls).toContain('quadraticCurveTo');
  });

  it('keeps the fallback when dimensions are not usable', () => {
    const view = new CharacterView({ width: 390 });
    view.setSpriteAtlas({ image, width: 0, height: 600 });
    const ctx = new RecordingContext();
    view.render(ctx.asContext());
    expect(ctx.images).toHaveLength(0);
  });
});

import type { SwordRecipe } from '../primitives/sword.js';
import { SWORD_SINGLE } from './sword.js';

/** Approved prototype cast / bolt / hit rhythms; full WuXing shapes belong to ticket 04. */
export const MAGIC_SINGLE: SwordRecipe = {
  ...SWORD_SINGLE,
  name: '符弹·单发',
  events: [
    { t: 0, do: 'cast', hold: 0.25 },
    { t: 0.25, do: 'bolt', travel: 0.28, ease: 'in' },
    { t: 0.53, do: 'hit', stop: 0.08, push: 200, shake: 8 },
  ],
};
export const MAGIC_TRIPLE: SwordRecipe = {
  ...MAGIC_SINGLE,
  name: '符弹·三连',
  events: [0, 1, 2].flatMap((i) => [
    { t: i * 0.45, do: 'cast' as const, hold: 0.18 },
    { t: 0.18 + i * 0.45, do: 'bolt' as const, travel: 0.24, ease: 'in' as const },
    {
      t: 0.42 + i * 0.45,
      do: 'hit' as const,
      stop: i === 2 ? 0.13 : 0.05,
      push: i === 2 ? 320 : 130,
      shake: i === 2 ? 11 : 5,
      heavy: i === 2,
    },
  ]),
};
export const MAGIC_DISPLAY = {
  burstLife: 0.35,
  duration: 0.12,
  tail: 0.2,
  radius: 120,
  heavyRadius: 170,
  width: 10,
  heavyWidth: 12,
  spikes: 8,
  spikeScale: 0.55,
  segments: 24,
  chargeRadius: 34,
  chargeShrink: 14,
  chargeWidth: 3,
  projectileRadius: 9,
  projectileCore: 5,
  trailCount: 3,
  trailGap: 11,
  palmX: 18,
  palmY: -22,
};

import { describe, it, expect } from 'vitest';
import { createPRNG, drawTianGan } from '../../src/core/utils/prng.js';
import { TIAN_GAN_LIST } from '../../src/core/types/domain.js';

describe('PRNG (Mulberry32)', () => {
  it('should generate identical sequences for the same seed', () => {
    const seed = 42;
    const rng1 = createPRNG(seed);
    const rng2 = createPRNG(seed);

    const seq1 = Array.from({ length: 20 }, () => rng1.next());
    const seq2 = Array.from({ length: 20 }, () => rng2.next());

    expect(seq1).toEqual(seq2);
  });

  it('should generate different sequences for different seeds', () => {
    const rng1 = createPRNG(1);
    const rng2 = createPRNG(2);

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    expect(seq1).not.toEqual(seq2);
  });

  it('nextInt should stay strictly within [min, max] inclusive', () => {
    const rng = createPRNG(100);
    const min = 0;
    const max = 9;

    for (let i = 0; i < 500; i++) {
      const val = rng.nextInt(min, max);
      expect(val).toBeGreaterThanOrEqual(min);
      expect(val).toBeLessThanOrEqual(max);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('drawTianGan should draw valid TianGanInfo deterministically', () => {
    const rng1 = createPRNG(999);
    const rng2 = createPRNG(999);

    const draws1 = Array.from({ length: 10 }, () => drawTianGan(rng1));
    const draws2 = Array.from({ length: 10 }, () => drawTianGan(rng2));

    expect(draws1).toEqual(draws2);
    for (const tg of draws1) {
      expect(TIAN_GAN_LIST).toContainEqual(tg);
    }
  });
});

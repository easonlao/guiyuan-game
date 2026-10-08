import { describe, it, expect } from 'vitest';
import { HeadlessMatch } from '../../src/core/headless/HeadlessMatch.js';

describe('HeadlessMatch (Headless Simulation)', () => {
  it('should run a simulation match to completion without error', () => {
    const match = new HeadlessMatch();
    const result = match.run(undefined, undefined, 20);

    expect(result.roundsPlayed).toBeGreaterThanOrEqual(1);
    expect(result.finalState).toBeDefined();
    expect(typeof result.finalP1Score).toBe('number');
    expect(typeof result.finalP2Score).toBe('number');
  });
});

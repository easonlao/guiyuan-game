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
    expect(result.closureType).toBeDefined();
    expect(result.record).toBeDefined();
    expect(result.record.actions.length).toBeGreaterThan(0);
  });

  it('should reproduce identical match results given the same seed', () => {
    const match = new HeadlessMatch();
    const result1 = match.run(undefined, undefined, { seed: 8888, maxRounds: 30 });
    const result2 = match.run(undefined, undefined, { seed: 8888, maxRounds: 30 });

    expect(result1.roundsPlayed).toBe(result2.roundsPlayed);
    expect(result1.winner).toBe(result2.winner);
    expect(result1.endReason).toBe(result2.endReason);
    expect(result1.closureType).toBe(result2.closureType);
    expect(result1.finalP1Score).toBe(result2.finalP1Score);
    expect(result1.finalP2Score).toBe(result2.finalP2Score);
    expect(result1.record).toEqual(result2.record);
  });
});

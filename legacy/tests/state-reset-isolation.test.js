import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StateManager from '../src/js/state/StateManager.js';

describe('StateManager reset isolation', () => {
  beforeEach(() => {
    StateManager.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores fresh nested score statistics after they have been recorded', () => {
    StateManager.addScore('P1', 489, '强破·致阳道损', 'BURST_ATK');

    expect(StateManager.getActionStats('P1')['强破']).toBe(1);
    expect(StateManager.getStateStats('P1')['致阳道损']).toBe(1);

    StateManager.reset();

    expect(StateManager.getState().players.P1.score).toBe(0);
    expect(StateManager.getActionStats('P1')['强破']).toBe(0);
    expect(StateManager.getActionScores('P1')['强破']).toBe(0);
    expect(StateManager.getStateStats('P1')['致阳道损']).toBe(0);
    expect(StateManager.getStateScores('P1')['致阳道损']).toBe(0);
  });
});

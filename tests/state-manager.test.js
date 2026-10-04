import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StateManager from '../src/js/state/StateManager.js';

describe('StateManager node state', () => {
  beforeEach(() => {
    StateManager.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes each player element to void on both sides', () => {
    expect(StateManager.getNodeState('P1', 0)).toEqual({ yang: 0, yin: 0 });
    expect(StateManager.getNodeState('P2', 4)).toEqual({ yang: 0, yin: 0 });
  });

  it('changes only the selected side of the selected element', () => {
    StateManager.updateNodeState('P1', 2, true, 1);

    expect(StateManager.getNodeState('P1', 2)).toEqual({ yang: 1, yin: 0 });
    expect(StateManager.getNodeState('P1', 1)).toEqual({ yang: 0, yin: 0 });
    expect(StateManager.getNodeState('P2', 2)).toEqual({ yang: 0, yin: 0 });
  });

  it('restores all nodes to void when the game is reset', () => {
    StateManager.updateNodeState('P1', 0, false, -1);

    StateManager.reset();

    expect(StateManager.getNodeState('P1', 0)).toEqual({ yang: 0, yin: 0 });
  });
});

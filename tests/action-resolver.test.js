import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActionResolver from '../src/js/logic/actions/ActionResolver.js';
import StateManager from '../src/js/state/StateManager.js';

describe('ActionResolver node actions', () => {
  beforeEach(() => {
    StateManager.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('repairs damage before lighting the yin side', () => {
    StateManager.updateNodeState('P1', 0, false, -1);

    expect(ActionResolver.applyPlus('P1', 0, false, 'AUTO', false)).toBe(true);
    expect(StateManager.getNodeState('P1', 0)).toEqual({ yang: 0, yin: 0 });

    expect(ActionResolver.applyPlus('P1', 0, false, 'AUTO', false)).toBe(true);
    expect(StateManager.getNodeState('P1', 0)).toEqual({ yang: 0, yin: 1 });
  });

  it('refuses to strengthen a side already at the blessed maximum', () => {
    StateManager.updateNodeState('P1', 0, false, 2);

    expect(ActionResolver.applyPlus('P1', 0, false, 'AUTO', false)).toBe(false);
    expect(StateManager.getNodeState('P1', 0)).toEqual({ yang: 0, yin: 2 });
  });

  it('damages the selected side but never below damage', () => {
    StateManager.updateNodeState('P2', 3, true, 1);

    expect(ActionResolver.applyMinus('P2', 3, true, 'ATK', true)).toBe(true);
    expect(StateManager.getNodeState('P2', 3)).toEqual({ yang: 0, yin: 0 });
    expect(ActionResolver.applyMinus('P2', 3, true, 'ATK', true)).toBe(true);
    expect(StateManager.getNodeState('P2', 3)).toEqual({ yang: -1, yin: 0 });
    expect(ActionResolver.applyMinus('P2', 3, true, 'ATK', true)).toBe(false);
    expect(StateManager.getNodeState('P2', 3)).toEqual({ yang: -1, yin: 0 });
  });

  it('reaches 归一 and 合一 when both yin and yang reach their thresholds', () => {
    ActionResolver.applyPlus('P1', 1, false, 'AUTO', false);
    ActionResolver.applyPlus('P1', 1, true, 'AUTO', false);
    expect(StateManager.getNodeState('P1', 1)).toEqual({ yang: 1, yin: 1 });

    ActionResolver.applyPlus('P1', 1, false, 'AUTO', false);
    ActionResolver.applyPlus('P1', 1, true, 'AUTO', false);
    expect(StateManager.getNodeState('P1', 1)).toEqual({ yang: 2, yin: 2 });
  });
});

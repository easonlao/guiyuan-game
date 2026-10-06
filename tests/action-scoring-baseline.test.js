import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActionResolver from '../src/js/logic/actions/ActionResolver.js';
import StateManager from '../src/js/state/StateManager.js';

describe('current action scoring baseline', () => {
  beforeEach(() => {
    StateManager.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['AUTO', () => ActionResolver.applyPlus('P1', 0, false, 'AUTO', false), 100],
    ['CONVERT', () => ActionResolver.applyPlus('P1', 0, false, 'CONVERT', false), 337],
    ['TRANS', () => ActionResolver.applyPlus('P1', 0, false, 'TRANS', false), 278],
    ['ATK', () => ActionResolver.applyMinus('P2', 0, false, 'ATK', true), 500]
  ])('%s keeps its current state and rarity score', (_actionType, execute, expectedScore) => {
    execute();

    expect(StateManager.getState().players.P1.score).toBe(expectedScore);
  });

  it('scores a BURST source consumption and both successful target improvements', () => {
    StateManager.updateNodeState('P1', 0, true, 1);
    StateManager.updateNodeState('P1', 0, false, 1);

    const result = ActionResolver.applyBurst('P1', 0, 1);

    expect(result).toEqual({ success: true, executedCount: 3 });
    expect(StateManager.getNodeState('P1', 0)).toEqual({ yang: 1, yin: 0 });
    expect(StateManager.getNodeState('P1', 1)).toEqual({ yang: 0, yin: 2 });
    expect(StateManager.getState().players.P1.score).toBe(750);
  });

  it('scores a BURST_ATK source consumption and both successful opponent attacks', () => {
    StateManager.updateNodeState('P1', 0, true, 1);
    StateManager.updateNodeState('P1', 0, false, 1);

    const result = ActionResolver.applyBurstAtk('P1', 0, 'P2', 2);

    expect(result).toEqual({ success: true, executedCount: 3 });
    expect(StateManager.getNodeState('P1', 0)).toEqual({ yang: 0, yin: 1 });
    expect(StateManager.getNodeState('P2', 2)).toEqual({ yang: -1, yin: -1 });
    expect(StateManager.getState().players.P1.score).toBe(990);
  });

  it.each([
    ['BURST', false, 350],
    ['BURST_ATK', true, 380]
  ])('keeps the positive self-damage diagnostic for %s', (actionType, isYang, expectedScore) => {
    ActionResolver.applyMinus('P1', 0, isYang, actionType, false);

    expect(StateManager.getNodeState('P1', 0)).toEqual({
      yang: isYang ? -1 : 0,
      yin: isYang ? 0 : -1
    });
    expect(StateManager.getState().players.P1.score).toBe(expectedScore);
  });

  it('counts only successful BURST substeps and awards no score for a blocked substep', () => {
    StateManager.updateNodeState('P1', 0, false, 1);
    StateManager.updateNodeState('P1', 1, false, 1);
    StateManager.updateNodeState('P1', 1, true, 2);

    const result = ActionResolver.applyBurst('P1', 0, 1);

    expect(result).toEqual({ success: true, executedCount: 2 });
    expect(StateManager.getNodeState('P1', 1)).toEqual({ yang: 2, yin: 2 });
    expect(StateManager.getState().players.P1.score).toBe(550);
    expect(StateManager.getActionStats('P1')['强化']).toBe(2);
    expect(StateManager.getActionScores('P1')['强化']).toBe(200);
    expect(StateManager.getStateStats('P1')['加持']).toBe(1);
  });

  it('rounds combined BURST_ATK score separately from its statistic components', () => {
    ActionResolver.applyMinus('P2', 0, true, 'BURST_ATK', true);

    const state = StateManager.getState();
    expect(state.players.P1.score).toBe(380);
    expect(StateManager.getActionScores('P1')['强破']).toBe(80);
    expect(StateManager.getStateScores('P1')['致阳道损']).toBe(300);
    expect(
      StateManager.getActionScores('P1')['强破'] + StateManager.getStateScores('P1')['致阳道损']
    ).toBe(380);
  });
});

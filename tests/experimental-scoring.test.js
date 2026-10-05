import { describe, expect, it } from 'vitest';
import { POINTS_CONFIG } from '../src/js/config/game-config.js';
import { createInitialHeadlessState, runHeadlessMatch } from '../src/js/logic/headless/HeadlessMatch.js';

function currentOpportunity(overrides = {}) {
  return createInitialHeadlessState({
    phase: 'DECISION',
    turnCount: 1,
    maxTurns: 2,
    currentStem: { name: '甲', element: 0, color: '#2dcc70' },
    ...overrides
  });
}

function evaluate(initialState, scoringConfig, selectAction = () => null) {
  return runHeadlessMatch({
    initialState,
    stems: [],
    scoringConfig,
    strategies: {
      P1: context => selectAction(context),
      P2: () => null
    }
  });
}

function choose(type) {
  return context => context.candidates.find(candidate => candidate.type === type);
}

describe('experimental headless scoring', () => {
  it('returns an immutable versioned formal-baseline snapshot including points configuration', () => {
    const initialState = currentOpportunity({
      nodeStates: {
        ...createInitialHeadlessState().nodeStates,
        'P1-0': { yang: 1, yin: 0 }
      }
    });
    const result = evaluate(initialState, undefined, choose('CONVERT'));

    expect(result.scoringConfig).toMatchObject({
      version: 1,
      name: 'formal-baseline',
      noSelfCostReward: false,
      burstActionScoreOnce: false,
      disableRarityBonus: false,
      pointsConfig: {
        ACTION: { CONVERT: 50 },
        STATE_CHANGE: { LIGHT_UP: 100 },
        PASSIVE: { UNITY_DIVIDEND: 50, DAMAGE_PENALTY: -40 },
        PENALTY: { UNREPAIRED_DMG: -100 },
        RARITY_MULTIPLIER: 1.5
      }
    });
    expect(result.scoringConfig.pointsConfig).not.toBe(POINTS_CONFIG);
    expect(Object.isFrozen(result.scoringConfig)).toBe(true);
    expect(Object.isFrozen(result.scoringConfig.pointsConfig.ACTION)).toBe(true);
    expect(result.actionRecords[0].scoreChanges[0].amount).toBe(337);
  });

  it.each([
    [null],
    [[]],
    [{ version: 2 }],
    [{ noSelfCostReward: 1 }],
    [{ unknownRule: true }],
    [{ pointsConfig: { ACTION: {} } }]
  ])('rejects illegal scoring configuration %j', scoringConfig => {
    const result = () => evaluate(currentOpportunity(), scoringConfig);

    expect(result).toThrow(expect.objectContaining({
      name: 'HeadlessMatchError',
      code: 'INVALID_SCORING_CONFIG'
    }));
  });

  it.each([
    ['BURST', '强化', { 'P1-1': { yang: 2, yin: 1 } }, [392, 734], [245, 734], '破阴点亮'],
    ['BURST_ATK', '强破', { 'P2-2': { yang: 0, yin: 0 } }, [391, 440, 489], [196, 440, 489], '破阳点亮']
  ])('removes only the %s self-cost state reward while preserving burst effects and extra turn', (actionType, actionName, targetStates, baselineScores, experimentalScores, selfStateReason) => {
    const initialState = currentOpportunity({
      nodeStates: {
        ...createInitialHeadlessState().nodeStates,
        'P1-0': { yang: 1, yin: 1 },
        ...targetStates
      }
    });
    const baseline = evaluate(initialState, undefined, choose(actionType));
    const experimental = evaluate(initialState, { noSelfCostReward: true }, choose(actionType));

    expect(baseline.actionRecords[0].scoreChanges.map(change => change.amount)).toEqual(baselineScores);
    expect(experimental.actionRecords[0].scoreChanges.map(change => change.amount)).toEqual(experimentalScores);
    expect(experimental.actionRecords[0].stateChanges).toEqual(baseline.actionRecords[0].stateChanges);
    expect(experimental.finalState.nodeStates).toEqual(baseline.finalState.nodeStates);
    expect(experimental.finalState.isExtraTurn).toBe(baseline.finalState.isExtraTurn);
    expect(experimental.finalState.pendingBurstPlayer).toBe(baseline.finalState.pendingBurstPlayer);
    expect(experimental.finalState.actionScores.P1[actionName]).toBe(baseline.finalState.actionScores.P1[actionName]);
    expect(experimental.finalState.stateScores.P1[selfStateReason]).toBe(0);
    expect(experimental.scoringConfig.name).toBe('experimental');
  });

  it.each([
    ['BURST', '强化', 245],
    ['BURST_ATK', '强破', 196]
  ])('awards %s behavior points once while retaining each successful substep and boundary result', (actionType, actionName, expectedActionScore) => {
    const initialState = currentOpportunity({
      nodeStates: {
        ...createInitialHeadlessState().nodeStates,
        'P1-0': { yang: 1, yin: 1 },
        'P1-1': { yang: 0, yin: 0 },
        'P2-2': { yang: 0, yin: 0 }
      }
    });
    const baseline = evaluate(initialState, undefined, choose(actionType));
    const once = evaluate(initialState, { burstActionScoreOnce: true }, choose(actionType));

    expect(baseline.actionRecords[0].stateChanges).toHaveLength(3);
    expect(once.actionRecords[0].stateChanges).toEqual(baseline.actionRecords[0].stateChanges);
    expect(once.finalState.nodeStates).toEqual(baseline.finalState.nodeStates);
    expect(once.finalState.isExtraTurn).toBe(baseline.finalState.isExtraTurn);
    expect(once.finalState.actionStats.P1[actionName]).toBe(3);
    expect(once.finalState.actionScores.P1[actionName]).toBe(expectedActionScore);
    expect(baseline.finalState.actionScores.P1[actionName]).toBe(expectedActionScore * 3);
  });

  it.each([
    ['BURST', '强化', 245],
    ['BURST_ATK', '强破', 196]
  ])('keeps %s successful-substep boundaries while awarding behavior score once', (actionType, actionName, expectedActionScore) => {
    const initialState = currentOpportunity({
      nodeStates: {
        ...createInitialHeadlessState().nodeStates,
        'P1-0': { yang: 1, yin: 1 },
        'P1-1': { yang: 2, yin: 1 },
        'P2-2': { yang: -1, yin: 0 }
      }
    });
    const baseline = evaluate(initialState, undefined, choose(actionType));
    const once = evaluate(initialState, { burstActionScoreOnce: true }, choose(actionType));

    expect(baseline.actionRecords[0].stateChanges).toHaveLength(2);
    expect(once.actionRecords[0].stateChanges).toEqual(baseline.actionRecords[0].stateChanges);
    expect(once.finalState.nodeStates).toEqual(baseline.finalState.nodeStates);
    expect(once.finalState.isExtraTurn).toBe(baseline.finalState.isExtraTurn);
    expect(once.finalState.actionStats.P1[actionName]).toBe(2);
    expect(once.finalState.actionScores.P1[actionName]).toBe(expectedActionScore);
  });

  it('disables rarity for total action scores and both component statistics', () => {
    const initialState = currentOpportunity({
      nodeStates: {
        ...createInitialHeadlessState().nodeStates,
        'P1-0': { yang: 1, yin: 0 }
      }
    });
    const result = evaluate(initialState, { disableRarityBonus: true }, choose('CONVERT'));

    expect(result.actionRecords[0].scoreChanges[0].amount).toBe(150);
    expect(result.finalState.actionScores.P1['调息']).toBe(50);
    expect(result.finalState.stateScores.P1['点亮']).toBe(100);
  });

  it('uses the captured points snapshot if globals change during strategy selection', () => {
    const initialState = currentOpportunity({
      nodeStates: {
        ...createInitialHeadlessState().nodeStates,
        'P1-0': { yang: 1, yin: 0 }
      }
    });
    const oldActionScore = POINTS_CONFIG.ACTION.CONVERT;
    const oldRarityMultiplier = POINTS_CONFIG.RARITY_MULTIPLIER;
    let result;
    try {
      result = evaluate(initialState, undefined, context => {
        const selected = choose('CONVERT')(context);
        POINTS_CONFIG.ACTION.CONVERT = 50000;
        POINTS_CONFIG.RARITY_MULTIPLIER = 999;
        return selected;
      });
    } finally {
      POINTS_CONFIG.ACTION.CONVERT = oldActionScore;
      POINTS_CONFIG.RARITY_MULTIPLIER = oldRarityMultiplier;
    }

    expect(result.actionRecords[0].scoreChanges[0].amount).toBe(337);
    expect(result.finalState.actionScores.P1['调息']).toBe(112);
    expect(result.scoringConfig.pointsConfig.ACTION.CONVERT).toBe(oldActionScore);
    expect(result.scoringConfig.pointsConfig.RARITY_MULTIPLIER).toBe(oldRarityMultiplier);
  });

  it('combines scoring experiments without changing a BURST board or extra-turn outcome', () => {
    const initialState = currentOpportunity({
      nodeStates: {
        ...createInitialHeadlessState().nodeStates,
        'P1-0': { yang: 1, yin: 1 },
        'P1-1': { yang: 0, yin: 0 }
      }
    });
    const baseline = evaluate(initialState, undefined, choose('BURST'));
    const combined = evaluate(initialState, {
      noSelfCostReward: true,
      burstActionScoreOnce: true,
      disableRarityBonus: true
    }, choose('BURST'));

    expect(combined.finalState.nodeStates).toEqual(baseline.finalState.nodeStates);
    expect(combined.finalState.isExtraTurn).toBe(baseline.finalState.isExtraTurn);
    expect(combined.finalState.pendingBurstPlayer).toBe(baseline.finalState.pendingBurstPlayer);
    expect(combined.finalState.actionScores.P1['强化']).toBe(100);
    expect(combined.finalState.stateScores.P1['破阴点亮']).toBe(0);
    expect(combined.finalState.stateScores.P1['点亮']).toBe(100);
    expect(combined.finalState.stateScores.P1['加持']).toBe(200);
  });
});

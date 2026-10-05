import { describe, expect, it } from 'vitest';
import { createInitialHeadlessState } from '../src/js/logic/headless/HeadlessMatch.js';
import { replaySeededMatch, runSeededMatch } from '../src/js/logic/headless/SeededMatch.js';
import { baselineMatch, reachableFixedPositions } from './fixtures/fixed-position-continuations/reachable-positions.js';
import {
  compareFixedPositionContinuations,
  enumerateLegalFirstActions,
  extractReachableFixedPosition,
  formatFixedPositionComparison,
  freezeDiagnosticFixedPosition
} from '../src/js/logic/headless/FixedPositionContinuations.js';

function createBaselineMatch() {
  return runSeededMatch({
    initialState: createInitialHeadlessState({ maxTurns: 6 }),
    seed: 123,
    strategies: { P1: 'build-priority', P2: 'attack-priority' }
  });
}

describe('fixed-position continuation public API', () => {
  it('extracts and deeply freezes a complete reachable checkpoint with provenance', () => {
    const baseline = createBaselineMatch();
    const turnStart = baseline.trajectory.find(entry => entry.event === 'turn-start' && entry.opportunity === 3);
    const position = extractReachableFixedPosition(baseline, {
      id: 'test-reachable-position',
      classification: 'balanced',
      opportunity: 3,
      playerId: turnStart.state.currentPlayer
    });

    expect(position).toMatchObject({
      id: 'test-reachable-position',
      classification: 'balanced',
      source: 'baseline-reachable',
      currentPlayer: turnStart.state.currentPlayer,
      currentStem: turnStart.state.currentStem,
      isExtraTurn: turnStart.state.isExtraTurn,
      pendingBurstPlayer: turnStart.state.pendingBurstPlayer,
      state: { ...turnStart.state, phase: 'DECISION' },
      provenance: {
        kind: 'seeded-match',
        seed: 123,
        randomVersion: baseline.randomVersion,
        strategyIdentities: baseline.strategyIdentities,
        opportunity: 3,
        baselineMatch: {
          initialState: baseline.trajectory[0].state,
          stems: baseline.stems,
          actionRecords: baseline.actionRecords,
          trajectory: baseline.trajectory,
          scoringConfigInput: {
            version: baseline.scoringConfig.version,
            noSelfCostReward: baseline.scoringConfig.noSelfCostReward,
            burstActionScoreOnce: baseline.scoringConfig.burstActionScoreOnce,
            disableRarityBonus: baseline.scoringConfig.disableRarityBonus
          },
          terminalResult: baseline.terminalResult
        }
      }
    });
    expect(Object.isFrozen(position)).toBe(true);
    expect(Object.isFrozen(position.state.nodeStates['P1-0'])).toBe(true);
    expect(Object.isFrozen(position.provenance.baselineMatch.actionRecords[0].action)).toBe(true);
    expect(() => { position.state.turnCount = 99; }).toThrow();
  });

  it('rejects experimental source matches rather than claiming baseline reachability', () => {
    const experimental = runSeededMatch({
      initialState: createInitialHeadlessState({ maxTurns: 6 }),
      seed: 123,
      strategies: { P1: 'build-priority', P2: 'attack-priority' },
      scoringConfig: { disableRarityBonus: true }
    });
    expect(() => extractReachableFixedPosition(experimental, {
      id: 'experimental-source', classification: 'balanced', opportunity: 3, playerId: 'P1'
    })).toThrow(/formal baseline scoring/);
  });

  it('labels caller-authored fixed states as diagnostics instead of baseline-reachable data', () => {
    const position = freezeDiagnosticFixedPosition({
      id: 'manual-diagnostic-example',
      description: 'Caller-authored stress position; not a baseline match sample.',
      state: structuredClone(reachableFixedPositions[0].state)
    });

    expect(position).toMatchObject({
      id: 'manual-diagnostic-example',
      classification: 'diagnostic',
      source: 'manual-diagnostic',
      provenance: { kind: 'manual-diagnostic', description: 'Caller-authored stress position; not a baseline match sample.' }
    });
    expect(Object.isFrozen(position.state)).toBe(true);
    expect(() => freezeDiagnosticFixedPosition({ id: 'unlabelled', state: position.state }))
      .toThrow(/description/);
  });

  it('keeps frozen balanced, disruption, near-limit, and extra-opportunity baseline fixtures reproducible', () => {
    expect(reachableFixedPositions.map(position => position.classification)).toEqual([
      'balanced',
      'extra-action-semantics',
      'trailing-needs-disruption',
      'near-turn-limit'
    ]);
    const replay = replaySeededMatch({
      initialState: baselineMatch.trajectory[0].state,
      stems: baselineMatch.stems,
      selectedActions: baselineMatch.actionRecords,
      scoringConfig: {}
    });
    expect(replay.trajectory).toEqual(baselineMatch.trajectory);
    expect(replay.terminalResult).toEqual(baselineMatch.terminalResult);

    for (const position of reachableFixedPositions) {
      const start = baselineMatch.trajectory.find(entry => entry.event === 'turn-start'
        && entry.opportunity === position.state.turnCount
        && entry.state.currentPlayer === position.currentPlayer);
      expect(position.source).toBe('baseline-reachable');
      expect(position.provenance.kind).toBe('seeded-match');
      expect(position.state).toEqual({ ...start.state, phase: 'DECISION' });
      expect(position.provenance.baselineMatch).toMatchObject({
        initialState: baselineMatch.trajectory[0].state,
        seed: 1,
        randomVersion: baselineMatch.randomVersion,
        strategyIdentities: baselineMatch.strategyIdentities,
        stems: baselineMatch.stems,
        actionRecords: baselineMatch.actionRecords,
        trajectory: baselineMatch.trajectory,
        scoringConfigInput: {
          version: baselineMatch.scoringConfig.version,
          noSelfCostReward: baselineMatch.scoringConfig.noSelfCostReward,
          burstActionScoreOnce: baselineMatch.scoringConfig.burstActionScoreOnce,
          disableRarityBonus: baselineMatch.scoringConfig.disableRarityBonus
        },
        terminalResult: baselineMatch.terminalResult,
        finalState: baselineMatch.finalState
      });
      expect(Object.isFrozen(position)).toBe(true);
    }
    const [balanced, extraOpportunity, disruption, nearLimit] = reachableFixedPositions;
    expect(balanced.state.players.P1.score).toBe(balanced.state.players.P2.score);
    expect(disruption.state.players.P1.score).toBeLessThan(disruption.state.players.P2.score);
    expect(disruption.state.nodeStates['P2-0']).toBeDefined();
    expect(nearLimit.state.maxTurns - nearLimit.state.turnCount).toBe(1);
    expect(extraOpportunity).toMatchObject({ isExtraTurn: true, currentPlayer: 'P2', pendingBurstPlayer: null });
  });

  it('enumerates the full legal first-action set from a frozen baseline checkpoint', () => {
    const baseline = runSeededMatch({
      initialState: createInitialHeadlessState({ maxTurns: 20 }),
      seed: 1,
      strategies: { P1: 'build-priority', P2: 'attack-priority' }
    });
    const baselineRecord = baseline.actionRecords.find(record => record.opportunity === 7 && record.playerId === 'P1');
    const position = extractReachableFixedPosition(baseline, {
      id: 'equal-candidates',
      classification: 'balanced',
      opportunity: 7,
      playerId: 'P1'
    });
    const enumeration = enumerateLegalFirstActions(position, { scoringConfig: {} });

    expect(baselineRecord.candidates.map(action => action.type)).toEqual(['CONVERT', 'TRANS']);
    expect(enumeration.candidates).toEqual(baselineRecord.candidates);
    expect(enumeration.actions).toEqual(baselineRecord.candidates);
    expect(enumeration.actionRecord.action).toEqual(baselineRecord.action);
    expect(enumeration.positionId).toBe('equal-candidates');
  });

  it('retains forced AUTO and no-candidate SKIP as the complete first-action choices', () => {
    const automatic = extractReachableFixedPosition(baselineMatch, {
      id: 'forced-auto-diagnostic',
      classification: 'forced-auto-check',
      opportunity: 1,
      playerId: 'P1'
    });
    const autoEnumeration = enumerateLegalFirstActions(automatic, { scoringConfig: {} });
    expect(autoEnumeration.candidates.map(action => action.type)).toEqual(['AUTO']);
    expect(autoEnumeration.actions.map(action => action.type)).toEqual(['AUTO']);

    const noActionState = structuredClone(reachableFixedPositions[0].state);
    noActionState.nodeStates['P1-4'] = { yang: 2, yin: 2 };
    noActionState.nodeStates['P1-0'] = { yang: 2, yin: 2 };
    const skipped = freezeDiagnosticFixedPosition({
      id: 'manual-no-legal-action',
      description: 'Diagnostic board with no legal choice for the checkpoint stem.',
      state: noActionState
    });
    const skipEnumeration = enumerateLegalFirstActions(skipped, { scoringConfig: {} });
    expect(skipEnumeration.candidates).toEqual([]);
    expect(skipEnumeration.actions).toEqual([{ type: 'SKIP' }]);
    expect(skipEnumeration.actionRecord.action).toEqual({ type: 'SKIP' });
  });

  it('uses versioned public continuation strategies without revealing future stems', () => {
    const contexts = [];
    const publicOnlyStrategy = {
      id: 'public-context-recorder',
      version: 3,
      decide(context) {
        contexts.push(context);
        return context.candidates[0];
      }
    };
    const result = compareFixedPositionContinuations({
      position: reachableFixedPositions[0],
      strategies: { P1: publicOnlyStrategy, P2: publicOnlyStrategy },
      seeds: ['paired-custom-policy'],
      scoringConfig: {}
    });

    expect(result.continuationStrategyIdentities).toEqual({
      P1: { id: 'public-context-recorder', version: 3 },
      P2: { id: 'public-context-recorder', version: 3 }
    });
    expect(contexts.length).toBeGreaterThan(0);
    for (const context of contexts) {
      expect(Object.keys(context)).toEqual(['playerId', 'stem', 'state', 'history', 'candidates']);
      expect(context).not.toHaveProperty('stems');
      expect(context).not.toHaveProperty('seed');
      expect(context).not.toHaveProperty('scoringConfig');
      expect(Object.isFrozen(context)).toBe(true);
    }
    for (const branch of result.firstActions) {
      expect(branch.samples[0].replay.strategyIdentities.P1.id).toContain('fixed-first-action:public-context-recorder@3');
      expect(branch.samples[0].replay.strategyIdentities.P2).toEqual({ id: 'public-context-recorder', version: 3 });
    }
  });

  it('captures the explicitly selected scoring configuration for every branch and replay', () => {
    const common = {
      position: reachableFixedPositions[0],
      strategies: { P1: 'build-priority', P2: 'attack-priority' },
      seeds: [17]
    };
    expect(() => compareFixedPositionContinuations(common)).toThrow(/scoringConfig is required/);
    const formal = compareFixedPositionContinuations({ ...common, scoringConfig: {} });
    const experimental = compareFixedPositionContinuations({
      ...common,
      scoringConfig: { version: 1, disableRarityBonus: true }
    });

    expect(formal.scoringConfig.name).toBe('formal-baseline');
    expect(experimental.scoringConfig).toMatchObject({
      version: 1,
      name: 'experimental',
      disableRarityBonus: true
    });
    expect(experimental.scoringConfigInput).toEqual({
      version: 1,
      noSelfCostReward: false,
      burstActionScoreOnce: false,
      disableRarityBonus: true
    });
    expect(experimental.firstActions.map(branch => branch.action)).toEqual(formal.firstActions.map(branch => branch.action));
    for (const branch of experimental.firstActions) {
      const sample = branch.samples[0];
      expect(sample.replay.scoringConfig).toEqual(experimental.scoringConfig);
      expect(sample.replay.scoringConfigInput).toEqual(experimental.scoringConfigInput);
      const replay = replaySeededMatch({
        initialState: sample.replay.initialState,
        stems: sample.replay.stems,
        selectedActions: sample.replay.actionRecords,
        scoringConfig: sample.replay.scoringConfigInput
      });
      expect(replay.trajectory).toEqual(sample.replay.trajectory);
    }
  });

  it('reports budget limits without dropping candidates or claiming complete paired samples', () => {
    const result = compareFixedPositionContinuations({
      position: reachableFixedPositions[0],
      strategies: { P1: 'build-priority', P2: 'attack-priority' },
      seeds: [51, 52],
      scoringConfig: {},
      maxRuns: 1
    });

    expect(result.status).toBe('partial');
    expect(result.firstActions).toHaveLength(2);
    expect(result.summary).toMatchObject({
      firstActionCount: 2,
      requestedMatchCount: 4,
      attemptedMatchCount: 1,
      completedMatchCount: 1,
      budgetSkippedMatchCount: 3
    });
    expect(result.firstActions.map(branch => branch.samples.length)).toEqual([2, 2]);
    expect(result.firstActions[0].pairedDifferenceToReference).toMatchObject({ sampleCount: 1, complete: false });
    expect(result.firstActions[1].pairedDifferenceToReference).toMatchObject({ sampleCount: 0, complete: false });
    const formatted = formatFixedPositionComparison(result);
    expect(formatted).toContain('no candidate was omitted');
    expect(formatted).toContain('P1=build-priority@1, P2=attack-priority@1');
    expect(formatted).toContain('scoring=formal-baseline@1');
    expect(formatted).toContain('(1/2), value');
    expect(formatted).not.toContain('undefined');
  });

  it('keeps failed continuation candidates and their seeded reproduction details', () => {
    const unavailable = {
      id: 'unavailable-after-first-action',
      version: 1,
      decide() { throw new Error('continuation policy unavailable'); }
    };
    const result = compareFixedPositionContinuations({
      position: reachableFixedPositions[0],
      strategies: { P1: 'build-priority', P2: unavailable },
      seeds: [91],
      scoringConfig: {}
    });

    expect(result.status).toBe('failed');
    expect(result.firstActions).toHaveLength(2);
    expect(result.failures).toHaveLength(2);
    for (const branch of result.firstActions) {
      expect(branch.status).toBe('failed');
      expect(branch.summary.sampleCount).toBe(0);
      expect(branch.samples[0]).toMatchObject({
        status: 'failed',
        seed: 91,
        error: { code: 'STRATEGY_FAILED', details: { seed: 91, playerId: 'P2', opportunity: expect.any(Number) } }
      });
      expect(branch.samples[0].error.details.opportunity).toBeGreaterThan(reachableFixedPositions[0].state.turnCount);
      expect(branch.samples[0].error.details.priorActionRecords[0].action).toEqual(branch.action);
    }
  });

  it('compares every first action over paired seeded continuations and retains full replays', () => {
    const baseline = runSeededMatch({
      initialState: createInitialHeadlessState({ maxTurns: 20 }),
      seed: 1,
      strategies: { P1: 'build-priority', P2: 'attack-priority' }
    });
    const position = extractReachableFixedPosition(baseline, {
      id: 'equal-candidates',
      classification: 'balanced',
      opportunity: 7,
      playerId: 'P1'
    });
    const result = compareFixedPositionContinuations({
      position,
      strategies: { P1: 'build-priority', P2: 'attack-priority' },
      seeds: [2, 5],
      scoringConfig: {},
      maxTurns: 20
    });

    expect(result.status).toBe('complete');
    expect(result.firstActions.map(branch => branch.action.type)).toEqual(['CONVERT', 'TRANS']);
    expect(result.pairing).toMatchObject({ seeds: [2, 5], commonSeedPolicy: 'same-seed-for-every-first-action' });
    expect(result.firstActions[0].samples.map(sample => sample.outcome)).toEqual(['loss', 'win']);
    expect(result.firstActions[0].samples.map(sample => sample.value)).toEqual([0, 1]);
    expect(result.firstActions[1].samples.map(sample => sample.outcome)).toEqual(['win', 'loss']);
    expect(result.firstActions[1].samples.map(sample => sample.value)).toEqual([1, 0]);
    expect(result.firstActions[0].summary.outcomeValue.mean).toBe(0.5);
    expect(result.firstActions[1].summary.outcomeValue.mean).toBe(0.5);
    expect(result.firstActions[0].summary.winDrawLoss.counts).toEqual({ wins: 1, draws: 0, losses: 1 });
    expect(result.firstActions[1].summary.winDrawLoss.proportions).toEqual({ wins: 0.5, draws: 0, losses: 0.5 });
    expect(result.firstActions[1].pairedDifferenceToReference.meanDifference).toBe(0);
    expect(result.firstActions[1].pairedDifferenceToReference.sampleStandardDeviation).toBeCloseTo(Math.sqrt(2));
    expect(result.firstActions[1].pairedDifferenceToReference.normalApprox95.low).toBeCloseTo(-1.9599639845);
    expect(result.firstActions[0].samples[0].replay.finalState.nodeStates)
      .not.toEqual(result.firstActions[1].samples[0].replay.finalState.nodeStates);
    expect(position.state).toEqual(reachableFixedPositions[0].state);
    expect(JSON.parse(JSON.stringify(result)).firstActions).toHaveLength(2);
    for (const branch of result.firstActions) {
      expect(branch.samples).toHaveLength(2);
      expect(branch.summary.sampleCount).toBe(2);
      expect(branch.pairedDifferenceToReference.sampleCount).toBe(2);
      for (const sample of branch.samples) {
        expect(sample.status).toBe('completed');
        expect(sample.replay.actionRecords[0].action).toEqual(branch.action);
        expect(sample.replay.initialState).toEqual(position.state);
        expect(sample.replay.actionRecords.at(-1).action).toBeDefined();
        const replay = replaySeededMatch({
          initialState: sample.replay.initialState,
          stems: sample.replay.stems,
          selectedActions: sample.replay.actionRecords,
          scoringConfig: sample.replay.scoringConfigInput
        });
        expect(replay.trajectory).toEqual(sample.replay.trajectory);
        expect(replay.terminalResult).toEqual(sample.terminalResult);
      }
    }
    for (let sampleIndex = 0; sampleIndex < 2; sampleIndex++) {
      expect(result.firstActions[0].samples[sampleIndex].seed).toBe(result.firstActions[1].samples[sampleIndex].seed);
      expect(result.firstActions[0].samples[sampleIndex].replay.randomVersion)
        .toBe(result.firstActions[1].samples[sampleIndex].replay.randomVersion);
      const firstBranchStems = result.firstActions[0].samples[sampleIndex].replay.stems;
      const secondBranchStems = result.firstActions[1].samples[sampleIndex].replay.stems;
      const commonStemCount = Math.min(firstBranchStems.length, secondBranchStems.length);
      expect(firstBranchStems.slice(0, commonStemCount)).toEqual(secondBranchStems.slice(0, commonStemCount));
    }
  });

  it('uses draw as the midpoint in outcome and paired-difference statistics', () => {
    const state = structuredClone(reachableFixedPositions[0].state);
    state.maxTurns = state.turnCount + 1;
    state.players.P1.score = 100;
    state.players.P2.score = 437;
    const position = freezeDiagnosticFixedPosition({
      id: 'draw-versus-loss-at-limit',
      description: 'Equal final scores on the turn limit produce a draw.',
      state
    });
    const result = compareFixedPositionContinuations({
      position,
      strategies: { P1: 'build-priority', P2: 'attack-priority' },
      seeds: [1],
      scoringConfig: {}
    });

    expect(result.firstActions.map(branch => branch.samples[0])).toMatchObject([
      { outcome: 'draw', value: 0.5, terminalResult: { winner: 'DRAW' } },
      { outcome: 'loss', value: 0, terminalResult: { winner: 'P2' } }
    ]);
    expect(result.firstActions[0].summary.winDrawLoss.counts).toEqual({ wins: 0, draws: 1, losses: 0 });
    expect(result.firstActions[0].summary.outcomeValue.mean).toBe(0.5);
    expect(result.firstActions[1].summary.outcomeValue.mean).toBe(0);
    expect(result.firstActions[1].pairedDifferenceToReference.meanDifference).toBe(-0.5);
  });
});

import { describe, expect, it } from 'vitest';
import { replaySeededMatch } from '../src/js/logic/headless/SeededMatch.js';
import { reachableFixedPositions } from './fixtures/fixed-position-continuations/reachable-positions.js';
import {
  classifyPayoffCrossover,
  evaluateCrossoverConfirmation,
  formatCrossoverConfirmation
} from '../src/js/logic/headless/CrossoverConfirmation.js';

const criteria = {
  minimumEffect: 0.2,
  minimumPairs: 2,
  uncertaintyMethod: 'paired-normal-95',
  evidenceRule: 'interval-excludes-zero'
};

describe('crossover confirmation public API', () => {
  it('classifies a reproducible signed payoff reversal with paired uncertainty summaries', () => {
    const result = classifyPayoffCrossover({
      criteria,
      opponents: [
        { id: 'builder', samples: [
          { seed: 1, actionAValue: 1, actionBValue: 0 },
          { seed: 2, actionAValue: 1, actionBValue: 0 }
        ] },
        { id: 'attacker', samples: [
          { seed: 1, actionAValue: 0, actionBValue: 1 },
          { seed: 2, actionAValue: 0, actionBValue: 1 }
        ] }
      ]
    });

    expect(result.classification).toBe('crossover');
    expect(result.orientation).toEqual([
      { opponentId: 'builder', sign: 1 },
      { opponentId: 'attacker', sign: -1 }
    ]);
    expect(result.criteria).toEqual(criteria);
    expect(result.opponents.map(opponent => opponent.id)).toEqual(['builder', 'attacker']);
    expect(result.opponents.map(opponent => opponent.pairedCount)).toEqual([2, 2]);
    expect(result.opponents[0]).toMatchObject({
      missingSeeds: [],
      meanDifference: 1,
      sampleStandardDeviation: 0,
      standardError: 0,
      normalApprox95: { low: 1, high: 1, confidenceLevel: 0.95 }
    });
  });

  it('distinguishes no reversal, effect too small, and uncertain paired evidence', () => {
    const samples = values => values.map((difference, index) => ({
      seed: index,
      actionAValue: difference > 0 ? difference : 0,
      actionBValue: difference < 0 ? -difference : 0
    }));
    const noReversal = classifyPayoffCrossover({
      criteria,
      opponents: [
        { id: 'builder', samples: samples([1, 1]) },
        { id: 'attacker', samples: samples([0.5, 0.5]) }
      ]
    });
    expect(noReversal.classification).toBe('no-reversal');

    const effectCriteria = { ...criteria, minimumEffect: 0.5 };
    const smallReversal = classifyPayoffCrossover({
      criteria: effectCriteria,
      opponents: [
        { id: 'builder', samples: samples([...Array(18).fill(0.5), ...Array(2).fill(0)]) },
        { id: 'attacker', samples: samples([...Array(18).fill(-0.5), ...Array(2).fill(0)]) }
      ]
    });
    expect(smallReversal.classification).toBe('effect-insufficient');

    const uncertain = classifyPayoffCrossover({
      criteria,
      opponents: [
        { id: 'builder', samples: samples([1, -1]) },
        { id: 'attacker', samples: samples([-1, 1]) }
      ]
    });
    expect(uncertain.classification).toBe('uncertainty-insufficient');
  });

  it('keeps missing paired seeds visible and rejects ambiguous sample identity', () => {
    const result = classifyPayoffCrossover({
      criteria,
      opponents: [
        { id: 'builder', samples: [
          { seed: 'a', actionAValue: 1, actionBValue: 0 },
          { seed: 'b', actionAValue: null, actionBValue: 0 },
          { seed: 'c', actionAValue: 1, actionBValue: 0 }
        ] },
        { id: 'attacker', samples: [
          { seed: 'a', actionAValue: 0, actionBValue: 1 },
          { seed: 'c', actionAValue: 0, actionBValue: 1 }
        ] }
      ]
    });
    expect(result.opponents[0]).toMatchObject({
      requestedPairCount: 3,
      pairedCount: 2,
      missingSeeds: ['b'],
      meanDifference: 1
    });
    expect(result.opponents[1]).toMatchObject({ requestedPairCount: 3, providedPairCount: 2, missingSeeds: ['b'] });
    expect(() => classifyPayoffCrossover({
      criteria,
      opponents: [
        { id: 'same', samples: [{ seed: 1, actionAValue: 1, actionBValue: 0 }, { seed: 1, actionAValue: 1, actionBValue: 0 }] },
        { id: 'same', samples: [] }
      ]
    })).toThrow(/ids must be distinct/);
  });

  it('evaluates fixed-position action pairs in disjoint phases and preserves replayable public comparisons', () => {
    const state = structuredClone(reachableFixedPositions[0].state);
    state.maxTurns = state.turnCount + 1;
    const position = {
      ...reachableFixedPositions[0],
      state,
      provenance: { kind: 'manual-diagnostic', description: 'One-opportunity orchestration check.' },
      source: 'manual-diagnostic',
      classification: 'diagnostic'
    };
    const report = evaluateCrossoverConfirmation({
      positions: [position],
      focalStrategy: 'build-priority',
      opponents: [
        { id: 'builder', strategy: 'build-priority' },
        { id: 'attacker', strategy: 'attack-priority' }
      ],
      discoverySeeds: [11, 12],
      confirmationSeeds: [21, 22],
      scoringConfig: {},
      criteria: { ...criteria, minimumEffect: 0 }
    });

    expect(report).toMatchObject({ schemaVersion: 1, configuration: { discoverySeeds: [11, 12], confirmationSeeds: [21, 22] } });
    expect(report.discovery.comparisons).toHaveLength(2);
    expect(report.discovery.pairs).toHaveLength(1);
    expect(report.discovery.pairs[0]).toMatchObject({
      positionId: position.id,
      candidateIndices: [0, 1],
      actions: [expect.any(Object), expect.any(Object)],
      classification: expect.any(String)
    });
    for (const phase of [report.discovery, report.confirmation]) {
      for (const comparison of phase.comparisons) {
        expect(comparison).toHaveProperty('firstActions');
        for (const branch of comparison.firstActions) {
          for (const sample of branch.samples) {
            if (sample.status !== 'completed') continue;
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
      }
    }
    expect(report.summary).toMatchObject({
      plannedMatchCount: expect.any(Number),
      completedMatchCount: expect.any(Number),
      failedMatchCount: expect.any(Number),
      budgetSkippedMatchCount: expect.any(Number)
    });
    expect(report.limitations.join(' ')).toMatch(/not globally optimal/i);
    const formatted = formatCrossoverConfirmation(report);
    expect(formatted).toContain('Discovery-qualified:');
    expect(formatted).toContain('normal 95%');
    expect(formatted).toContain('Limitation:');
  });

  it('retains every candidate pair and labels discovery budget skips without dropping raw results', () => {
    const report = evaluateCrossoverConfirmation({
      positions: [reachableFixedPositions[0]],
      focalStrategy: 'build-priority',
      opponents: [
        { id: 'builder', strategy: 'build-priority' },
        { id: 'attacker', strategy: 'attack-priority' }
      ],
      discoverySeeds: [41],
      confirmationSeeds: [42],
      scoringConfig: {},
      criteria: { ...criteria, minimumPairs: 1 },
      maxRuns: 0
    });

    expect(report.discovery.comparisons).toHaveLength(2);
    expect(report.discovery.pairs).toHaveLength(1);
    expect(report.discovery.comparisons.flatMap(comparison => comparison.firstActions)
      .flatMap(branch => branch.samples).every(sample => sample.status === 'not-run-budget')).toBe(true);
    expect(report.confirmation.comparisons).toHaveLength(0);
    expect(report.confirmation.pairs).toHaveLength(1);
    expect(report.confirmation.pairs[0].status).toBe('not-run');
    expect(report.summary).toMatchObject({
      plannedMatchCount: 4,
      attemptedMatchCount: 0,
      completedMatchCount: 0,
      failedMatchCount: 0,
      budgetSkippedMatchCount: 4,
      notRunPairCount: 1
    });
  });

  it('validates phase seeds and criteria before invoking continuation strategies', () => {
    let decisions = 0;
    const focal = { id: 'counting-policy', version: 1, decide(context) { decisions++; return context.candidates[0]; } };
    const common = {
      positions: [reachableFixedPositions[0]],
      focalStrategy: focal,
      opponents: [
        { id: 'other-build', strategy: 'build-priority' },
        { id: 'other-attack', strategy: 'attack-priority' }
      ],
      discoverySeeds: [31],
      confirmationSeeds: [31],
      scoringConfig: {},
      criteria
    };
    expect(() => evaluateCrossoverConfirmation(common)).toThrow(/disjoint/);
    expect(decisions).toBe(0);
    expect(() => evaluateCrossoverConfirmation({
      ...common,
      confirmationSeeds: [32],
      criteria: { ...criteria, minimumPairs: 0 }
    })).toThrow(/minimumPairs/);
    const { scoringConfig, ...withoutScoringConfig } = common;
    expect(scoringConfig).toEqual({});
    expect(() => evaluateCrossoverConfirmation({ ...withoutScoringConfig, confirmationSeeds: [32] }))
      .toThrow(/scoringConfig is required/);
    expect(decisions).toBe(0);
  });
});

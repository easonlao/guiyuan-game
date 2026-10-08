import { describe, expect, it } from 'vitest';
import {
  TOURNAMENT_STRATEGIES,
  runStrategyTournament
} from '../src/js/logic/headless/StrategyTournament.js';

describe('StrategyTournament', () => {
  it('runs pairwise tournament with first-player swaps and reports victory types and switching benefits', () => {
    const report = runStrategyTournament({
      seeds: [201, 202],
      maxTurns: 12,
      scoringConfig: {}
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      evaluationType: 'full-strategy-tournament',
      strategies: expect.arrayContaining([
        'build-priority',
        'attack-priority',
        'situation-responsive',
        'fixed-build',
        'fixed-attack'
      ]),
      seeds: [201, 202],
      maxTurns: 12,
      matchups: expect.any(Array),
      strategySummaries: expect.any(Object),
      switchingAnalysis: expect.any(Object),
      inferenceBoundary: expect.any(String)
    });

    // Check strategy summary includes lighting vs score settlements
    const summary = report.strategySummaries['situation-responsive'];
    expect(summary).toMatchObject({
      matchesPlayed: expect.any(Number),
      wins: expect.any(Number),
      draws: expect.any(Number),
      losses: expect.any(Number),
      meanOutcomeValue: expect.any(Number),
      victoryTypes: {
        lighting: expect.any(Number),
        turnLimit: expect.any(Number)
      }
    });

    // Check switching analysis compares situation-responsive against fixed controls
    expect(report.switchingAnalysis).toMatchObject({
      situationResponsiveValue: expect.any(Number),
      fixedBuildValue: expect.any(Number),
      fixedAttackValue: expect.any(Number),
      switchingAdvantageOverFixedBuild: expect.any(Number),
      switchingAdvantageOverFixedAttack: expect.any(Number),
      interpretation: expect.any(String)
    });
  });
});

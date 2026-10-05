import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { runStrategyTournament, TOURNAMENT_STRATEGIES } from '../src/js/logic/headless/StrategyTournament.js';
import { compareFixedPositionContinuations } from '../src/js/logic/headless/FixedPositionContinuations.js';
import { runBatchComparison } from '../src/js/logic/headless/BatchComparison.js';
import { runStrategyEvaluationStudy } from '../src/js/logic/headless/StrategyEvaluation.js';
import { reachableFixedPositions } from './fixtures/fixed-position-continuations/reachable-positions.js';

const cliPath = new URL('../scripts/headless-strategy-evaluation.js', import.meta.url).pathname;

describe('issue 02: parameterized evaluation and formal limits', () => {
  it('defaults tournament and evaluation to formal 60 maxTurns and >=200 seeds in CLI defaults', () => {
    const result = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--seeds <positive integer>');
    expect(result.stdout).toContain('default: 200');
    expect(result.stdout).toContain('--max-turns <integer or list>');
    expect(result.stdout).toContain('default: 60');
  });

  it('StrategyTournament defaults maxTurns to 60 and executes paired starter swaps for every seed and strategy pair', () => {
    const report = runStrategyTournament({
      seeds: [202603],
      scoringConfig: {}
    });

    expect(report.maxTurns).toBe(60);
    // 5 strategies -> 25 matchups, each with 1 seed * 2 starting players = 2 matches per matchup
    expect(report.matchups).toHaveLength(25);
    for (const matchup of report.matchups) {
      expect(matchup.matches).toHaveLength(2);
      expect(matchup.matches.map(m => m.startingPlayer)).toEqual(['P1', 'P2']);
      for (const match of matchup.matches) {
        expect(match.terminalCategory).toMatch(/五行归元|回合上限结算/);
        expect(match.litSides).toBeDefined();
        expect(typeof match.litSides.P1).toBe('number');
        expect(typeof match.litSides.P2).toBe('number');
        expect(match.actionSequence).toBeDefined();
      }
    }

    // Total runs is 50, effective samples is tracked
    expect(report.totalRuns).toBe(50);
    expect(typeof report.effectiveSamples).toBe('number');
    expect(report.effectiveSamples).toBeLessThanOrEqual(report.totalRuns);
    expect(report.terminalDistribution).toBeDefined();
    expect(typeof report.starterWinRate).toBe('number');
  });

  it('BatchComparison pairs starter swaps for every seed and strategy assignment', () => {
    const batch = runBatchComparison({
      samples: 1,
      seed: 202603,
      maxTurns: 60,
      baselineScoringConfig: {}
    });

    // 9 strategy pairs * 2 starting players * 2 configurations (baseline & experiment) = 36 matches
    expect(batch.results).toHaveLength(36);
    const baselineResults = batch.results.filter(r => r.configurationRole === 'baseline');
    expect(baselineResults).toHaveLength(18);
    const startingPlayers = baselineResults.map(r => r.startingPlayer);
    const p1Starts = startingPlayers.filter(p => p === 'P1').length;
    const p2Starts = startingPlayers.filter(p => p === 'P2').length;
    expect(p1Starts).toBe(9);
    expect(p2Starts).toBe(9);
  });

  it('fixed position continuation defaults to 60 turns when continuing 20-turn fixtures', () => {
    const position = reachableFixedPositions[0]; // has position.state.maxTurns = 20
    expect(position.state.maxTurns).toBe(20);

    const result = compareFixedPositionContinuations({
      position,
      strategies: { P1: 'build-priority', P2: 'attack-priority' },
      seeds: [101],
      scoringConfig: {}
    });

    // Verify continuation ran with 60 turns
    expect(result.firstActions[0].samples[0].replay.initialState.maxTurns).toBe(60);
  });

  it('StrategyEvaluation accepts multi-value maxTurns sweep and reports totalRuns vs effectiveSamples', () => {
    const study = runStrategyEvaluationStudy({
      positions: [reachableFixedPositions[0]],
      samples: 1,
      seed: 7001,
      maxTurns: [12, 20],
      config: 'formal-baseline',
      maxRuns: 2
    });

    expect(study.sweep).toBeDefined();
    expect(study.sweep).toHaveLength(2);
    expect(study.sweep[0].maxTurns).toBe(12);
    expect(study.sweep[1].maxTurns).toBe(20);

    expect(study.summary.totalRuns).toBeGreaterThan(0);
    expect(study.summary.effectiveSamples).toBeGreaterThan(0);
    expect(study.summary.effectiveSamples).toBeLessThanOrEqual(study.summary.totalRuns);
  });

  it('benchmarks runtime for parameterized evaluation at 60 turns', () => {
    const t0 = Date.now();
    const batch = runBatchComparison({
      samples: 5,
      seed: 202603,
      maxTurns: 60,
      baselineScoringConfig: {},
      experimentalScoringConfig: {}
    });
    const elapsed = Date.now() - t0;
    expect(batch.results.length).toBe(5 * 9 * 2 * 2); // 180 matches
    expect(elapsed).toBeGreaterThan(0);
    const msPerMatch = elapsed / batch.results.length;
    console.log(`5 seeds x 60 turns (180 matches) runtime: ${elapsed}ms (${msPerMatch.toFixed(2)}ms/match, est. 200 seeds ~${((msPerMatch * 7200) / 1000).toFixed(1)}s)`);
  });
});

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createInitialHeadlessState } from '../src/js/logic/headless/HeadlessMatch.js';
import { runBatchComparison } from '../src/js/logic/headless/BatchComparison.js';
import { replaySeededMatch } from '../src/js/logic/headless/SeededMatch.js';

const batchCliPath = new URL('../scripts/headless-batch-comparison.js', import.meta.url).pathname;

describe('batch comparison public API', () => {
  it('pairs every public strategy assignment and starting player across scoring configurations', () => {
    const initialState = createInitialHeadlessState({ phase: 'GAME_END', maxTurns: 4 });
    for (let elementIndex = 0; elementIndex < 5; elementIndex++) {
      initialState.nodeStates[`P1-${elementIndex}`] = { yang: 1, yin: 1 };
    }

    const report = runBatchComparison({
      samples: 1,
      seed: 42,
      maxTurns: 4,
      initialState,
      experimentalScoringConfig: { disableRarityBonus: true }
    });

    expect(report.plan).toMatchObject({
      sampleCount: 1,
      plannedMatches: 36,
      plannedComparisons: 18,
      randomVersion: 'mulberry32-fnv1a-v1'
    });
    expect(report.coverage).toMatchObject({
      completedMatches: 36,
      failedMatches: 0,
      skippedMatches: 0,
      completeComparisons: 18,
      failedComparisons: 0,
      startingPlayers: {
        P1: { plannedMatches: 18, completedMatches: 18 },
        P2: { plannedMatches: 18, completedMatches: 18 }
      }
    });
    expect(report.coverage.strategyPairs).toHaveLength(9);
    expect(report.coverage.strategyPairs.find(pair => pair.P1 === 'build-priority' && pair.P2 === 'attack-priority'))
      .toMatchObject({ plannedMatches: 4, completedMatches: 4, failedMatches: 0 });
    expect(report.coverage.strategyPairs.find(pair => pair.P1 === 'attack-priority' && pair.P2 === 'build-priority'))
      .toMatchObject({ plannedMatches: 4, completedMatches: 4, failedMatches: 0 });
    expect(report.plan.configurations.map(configuration => configuration.id)).toEqual([
      'baseline:scoring-v1-000', 'experiment:scoring-v1-001'
    ]);

    const baseline = report.results.find(result => result.configurationId === 'baseline:scoring-v1-000');
    expect(baseline).toMatchObject({
      status: 'completed',
      seed: 42,
      initialState: { currentPlayer: 'P1', phase: 'GAME_END' },
      strategyIdentities: { P1: { id: 'build-priority', version: 1 } },
      scoringConfig: { version: 1, name: 'formal-baseline', disableRarityBonus: false },
      terminalResult: { winner: 'P1', reason: '所有天干点亮' },
      actionRecords: []
    });
    expect(report.summary.configurations['baseline:scoring-v1-000'].winLossDrawMatrix['build-priority']['build-priority'])
      .toMatchObject({ P1: 2, P2: 0, draws: 0 });
  });

  it('reports traceable actions, role-balanced outcomes, paired seed-cluster uncertainty, and board keys', () => {
    const initialState = createInitialHeadlessState({
      phase: 'DECISION',
      turnCount: 1,
      maxTurns: 2,
      currentStem: { name: '甲', color: '#2dcc70', element: 0 }
    });
    initialState.players.P1.score = 175;
    for (const playerId of ['P1', 'P2']) {
      initialState.nodeStates[`${playerId}-0`] = { yang: 1, yin: 0 };
      initialState.nodeStates[`${playerId}-2`] = { yang: -1, yin: -1 };
    }

    const report = runBatchComparison({
      samples: 2,
      seed: 101,
      maxTurns: 2,
      initialState,
      experimentalScoringConfig: { disableRarityBonus: true }
    });
    const baselineId = 'baseline:scoring-v1-000';
    const experimentId = 'experiment:scoring-v1-001';
    const baselinePair = report.summary.configurations[baselineId].winLossDrawMatrix['build-priority']['build-priority'];
    const experimentPair = report.summary.configurations[experimentId].winLossDrawMatrix['build-priority']['build-priority'];

    expect(baselinePair).toMatchObject({ P1: 2, P2: 2, draws: 0, winValue: { P1: 0.5, P2: 0.5 } });
    expect(experimentPair).toMatchObject({ P1: 4, P2: 0, draws: 0, winValue: { P1: 1, P2: 0 } });
    expect(report.summary.configurations[baselineId].winLossDrawMatrixByStartingPlayer.P1['build-priority']['build-priority'])
      .toMatchObject({ P1: 2, P2: 0 });
    expect(report.summary.configurations[baselineId].winLossDrawMatrixByStartingPlayer.P2['build-priority']['build-priority'])
      .toMatchObject({ P1: 0, P2: 2 });
    expect(report.summary.configurations[experimentId].winLossDrawMatrixByStartingPlayer.P2['build-priority']['build-priority'])
      .toMatchObject({ P1: 2, P2: 0 });
    expect(report.summary.pairedComparison.byStrategyPair['build-priority|build-priority'])
      .toMatchObject({
        plannedClusters: 2,
        completeClusters: 2,
        pairedWinValueDelta: {
          mean: 0.5,
          standardError: 0,
          confidenceInterval95: { lower: 0.5, upper: 0.5 },
          sampleClusters: 2,
          clusterUnit: 'seed; averaged over both starting players'
        }
      });

    const baselineMatch = report.results.find(result => result.configurationId === baselineId
      && result.strategies.P1 === 'build-priority' && result.strategies.P2 === 'build-priority'
      && result.startingPlayer === 'P1');
    const experimentMatch = report.results.find(result => result.configurationId === experimentId
      && result.comparisonId === baselineMatch.comparisonId);
    expect(baselinePair.comparisonIds).toContain(baselineMatch.comparisonId);
    expect(baselineMatch.actionRecords[0]).toMatchObject({
      playerId: 'P1',
      action: { type: 'CONVERT' },
      candidates: [{ type: 'CONVERT' }]
    });
    expect(baselineMatch.initialState).toEqual({ ...initialState, currentPlayer: 'P1' });
    expect(baselineMatch.positionTrajectory).toHaveLength(1);
    expect(JSON.parse(baselineMatch.positionTrajectory[0].boardKey)).toEqual({
      nodeStates: expect.any(Object),
      currentPlayer: expect.any(String),
      isExtraTurn: false
    });
    expect(experimentMatch).toMatchObject({
      seed: baselineMatch.seed,
      startingPlayer: baselineMatch.startingPlayer,
      strategies: baselineMatch.strategies,
      initialState: baselineMatch.initialState,
      scoringConfig: { version: 1, disableRarityBonus: true }
    });
    expect(experimentMatch.stems).toEqual(baselineMatch.stems);
    expect(experimentMatch.positionTrajectory[0].boardKey).toBe(baselineMatch.positionTrajectory[0].boardKey);
    expect(JSON.parse(baselineMatch.positionTrajectory[0].boardKey)).toMatchObject({
      nodeStates: { 'P1-0': { yang: 1, yin: 1 }, 'P2-0': { yang: 1, yin: 0 } },
      currentPlayer: 'P2',
      isExtraTurn: false
    });
    expect(report.summary.configurations[baselineId]).toMatchObject({
      unityVictory: { count: 0, rate: 0 },
      turnLimitSettlement: { count: 36, rate: 1 },
      progressAndDestruction: { progressTransitions: 36, destructionTransitions: 0 },
      repeatedBoardKeys: { keyFields: ['nodeStates', 'currentPlayer', 'isExtraTurn'], matchesWithRepeats: 0 }
    });
    expect(report.summary.configurations[baselineId].actionFrequency.actions.CONVERT)
      .toMatchObject({ count: 36, frequency: 1 });
    expect(report.summary.configurations[baselineId].matchLength.opportunities.mean).toBe(1);

    const replay = replaySeededMatch({
      initialState: baselineMatch.initialState,
      stems: baselineMatch.stems,
      selectedActions: baselineMatch.actionRecords
    });
    expect(replay.finalState).toEqual(baselineMatch.finalState);
    expect(replay.terminalResult).toEqual(baselineMatch.terminalResult);
  });

  it('counts repeated board keys without implying repeated scores or an infinite loop', () => {
    const initialState = createInitialHeadlessState({
      phase: 'DECISION',
      turnCount: 1,
      maxTurns: 5,
      currentStem: { name: '甲', color: '#2dcc70', element: 0 }
    });
    for (const playerId of ['P1', 'P2']) {
      initialState.nodeStates[`${playerId}-0`] = { yang: 2, yin: 2 };
      initialState.nodeStates[`${playerId}-1`] = { yang: 2, yin: 2 };
      initialState.nodeStates[`${playerId}-2`] = { yang: -1, yin: -1 };
    }

    const report = runBatchComparison({ samples: 1, seed: 5, maxTurns: 5, initialState });
    const match = report.results.find(result => result.configurationRole === 'baseline'
      && result.strategies.P1 === 'build-priority' && result.strategies.P2 === 'build-priority'
      && result.startingPlayer === 'P1');
    const repeat = match.repeatedBoardKeys.find(item => JSON.parse(item.boardKey).currentPlayer === 'P1');

    expect(match.actionRecords.map(record => record.action.type)).toEqual(['SKIP', 'SKIP', 'SKIP', 'SKIP']);
    expect(repeat).toMatchObject({ count: 2, firstOpportunity: 2, opportunities: [2, 4] });
    expect(JSON.parse(repeat.boardKey)).toMatchObject({
      nodeStates: { 'P1-0': { yang: 2, yin: 2 }, 'P2-2': { yang: -1, yin: -1 } },
      currentPlayer: 'P1',
      isExtraTurn: false
    });
    expect(match.positionTrajectory[1].boardKey).toBe(match.positionTrajectory[3].boardKey);
    expect(match.positionTrajectory[1].scores.P1).not.toBe(match.positionTrajectory[3].scores.P1);
    expect(report.summary.configurations['baseline:scoring-v1-000'].repeatedBoardKeys)
      .toMatchObject({ matchesWithRepeats: 18, repeatOccurrences: 36 });
  });
});

describe('batch comparison CLI', () => {
  it('writes a machine-readable paired report and prints a concise human summary', () => {
    const directory = mkdtempSync(join(tmpdir(), 'headless-batch-'));
    const outputPath = join(directory, 'comparison.json');
    try {
      const child = spawnSync(process.execPath, [
        batchCliPath,
        '--samples', '1',
        '--seed', '7',
        '--max-turns', '2',
        '--config', 'disable-rarity-bonus',
        '--out', outputPath
      ], { cwd: process.cwd(), encoding: 'utf8' });

      expect(child.status).toBe(0);
      expect(child.stderr).toBe('');
      expect(child.stdout).toContain('Planned: 36; completed: 36; failed: 0; skipped: 0');
      const report = JSON.parse(readFileSync(outputPath, 'utf8'));
      expect(report).toMatchObject({
        plan: {
          sampleCount: 1,
          maxTurns: 2,
          plannedMatches: 36,
          configurations: [{ role: 'baseline' }, { role: 'experiment', id: 'experiment:scoring-v1-001' }]
        },
        coverage: { completedMatches: 36, failedMatches: 0, completeComparisons: 18 }
      });
      expect(report.results[0]).toMatchObject({
        status: 'completed',
        seed: 7,
        randomVersion: 'mulberry32-fnv1a-v1',
        initialState: { currentPlayer: 'P1', maxTurns: 2 },
        strategyIdentities: { P1: { id: 'build-priority', version: 1 } },
        scoringConfig: { version: 1, name: 'formal-baseline' },
        consumedStemCount: 1,
        actionRecords: [{ stem: { element: expect.any(Number) } }]
      });
      expect(report.results[0].stems).toHaveLength(report.results[0].consumedStemCount);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('returns nonzero and preserves failed match reasons instead of manufacturing draws', () => {
    const directory = mkdtempSync(join(tmpdir(), 'headless-batch-failure-'));
    const statePath = join(directory, 'invalid-state.json');
    const outputPath = join(directory, 'failed-comparison.json');
    writeFileSync(statePath, JSON.stringify({ phase: 'DECISION' }));
    try {
      const child = spawnSync(process.execPath, [
        batchCliPath,
        '--samples=1',
        '--seed=7',
        '--initial-state', statePath,
        '--out', outputPath
      ], { cwd: process.cwd(), encoding: 'utf8' });

      expect(child.status).toBe(1);
      expect(child.stdout).toContain('Planned: 36; completed: 0; failed: 36; skipped: 0');
      const report = JSON.parse(readFileSync(outputPath, 'utf8'));
      expect(report.coverage).toMatchObject({
        plannedMatches: 36,
        completedMatches: 0,
        failedMatches: 36,
        failedComparisons: 18,
        failureReasons: [{ code: 'INVALID_STATE', count: 36 }]
      });
      expect(report.results.every(result => result.status === 'failed' && result.error.code === 'INVALID_STATE')).toBe(true);
      expect(report.summary.configurations['baseline:scoring-v1-000'].winLossDrawMatrix['build-priority']['build-priority'])
        .toMatchObject({ P1: 0, P2: 0, draws: 0, completedMatches: 0, winValue: { P1: null, P2: null } });
      expect(report.summary.pairedComparison.byStrategyPair['build-priority|build-priority'])
        .toMatchObject({ plannedClusters: 1, completeClusters: 0, pairedWinValueDelta: { mean: null, sampleClusters: 0 } });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('returns nonzero for an unknown rule configuration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'headless-batch-invalid-config-'));
    const outputPath = join(directory, 'should-not-exist.json');
    try {
      const child = spawnSync(process.execPath, [
        batchCliPath, '--config', 'not-a-rule', '--out', outputPath
      ], { cwd: process.cwd(), encoding: 'utf8' });

      expect(child.status).toBe(1);
      expect(child.stderr).toContain('unknown --config not-a-rule');
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

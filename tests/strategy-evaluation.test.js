import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { runStrategyEvaluationStudy } from '../src/js/logic/headless/StrategyEvaluation.js';
import { reachableFixedPositions } from './fixtures/fixed-position-continuations/reachable-positions.js';

const cliPath = new URL('../scripts/headless-strategy-evaluation.js', import.meta.url).pathname;
const criteria = {
  minimumEffect: 0.1,
  minimumPairs: 3,
  uncertaintyMethod: 'paired-normal-95',
  evidenceRule: 'interval-excludes-zero'
};

describe('crossover evaluation public API', () => {
  it('keeps holdout seeds untouched when discovery has fewer paired samples than preregistered', async () => {
    const { evaluateCrossoverConfirmation } = await import('../src/js/logic/headless/StrategyEvaluation.js');
    const report = evaluateCrossoverConfirmation({
      positions: [reachableFixedPositions[3]],
      focalStrategy: 'build-priority',
      opponents: [
        { id: 'build', strategy: 'build-priority' },
        { id: 'attack', strategy: 'attack-priority' }
      ],
      discoverySeeds: [71, 72],
      confirmationSeeds: [91, 92],
      scoringConfig: {},
      criteria
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      configuration: {
        focalStrategy: { id: 'build-priority', version: 1 },
        scoringConfig: { version: 1, name: 'formal-baseline' },
        criteria
      }
    });
    expect(report.discovery.comparisons).toHaveLength(2);
    expect(report.discovery.comparisons.every(comparison => comparison.evaluationType === 'paired-fixed-first-action-continuations')).toBe(true);
    expect(report.discovery.pairs).toHaveLength(1);
    expect(report.discovery.pairs[0].opponents).toHaveLength(2);
    expect(report.discovery.pairs[0].opponents.map(opponent => opponent.counts.completed)).toEqual([2, 2]);
    expect(report.discovery.pairs[0].opponents[0].counts).toMatchObject({
      requested: 2,
      actions: {
        A: { wins: expect.any(Number), draws: expect.any(Number), losses: expect.any(Number) },
        B: { wins: expect.any(Number), draws: expect.any(Number), losses: expect.any(Number) }
      }
    });
    expect(report.confirmation.comparisons).toEqual([]);
    expect(report.confirmation.pairs[0]).toMatchObject({
      positionId: reachableFixedPositions[3].id,
      candidateIndices: [0, 1],
      discoveryClassification: expect.any(String),
      status: 'not-run'
    });
  });

  it('accounts for a shared continuation budget and exposes raw replayable comparison results', async () => {
    const { evaluateCrossoverConfirmation } = await import('../src/js/logic/headless/StrategyEvaluation.js');
    const report = evaluateCrossoverConfirmation({
      positions: [reachableFixedPositions[3]],
      focalStrategy: 'build-priority',
      opponents: [
        { id: 'build', strategy: 'build-priority' },
        { id: 'attack', strategy: 'attack-priority' }
      ],
      discoverySeeds: [73, 74],
      confirmationSeeds: [93, 94],
      scoringConfig: {},
      criteria,
      maxRuns: 1
    });

    const comparisons = [...report.discovery.comparisons, ...report.confirmation.comparisons];
    const attempted = comparisons.reduce((total, comparison) => total + comparison.summary.attemptedMatchCount, 0);
    expect(attempted).toBeLessThanOrEqual(1);
    expect(report.summary.coverage).toMatchObject({ planned: expect.any(Number), attempted, budgetSkipped: expect.any(Number) });
    expect(comparisons[0].firstActions[0].samples[0]).toMatchObject({
      status: 'completed',
      seed: 73,
      replay: {
        initialState: expect.any(Object),
        stems: expect.any(Array),
        actionRecords: expect.any(Array),
        terminalResult: expect.any(Object)
      }
    });
  });
});

describe('strategy evaluation study public API', () => {
  it('runs all five preregistered scoring selections and records a shared exhausted budget honestly', () => {
    const report = runStrategyEvaluationStudy({
      positions: [reachableFixedPositions[3]],
      discoverySamples: 1,
      confirmationSamples: 1,
      seed: 75,
      maxTurns: 2,
      config: 'all',
      maxRuns: 0,
      revision: { commit: 'fixture-commit', workingTree: 'fixture-snapshot' }
    });

    expect(report.plan.scoringSelections.map(selection => selection.id)).toEqual([
      'formal-baseline', 'no-self-cost-reward', 'burst-action-score-once', 'disable-rarity-bonus', 'combined'
    ]);
    expect(report.plan.discoverySeeds).toEqual([75]);
    expect(report.plan.confirmationSeeds).toEqual([76]);
    expect(report.evaluations).toHaveLength(45);
    expect(report.batchComparisons).toHaveLength(5);
    expect(report.summary).toMatchObject({
      status: 'incomplete',
      coverage: { failed: 0, skipped: 180, continuationBudgetAttempted: 0 },
      baselineControls: 90
    });
    expect(report.humanCases.some(item => item.kind === 'public-policy-action-disagreement')).toBe(true);
    expect(report.revision).toEqual({ commit: 'fixture-commit', workingTree: 'fixture-snapshot' });
    expect(report.researchMarkdown).toContain('## Observed facts');
    expect(report.researchMarkdown).toContain('## Limited inference');
    expect(report.researchMarkdown).toContain('## Human questions');
  });
});

describe('strategy evaluation CLI', () => { 
  it('documents the reproducible small-run options without starting an experiment', () => {
    const result = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--discovery-samples');
    expect(result.stdout).toContain('--confirmation-samples');
    expect(result.stdout).toContain('--max-runs');
    expect(result.stdout).toContain('formal-baseline');
    expect(result.stdout).toContain('all');
    expect(result.stderr).toBe('');
  });

  it('writes a compressed replay artifact and coverage report when a valid budget is exhausted', () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), 'strategy-evaluation-budget-'));
    try {
      const result = spawnSync(process.execPath, [
        cliPath, '--samples', '1', '--seed', '76', '--max-turns', '2', '--config', 'formal-baseline',
        '--max-runs', '0', '--out', outputDirectory
      ], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(existsSync(join(outputDirectory, 'evaluation.json'))).toBe(true);
      expect(existsSync(join(outputDirectory, 'evaluation-full.json.gz'))).toBe(true);
      expect(existsSync(join(outputDirectory, 'research.md'))).toBe(true);
      expect(JSON.parse(readFileSync(join(outputDirectory, 'evaluation.json'), 'utf8')))
        .toMatchObject({ status: 'incomplete', summary: { coverage: { skipped: expect.any(Number) } } });
      const full = JSON.parse(gunzipSync(readFileSync(join(outputDirectory, 'evaluation-full.json.gz'))).toString('utf8'));
      expect(full.evaluations[0].result.discovery.comparisons[0].firstActions[0].samples[0])
        .toMatchObject({ status: 'not-run-budget' });
      expect(readFileSync(join(outputDirectory, 'research.md'), 'utf8')).toContain('## Human questions');
      expect(JSON.parse(readFileSync(join(outputDirectory, 'missing-data.json'), 'utf8')))
        .toMatchObject({ status: 'failed', coverage: { failed: 0, skipped: expect.any(Number) }, failures: expect.arrayContaining([expect.objectContaining({ phase: expect.stringContaining('discovery'), reason: expect.stringContaining('budget') })]) });
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it('honors a requested output directory even when argument parsing fails', () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), 'strategy-evaluation-parse-error-'));
    try {
      const result = spawnSync(process.execPath, [cliPath, '--unknown', '--out', outputDirectory], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(existsSync(join(outputDirectory, 'missing-data.json'))).toBe(true);
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it('writes an explicit missing-data report and exits nonzero for invalid choices', () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), 'strategy-evaluation-invalid-'));
    try {
      const result = spawnSync(process.execPath, [cliPath, '--config', 'invented', '--out', outputDirectory], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unknown --config invented');
      expect(result.stderr).toContain('Missing-data report:');
      expect(existsSync(join(outputDirectory, 'missing-data.json'))).toBe(true);
      expect(JSON.parse(readFileSync(join(outputDirectory, 'missing-data.json'), 'utf8')))
        .toMatchObject({ status: 'failed', coverage: { completed: 0, missingReason: expect.stringContaining('unknown --config') } });
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});

#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_EXPERIMENTAL_SCORING_CONFIG, runBatchComparison } from '../src/js/logic/headless/BatchComparison.js';

const CONFIGURATIONS = Object.freeze({
  'formal-baseline': Object.freeze({}),
  experimental: DEFAULT_EXPERIMENTAL_SCORING_CONFIG,
  'no-self-cost-reward': Object.freeze({ version: 1, noSelfCostReward: true }),
  'burst-action-score-once': Object.freeze({ version: 1, burstActionScoreOnce: true }),
  'disable-rarity-bonus': Object.freeze({ version: 1, disableRarityBonus: true })
});
const DEFAULTS = Object.freeze({ samples: 2, seed: 202603, maxTurns: 12, config: 'experimental', out: 'headless-batch-comparison.json' });
const USAGE = `Usage: npm run headless:compare -- [options]

Options:
  --samples <positive integer>    Independent seed clusters (default: ${DEFAULTS.samples})
  --seed <integer|string>         Base deterministic seed (default: ${DEFAULTS.seed})
  --max-turns <positive integer>  Turn limit per match (default: ${DEFAULTS.maxTurns})
  --config <name>                 Candidate rule preset: ${Object.keys(CONFIGURATIONS).join(', ')}
  --initial-state <path>          Optional complete headless state JSON template
  --out <path>                    JSON report destination (default: ${DEFAULTS.out})
  --help                          Show this help`;

function parsePositiveInteger(value, name) {
  if (!/^\d+$/.test(value)) throw new TypeError(`--${name} must be a positive safe integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new TypeError(`--${name} must be a positive safe integer`);
  return parsed;
}

function parseSeed(value) {
  if (value.length === 0) throw new TypeError('--seed must be a non-empty string or safe integer');
  if (/^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return value;
}

function parseArguments(args) {
  const options = { ...DEFAULTS, help: false, initialStatePath: null };
  const allowed = new Set(['--samples', '--seed', '--max-turns', '--config', '--initial-state', '--out']);
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    const equalsIndex = argument.indexOf('=');
    const name = equalsIndex < 0 ? argument : argument.slice(0, equalsIndex);
    if (!allowed.has(name)) throw new TypeError(`unknown option ${name}\n${USAGE}`);
    const value = equalsIndex < 0 ? args[++index] : argument.slice(equalsIndex + 1);
    if (value === undefined || value.length === 0 || value.startsWith('--')) {
      throw new TypeError(`${name} requires a value`);
    }
    switch (name) {
      case '--samples': options.samples = parsePositiveInteger(value, 'samples'); break;
      case '--seed': options.seed = parseSeed(value); break;
      case '--max-turns': options.maxTurns = parsePositiveInteger(value, 'max-turns'); break;
      case '--config': options.config = value; break;
      case '--initial-state': options.initialStatePath = value; break;
      case '--out': options.out = value; break;
      default: throw new TypeError(`unsupported option ${name}`);
    }
  }
  if (!Object.hasOwn(CONFIGURATIONS, options.config)) {
    throw new TypeError(`unknown --config ${options.config}; choose one of ${Object.keys(CONFIGURATIONS).join(', ')}`);
  }
  return options;
}

function fixed(value, digits = 3) {
  return value === null || value === undefined ? 'n/a' : Number(value).toFixed(digits);
}

function outcomeCounts(summary) {
  return Object.values(summary.winLossDrawMatrix).flatMap(row => Object.values(row)).reduce((total, cell) => ({
    P1: total.P1 + cell.P1,
    P2: total.P2 + cell.P2,
    draws: total.draws + cell.draws
  }), { P1: 0, P2: 0, draws: 0 });
}

function formatHumanReport(report, outputPath) {
  const lines = [
    'Headless strategy batch comparison',
    `Planned: ${report.plan.plannedMatches}; completed: ${report.coverage.completedMatches}; failed: ${report.coverage.failedMatches}; skipped: ${report.coverage.skippedMatches}`,
    `Comparisons: ${report.plan.plannedComparisons}; complete: ${report.coverage.completeComparisons}; incomplete: ${report.coverage.failedComparisons}`,
    `Seed: ${JSON.stringify(report.plan.baseSeed)}; independent seed clusters: ${report.plan.sampleCount}; random: ${report.plan.randomVersion}`,
    `JSON report: ${outputPath}`
  ];
  for (const failure of report.coverage.failureReasons) {
    lines.push(`Failure ${failure.code ?? 'Error'} x${failure.count}: ${failure.message}`);
  }
  for (const skipped of report.coverage.skippedReasons) {
    lines.push(`Skipped x${skipped.count}: ${skipped.reason}`);
  }

  for (const configuration of report.plan.configurations) {
    const summary = report.summary.configurations[configuration.id];
    const counts = outcomeCounts(summary);
    const outcomes = counts.P1 + counts.P2 + counts.draws;
    const p1Value = outcomes ? (counts.P1 + counts.draws / 2) / outcomes : null;
    const p2Value = outcomes ? (counts.P2 + counts.draws / 2) / outcomes : null;
    const actions = Object.entries(summary.actionFrequency.actions)
      .map(([type, metric]) => `${type} ${fixed(metric.frequency)}`).join(', ') || 'none';
    lines.push(`${configuration.role} ${configuration.id}: P1/P2/draw ${counts.P1}/${counts.P2}/${counts.draws}; value ${fixed(p1Value)}/${fixed(p2Value)}; actions ${actions}`);
    lines.push(`  Length mean ${fixed(summary.matchLength.opportunities.mean, 2)}; unity wins ${summary.unityVictory.count}/${summary.completedMatches}; turn-limit settlements ${summary.turnLimitSettlement.count}/${summary.completedMatches}; repeated-key matches ${summary.repeatedBoardKeys.matchesWithRepeats}`);
  }

  lines.push('Paired P1 win-value differences (experiment − baseline; seed-clustered):');
  for (const pair of Object.values(report.summary.pairedComparison.byStrategyPair)) {
    const delta = pair.pairedWinValueDelta;
    const interval = delta.confidenceInterval95
      ? `[${fixed(delta.confidenceInterval95.lower)}, ${fixed(delta.confidenceInterval95.upper)}]`
      : 'n/a';
    lines.push(`  ${pair.strategies.P1} vs ${pair.strategies.P2}: ${fixed(delta.mean)} 95% CI ${interval} (clusters ${delta.sampleClusters}/${pair.plannedClusters})`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArguments(args);
    if (options.help) {
      process.stdout.write(`${USAGE}\n`);
      return 0;
    }
    const initialState = options.initialStatePath
      ? JSON.parse(await readFile(resolve(options.initialStatePath), 'utf8'))
      : undefined;
    const report = runBatchComparison({
      samples: options.samples,
      seed: options.seed,
      maxTurns: options.maxTurns,
      initialState,
      experimentalScoringConfig: CONFIGURATIONS[options.config]
    });
    report.plan.experimentSelection = options.config;

    const outputPath = resolve(options.out);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(formatHumanReport(report, outputPath));
    const incomplete = report.coverage.failedMatches > 0 || report.coverage.skippedMatches > 0
      || report.coverage.completedMatches !== report.plan.plannedMatches
      || report.coverage.failedComparisons > 0;
    return incomplete ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${error.message ?? String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const CONFIGURATION_NAMES = Object.freeze([
  'formal-baseline', 'no-self-cost-reward', 'burst-action-score-once', 'disable-rarity-bonus', 'combined', 'all'
]);
const DEFAULTS = Object.freeze({
  samples: null,
  discoverySamples: 2,
  confirmationSamples: 2,
  seed: 202603,
  maxTurns: 12,
  config: 'all',
  out: 'reports/headless-strategy-evaluation/small-run',
  maxRuns: null,
  minimumEffect: 0.1,
  minimumPairs: 6
});
const USAGE = `Usage: npm run headless:evaluate -- [options]

Options:
  --samples <positive integer>          Set discovery and confirmation samples together
  --discovery-samples <positive integer> Exploration seed count (default: ${DEFAULTS.discoverySamples})
  --confirmation-samples <positive integer> Independent holdout seed count (default: ${DEFAULTS.confirmationSamples})
  --seed <integer|string>               Base deterministic seed (default: ${DEFAULTS.seed})
  --max-turns <positive integer>        Turn limit (default: ${DEFAULTS.maxTurns})
  --config <name|all>                   Selection: ${CONFIGURATION_NAMES.join(', ')} (default: all)
  --max-runs <non-negative integer>     Overall fixed-continuation budget (default: unlimited)
  --minimum-effect <number>             Preregistered minimum value difference (default: ${DEFAULTS.minimumEffect})
  --minimum-pairs <positive integer>    Preregistered evidence floor (default: ${DEFAULTS.minimumPairs})
  --out <directory>                     Artifact directory (default: ${DEFAULTS.out})
  --help                                Show this help`;

function parsePositiveInteger(value, name) {
  if (!/^\d+$/.test(value)) throw new TypeError(`--${name} must be a positive safe integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new TypeError(`--${name} must be a positive safe integer`);
  return parsed;
}

function parseNonNegativeInteger(value, name) {
  if (!/^\d+$/.test(value)) throw new TypeError(`--${name} must be a non-negative safe integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new TypeError(`--${name} must be a non-negative safe integer`);
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
  const options = { ...DEFAULTS, help: false };
  const allowed = new Set([
    '--samples', '--discovery-samples', '--confirmation-samples', '--seed', '--max-turns',
    '--config', '--max-runs', '--minimum-effect', '--minimum-pairs', '--out'
  ]);
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
    if (value === undefined || value.length === 0 || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
    switch (name) {
      case '--samples':
        options.samples = parsePositiveInteger(value, 'samples');
        options.discoverySamples = options.samples;
        options.confirmationSamples = options.samples;
        break;
      case '--discovery-samples': options.discoverySamples = parsePositiveInteger(value, 'discovery-samples'); break;
      case '--confirmation-samples': options.confirmationSamples = parsePositiveInteger(value, 'confirmation-samples'); break;
      case '--seed': options.seed = parseSeed(value); break;
      case '--max-turns': options.maxTurns = parsePositiveInteger(value, 'max-turns'); break;
      case '--config': options.config = value; break;
      case '--max-runs': options.maxRuns = parseNonNegativeInteger(value, 'max-runs'); break;
      case '--minimum-effect':
        options.minimumEffect = Number(value);
        if (!Number.isFinite(options.minimumEffect) || options.minimumEffect < 0 || options.minimumEffect > 1) {
          throw new TypeError('--minimum-effect must be a finite number from 0 to 1');
        }
        break;
      case '--minimum-pairs': options.minimumPairs = parsePositiveInteger(value, 'minimum-pairs'); break;
      case '--out': options.out = value; break;
      default: throw new TypeError(`unsupported option ${name}`);
    }
  }
  return options;
}

function requestedOutput(args) {
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument.startsWith('--out=')) return argument.slice('--out='.length);
    if (argument === '--out' && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  }
  return null;
}

function filesRecursively(directory, includeFile = () => true) {
  return readdirSync(resolve(REPOSITORY_ROOT, directory), { withFileTypes: true })
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    .flatMap(entry => {
      const relativePath = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return filesRecursively(relativePath, includeFile);
      return entry.isFile() && includeFile(relativePath) ? [relativePath] : [];
    });
}

function sourceManifest() {
  const paths = [
    ...filesRecursively('src/js'),
    ...filesRecursively('scripts', path => path.endsWith('.js')),
    'tests/fixtures/fixed-position-continuations/reachable-positions.js',
    'package.json',
    'package-lock.json'
  ].sort();
  return paths.map(path => ({
    path,
    sha256: createHash('sha256').update(readFileSync(resolve(REPOSITORY_ROOT, path))).digest('hex')
  }));
}

function currentRevision() {
  const revision = { commit: null, workingTree: null };
  try {
    revision.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPOSITORY_ROOT, encoding: 'utf8' }).trim();
    revision.workingTree = execFileSync('git', ['status', '--short'], { cwd: REPOSITORY_ROOT, encoding: 'utf8' }).trim();
  } catch (error) {
    revision.error = error.message;
  }
  try {
    revision.sourceManifest = sourceManifest();
    revision.sourceSha256 = createHash('sha256').update(JSON.stringify(revision.sourceManifest)).digest('hex');
  } catch (error) {
    revision.sourceManifest = [];
    revision.sourceSha256 = null;
    revision.sourceError = error.message;
  }
  return revision;
}

function resolveFromRepository(path) {
  return isAbsolute(path) ? resolve(path) : resolve(REPOSITORY_ROOT, path);
}

function collectFailureReasons(evaluation) {
  const reasons = new Map();
  const add = (phase, reason, count = 1) => {
    const key = `${phase}:${reason}`;
    const previous = reasons.get(key);
    if (previous) previous.count += count;
    else reasons.set(key, { phase, reason, count });
  };
  for (const comparison of evaluation.batchComparisons ?? []) {
    for (const failure of comparison.result.coverage.failureReasons ?? []) {
      add(`batch ${comparison.selection}`, `${failure.code ?? 'Error'}: ${failure.message}`, failure.count);
    }
  }
  for (const item of evaluation.evaluations ?? []) {
    for (const phase of ['discovery', 'confirmation']) {
      for (const comparison of item.result[phase].comparisons) {
        for (const failure of comparison.failures ?? []) add(`${phase} ${item.selection}/${item.focalStrategy}`, `${failure.error.code ?? failure.error.name}: ${failure.error.message}`);
        for (const skipped of comparison.budgetSkipped ?? []) add(`${phase} ${item.selection}/${item.focalStrategy}`, skipped.reason);
      }
    }
  }
  return [...reasons.values()];
}

async function writeMissingDataReport(outputDirectory, error, options = null, evaluation = null) {
  const resolvedOutputDirectory = resolveFromRepository(outputDirectory);
  await mkdir(resolvedOutputDirectory, { recursive: true });
  const coverage = evaluation?.summary?.coverage;
  const report = {
    schemaVersion: 1,
    status: 'failed',
    reason: error?.message ?? String(error),
    configuration: options,
    coverage: coverage ?? { planned: null, completed: 0, failed: 0, skipped: 0, missingReason: error?.message ?? String(error) },
    failures: evaluation ? collectFailureReasons(evaluation) : [],
    revision: currentRevision()
  };
  await writeFile(resolve(resolvedOutputDirectory, 'missing-data.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const coverageText = `- Planned/completed/failed/skipped: ${report.coverage.planned ?? 'unknown'}/${report.coverage.completed ?? 0}/${report.coverage.failed ?? 0}/${report.coverage.skipped ?? 0}`;
  const failureText = report.failures.length ? `\n\n## Failure and skip reasons\n\n${report.failures.map(failure => `- ${failure.phase}: ${failure.reason} (count ${failure.count})`).join('\n')}` : '';
  await writeFile(resolve(resolvedOutputDirectory, 'missing-data.md'), `# Headless strategy evaluation: missing data\n\nThe evaluation did not complete. No missing run is counted as a draw.\n\n- Reason: ${report.reason}\n${coverageText}\n- Revision: ${report.revision.commit ?? 'unavailable'}\n- Working-tree status: ${report.revision.workingTree ?? 'unavailable'}\n- Source SHA-256: ${report.revision.sourceSha256 ?? 'unavailable'}${failureText}\n`, 'utf8');
}

async function runEvaluation(options) {
  const { reachableFixedPositions } = await import('../tests/fixtures/fixed-position-continuations/reachable-positions.js');
  const { runStrategyEvaluationStudy } = await import('../src/js/logic/headless/StrategyEvaluation.js');
  return runStrategyEvaluationStudy({ ...options, positions: reachableFixedPositions, revision: currentRevision() });
}

async function main(args = process.argv.slice(2)) {
  let options;
  try {
    options = parseArguments(args);
    if (!CONFIGURATION_NAMES.includes(options.config)) {
      throw new TypeError(`unknown --config ${options.config}; choose one of ${CONFIGURATION_NAMES.join(', ')}`);
    }
    if (options.help) {
      process.stdout.write(`${USAGE}\n`);
      return 0;
    }
    const outputDirectory = resolveFromRepository(options.out);
    try {
      const report = await runEvaluation(options);
      await mkdir(outputDirectory, { recursive: true });
      const machineSummary = report.machineSummary ?? report;
      await writeFile(resolve(outputDirectory, 'evaluation.json'), `${JSON.stringify(machineSummary, null, 2)}\n`, 'utf8');
      await writeFile(resolve(outputDirectory, 'evaluation-full.json.gz'), gzipSync(Buffer.from(`${JSON.stringify(report)}\n`)));
      await writeFile(resolve(outputDirectory, 'research.md'), `${report.researchMarkdown ?? formatResearchReport(report)}\n`, 'utf8');
      process.stdout.write(`Evaluation report: ${resolve(outputDirectory, 'evaluation.json')}\n`);
      if (hasIncompleteCoverage(report)) {
        await writeMissingDataReport(outputDirectory, new Error('planned evaluation runs failed or were skipped'), options, report);
        process.stderr.write(`Evaluation coverage is incomplete. Missing-data report: ${resolve(outputDirectory, 'missing-data.md')}\n`);
        return 1;
      }
      return 0;
    } catch (error) {
      await writeMissingDataReport(outputDirectory, error, options);
      process.stderr.write(`${error.message ?? String(error)}\nMissing-data report: ${resolve(outputDirectory, 'missing-data.md')}\n`);
      return 1;
    }
  } catch (error) {
    const outputDirectory = resolveFromRepository(options?.out ?? requestedOutput(args) ?? DEFAULTS.out);
    await writeMissingDataReport(outputDirectory, error, options ?? null);
    process.stderr.write(`${error.message ?? String(error)}\nMissing-data report: ${resolve(outputDirectory, 'missing-data.md')}\n`);
    return 1;
  }
}

function hasIncompleteCoverage(report) {
  if (report.summary?.status === 'failed') return true;
  const coverage = report.summary?.coverage ?? report.coverage;
  if (!coverage) return false;
  if (['failed', 'failedRuns', 'failedMatches', 'skipped', 'budgetSkipped'].some(key => (coverage[key] ?? 0) > 0)) return true;
  return Number.isFinite(coverage.planned) && Number.isFinite(coverage.completed) && coverage.completed < coverage.planned;
}

function formatResearchReport(report) {
  const lines = [
    '# Headless strategy evaluation',
    '',
    '## Findings',
    '',
    '- **Observed facts:** See the machine report for configuration-level counts, outcomes, and fixed-position estimates.',
    '- **Limited inference:** Fixed-position values are conditional on the selected public continuation policies and tested reachable checkpoints; they are not globally optimal action values.',
    '- **Human questions:** Automated evidence cannot establish whether a person notices or enjoys the action trade-off. Use only recorded disagreement cases in the report.',
    '',
    'No automatic formal-scoring changes are proposed. A longer match, more even action frequencies, or closer score alone is not treated as improvement.',
    '',
    'The structured artifact records replay inputs, exact actions, seeds, scoring snapshots, coverage, failure and budget omissions.'
  ];
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}

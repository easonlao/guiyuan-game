#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runAttackBuffSweep,
  runFullAttackBuffExperiment,
  buildAttackBuffExperimentReportMarkdown
} from '../../src/js/logic/headless/ExperimentAttackBuffSweep.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../..');

// Parse CLI flags
const args = process.argv.slice(2);
let seedsCount = 200;
const seedsArgIdx = args.indexOf('--seeds');
if (seedsArgIdx !== -1 && args[seedsArgIdx + 1]) {
  seedsCount = parseInt(args[seedsArgIdx + 1], 10);
}

let sweepSeedsCount = 50;
const sweepSeedsArgIdx = args.indexOf('--sweep-seeds');
if (sweepSeedsArgIdx !== -1 && args[sweepSeedsArgIdx + 1]) {
  sweepSeedsCount = parseInt(args[sweepSeedsArgIdx + 1], 10);
}

let outDir = resolve(rootDir, 'reports/balance-diagnostics/experiments');
const outDirIdx = args.indexOf('--out-dir');
if (outDirIdx !== -1 && args[outDirIdx + 1]) {
  outDir = resolve(process.cwd(), args[outDirIdx + 1]);
}

let baselinePath = resolve(rootDir, 'reports/balance-diagnostics/score-unity-overlap/data.json');
const baselineIdx = args.indexOf('--baseline');
if (baselineIdx !== -1 && args[baselineIdx + 1]) {
  baselinePath = resolve(process.cwd(), args[baselineIdx + 1]);
}

let exp01Path = resolve(rootDir, 'reports/balance-diagnostics/experiments/01-nerf-burst-rarity-data.json');
const exp01Idx = args.indexOf('--exp01');
if (exp01Idx !== -1 && args[exp01Idx + 1]) {
  exp01Path = resolve(process.cwd(), args[exp01Idx + 1]);
}

let baselineData = null;
if (existsSync(baselinePath)) {
  console.log(`Loading baseline data from ${baselinePath}...`);
  baselineData = JSON.parse(readFileSync(baselinePath, 'utf8'));
} else {
  console.warn(`Baseline data not found at ${baselinePath}. Report will evaluate experimental run standalone.`);
}

let exp01Data = null;
if (existsSync(exp01Path)) {
  console.log(`Loading Experiment 01 data from ${exp01Path}...`);
  exp01Data = JSON.parse(readFileSync(exp01Path, 'utf8'));
} else {
  console.warn(`Experiment 01 data not found at ${exp01Path}.`);
}

// -------------------------------------------------------------
// Step 1: Parameter Sweep
// -------------------------------------------------------------
console.log(`\n=== Phase 1: Parameter Sweep across [1.5x, 2.0x, 2.5x] with ${sweepSeedsCount} seeds ===`);
const sweepSeeds = Array.from({ length: sweepSeedsCount }, (_, i) => 202603 + i);
const sweepSummary = runAttackBuffSweep({
  sweepMultipliers: [1.5, 2.0, 2.5],
  seeds: sweepSeeds,
  sweepPairings: ['strong-d1-vs-rule', 'search-d1-score'],
  maxTurns: 60
});

console.log('\nSweep Results:');
for (const c of sweepSummary.candidates) {
  const status = c.guardrail2Pass ? 'PASS' : 'FAIL';
  console.log(`  [${c.multiplier.toFixed(1)}x] Strong Win Rate: ${(c.strongWinRate * 100).toFixed(1)}% (${status} >=65%), Midgame Score Leader Win Rate: ${(c.divergentScoreLeaderWinRate * 100).toFixed(1)}% (Distance to 50%: ${(c.divergentDistanceTo50 * 100).toFixed(1)}%)`);
}
console.log(`\nDecision Rationale: ${sweepSummary.rationale}`);
console.log(`Selected Optimal Multiplier: ${sweepSummary.selectedMultiplier.toFixed(1)}x`);

// -------------------------------------------------------------
// Step 2: Full Diagnostic Run with Selected Multiplier
// -------------------------------------------------------------
console.log(`\n=== Phase 2: Full Diagnostic with ${seedsCount} seeds using ${sweepSummary.selectedMultiplier.toFixed(1)}x multiplier ===`);
const fullSeeds = Array.from({ length: seedsCount }, (_, i) => 202603 + i);
const fullExperimentData = runFullAttackBuffExperiment({
  multiplier: sweepSummary.selectedMultiplier,
  maxTurns: 60,
  seeds: fullSeeds
});

console.log(`Full diagnostic completed in ${(fullExperimentData.totalElapsedMs / 1000).toFixed(2)}s for ${fullExperimentData.totalMatches} matches.`);

// Build Markdown Report
const reportMarkdown = buildAttackBuffExperimentReportMarkdown({
  sweepSummary,
  fullExperimentData,
  baselineData,
  exp01Data,
  revision: { commit: 'integration/balance-diagnostics', sourceSha256: 'active' },
  replayCommand: `node scripts/experiments/02-attack-buff-sweep.js --seeds ${seedsCount} --sweep-seeds ${sweepSeedsCount}`
});

const reportPath = resolve(outDir, '02-attack-buff-sweep.md');
const dataPath = resolve(outDir, '02-attack-buff-sweep-data.json');

try {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(dataPath, JSON.stringify({ sweepSummary, ...fullExperimentData }, null, 2), 'utf8');
  writeFileSync(reportPath, reportMarkdown, 'utf8');
  console.log(`\nExperiment report successfully written to ${reportPath}`);
  console.log(`Experiment data successfully written to ${dataPath}`);
} catch (err) {
  if (err.code === 'EROFS') {
    const fallbackDir = '/tmp/balance-diagnostics-experiments';
    mkdirSync(fallbackDir, { recursive: true });
    writeFileSync(resolve(fallbackDir, '02-attack-buff-sweep-data.json'), JSON.stringify({ sweepSummary, ...fullExperimentData }, null, 2), 'utf8');
    writeFileSync(resolve(fallbackDir, '02-attack-buff-sweep.md'), reportMarkdown, 'utf8');
    console.log(`\nFilesystem read-only. Written to fallback ${fallbackDir}`);
  } else {
    throw err;
  }
}

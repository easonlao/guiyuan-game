#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runNerfBurstExperiment,
  buildNerfBurstExperimentReportMarkdown
} from '../../src/js/logic/headless/ExperimentNerfBurstRarity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../..');

// Parse CLI flags
const args = process.argv.slice(2);
let seedsCount = 200;
const seedsArgIdx = args.indexOf('--seeds');
if (seedsArgIdx !== -1 && args[seedsArgIdx + 1]) {
  seedsCount = parseInt(args[seedsArgIdx + 1], 10);
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

let baselineData = null;
if (existsSync(baselinePath)) {
  console.log(`Loading baseline data from ${baselinePath}...`);
  baselineData = JSON.parse(readFileSync(baselinePath, 'utf8'));
} else {
  console.warn(`Baseline data not found at ${baselinePath}. Report will evaluate experimental run standalone.`);
}

console.log(`Starting Nerf Burst Rarity Experiment with ${seedsCount} seeds (60 turns, 6 pairings, starter swaps)...`);

const seeds = Array.from({ length: seedsCount }, (_, i) => 202603 + i);
const experimentData = runNerfBurstExperiment({
  maxTurns: 60,
  seeds
});

console.log(`Experiment completed in ${(experimentData.totalElapsedMs / 1000).toFixed(2)}s for ${experimentData.totalMatches} matches.`);

const reportMarkdown = buildNerfBurstExperimentReportMarkdown(experimentData, baselineData, {
  revision: { commit: 'integration/balance-diagnostics', sourceSha256: 'active' },
  replayCommand: `node scripts/experiments/01-nerf-burst-rarity.js --seeds ${seedsCount}`
});

const reportPath = resolve(outDir, '01-nerf-burst-rarity.md');
const dataPath = resolve(outDir, '01-nerf-burst-rarity-data.json');

try {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(dataPath, JSON.stringify(experimentData, null, 2), 'utf8');
  writeFileSync(reportPath, reportMarkdown, 'utf8');
  console.log(`Experiment report successfully written to ${reportPath}`);
  console.log(`Experiment data successfully written to ${dataPath}`);
} catch (err) {
  if (err.code === 'EROFS') {
    const fallbackDir = '/tmp/balance-diagnostics-experiments';
    mkdirSync(fallbackDir, { recursive: true });
    writeFileSync(resolve(fallbackDir, '01-nerf-burst-rarity-data.json'), JSON.stringify(experimentData, null, 2), 'utf8');
    writeFileSync(resolve(fallbackDir, '01-nerf-burst-rarity.md'), reportMarkdown, 'utf8');
    console.log(`Filesystem read-only. Written to fallback ${fallbackDir}`);
  } else {
    throw err;
  }
}

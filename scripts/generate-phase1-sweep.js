#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPhase1Sweep, buildPhase1ReportMarkdown } from '../src/js/logic/headless/Phase1SweepRunner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Parse CLI flags
const args = process.argv.slice(2);
let seedsCount = 200;
const seedsArgIdx = args.indexOf('--seeds');
if (seedsArgIdx !== -1 && args[seedsArgIdx + 1]) {
  seedsCount = parseInt(args[seedsArgIdx + 1], 10);
}

let outDir = '/tmp/phase1-sweep';
const outDirIdx = args.indexOf('--out-dir');
if (outDirIdx !== -1 && args[outDirIdx + 1]) {
  outDir = args[outDirIdx + 1];
}

console.log(`Starting Phase 1 balance sweep with ${seedsCount} seeds...`);

const sweepData = runPhase1Sweep({
  maxTurnsList: [12, 20, 30, 45, 60],
  seeds: Array.from({ length: seedsCount }, (_, i) => 202603 + i)
});

console.log(`Sweep completed in ${(sweepData.totalElapsedMs / 1000).toFixed(2)}s for ${sweepData.totalRuns} total runs.`);

const reportMarkdown = buildPhase1ReportMarkdown(sweepData, {
  revision: { commit: 'integration/balance-diagnostics', sourceSha256: 'active' },
  replayCommand: `node scripts/generate-phase1-sweep.js --seeds ${seedsCount}`
});

mkdirSync(outDir, { recursive: true });

writeFileSync(resolve(outDir, 'data.json'), JSON.stringify(sweepData, null, 2), 'utf8');
writeFileSync(resolve(outDir, 'report.md'), reportMarkdown, 'utf8');

console.log(`Report and data successfully written to ${outDir}`);

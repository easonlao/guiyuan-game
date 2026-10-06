#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runScoreUnityOverlapDiagnostic,
  buildScoreUnityOverlapReportMarkdown
} from '../src/js/logic/headless/ScoreUnityOverlapDiagnostic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Parse CLI flags
const args = process.argv.slice(2);
let seedsCount = 200;
const seedsArgIdx = args.indexOf('--seeds');
if (seedsArgIdx !== -1 && args[seedsArgIdx + 1]) {
  seedsCount = parseInt(args[seedsArgIdx + 1], 10);
}

let outDir = resolve(rootDir, 'reports/balance-diagnostics/score-unity-overlap');
const outDirIdx = args.indexOf('--out-dir');
if (outDirIdx !== -1 && args[outDirIdx + 1]) {
  outDir = resolve(process.cwd(), args[outDirIdx + 1]);
}

console.log(`Starting Score & Unity Overlap Diagnostic with ${seedsCount} seeds (60 turns, 6 pairings)...`);

const diagnosticData = runScoreUnityOverlapDiagnostic({
  maxTurns: 60,
  seeds: Array.from({ length: seedsCount }, (_, i) => 202603 + i)
});

console.log(`Diagnostic completed in ${(diagnosticData.totalElapsedMs / 1000).toFixed(2)}s for ${diagnosticData.totalMatches} total runs.`);

const reportMarkdown = buildScoreUnityOverlapReportMarkdown(diagnosticData, {
  revision: { commit: 'integration/balance-diagnostics', sourceSha256: 'active' },
  replayCommand: `node scripts/generate-score-unity-overlap.js --seeds ${seedsCount}`
});

try {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'data.json'), JSON.stringify(diagnosticData, null, 2), 'utf8');
  writeFileSync(resolve(outDir, 'report.md'), reportMarkdown, 'utf8');
  console.log(`Report and data successfully written to ${outDir}`);
} catch (err) {
  if (err.code === 'EROFS') {
    const fallbackDir = '/tmp/score-unity-overlap';
    mkdirSync(fallbackDir, { recursive: true });
    writeFileSync(resolve(fallbackDir, 'data.json'), JSON.stringify(diagnosticData, null, 2), 'utf8');
    writeFileSync(resolve(fallbackDir, 'report.md'), reportMarkdown, 'utf8');
    console.log(`Filesystem read-only. Report and data successfully written to fallback ${fallbackDir}`);
  } else {
    throw err;
  }
}

#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  performScoreRarityReanalysis,
  buildScoreRarityReanalysisReportMarkdown
} from '../src/js/logic/headless/ScoreRarityReanalysis.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Parse CLI flags
const args = process.argv.slice(2);
let dataPath = resolve(rootDir, 'reports/balance-diagnostics/score-unity-overlap/data.json');
const dataIdx = args.indexOf('--data');
if (dataIdx !== -1 && args[dataIdx + 1]) {
  dataPath = resolve(process.cwd(), args[dataIdx + 1]);
}

let outPath = resolve(rootDir, 'reports/balance-diagnostics/score-unity-overlap/08-reanalysis-report.md');
const outIdx = args.indexOf('--out');
if (outIdx !== -1 && args[outIdx + 1]) {
  outPath = resolve(process.cwd(), args[outIdx + 1]);
}

if (!existsSync(dataPath)) {
  console.error(`Error: data file not found at ${dataPath}. Please ensure data.json exists.`);
  process.exit(1);
}

console.log(`Reading diagnostic data from ${dataPath}...`);
const rawData = readFileSync(dataPath, 'utf8');
const data = JSON.parse(rawData);

console.log(`Processing reanalysis (total matches: ${data.totalMatches || data.matchBreakdowns?.length || 'unknown'})...`);
const reanalysisResult = performScoreRarityReanalysis(data);

console.log(`Filtered ${reanalysisResult.turnLimitMatchesCount} turn-limit matches out of ${reanalysisResult.totalMatches} matches (${(reanalysisResult.turnLimitRate * 100).toFixed(1)}%).`);
console.log(`Generating 08 reanalysis report...`);

const reportMarkdown = buildScoreRarityReanalysisReportMarkdown(reanalysisResult, {
  dataSource: dataPath.replace(rootDir + '/', '')
});

try {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, reportMarkdown, 'utf8');
  console.log(`08 reanalysis report successfully written to ${outPath}`);
} catch (err) {
  if (err.code === 'EROFS') {
    const fallbackOut = resolve('/tmp/08-reanalysis-report.md');
    writeFileSync(fallbackOut, reportMarkdown, 'utf8');
    console.log(`Filesystem read-only. Report written to fallback ${fallbackOut}`);
  } else {
    throw err;
  }
}

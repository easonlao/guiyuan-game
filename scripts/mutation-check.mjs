// `npm run mutation:check`：把 Stryker 报告与基线对比，**只报告基线里没有的**存活/无覆盖突变体。
// 有新增 → 退出码 1；无新增 → 退出码 0。基线文件缺失/报告缺失 → 退出码 2。
//
// 用法：
//   npm run mutation:check                    # 读 reports/mutation/mutation.json + mutation-baseline.jsonl
//   node scripts/mutation-check.mjs <report.json> [baseline.jsonl]
//
// 为什么退出码由本脚本算：
//   Stryker 只在 `thresholds.break` 是数字时才置退出码；本仓库没配 thresholds（也刻意不设全局阈值），
//   所以「有新增存活就失败」这条门禁只能由这里兜底。仓库没有 CI，这条必须在本地/agent 循环里成立。

import { existsSync } from 'node:fs';
import {
  DEFAULT_BASELINE,
  DEFAULT_REPORT,
  entryKey,
  formatEntry,
  looseSignature,
  readBaselineEntries,
  readReportEntries,
  sortEntries
} from './lib/mutation-baseline-core.mjs';

const reportPath = process.argv[2] ?? DEFAULT_REPORT;
const baselinePath = process.argv[3] ?? DEFAULT_BASELINE;

function fail(message) {
  process.stderr.write(`mutation:check: ${message}\n`);
  process.exit(2);
}

if (!existsSync(reportPath)) {
  fail(
    `找不到报告 '${reportPath}'。请先跑 'npm run mutation'（全量）或 'npm run mutation:changed'。`
  );
}
if (!existsSync(baselinePath)) {
  fail(`找不到基线 '${baselinePath}'。请先跑 'npm run mutation:baseline' 建立基线。`);
}

let reportEntries;
let baselineEntries;
try {
  reportEntries = readReportEntries(reportPath);
  baselineEntries = readBaselineEntries(baselinePath);
} catch (error) {
  fail(`读取失败：${error instanceof Error ? error.message : String(error)}`);
}

const baselineKeys = new Set(baselineEntries.map(entryKey));
const reportKeys = new Set(reportEntries.map(entryKey));

const newEntries = sortEntries(reportEntries.filter((entry) => !baselineKeys.has(entryKey(entry))));

// 「疑似只是移位」：基线里存在同 file+mutatorName+replacement 的条目，且该条目**本次已不在报告里**
// （即老位置消失、新位置出现）。只统计「消失的基线条目」可避免同类替换（如满地 `{}`）造成误报。
const disappearedLoose = new Map();
for (const entry of baselineEntries) {
  if (reportKeys.has(entryKey(entry))) continue;
  const signature = looseSignature(entry);
  const locations = disappearedLoose.get(signature) ?? [];
  locations.push(`${entry.line}:${entry.column}`);
  disappearedLoose.set(signature, locations);
}

process.stdout.write(`mutation:check: 报告 ${reportPath}（存活/无覆盖 ${reportEntries.length} 条）\n`);
process.stdout.write(`mutation:check: 基线 ${baselinePath}（${baselineEntries.length} 条）\n`);

if (newEntries.length === 0) {
  process.stdout.write(
    `mutation:check: ✅ 没有新增存活/无覆盖突变体（基线内 ${reportKeys.size} 条全部命中）。退出 0。\n`
  );
  process.exit(0);
}

process.stdout.write(`\nmutation:check: ❌ 发现 ${newEntries.length} 个新增存活/无覆盖突变体：\n\n`);
for (const entry of newEntries) {
  process.stdout.write(`  ${formatEntry(entry)}\n`);
  const previous = disappearedLoose.get(looseSignature(entry));
  if (previous) {
    process.stdout.write(`      ⚠ 疑似只是移位：基线里同类型同替换已从 ${previous.join(', ')} 消失\n`);
  }
}
process.stdout.write(
  `\nmutation:check: 这些突变体不在基线里。要么补测试抓住它们，要么在确认等价后跑 ` +
    `'npm run mutation:baseline' 接受为新基线（会在 diff 中体现）。退出 1。\n`
);
process.exit(1);

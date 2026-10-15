// `npm run mutation:check`：把 Stryker 报告与基线对比，**只报告基线里没有的**存活/无覆盖突变体。
// 有新增 → 退出码 1；无新增 → 退出码 0。基线文件缺失/报告缺失/报告结构无效/报告来自子集跑 → 退出码 2。
//
// 子集报告（`mutation:changed` 的 --mutate 结果）会被拒绝：棘轮只对全量跑有效，
// 子集跑的覆盖集不同，直接对比会报出假的新增存活。
//
// 用法：
//   npm run mutation:check                    # 读 artifacts/mutation/mutation.json + mutation-baseline.jsonl
//   node scripts/mutation-check.mjs <report.json> [baseline.jsonl]
//
// 为什么退出码由本脚本算：
//   Stryker 只在 `thresholds.break` 是数字时才置退出码；本仓库没配 thresholds（也刻意不设全局阈值），
//   所以「有新增存活就失败」这条门禁只能由这里兜底。仓库没有 CI，这条必须在本地/agent 循环里成立。

import { existsSync } from 'node:fs';
import {
  DEFAULT_BASELINE,
  DEFAULT_REPORT,
  DEFAULT_STRYKER_CONFIG,
  assertReportIsFullRun,
  entryKey,
  formatEntry,
  looseSignature,
  readBaselineEntries,
  readConfigMutate,
  readReportEntriesStrict,
  sortEntries,
} from './lib/mutation-baseline-core.mjs';

const reportPath = process.argv[2] ?? DEFAULT_REPORT;
const baselinePath = process.argv[3] ?? DEFAULT_BASELINE;

function fail(message) {
  process.stderr.write(`mutation:check: ${message}\n`);
  process.exit(2);
}

if (!existsSync(reportPath)) {
  fail(
    `找不到报告 '${reportPath}'。请先跑 'npm run mutation'（全量）或 'npm run mutation:changed'。`,
  );
}
if (!existsSync(baselinePath)) {
  fail(`找不到基线 '${baselinePath}'。请先跑 'npm run mutation:baseline' 建立基线。`);
}

let reportEntries;
let baselineEntries;
try {
  reportEntries = readReportEntriesStrict(reportPath);
  baselineEntries = readBaselineEntries(baselinePath);
} catch (error) {
  fail(`读取失败：${error instanceof Error ? error.message : String(error)}`);
}

// 子集报告防护（门禁完整性）：棘轮只对**全量**跑有效。
// `mutation:changed` 用 `--mutate <子集>` 只变异改动文件，Stryker 的 perTest 覆盖随之按子集选测试，
// 跑出的存活/无覆盖集合与全量跑不同——直接对比会报出**假的新增存活**。
// 判定依据：报告 `config.mutate` 是 CLI 覆盖后的最终值，子集跑会与 stryker.config.json 的 `mutate` 不一致。
if (!existsSync(DEFAULT_STRYKER_CONFIG)) {
  fail(`找不到配置 '${DEFAULT_STRYKER_CONFIG}'，无法校验报告是否来自全量跑。`);
}
try {
  assertReportIsFullRun(reportPath, readConfigMutate(DEFAULT_STRYKER_CONFIG));
} catch (error) {
  fail(
    `报告不是全量跑的结果：${error instanceof Error ? error.message : String(error)}。\n` +
      `棘轮只对全量跑有效（子集跑的覆盖集不同，会报出假的新增存活）。请先跑 'npm run mutation' 再做棘轮对比；` +
      `'npm run mutation:changed' 仅用于 implement 收尾时查看存活、补断言，不做棘轮对比。`,
  );
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

process.stdout.write(
  `mutation:check: 报告 ${reportPath}（存活/无覆盖 ${reportEntries.length} 条）\n`,
);
process.stdout.write(`mutation:check: 基线 ${baselinePath}（${baselineEntries.length} 条）\n`);

if (newEntries.length === 0) {
  process.stdout.write(
    `mutation:check: ✅ 没有新增存活/无覆盖突变体（报告内 ${reportEntries.length} 条存活/无覆盖均在基线内）。退出 0。\n`,
  );
  process.exit(0);
}

process.stdout.write(
  `\nmutation:check: ❌ 发现 ${newEntries.length} 个新增存活/无覆盖突变体：\n\n`,
);
for (const entry of newEntries) {
  process.stdout.write(`  ${formatEntry(entry)}\n`);
  const previous = disappearedLoose.get(looseSignature(entry));
  if (previous) {
    process.stdout.write(
      `      ⚠ 疑似只是移位：基线里同类型同替换已从 ${previous.join(', ')} 消失\n`,
    );
  }
}
process.stdout.write(
  `\nmutation:check: 这些突变体不在基线里。要么补测试抓住它们，要么在确认等价后跑 ` +
    `'npm run mutation:baseline' 接受为新基线（会在 diff 中体现）。退出 1。\n`,
);
process.exit(1);

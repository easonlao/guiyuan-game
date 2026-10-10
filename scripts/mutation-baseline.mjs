// `npm run mutation:baseline`：从 Stryker 报告抽取当前全部「未被测试抓住」的突变体，
// 排序后写入基线文件（默认 `mutation-baseline.jsonl`，入库、可 diff）。
//
// 用法：
//   npm run mutation:baseline                 # 读 reports/mutation/mutation.json，写 mutation-baseline.jsonl
//   node scripts/mutation-baseline.mjs <report.json> [baseline.jsonl]
//
// 前置：先跑一次变异（`npm run mutation` 或 `npm run mutation:changed`）生成报告。
//
// 基线语义：记录 Survived + NoCoverage。之后 `npm run mutation:check` 只报告
// 不在本文件里的存活/无覆盖；基线更新后 `git diff` 里新增/删除的行就是新出现/消失的存活。

import { existsSync, writeFileSync } from 'node:fs';
import {
  DEFAULT_BASELINE,
  DEFAULT_REPORT,
  entryKey,
  readReportEntries,
  serializeEntry,
  sortEntries
} from './lib/mutation-baseline-core.mjs';

const reportPath = process.argv[2] ?? DEFAULT_REPORT;
const baselinePath = process.argv[3] ?? DEFAULT_BASELINE;

if (!existsSync(reportPath)) {
  process.stderr.write(
    `mutation:baseline: 找不到报告 '${reportPath}'。请先跑 'npm run mutation'（全量）或 'npm run mutation:changed'。\n`
  );
  process.exit(2);
}

// 按身份键去重：Stryker 偶尔在同一 start 位置产出两个身份相同的 mutant（end 不同但键相同），
// 而棘轮用的是不含 end 的身份键，两者无法区分，落库一条即可。
const unique = new Map();
for (const entry of readReportEntries(reportPath)) {
  const key = entryKey(entry);
  if (!unique.has(key)) unique.set(key, entry);
}
const entries = sortEntries([...unique.values()]);

const header = [
  '# mutation-baseline.jsonl — 已确认「未被测试抓住」的突变体（Survived + NoCoverage）。',
  '# 由 `npm run mutation:baseline` 从 Stryker 报告生成；`npm run mutation:check` 只报告本文件之外的存活/无覆盖。',
  '# 每行一条 JSON 记录：{"file","line","column","mutatorName","replacement"}，已按 file/line/column/mutatorName/replacement 稳定排序。',
  '# 身份键：{file, mutatorName, line, column, replacement}。不要用 Stryker 的 id（单次报告内才唯一）。'
];

const body = entries.map(serializeEntry);
writeFileSync(baselinePath, [...header, ...body].join('\n') + '\n');

const survived = entries.filter((e) => e.status === 'Survived').length;
const noCoverage = entries.filter((e) => e.status === 'NoCoverage').length;

process.stdout.write(`mutation:baseline: 报告 ${reportPath}\n`);
process.stdout.write(
  `mutation:baseline: 写入 ${baselinePath}，共 ${entries.length} 条` +
    `（Survived ${survived}，NoCoverage ${noCoverage}）。\n`
);

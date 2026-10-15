// `npm run mutation:baseline`：从 Stryker 报告抽取当前全部「未被测试抓住」的突变体，
// 排序后写入基线文件（默认 `mutation-baseline.jsonl`，入库、可 diff）。
//
// 用法：
//   npm run mutation:baseline                 # 读 artifacts/mutation/mutation.json，写 mutation-baseline.jsonl
//   node scripts/mutation-baseline.mjs <report.json> [baseline.jsonl]
//
// 前置：**必须先跑一次全量** `npm run mutation` 生成报告。与 `mutation:check` 一样，
// 本脚本拒绝子集报告（`mutation:changed` 的 --mutate 结果）：子集跑的覆盖集与全量不同，
// 拿它刷基线会把基线缩到子集，口径与门禁不一致（后续 check 会报更多新增）。
// 缺报告 / 报告结构无效 / 非全量跑 → 退出 2。
//
// 基线语义：记录 Survived + NoCoverage。之后 `npm run mutation:check` 只报告
// 不在本文件里的存活/无覆盖；基线更新后 `git diff` 里新增/删除的行就是新出现/消失的存活。

import { existsSync, writeFileSync } from 'node:fs';
import {
  DEFAULT_BASELINE,
  DEFAULT_REPORT,
  DEFAULT_STRYKER_CONFIG,
  assertReportIsFullRun,
  entryKey,
  readConfigMutate,
  readReportEntriesStrict,
  serializeEntry,
  sortEntries,
} from './lib/mutation-baseline-core.mjs';

const reportPath = process.argv[2] ?? DEFAULT_REPORT;
const baselinePath = process.argv[3] ?? DEFAULT_BASELINE;

function fail(message) {
  process.stderr.write(`mutation:baseline: ${message}\n`);
  process.exit(2);
}

if (!existsSync(reportPath)) {
  fail(`找不到报告 '${reportPath}'。请先跑 'npm run mutation'（全量）生成报告。`);
}

// 与 `mutation:check` 相同的全量跑校验：棘轮只对全量跑有效，基线也只能由全量报告刷新。
if (!existsSync(DEFAULT_STRYKER_CONFIG)) {
  fail(`找不到配置 '${DEFAULT_STRYKER_CONFIG}'，无法校验报告是否来自全量跑。`);
}

try {
  assertReportIsFullRun(reportPath, readConfigMutate(DEFAULT_STRYKER_CONFIG));
} catch (error) {
  fail(
    `报告不是全量跑的结果：${error instanceof Error ? error.message : String(error)}。\n` +
      `基线只能由全量跑刷新（子集跑的覆盖集不同，会把基线缩到子集、与门禁口径不一致）。` +
      `请先跑 'npm run mutation'；'npm run mutation:changed' 仅用于 implement 收尾时查看存活、补断言。`,
  );
}

// 按身份键去重：Stryker 偶尔在同一 start 位置产出两个身份相同的 mutant（end 不同但键相同），
// 而棘轮用的是不含 end 的身份键，两者无法区分，落库一条即可。
let reportEntries;
try {
  reportEntries = readReportEntriesStrict(reportPath);
} catch (error) {
  fail(`读取报告失败：${error instanceof Error ? error.message : String(error)}`);
}

const unique = new Map();
for (const entry of reportEntries) {
  const key = entryKey(entry);
  if (!unique.has(key)) unique.set(key, entry);
}
const entries = sortEntries([...unique.values()]);

const header = [
  '# mutation-baseline.jsonl — 已确认「未被测试抓住」的突变体（Survived + NoCoverage）。',
  '# 由 `npm run mutation:baseline` 从 Stryker 报告生成；`npm run mutation:check` 只报告本文件之外的存活/无覆盖。',
  '# 每行一条 JSON 记录：{"file","line","column","mutatorName","replacement"}，已按 file/line/column/mutatorName/replacement 稳定排序。',
  '# 身份键：{file, mutatorName, line, column, replacement}。不要用 Stryker 的 id（单次报告内才唯一）。',
];

const body = entries.map(serializeEntry);
writeFileSync(baselinePath, [...header, ...body].join('\n') + '\n');

const survived = entries.filter((e) => e.status === 'Survived').length;
const noCoverage = entries.filter((e) => e.status === 'NoCoverage').length;

process.stdout.write(`mutation:baseline: 报告 ${reportPath}\n`);
process.stdout.write(
  `mutation:baseline: 写入 ${baselinePath}，共 ${entries.length} 条` +
    `（Survived ${survived}，NoCoverage ${noCoverage}）。\n`,
);

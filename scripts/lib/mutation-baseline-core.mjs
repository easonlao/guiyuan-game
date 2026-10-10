// 变异基线（mutation baseline）的核心逻辑，供 `mutation:baseline` 与 `mutation:check` 共用。
//
// 为什么单独抽一层：
//   - 生成与对比必须用**完全相同**的身份键，否则会出现「基线明明有、check 却报新增」的漂移。
//   - Stryker JSON 报告里 `mutants[].id` 只在单次报告内唯一，跨次运行会重排，**绝不能**当键。
//     这里改用 Stryker IncrementalDiffer 自己认的身份：
//       {file, mutatorName, location.start.line, location.start.column, replacement}
//     （列号 1 起，location.end 排他；见 Stryker IncrementalDiffer 的 identity 定义。）
//   - 棘轮对象是**未被测试抓住**的突变体：`Survived`（执行到但没断言失败）与
//     `NoCoverage`（根本没被测到）都算。其余状态（Killed / Timeout / CompileError /
//     Ignored / RuntimeError）不入基线。只盯 Survived 会漏掉「故意加一段没被测到的行为」
//     所产生的 NoCoverage。

import { readFileSync } from 'node:fs';

/** 计入基线的突变体状态：执行到但存活 + 完全没覆盖。 */
export const RATCHET_STATUSES = new Set(['Survived', 'NoCoverage']);

export const DEFAULT_REPORT = 'reports/mutation/mutation.json';
export const DEFAULT_BASELINE = 'mutation-baseline.jsonl';

/** 字节级稳定比较（不用 localeCompare，避免随 locale 变化）。 */
function compare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** 从 Stryker 报告中的单个 mutant 构造基线记录（附带 status 供统计，不写进基线文件）。 */
export function entryFromMutant(file, mutant) {
  return {
    file,
    line: mutant.location.start.line,
    column: mutant.location.start.column,
    mutatorName: mutant.mutatorName,
    replacement: mutant.replacement,
    status: mutant.status
  };
}

/**
 * 身份键：同一 mutant 跨运行稳定的唯一标识。
 * 用 `\u0000` 连接，避免字段内容里出现分隔符导致歧义。
 */
export function entryKey(entry) {
  return [entry.file, entry.mutatorName, entry.line, entry.column, entry.replacement].join('\u0000');
}

/**
 * 「疑似只是移位」的宽松签名：同一文件、同一变异类型、同一替换文本，只是行列变了。
 * 这类新增通常只是上方插入/删除了代码，不是新引入的测试缺口。
 */
export function looseSignature(entry) {
  return [entry.file, entry.mutatorName, entry.replacement].join('\u0000');
}

/** 读取 Stryker JSON 报告，返回全部 Survived / NoCoverage 记录（未排序）。 */
export function readReportEntries(reportPath) {
  const raw = JSON.parse(readFileSync(reportPath, 'utf-8'));
  const entries = [];
  for (const [file, fileReport] of Object.entries(raw.files ?? {})) {
    for (const mutant of fileReport.mutants ?? []) {
      if (RATCHET_STATUSES.has(mutant.status)) {
        entries.push(entryFromMutant(file, mutant));
      }
    }
  }
  return entries;
}

/** 读取基线文件（跳过空行与 `#` 注释行）。 */
export function readBaselineEntries(baselinePath) {
  const text = readFileSync(baselinePath, 'utf-8');
  const entries = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    entries.push(JSON.parse(line));
  }
  return entries;
}

/** 稳定排序：file → line → column → mutatorName → replacement。 */
export function sortEntries(entries) {
  return [...entries].sort(
    (a, b) =>
      compare(a.file, b.file) ||
      a.line - b.line ||
      a.column - b.column ||
      compare(a.mutatorName, b.mutatorName) ||
      compare(a.replacement, b.replacement)
  );
}

/** 序列化为基线文件的一行（只含身份键字段；不含 status，保证 diff 只反映新增/消失）。 */
export function serializeEntry(entry) {
  return JSON.stringify({
    file: entry.file,
    line: entry.line,
    column: entry.column,
    mutatorName: entry.mutatorName,
    replacement: entry.replacement
  });
}

/** 人类可读的一行：`file:line:col mutatorName → replacement`。 */
export function formatEntry(entry) {
  return `${entry.file}:${entry.line}:${entry.column} ${entry.mutatorName} → ${entry.replacement}`;
}

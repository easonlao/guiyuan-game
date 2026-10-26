// 引用门禁：文档里写的每个本地路径都必须存在（`npm run check:refs`，`check:quick` 一段）。
//
// 为什么要有这道门禁：本仓库文档互相引用很密，删东西时最容易留下的不是逻辑错误，
// 而是指向已删文件的死链。2026-10-25 那轮清理里，死链是手工找的——找了两遍
// （20 处、22 处），两遍都可能数漏。枚举一次就够，不该靠人数。
//
// ── 扫描范围：只查长期文档 ──
// `.scratch/`（随时会被删的过程区）与 `.agents/`（上游技能的副本，更新时整目录覆盖）
// 不在范围内。查它们只会制造假警报，而这两处的死链伤不到读者。
//
// ── 只查能落在磁盘上的路径 ──
// 只收「带斜杠 + 已知扩展名」的形式（`docs/X.md`、`scripts/Y.mjs`）。裸文件名
// （`ActionResolver.ts` 这种「提到某个符号」的写法）不查，否则会把正文大量误判成引用。
// 围栏代码块里的内容不查。
//
// ── 写明「已删」的那一行不算死链 ──
// 文档里合法地会提到已删的路径（「该文档已删，见 git 历史」）。这类句子自称是历史记录，
// 不是活引用。判据是同一行出现「已删 / 已更名 / 已移走 / deleted」。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** 允许指向不存在路径的前缀，每条必须有理由。`artifacts/` 是工具产物落点，跑过工具才有。 */
const ALLOWED_MISSING = ['artifacts/'];

/** 扫描范围之外的前缀：过程区与上游技能副本。 */
const SKIP_PREFIXES = ['.scratch/', '.agents/'];

/** 长扩展名必须排在短扩展名前，否则 `package.json` 会被 `js` 截断。 */
const EXTENSIONS = ['jsonl', 'patch', 'yaml', 'json', 'mts', 'mjs', 'cjs', 'yml', 'md', 'ts', 'js'];
const PATH_PATTERN = new RegExp(
  String.raw`(?:^|[\s(\[「])\x60?((?:docs|src|scripts|tests|tools|patches|\.github|artifacts)\/[A-Za-z0-9_.@/-]+\.(?:${EXTENSIONS.join('|')}))(?![\w-])`,
  'g',
);

/** 这一行自称是历史记录时，它提到的不存在路径不算死链。 */
const HISTORICAL = /已删|已更名|已移走|已不存在|deleted/;

const files = execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((line) => line.length > 0 && !SKIP_PREFIXES.some((prefix) => line.startsWith(prefix)));

const failures = [];
let checked = 0;
let historical = 0;

for (const file of files) {
  const lines = readFileSync(resolve(root, file), 'utf8').split('\n');
  let inFence = false;
  for (const [index, line] of lines.entries()) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    for (const match of line.matchAll(PATH_PATTERN)) {
      const path = match[1];
      if (ALLOWED_MISSING.some((prefix) => path.startsWith(prefix))) continue;
      checked += 1;
      if (existsSync(resolve(root, path))) continue;
      if (HISTORICAL.test(line)) {
        historical += 1;
        continue;
      }
      failures.push(`${file}:${index + 1} 指向不存在的路径：${path}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`check:refs: ${failure}\n`);
  process.stderr.write(
    `check:refs: ${failures.length} 处死链。改路径、删句子，或让该行自己说明「已删」。\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `check:refs: ${files.length} 份文档里的 ${checked} 处路径引用全部存在` +
    `（${historical} 处是写明已删的历史记录）。\n`,
);

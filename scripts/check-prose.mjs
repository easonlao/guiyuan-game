// 语句门禁：只看**本次改动新增的** Markdown 行，找「查找替换改坏」留下的怪句子
// （`npm run check:prose`，`check:quick` 一段）。
//
// ── 为什么要它 ──
// 2026-10-25 那次文档清理，我用查找替换一次改了几十个文件，改完只看了 diff 的开头和
// 结尾。中间被改坏的句子没看见，例如把 `docs/headless/` 换成「报告层（已删）」以后，
// 有的句子变成「（原 报告层（已删） 与 …）」，有的变成「（已删）（本文只引关键数字）」，
// 还有的吃掉了章节号只剩 `/§4.5`。这类残留后来靠人逐行找才清掉。
//
// ── 为什么只查「改动的行」 ──
// 这四条规则在全仓一起跑会误报：`docs/adr/0017` 里 `平衡 对 激进压制` 是故意排的字，
// 老文档里合法的括号嵌套也有。但**改坏一定落在新增行上**——老行不会凭空变质。所以
// 只看 `git diff HEAD` 里新增的 Markdown 行，误报面自然收敛到零。
//
// ── 为什么只查 `.md` ──
// 代码注释里汉字之间夹空格是正常写法（`抽到 癸水 (阴)`、`推进五行全归元 (净归一…)`），
// 括号也常跨行开合。实测把它们纳进来会多出 23 处误报。代码注释另有 review 兜。
//
// ── 四条规则 ──
// 单条规则都漏，四条合起来才覆盖那次四种损害（逐条实测过）：
//   ① 括号不配对      ② 汉字之间夹空格      ③ 括号里再套括号      ④ 相邻两对括号
// 所以四条一起跑。宁可有一处误报要写豁免，也不要漏掉一种。
//
// ── 豁免 ──
// 该行确实这么写是对的（例如要举例说明「别写成这样」），在行尾加 `prose-ok`。
//
// ── 围栏代码块不查 ──
// 代码块里的引号与括号是代码，不是句子。

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const CHECKS = [
  {
    name: '括号不配对',
    test: (line) => line.split('（').length !== line.split('）').length,
    hint: '一对括号要在同一行里闭合',
  },
  {
    name: '汉字之间夹空格',
    test: (line) => /[\u4e00-\u9fff] [\u4e00-\u9fff]/.test(line),
    hint: '查找替换常在这里留下多余空格',
  },
  {
    name: '括号里再套括号',
    test: (line) => /（[^（）]{0,40}（/.test(line),
    hint: '嵌套括注多半是替换把整句包了两层',
  },
  {
    name: '相邻两对括号',
    test: (line) => /）\s*（/.test(line),
    hint: '两个括注拼在一起，通常是要合成一句',
  },
];

/** 取 `git diff HEAD` 里新增的 Markdown 行号：`{file: Set<lineNumber>}`。 */
function addedLines() {
  const diff = execFileSync('git', ['diff', '-U0', 'HEAD', '--', '*.md'], {
    cwd: root,
    encoding: 'utf8',
  });

  const added = new Map();
  let file = null;
  let cursor = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice('+++ b/'.length);
      if (!added.has(file)) added.set(file, new Set());
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      cursor = Number(hunk[1]);
      continue;
    }
    if (file === null) continue;
    if (line.startsWith('+')) {
      added.get(file).add(cursor);
      cursor += 1;
    } else if (line.startsWith('-') || line.startsWith('\\')) {
      // 删除行与「\ No newline」不占新文件的行号。
    } else {
      cursor += 1;
    }
  }
  return added;
}

const failures = [];
let checked = 0;

for (const [file, lineNumbers] of addedLines()) {
  if (lineNumbers.size === 0) continue;
  const lines = readFileSync(resolve(root, file), 'utf8').split('\n');

  let inFence = false;
  for (const [index, line] of lines.entries()) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !lineNumbers.has(index + 1)) continue;
    if (line.includes('prose-ok')) continue;

    checked += 1;
    for (const check of CHECKS) {
      if (check.test(line)) {
        failures.push(
          `${file}:${index + 1} ${check.name}——${check.hint}\n` +
            `    ${line.trim().slice(0, 100)}\n` +
            `    这行确实该这么写就在行尾加 prose-ok`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`check:prose: ${failure}\n`);
  process.stderr.write(`check:prose: ${failures.length} 处疑似被替换改坏的句子。\n`);
  process.exit(1);
}
process.stdout.write(`check:prose: 本次改动新增的 ${checked} 行 Markdown 里没有怪句子。\n`);

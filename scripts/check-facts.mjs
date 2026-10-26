// 事实门禁：文档与配置里那些「会悄悄脱节」的量（`npm run check:facts`，`check:quick` 一段）。
//
// 为什么要有这道门禁：2026-10-25 那轮清理里，我手工核了 25 条对账点才抓出三处过期数字
// （内循环命令的段数、`.scratch/` 文件数、突变基线的口径）。手工核一次可以，不能靠人一直核。
//
// ── 只断言「不变式」，不断言「快照」 ──
// 这里每条都是「两个地方必须一致」或「某个结构必须成立」，**不锁具体数字**。
// 锁数字会造出跑步机：数量每次合法变化都要手工重钉基线，钉着钉着门禁就没人看了
// （历史上真有门禁翻过车：基线计数随合法提交增长，棘轮钉不住——票 delivery-protocol/05，已删目录）。
// 因此这里的检查不改数字就不会红，改坏了才会红。

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const read = (path) => readFileSync(resolve(root, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const pkg = readJson('package.json');
const npmrc = read('.npmrc');

// ① 环境基线：两处必须同值。`.nvmrc` 给人看，`engines` 给机器判。
const nvmrc = read('.nvmrc').trim();
check(
  (pkg.engines?.node ?? '').includes(nvmrc),
  `① .nvmrc 写 ${nvmrc}，但 package.json#engines.node 是 ${pkg.engines?.node}——两处不同值。`,
);

// ② npm 版本：`packageManager` 是机器的判据，本机装的那份必须与它一致。
const declaredNpm = (pkg.packageManager ?? '').split('@')[1];
let actualNpm = '';
try {
  actualNpm = execFileSync('npm', ['-v'], { cwd: root, encoding: 'utf8' }).trim();
} catch {
  failures.push('② 跑不了 `npm -v`，无法核对 packageManager。');
}
check(
  declaredNpm !== undefined && actualNpm === declaredNpm,
  `② 本机 npm 是 ${actualNpm}，但 package.json#packageManager 写 ${pkg.packageManager}。`,
);

// ③ `.npmrc` 的开关：版本不符即判红。这是机制，不是偏好。
check(
  /^engine-strict\s*=\s*true$/m.test(npmrc),
  '③ .npmrc 缺 `engine-strict=true`：版本不符时 npm 只警告不判红。',
);

// ⑤ core 层的浏览器全局禁令：两个键任一被删，门禁就漏。
const oxlint = JSON.stringify(readJson('.oxlintrc.json'));
check(
  oxlint.includes('no-restricted-globals'),
  '⑤ .oxlintrc.json 丢了 `no-restricted-globals`：core 层可以碰 window/document。',
);
check(
  oxlint.includes('no-restricted-imports'),
  '⑤ .oxlintrc.json 丢了 `no-restricted-imports`：core 层可以 import `cc`。',
);

// ⑥⑦ CI 只做兜底：只跑安装 + 验收，且不跑突变测试（ADR 0012）。
const workflow = read('.github/workflows/fast.yml');
const runSteps = workflow.split('\n').filter((line) => /^\s*run:/.test(line));
check(
  runSteps.length === 2,
  `⑥ fast.yml 有 ${runSteps.length} 个 run 步，应是 2 个（安装 + npm run verify）。多出来的检查会让 CI 与本地口径分裂。`,
);
const nonComment = workflow
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');
check(
  !/mutation/i.test(nonComment),
  '⑦ fast.yml 的非注释行提到了 mutation：CI 不该跑突变测试（ADR 0012）。',
);

// ⑧ ADR 文件名格式：`NNNN-slug.md`。格式一乱，ADR 之间就按不上号。
const adrNames = readdirSync(resolve(root, 'docs/adr'));
const badAdr = adrNames.filter((name) => !/^\d{4}-[a-z0-9-]+\.md$/.test(name));
check(badAdr.length === 0, `⑧ docs/adr 里有文件名不合 NNNN-slug.md 的：${badAdr.join('、')}`);

// ⑨ 术语表：每条词条都必须带一行 `_Avoid_`，否则「禁用别名」这半边悄悄失效。
const glossary = read('GLOSSARY.md');
const termCount = (glossary.match(/^\*\*[^*]+\*\*:/gm) ?? []).length;
const avoidCount = (glossary.match(/^_Avoid_:/gm) ?? []).length;
check(
  termCount === avoidCount && termCount > 0,
  `⑨ GLOSSARY.md 有 ${termCount} 条词条、${avoidCount} 行 _Avoid_——每条都必须有禁用别名。`,
);

// ⑩ 技能来源：lock 里的技能集减去已装目录，只允许差一个按需安装的 sprite-gen。
const lockSkills = Object.keys(readJson('skills-lock.json').skills);
const installed = readdirSync(resolve(root, '.agents/skills')).filter((name) =>
  statSync(resolve(root, '.agents/skills', name)).isDirectory(),
);
const missing = lockSkills.filter((name) => !installed.includes(name));
const extra = installed.filter((name) => !lockSkills.includes(name));
check(
  missing.every((name) => name === 'sprite-gen') && extra.length === 0,
  `⑩ skills-lock.json 与 .agents/skills/ 对不上：lock 有但没装 ${JSON.stringify(missing)}，装了但不在 lock ${JSON.stringify(extra)}。`,
);

// ⑪ 突变基线：只查结构（每行可解析、五个键齐全），不查条目数——条目数会随合法改动变化。
const baselineLines = read('mutation-baseline.jsonl')
  .split('\n')
  .filter((line) => line.trim().length > 0 && !line.startsWith('#'));
const BAD_LINE = baselineLines.findIndex((line) => {
  try {
    const row = JSON.parse(line);
    return ['file', 'line', 'column', 'mutatorName', 'replacement'].some((key) => !(key in row));
  } catch {
    return true;
  }
});
check(
  BAD_LINE === -1,
  `⑪ mutation-baseline.jsonl 第 ${BAD_LINE + 1} 条记录（跳过注释行计）无法解析或缺字段；` +
    `格式是 {file, line, column, mutatorName, replacement}。`,
);

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`check:facts: ${failure}\n`);
  process.exit(1);
}
process.stdout.write(`check:facts: 10 条不变式成立。\n`);

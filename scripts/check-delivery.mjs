// 交付不变量门禁：四条断言，把 `CONTRIBUTING.md` §6 里那些「靠自觉」的约束变成判红
// （`npm run check:delivery`）。
//
// 为什么要有这个脚本：本仓库两次先例都说明「写进文档的规则拦不住」——worktree 被建到
// 仓库外（后来 `check-worktrees.mjs` 用 `git worktree list` 才拦住）、`.gitignore` 写成
// 整目录让反选静默失效（同上脚本的两条探针）。§6 里 main 线性、快照一致、无新增孤儿提交、
// worktree 清账这四类同样是「错了要查很久」，所以同样要脚本。
//
// ── 不进 check:quick，也不进 verify ──
// `check:quick` 每轮编辑都跑；交付断言在编辑循环里必然红（快照、清账都是交付那一刻才成立）。
// `verify` 的语义是「每个提交都得绿」，把交付断言塞进去会让每个提交都跑不过。所以本条是
// 独立脚本，由协调代理在整理阶段按需跑。
//
// ── 与 check-worktrees.mjs 的分工 ──
// 那条管「worktree 建在哪」；这里是「还剩几个」。两条都不改，一条一个职责。
//
// ── 用法 ──
//   npm run check:delivery
//   npm run check:delivery -- --base <rev> --snapshot <rev> --tip <rev> --worktrees <n>
//
//   --base        线性检查的区间起点，默认 origin/main
//   --snapshot    交付整理时保留的快照提交；不传则跳过断言②
//   --tip         交付分支的 tip，默认 HEAD
//   --worktrees   期望存在的 worktree 总数，默认 1（只有主 checkout）
//   --unreachable-baseline  覆盖断言③的棘轮基线，见下

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** 主 checkout 的根（从本脚本位置推，因此在 worktree 内跑也指向那个 worktree 自己）。 */
const root = fileURLToPath(new URL('..', import.meta.url));

/** 直接跑 git，失败抛异常。 */
function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

/** 跑 git，失败返回 null（用于「存在与否」这类询问）。 */
function tryGit(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

const failures = [];
const skipped = [];

// ── 断言③的棘轮基线 ──
//
// 语义同 `mutation-baseline.jsonl`：只对**基线之外的新增**报红，数量下降（如 `git gc`
// 回收）不报红。
//
// 来历：2026-10-25 main 线性化（40 个 merge 塌成单亲，416 → 323 个提交）之后实测。
// 这个数里绝大多数是重写过程留下的垃圾——试跑分支（`rewrite/*`）与被打断的 cherry-pick。
// 它是**垃圾基线**，不是「允许 479 个孤儿」。
//
// 重钉：确认新增的不可达提交确实作废后，把这里改成实测值，并在提交信息里写明为什么。
const UNREACHABLE_COMMIT_BASELINE = 479;

// ── 参数 ──
const argv = process.argv.slice(2);
function argValue(name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

const base = argValue('--base') ?? 'origin/main';
const tip = argValue('--tip') ?? 'HEAD';
const snapshot = argValue('--snapshot');
const expectedWorktrees = Number(argValue('--worktrees') ?? '1');
const unreachableBaseline = Number(
  argValue('--unreachable-baseline') ?? String(UNREACHABLE_COMMIT_BASELINE),
);

// ① main 线性：基点之后不得有 merge commit。
// 区间为空（基点即 tip）时 `rev-list` 无输出，也算通过。
const merges = tryGit(['rev-list', '--merges', `${base}..${tip}`]);
if (merges === null) {
  failures.push(
    `断言① 无法解析区间 ${base}..${tip}——基点或 tip 不存在。\n` +
      `    查：git rev-parse ${base} ${tip}`,
  );
} else {
  const mergeList = merges.split('\n').filter((line) => line.length > 0);
  if (mergeList.length > 0) {
    failures.push(
      `断言① ${base}..${tip} 里有 ${mergeList.length} 个 merge commit——main 必须是线性的。\n` +
        `    ${mergeList.slice(0, 5).join('\n    ')}\n` +
        `    交付提交按切片归组后应当只有一个父；出现 merge 说明整理那一步漏了。\n` +
        `    查：git log --merges ${base}..${tip}`,
    );
  }
}

// ② 快照一致：快照提交的整棵树必须与交付分支 tip 的树逐字节一致。
// 比提交而不是比文件列表——文件列表一样、内容不同是可能的。
if (snapshot === undefined) {
  skipped.push(`断言② 未传 --snapshot，跳过（快照比较只在交付整理时有对象）`);
} else {
  const snapshotTree = tryGit(['rev-parse', `${snapshot}^{tree}`]);
  const tipTree = tryGit(['rev-parse', `${tip}^{tree}`]);
  if (snapshotTree === null || tipTree === null) {
    failures.push(
      `断言② 无法解析 ${snapshot} 或 ${tip} 的树——提交不存在或不是提交对象。\n` +
        `    查：git rev-parse ${snapshot}^{commit} ${tip}^{commit}`,
    );
  } else if (snapshotTree.trim() !== tipTree.trim()) {
    const diffStat = tryGit(['diff', '--stat', snapshot, tip]) ?? '';
    failures.push(
      `断言② 快照 ${snapshot} 与交付分支 ${tip} 的文件树不一致——整理改变了内容。\n` +
        `    快照树 ${snapshotTree.trim()}\n` +
        `    交付树 ${tipTree.trim()}\n` +
        `    整理只搬历史，不改行为；有差异先查原因，不要直接合入。\n` +
        `    查：git diff ${snapshot} ${tip}\n${diffStat}`,
    );
  }
}

// ③ 无新增孤儿提交：`git fsck` 报出的不可达提交数是棘轮，不是清零。
// 清零不是本断言的目标——重写历史会留下合理的垃圾，清掉它们是 `git gc` 的事。
const fsck = tryGit(['fsck', '--unreachable', '--no-reflogs']);
if (fsck === null) {
  failures.push(`断言③ git fsck 失败，无法统计不可达提交。`);
} else {
  const unreachable = fsck.split('\n').filter((line) => line.startsWith('unreachable commit '));
  if (unreachable.length > unreachableBaseline) {
    const newest = tryGit([
      'log',
      '--no-walk',
      '--date=short',
      '--format=%h %ad %s',
      ...unreachable.map((line) => line.slice('unreachable commit '.length)),
    ]);
    failures.push(
      `断言③ 不可达提交 ${unreachable.length} 个，超过基线 ${unreachableBaseline}（新增 ${unreachable.length - unreachableBaseline} 个）。\n` +
        `    新增的可能是：删掉的分支、被放弃的 cherry-pick、rebase 留下的旧提交。\n` +
        `    先确认是哪一个。确实作废才重钉基线（--unreachable-baseline <n>）并在提交信息里写明。\n` +
        `    ${(newest ?? '')
          .split('\n')
          .filter((line) => line.length > 0)
          .slice(0, 8)
          .join('\n    ')}`,
    );
  }
}

// ④ worktree 清账：交付收尾后应当只剩主 checkout。
// `--worktrees <n>` 用来声明整理期间的期望值（那时还有交付分支的 worktree）。
const worktreeList = tryGit(['worktree', 'list', '--porcelain']);
if (worktreeList === null) {
  failures.push(`断言④ git worktree list 失败，无法统计 worktree。`);
} else {
  const worktrees = worktreeList
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
  if (worktrees.length !== expectedWorktrees) {
    failures.push(
      `断言④ 有 ${worktrees.length} 个 worktree，期望 ${expectedWorktrees} 个。\n` +
        `    ${worktrees.join('\n    ')}\n` +
        `    收尾要求只剩主 checkout；整理期间用 --worktrees <n> 声明期望值。\n` +
        `    删：git worktree remove <path>（脏的加 --force）`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`check:delivery: ${failure}\n`);
  process.exit(1);
}
for (const note of skipped) process.stdout.write(`check:delivery: ${note}\n`);
process.stdout.write(
  `check:delivery: 4 条断言通过（线性 ${base}..${tip}${snapshot === undefined ? '' : `，快照 ${snapshot}`}）。\n`,
);

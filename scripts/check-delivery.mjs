// 交付不变量门禁：四条断言，把 `CONTRIBUTING.md` §6 里那些「靠自觉」的约束变成判红
// （`npm run check:delivery`）。
//
// 为什么要有这个脚本：本仓库两次先例都说明「写进文档的规则拦不住」——worktree 被建到
// 仓库外（后来 `check-worktrees.mjs` 用 `git worktree list` 才拦住）、`.gitignore` 写成
// 整目录让反选静默失效（同上脚本的两条探针）。§6 里 main 线性、快照一致、无内容未并入
// main 的孤儿提交、worktree 清账这四类同样是「错了要查很久」，所以同样要脚本。
//
// ── 判据的选择：内容判据 > 计数或结构判据 ──
// 本路线两次撞同一类坑，两次的修法都是换判据：
//   · 收尾删分支时 `git branch -d` 用「是否 main 的祖先」这个**结构判据**，
//     在 squash + rebase 下永远通不过，改成比**树**（§6.3.7）。
//   · 断言③ 原用不可达提交的**计数棘轮**，而 squash + rebase 每轮都抛弃原始提交，
//     所以按构造每轮必红（实测 479 → 482 → 484）。改成比**树**加日期水位线。
// 凡是对账与验收，先问「能不能比内容」；不能，才退到计数或结构。
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
//   --watermark   覆盖断言③的日期水位线，默认见常量

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

// ── 断言③ 的日期水位线 ──
//
// 来历：2026-10-25 给断言③ 换树判据后实测，仍有 34 个命中，其中 33 个是**假阳性**：
// 线性化之前的历史中间态（10-05 至 10-16，含 `Checkpoint`、`WIP on …` 的 stash 残骸，
// 以及 `frontend-art-direction` 改写前的旧副本）。根因是分支的**中间态**本来就从未
// 作为完整状态存在于 main，但工作早已由别的路径交付。
//
// 水位线取 2026-10-20：晚于那次改写、早于唯一真孤儿 `ccc3886`（10-24，已打 tag
// `archive/ccc3886-frontend-full-experience` 保存）。
//
// 它不是一个需要每轮重钉的计数：交付残渣由树判据滤掉，历史由本水位线滤掉，
// 两边都不随交付轮次变化。
const UNREACHABLE_WATERMARK = '2026-10-20';

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
const watermark = argValue('--watermark') ?? UNREACHABLE_WATERMARK;

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

// ③ 无内容未并入交付的孤儿提交：两个条件与，都满足才报红。
//
//   条件一 树不在**交付范围内**的树集合里。范围取 `<tip>` 的全部提交（包含 `<base>`，
//          因为交付分支从基点长出来）。squash 与 rebase 会抛弃原始提交，但它们的**树**
//          就是交付里那些提交的树，所以交付残渣在这里被放过（实测 2026-10-25：
//          S1 / S2 两轮交付弃掉的 6 个提交全部命中此条而放过）。
//          用 `tip` 而不是 `base`：交付整理时，本轮自己的 spec / ticket 提交本来就
//          还没进 main，拿 main 的树集合比会把它们全报成孤儿（实测踩过，2 个误报）。
//   条件二 author date 晚于水位线。滤掉线性化之前的历史中间态（见常量注释）。
//
// 不用 patch-id：squash 与 rebase 都会改 patch-id 而树不变；用 patch-id 会把正常交付误报。
const fsck = tryGit(['fsck', '--unreachable', '--no-reflogs']);
if (fsck === null) {
  failures.push(`断言③ git fsck 失败，无法统计不可达提交。`);
} else {
  const unreachable = fsck
    .split('\n')
    .filter((line) => line.startsWith('unreachable commit '))
    .map((line) => line.slice('unreachable commit '.length));

  const deliveryTrees = tryGit(['log', '--format=%T', tip])
    ?.split('\n')
    .filter((line) => line.length > 0);

  if (deliveryTrees === undefined) {
    failures.push(`断言③ 无法取 ${tip} 的树集合——tip 不存在。\n    查：git rev-parse ${tip}`);
  } else {
    const treeSet = new Set(deliveryTrees);
    // 一次调用取全部不可达提交的树与日期，不逐条 fork git。
    const details = tryGit([
      'log',
      '--no-walk',
      '--date=short',
      '--format=%H%x09%T%x09%ad%x09%s',
      ...unreachable,
    ]);
    const suspects = (details ?? '')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => line.split('\t'))
      .filter(([, tree, date]) => !treeSet.has(tree) && date >= watermark);

    if (suspects.length > 0) {
      const listed = suspects
        .slice(0, 8)
        .map(([hash, , date, subject]) => `${hash.slice(0, 7)} ${date} ${subject}`)
        .join('\n    ');
      failures.push(
        `断言③ 有 ${suspects.length} 个孤儿提交：树不在 ${tip} 的交付范围内，且 author date 晚于 ${watermark}。\n` +
          `    这些内容没并入交付。可能是：分支删了但工作没合、被放弃的 cherry-pick、stash 残留。\n` +
          `    ${listed}\n` +
          `    先看内容再决定：git show <hash>。确实作废就打 tag 保存或清掉；不要只改水位线绕过。`,
      );
    }
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

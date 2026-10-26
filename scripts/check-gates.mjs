// 门禁自检：在当前状态下把每个门禁脚本跑一遍，要求全部绿（`npm run check:gates`）。
//
// ── 为什么要它 ──
// 2026-10-25 我写出过一个「每轮必红」的门禁：`check:delivery` 的断言③ 数不可达提交，
// 超过 479 就报警。可 squash / rebase 每轮都抛弃原始提交，那个数只涨不跌——于是它
// 在真实仓库里**一直是红的**，等于废掉。当时没人发现，因为我只在交付那一刻跑它，
// 看到红就按脚本提示重钉基线，从没停下来问「它凭什么以后能变绿」。
//
// 同类的还有一次：断言③ 换代时只上树判据，实测 34 个命中、33 个假阳性——那也是在
// 真实状态下就是红的。
//
// ── 它查的和「新门禁红过一次」互补 ──
// 「先在自己造的破坏上红一次」管的是**永远绿**的门禁（拦不住东西）；
// 这一条管的是**永远红**的门禁（没人愿意跑）。两个方向都得有。
//
// ── 为什么自动发现而不是列清单 ──
// 清单会漂：加了新门禁忘了登记，自检就漏掉它。所以这里扫 `scripts/check-*.mjs`
// 现场发现（排除自己，否则递归）。
//
// ── 不进 check:quick ──
// 它要跑完全部门禁（含 `git fsck` 与产物构建），比秒级的快链重得多。放在交付收尾跑：
// 那一刻正该确认「整套门禁在这个仓库上是否真的都是绿的」。

import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** 自检自己不能进名单，否则无限递归。 */
const SELF = 'check-gates.mjs';

/** 单个门禁的超时上限（秒）。`git fsck` 与产物构建是最慢的两个。 */
const TIMEOUT_SECONDS = 300;

const gates = readdirSync(resolve(root, 'scripts'))
  .filter((name) => /^check-.*\.mjs$/.test(name) && name !== SELF)
  .sort();

if (gates.length === 0) {
  process.stderr.write(
    'check:gates: scripts/ 下没找到任何 check-*.mjs——自检没对象，可能路径写错。\n',
  );
  process.exit(1);
}

const results = [];

// `check-delivery` 的断言④ 数 worktree 数量（收尾后应当只剩主 checkout）。那是收尾后的
// 判据，在 worktree 里跑必然红，但那不说明它坏了。所以在非主 checkout 下声明实际数量，
// 让①②③ 仍然被自检到，并把这处跳过明说出来。
const worktreeList = execFileSync('git', ['worktree', 'list', '--porcelain'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter((line) => line.startsWith('worktree '))
  .map((line) => line.slice('worktree '.length));
const inMainCheckout = worktreeList[0] === root;

for (const gate of gates) {
  const args = [`scripts/${gate}`];
  if (gate === 'check-delivery.mjs' && !inMainCheckout) {
    args.push('--worktrees', String(worktreeList.length));
  }
  const run = spawnSync('node', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: TIMEOUT_SECONDS * 1000,
  });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
    .trim()
    .split('\n')
    .filter((l) => l.length > 0);
  const last = output.at(-1) ?? '(无输出)';
  const timedOut = run.error?.code === 'ETIMEDOUT' || run.signal === 'SIGTERM';
  results.push({ gate, code: run.status, last, timedOut });
  process.stdout.write(`check:gates: ${gate} → ${run.status === 0 ? '绿' : '红'}\n`);
}

if (!inMainCheckout) {
  process.stdout.write(
    `check:gates: 注意——本次在 worktree 里跑，check-delivery 的断言④（worktree 数量）未受检；\n` +
      `    它只在主 checkout 上才测得准，收尾后从主 checkout 再跑一次。\n`,
  );
}

const red = results.filter((r) => r.code !== 0);
if (red.length > 0) {
  for (const r of red) {
    process.stderr.write(
      `check:gates: ${r.gate} 在**当前状态**下是红的${r.timedOut ? '（超时）' : ''}。\n` +
        `    最后一个门禁自己有基线棘轮的话，先问「它凭什么以后能变绿」——\n` +
        `    每轮必红的门禁比没有门禁更糟。\n` +
        `    ${r.last}\n`,
    );
  }
  process.stderr.write(`check:gates: ${gates.length} 个门禁里 ${red.length} 个是红的。\n`);
  process.exit(1);
}

process.stdout.write(`check:gates: ${gates.length} 个门禁在当前状态下全部是绿的。\n`);

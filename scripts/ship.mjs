// 交付收口命令：把「跑 verify」与「push」绑成一条，堵住两步之间的缺口
// （`npm run ship`）。
//
// ── 为什么需要它 ──
// 本仓库的交付纪律要求每个交付提交都跑 `npm run verify`（`CONTRIBUTING.md` §6.6），但
// 「跑 verify」与「push」是两条独立命令，没有机制保证先做了第一条。先 push 再补
// verify，看的人会以为推上去的就是全部；代理的收尾动作里，verify 只能靠「记得跑」。
// 这条命令把两步焊在一起：verify 不过就推不出去。
//
// ── 为什么不挂 pre-commit hook ──
// `CONTRIBUTING.md` §1 明确不加 pre-commit hook：钩子只拦 `git commit`，拦不住
// `git push`，而代理的收尾动作恰恰是 push。给每次 `commit` 加 40 秒的动作，功效却对不上
// 要防的那一步。所以改成一条显式命令——不跑它就不会 push，跑它就顺带把 verify 跑了。
//
// ── 用法 ──
//   npm run ship                 先 verify、再 push 到 origin
//   npm run ship -- --dry-run    做完前置检查，到「将要 push」就停，只打印命令，不真推
//
// ── 四步短路 ──
// ① 工作区脏就拒绝（带着未提交改动推上去，看的人以为推的就是全部）
// ② `npm run verify` 非 0 就不推（失败信息留在屏幕上）
// ③ 本地不领先远端就没有要推的（无 upstream 时提示先 `push -u`）
// ④ `git push origin HEAD`（不写死分支名，worktree 里也对）
// 任一步失败即退出 1；`--dry-run` 在 ④ 只打印不执行，随后退出 0。

import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** 仓库根（从本脚本位置推，因此在 worktree 内跑也指向该 worktree 自己）。 */
const root = fileURLToPath(new URL('..', import.meta.url));

const dryRun = process.argv.slice(2).includes('--dry-run');

/** 跑 git 并捕获 stdout，失败抛异常。 */
function git(args, options = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options });
}

/** 跑 git，失败返回 null（用于「存在与否」这类询问）。
 *  stderr 丢弃：探测失败时 git 的 `fatal:` 是噪声，真正的提示由本脚本给。 */
function tryGit(args) {
  try {
    return git(args, { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/** 打一行「在做什么」。 */
function step(text) {
  process.stdout.write(`ship: ${text}\n`);
}

/** 报错并退出 1，失败信息附上下一步该跑什么。 */
function fail(text) {
  process.stderr.write(`ship: ${text}\n`);
  process.exit(1);
}

// ① 工作区必须干净：推上去的应当正好是已提交的那一份。
step('① 检查工作区是否干净');
const dirty = git(['status', '--porcelain'])
  .split('\n')
  .filter((line) => line.length > 0);
if (dirty.length > 0) {
  fail(
    '工作区有未提交改动，拒绝推送——带着改动推上去，看的人会以为推的就是全部。\n' +
      '    先提交：git add <paths> && git commit\n' +
      '    或暂存：git stash push -m "ship 前暂存"\n' +
      dirty.map((line) => `    ${line}`).join('\n'),
  );
}

// ② 收尾验收：verify 不过就不推。
step('② 跑 npm run verify');
const verify = spawnSync('npm', ['run', 'verify'], { cwd: root, stdio: 'inherit' });
if (verify.status !== 0) {
  fail(
    `npm run verify 失败（退出码 ${verify.status ?? '未知'}），不推送。\n` +
      '    上面的失败信息是要修的东西；修完再跑 npm run ship。',
  );
}

// ③ 至少要有一个可推的提交，且要能定位远端。
step('③ 检查本地是否领先远端');
const upstream = tryGit(['rev-parse', '--abbrev-ref', '@{upstream}']);
if (upstream === null) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  fail(
    '当前分支没有 upstream，无法确定要推到哪里。\n' +
      `    先建 upstream：git push -u origin ${branch}`,
  );
}
const ahead = Number(git(['rev-list', '--count', `@{upstream}..HEAD`]).trim());
if (ahead === 0) {
  process.stdout.write(`ship: 没有要推的提交（${upstream.trim()} 已是 HEAD），收工。\n`);
  process.exit(0);
}
step(`本地领先 ${upstream.trim()} ${ahead} 个提交`);

// ④ 推。`origin HEAD` 而非分支名：worktree 与临时分支都不用改脚本。
step('④ 推送');
if (dryRun) {
  process.stdout.write('ship: --dry-run：将要执行 git push origin HEAD（未实际执行）。\n');
  process.exit(0);
}
const push = spawnSync('git', ['push', 'origin', 'HEAD'], { cwd: root, stdio: 'inherit' });
if (push.status !== 0) {
  fail(
    `git push origin HEAD 失败（退出码 ${push.status ?? '未知'}）。\n` +
      '    看上方的 git 报错；网络或鉴权问题处理后可重试同一条：git push origin HEAD',
  );
}
process.stdout.write('ship: 推送完成。\n');

// worktree 落点门禁：子代理的 worktree 必须落在主 checkout 的 `.worktrees/<ticket>` 下
// （`npm run check:worktrees`，`check:quick` 第一段）。
//
// 规则写在 `~/projects/AGENTS.md`，但那是建议——这个仓库历史上真把 worktree 建到了仓库外
// （历史上真发生过）。`git worktree list` 才是事实：元数据记在
// `.git/worktrees`，建在哪都列得出来。
//
// 另两条断言钉住 `.gitignore` 遮罩：写成整目录就静默失效，`.git/info/exclude` 这类本地源
// 也会盖掉它（真发生过一次）。

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** 主 checkout 的根（从本脚本位置推，因此在 worktree 内跑也指向那个 worktree 自己）。 */
const root = fileURLToPath(new URL('..', import.meta.url));

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

const failures = [];

// ① 落点：除主 checkout 外，每个 worktree 都必须在 `<主 checkout>/.worktrees/` 下。
let worktrees;
try {
  worktrees = git(['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
} catch (error) {
  process.stderr.write(`check:worktrees: git worktree list 失败：${error.message}\n`);
  process.exit(1);
}

const mainCheckout = worktrees[0];
const allowedPrefix = `${mainCheckout}/.worktrees/`;
for (const worktree of worktrees.slice(1)) {
  if (!worktree.startsWith(allowedPrefix)) {
    const name = worktree.slice(worktree.lastIndexOf('/') + 1);
    failures.push(
      `worktree 落点越界：${worktree}\n` +
        `    应为 ${allowedPrefix}${name}。迁移：git worktree move ${worktree} ${allowedPrefix}${name}`,
    );
  }
}

// ② 遮罩：两条 `git check-ignore` 探针，证明「worktree 内容被排、`.gitkeep` 没被排」。
// 必须带 `--no-index`：已入库的文件不吃 ignore 规则，不带就看不见回退。
const ignored = (path) => {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

if (!ignored('.worktrees/__gate_probe__/a.ts')) {
  failures.push(
    'worktree 内容没有被 .gitignore 遮罩住（.worktrees/* 失效）——建在里面的 worktree 会弄脏 git status，"' +
      '且 git add -A 会把它们收进提交。',
  );
}
if (ignored('.worktrees/.gitkeep')) {
  failures.push(
    '.worktrees/.gitkeep 被某条 ignore 规则排掉了——负向规则失效，目录不会随克隆存在。' +
      '常见元凶是改回整目录写法（.worktrees/，父目录被排除后 git 不再下钻）' +
      '或 `.git/info/exclude` / 全局 excludesfile 里另排了一次。\n' +
      '    查：git check-ignore -v .worktrees/.gitkeep',
  );
}
try {
  git(['ls-files', '--error-unmatch', '.worktrees/.gitkeep']);
} catch {
  failures.push(
    '.worktrees/.gitkeep 不在版本库里——空目录不被 git 跟踪，靠它让目录随克隆存在。' +
      '提交：git add .worktrees/.gitkeep',
  );
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`check:worktrees: ${failure}\n`);
  process.exit(1);
}
process.stdout.write(
  `check:worktrees: ${worktrees.length - 1} 个 worktree，落点全部在 .worktrees/ 下。\n`,
);

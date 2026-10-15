import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// 对「相对某个 git ref 改动的核心逻辑文件」跑 Stryker 变异测试。
//
// 为什么需要这个包装：
//   - Stryker 10 没有 `--since` / 按 git ref 增量的能力（只有基于上次结果文件的
//     `--incremental`）。要按改动收敛范围，唯一正确做法是外部用 git 算出改动文件，
//     再喂给 `--mutate`。
//   - `mutate` glob 与 `git diff --name-only` 的输出都是相对 repo root，可直接透传；
//     用 node 以数组参数调用可规避 shell 引号与路径问题。
//
// 用法：
//   npm run mutation:changed                 # 对比 HEAD（含未提交改动）
//   npm run mutation:changed -- <ref>        # 对比任意 ref，如 HEAD~1、main
//   npm run mutation:changed -- <ref> --dryRunOnly   # 额外参数透传给 stryker run
//
// 说明：无改动文件时以退出码 0 退出。见下方注释。

const LOGIC_DIR = 'src/core/logic';
// 纯 re-export 的入口 barrel 不参与变异（与 stryker.config.json 的 `!` 排除保持一致）。
const BARREL = `${LOGIC_DIR}/index.ts`;

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf-8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `git ${args.join(' ')} 执行失败\n`);
    process.exit(result.status ?? 1);
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const ref = process.argv[2] ?? 'HEAD';
const passthroughArgs = process.argv.slice(3);

// 相对 ref 的已跟踪改动（新增 / 复制 / 修改 / 重命名；不含删除）。
const trackedChanges = git(['diff', '--name-only', '--diff-filter=ACMR', ref, '--', LOGIC_DIR]);
// 未跟踪的新文件不在任何提交里，相对任何 ref 都算「改动」，一并纳入。
const untrackedFiles = git(['ls-files', '--others', '--exclude-standard', '--', LOGIC_DIR]);

const changedFiles = [...new Set([...trackedChanges, ...untrackedFiles])]
  .filter((file) => file.endsWith('.ts'))
  .filter((file) => file !== BARREL);

if (changedFiles.length === 0) {
  // 无改动是合法状态（干净工作树 / 该 ref 未触及核心逻辑），不是失败。
  // 退出 0 以免 CI 或自动化把「没有东西可变异」误判为报错；输出足以让人区分
  // 「跑过了但没目标」和「真的跑过并全部存活」。
  process.stdout.write(
    `mutation:changed: 相对 '${ref}' 没有改动的 TypeScript 文件（目录 ${LOGIC_DIR}/，已排除 ${BARREL}）。\n`,
  );
  process.stdout.write('没有可变异的目标，退出 0。\n');
  process.exit(0);
}

process.stdout.write(
  `mutation:changed: 相对 '${ref}' 共 ${changedFiles.length} 个改动文件，开始变异：\n`,
);
for (const file of changedFiles) {
  process.stdout.write(`  - ${file}\n`);
}

// 用 `--mutate` 覆盖配置里的全量 glob，只跑改动文件。
// JSON 报告（artifacts/mutation/mutation.json）与存活明细仍由 stryker.config.json 的 reporters 产出。
const strykerArgs = ['run', '--mutate', changedFiles.join(','), ...passthroughArgs];
const result = spawnSync(resolve('node_modules/.bin/stryker'), strykerArgs, {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);

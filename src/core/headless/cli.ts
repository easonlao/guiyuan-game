/**
 * 归元弈 (Guiyuan) - 无头实验命令的共享 CLI 基础设施
 *
 * 把三个实验入口（ExperimentRunner / DynamicSwitching / AtkMarginalReturn）
 * 重复的「直接执行守卫 + 统一错误处理」收敛到一处（code-review finding E）。
 *
 * 守卫需要调用方传入自己的 `import.meta.url`：只有当该模块被 `node`/`tsx`
 * 直接执行（而非被 import）时才运行 CLI 主体。`import.meta.url` 无法从被调用方
 * 推断，因此由调用方显式传入。
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** 当前模块是否被 CLI 直接执行（`argv[1]` 即本模块文件）。 */
export function isDirectRun(moduleUrl: string, argv: readonly string[] = process.argv): boolean {
  const entry = argv[1];
  if (!entry) return false;
  return (
    moduleUrl === pathToFileURL(entry).href ||
    moduleUrl === pathToFileURL(resolve(entry)).href
  );
}

/**
 * CLI 直接执行入口：仅当 `moduleUrl` 是被直接执行的模块时运行 `main`，
 * 并统一把异常转成 `process.exitCode = 1`（与三个实验入口的历史行为一致）。
 */
export function runCliIfDirect(moduleUrl: string, main: () => void): void {
  if (typeof process === 'undefined' || !process.argv || !process.argv[1]) {
    return;
  }
  if (!isDirectRun(moduleUrl, process.argv)) {
    return;
  }
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

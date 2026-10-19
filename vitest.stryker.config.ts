import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

// Stryker 专用 Vitest 配置。
//
// 为什么需要单独一份：
//   - `tests/core/candidate-validation.test.ts` 的 `beforeAll` 会跑 4 次完整候选验证（重仿真），
//     在 Stryker 的 perTest 覆盖率插桩下超过 Vitest 默认的 10s hookTimeout，导致 dry run 直接失败。
//     该用例只覆盖 `tools/CandidateValidation.ts`，而 Stryker 只 mutate `src/core/logic/**`，
//     排除它不损失任何被 mutate 文件的覆盖信号。
//   - 同时抬高 hookTimeout 与 testTimeout，给其余重用例留出插桩开销。testTimeout 这条
//     是 2026-10-18 一次 CI 试跑留下的：`座次平衡对称性` 本地约 0.5s，但在 2 vCPU 的
//     托管 runner 上、带着 perTest 插桩、4 个 worker 争 CPU 时越过了默认的 5s。
//     那次运行所在的 workflow 已删除（CI 不再跑突变，见 ADR 0012），但上限保留：
//     agent 的机器也可能被别的任务占满，dry run 一样带插桩。该用例经 `HeadlessBenchmark`
//     驱动 `TurnManager` / `ActionResolver` 跑 50 局矩阵，是 mutated 文件的真实覆盖来源，
//     排掉等于丢信号（与 `candidate-validation` 的情形不同：那一份覆盖的是 `tools/`）。
//     抬到 60s 不会掩盖挂死：Stryker 自己的突变超时（`stryker.config.json` 的
//     `timeoutMS` + `timeoutFactor × dryRun 净耗时`）远早于这个上限触发。
//
// `resolve.alias` 是包边界（`@guiyuan/game`）与 Stryker 沙箱的适配层：
//   - 沙箱里 `tools/` 走 `@guiyuan/game/…`（`.npmrc` 的 `linked` 布局把它链到真实仓库的 `src/`），
//     而测试走相对路径 `../../src/…`（沙箱自己的 `src/`）。同一份源码被解析成两个模块实例，
//     `toBe` 之类的身份断言会假红（曾见于 `tests/core/candidate-search.test.ts`），
//     更严重的是被 mutate 的沙箱源码与 tools 实际加载的源码不是同一份，突变信号会失真。
//   - 别名以**运行目录**（沙箱根）为基准，把 `@guiyuan/game` 钉回本地 `src/`；仓库内直接 `npm test`
//     时它解析到同一份真实 `src/`，与 `vitest.config.ts` 的默认解析等价，所以不写进那份配置。
//   - 声明式边界仍由 `tsc`（`moduleResolution: nodenext` + `exports`）在类型检查期把关；
//     这里只影响 Stryker 沙箱内的运行时解析。
export default defineConfig({
  resolve: {
    alias: {
      '@guiyuan/game': resolve(process.cwd(), 'src'),
    },
  },
  test: {
    include: ['tests/core/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'tests/core/candidate-validation.test.ts'],
    environment: 'node',
    globals: true,
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});

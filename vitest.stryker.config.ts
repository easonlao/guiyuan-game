import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

// Stryker 专用 Vitest 配置。
//
// 为什么需要单独一份：
//   - `tests/core/candidate-validation.test.ts` 的 `beforeAll` 会跑 4 次完整候选验证（重仿真），
//     在 Stryker 的 perTest 覆盖率插桩下超过 Vitest 默认的 10s hookTimeout，导致 dry run 直接失败。
//     该用例只覆盖 `tools/CandidateValidation.ts`，而 Stryker 只 mutate `src/core/logic/**`，
//     排除它不损失任何被 mutate 文件的覆盖信号。
//   - 同时抬高 hookTimeout，给其余重用例留出插桩开销。
//
// `resolve.alias` 是包边界（`@guiyuan/game`）与 Stryker 沙箱的适配层：
//   - 沙箱里 `tools/` 走 `@guiyuan/game/…`（`.npmrc` 的 `linked` 布局把它链到真实仓库的 `src/`），
//     而测试走相对路径 `../../src/…`（沙箱自己的 `src/`）。同一份源码被解析成两个模块实例，
//     `toBe` 之类的身份断言会假红（曾见于 `tests/core/candidate-search.test.ts`），
//     更严重的是被 mutate 的沙箱源码与 tools 实际加载的源码不是同一份，变异信号会失真。
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
  },
});

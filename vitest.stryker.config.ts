import { configDefaults, defineConfig } from 'vitest/config';

// Stryker 专用 Vitest 配置。
//
// 为什么需要单独一份：
//   - `tests/core/candidate-validation.test.ts` 的 `beforeAll` 会跑 4 次完整候选验证（重仿真），
//     在 Stryker 的 perTest 覆盖率插桩下超过 Vitest 默认的 10s hookTimeout，导致 dry run 直接失败。
//     该用例只覆盖 `src/core/headless/CandidateValidation.ts`，而 Stryker 只 mutate `src/core/logic/**`，
//     排除它不损失任何被 mutate 文件的覆盖信号。
//   - 同时抬高 hookTimeout，给其余重用例留出插桩开销。
export default defineConfig({
  test: {
    include: ['tests/core/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'tests/core/candidate-validation.test.ts'],
    environment: 'node',
    globals: true,
    hookTimeout: 60000,
  },
});

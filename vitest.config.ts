import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/core/**/*.test.ts'],
    environment: 'node',
    globals: true,
    // 超时不在这里全局抬高。两个重用例各自在自己的文件里声明超时，见
    // dominance-regression-guard.test.ts 的 MATRIX_HOOK_TIMEOUT_MS 与
    // candidate-validation.test.ts 的 DETERMINISM_TIMEOUT_MS。
    // 这样新出现的慢 hook / 慢用例仍会撞到默认值（hook 10s / test 5s）。
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/core/**/*.test.ts'],
    environment: 'node',
    globals: true,
    // 默认的 10s / 5s 是按快机器定的。两个最重的用例在 GitHub `ubuntu-latest` 上要
    // ~10.5s（dominance 的 beforeAll）和 ~4.0s（candidate-validation 的确定性用例），
    // 而本机只要 ~5.6s / ~1.3s。2026-10-16 把它当日的旧成功 commit 重跑也会在同一个
    // hook 上超时——是 runner 变慢，不是代码回归。留足余量，别让它再偶发翻车。
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});

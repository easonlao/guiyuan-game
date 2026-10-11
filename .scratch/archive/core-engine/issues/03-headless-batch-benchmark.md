# 03: 万局无头推演基线评测与内存/GC双指标诊断

**Blocked by:** 01、02

**Status:** resolved

## Context & Question

如何构建批量推演与性能基线诊断脚本（`HeadlessBenchmark`），驱动策略 AI 进行 10,000 局自动化推演，并产出胜率分布、平均回合数、推演 TPS 以及内存泄漏检测报告？

## Acceptance Criteria

1. 在 `src/core/headless/HeadlessBenchmark.ts` 实现高性能批量推演器：
   - 支持配置局数、并发/串行推演、注入不同策略对局（如 归元 AI vs 克制 AI）。
   - 记录推演总耗时、单局平均微秒数、P1/P2 胜率、归元终局率与 60 回合终局率。
   - 监控推演前后 `process.memoryUsage().heapUsed` 变化，验证低 GC 增量更新的稳定性。
2. 提供可执行的 npm 脚本 `npm run benchmark:headless`。
3. 单元测试 `tests/core/headless-benchmark.test.ts`（跑 100 局快速验证）。
4. `npm test`、`npm run oxlint` 和 `npm run check:deps` 全部通过。

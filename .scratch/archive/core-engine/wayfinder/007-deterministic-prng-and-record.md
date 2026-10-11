# T0: 确定性随机生成器 (PRNG) 与轻量对局日志契约

**Type:** task

**Blocked by:** None (can start immediately)

**Status:** resolved

## Question

如何为纯 TS 核心层实现零外部依赖、高性能且可控种子的伪随机数生成器（PRNG，如 xorshift128+ 或 mulberry32），并定义轻量对局日志格式（`[seed, actions]`），确保推演过程中的任意对局均能 100% 确定性重现？

## Acceptance Criteria

1. 在 `src/core/utils/prng.ts` 实现高性能、支持设置 seed 的 PRNG，并接管天干抽取机制（废弃 `Math.random()`）。
2. 在 `src/core/types/record.ts` 定义紧凑的对局记录格式 `GameRecord`。
3. 单元测试覆盖不同种子下结果的确定性与独立性。
4. `npm test`、`npm run oxlint` 和 `npm run check:deps` 全部通过。

## Resolution

已基于 Mulberry32 算法实现确定性 PRNG 工具库（`createPRNG`、`drawTianGan`），废弃对局逻辑中对 `Math.random()` 的依赖；定义了 `GameRecord` 与 `ActionRecord` 轻量对局格式；将 `HeadlessMatch` 接入 PRNG 并输出完整对局日志；通过单测覆盖相同种子确定性回放与独立性检验，全量测试与静态检查 100% 通过。


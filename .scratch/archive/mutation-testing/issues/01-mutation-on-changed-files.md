# 01: 变异测试能在改动处跑，并输出存活清单

**What to build:** agent 能对"本次改动涉及的核心逻辑文件"跑一次变异测试，拿到存活突变体的具体位置（文件、行号、变异类型、diff），而不是只有一个百分比。同时保留全量跑的能力。范围收敛到核心逻辑层，排除只有 re-export 的入口文件。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 有一个命令能只对"相对某个 git ref 改动的文件"跑变异，并产出报告（`npm run mutation:changed [-- <ref>]`，默认 `HEAD`）
- [x] 有一个命令能跑全量（`npm run mutation`）
- [x] 报告给出每个存活突变体的文件、行号、变异类型与 diff（`clear-text` 控制台 + `artifacts/mutation/mutation.json`）
- [x] 只有 re-export 的入口文件不在变异范围内（`!src/core/logic/index.ts`）
- [x] `npm test` 的行为与结果不变（实测 665 用例全绿；本票未触碰 `scripts/run-tests.mjs` / `vitest.config.ts` / `vitest.stryker.config.ts`）
- [x] 全量跑不会像修复前那样在 dry run 阶段失败（`stryker run --dryRunOnly`：Found 6 files，Ran 609 tests，exit 0）

**备注：** dry run 的 hook 超时与 `coverageAnalysis` 退化两个阻断问题已在本次会话修好（提交 `4bc2a57`），本票只做范围收敛与命令包装，不要回退这两个修复。

**交付提交：** `48865e2`。

**⚠️ 本票执行时发现的新阻塞（上游 bug，非本票引入）：** 在 `@stryker-mutator/vitest-runner@10.0.0` + `vitest@5.0.3` 下，**非 static 突变体的存活判定全部不可信**——runner 按空格连接套件链构造 `testNamePattern`，而 Vitest 5 改用 `' > '` 连接，过滤不中任何用例、实际执行 0 个测试，突变体一律误报 `Survived`（报告里 `testsCompleted: 0`）。仅 static 突变体（不套名字过滤）判定正确。上游 [stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210)，修复 PR [#6214](https://github.com/stryker-mutator/stryker-js/pull/6214) 未发布；`coverageAnalysis: "off"` 无法绕开。建议：`patch-package` 打 #6214 分隔符补丁，或把 Vitest 降到 4.x。本票交付的命令/报告结构正确，但在该上游 bug 修复前，存活清单不能当作真实测试缺口（已记入 `docs/TEST_PLAN.md`）。

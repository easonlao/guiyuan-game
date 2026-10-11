# 00: 修复 vitest-runner 的 testNamePattern 分隔符（前置阻断）

**What to build:** 让变异测试对**非 static 突变体**给出真实判定。当前 `@stryker-mutator/vitest-runner@10.0.0` 在 Vitest 5 下用**空格**连接套件链构造 `testNamePattern`，而 Vitest 5 按 `' > '` 匹配该 pattern，导致有 per-test 覆盖的突变体实际执行 **0 个测试**、一律误报 Survived。

**Blocked by:** None

**Status:** done

## 证据

- 本地：`node_modules/@stryker-mutator/vitest-runner/dist/src/test-helpers.js:11` 与 `.../stryker-setup.js:66` 均为 `nameParts.join(' ')`；`vitest-test-runner.js:148-152` 用它构造 `project.config.testNamePattern`。
- 现象：`EventBus.ts`（0 个 static 突变体）45 存活 / **0 杀**，存活项 `coveredBy: 46` 但 `testsCompleted: 0`。
- 上游 [stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210) 完整描述同一 bug，修复 PR [#6214](https://github.com/stryker-mutator/stryker-js/pull/6214)/[#6220](https://github.com/stryker-mutator/stryker-js/pull/6220) **尚未发版**（`npm view` latest 仍是 10.0.0）。
- `coverageAnalysis: "off"` 绕不开：vitest-runner 无论如何都按 perTest 收集覆盖并回传。

## 验收标准

- [x] 用 `patch-package` 给 `@stryker-mutator/vitest-runner` 打上 #6214 的分隔符修复（`dist/src/test-helpers.js` 与 `dist/src/stryker-setup.js` 的 `collectTestName` 用 `' > '`），patch 文件入库到 `patches/`
- [x] `package.json` 增加 `"postinstall": "patch-package"`，`patch-package` 进 `devDependencies`
- [x] `EventBus.ts` 变异跑出**非零杀分**（修复前 0 杀 / 45 存活 → 修复后 34 杀 / 11 存活 / 2 无覆盖，72.34%）
- [x] 存活突变体的 `testsCompleted` 不再恒为 0（修复后存活项为 2–46，平均每突变体执行 9.21 个测试）
- [x] `npm test` 仍全绿（665 用例）
- [x] 更新 `docs/TEST_PLAN.md` 中 MT01 追加的「上游 bug」记录为已修复，并说明补丁位置、升级 runner 时需重新生成补丁

## 备注

本票是 `.scratch/mutation-testing` 的硬前置：02/03/04 在本票落地前拿到的存活清单**不可信**（MT01 交付的命令与报告结构正确，仅报告内容受此 bug 污染）。

## 决定（2026-10-10）

在 patch-package / 降 Vitest 4 / 等上游三个方案中选择 **patch-package**：改动最小、只碰 runner 的 dist、上游已有第三方实测验证（补丁后 0% → 100%），且保留仓库已迁移到的 Vitest 5。

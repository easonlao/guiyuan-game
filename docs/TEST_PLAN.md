# 归元弈 (Guiyuan) - 测试计划与质量保障体系 (Test Plan)

在 AI-First 的架构下，测试不仅是用来发现 Bug 的，更是给 AI Agent 提供**确定性反馈循环**的“眼”和“耳”。通过执行测试，AI 能知道自己写的代码是对是错。

本测试计划分为三个维度：单元测试 (Unit Test)、无头推演测试 (Headless Match) 以及突变体检 (Mutation Test)。

---

## 1. 单元测试 (Unit Testing)

这是项目最核心、最高频的测试环节，必须在每次 Commit 之前确保 100% 绿灯。

* **测试框架**：`Vitest` (极速反馈，原生 TypeScript 支持)
* **测试目录**：集中收敛于 `tests/core/` 目录，执行 `npm test`
* **覆盖率红线 (Coverage)**：
  * **Layer 1 (核心逻辑层)**：如 `ActionResolver`, `ScoreCalculator`, `TurnManager` 必须保持 100% 规则完备并配备严密分支单测。纯函数状态推演与增量结构共享。
  * **Layer 2 (适配器层)**：针对 `IStorageManager` 等，提供 `MockStorage`、`LocalStorageAdapter`、`WechatStorageAdapter`。
  * **Layer 3 (表现层)**：小游戏 Canvas 脚本通过类型检查 (`npm run typecheck`)、构建检查 (`npm run build:minigame`) 与真机视觉回归验收。

**对 AI 的要求 (TDD)**：当 Agent 实现或重构核心规则（如 `ActionType.BURST`）时，必须先在 `tests/core/` 编写红灯测试用例，再实现业务逻辑使其变绿。

---

## 2. 无头对战模拟测试 (Headless Match)

《归元弈》是一款高强度策略游戏。AI 决策的效率和胜率，不能仅仅通过单元测试来证明，需要放到无头模拟器中“真刀真枪”地跑。

* **测试脚本存放处**：`src/core/headless/HeadlessBenchmark.ts`，通过 `npm run benchmark:headless` 触发。
* **执行方式**：通过 Node.js 运行纯粹的对战主循环（双方均由 AI 控制），不渲染任何 UI。
* **验收指标**：
  1. **性能基准 (Performance)**：在 Node.js 环境下跑通 10,000 局推演，单局完整推演平均耗时必须严格 `< 1ms`，吞吐量 > 1500 TPS。
  2. **确定性 (Determinism)**：如果传入相同的随机数种子 (Seed)，执行 100 场对局的胜负结果必须 100% 绝对一致。
  3. **内存与 GC 稳定性**：推演 10,000 局前后堆内存增量平稳（+<10MB），无任何对象泄漏。

---

## 3. 突变测试与漏洞防御 (Mutation Testing)

由于 AI 生成的代码有时会看似通过了测试，但实际上只是“侥幸通过”（比如测试断言写得太宽泛），我们需要引入**突变测试 (Mutation Testing)** 来检验测试本身的健壮性。**规则与门禁的完整说明见 [`docs/MUTATION-TESTING.md`](./MUTATION-TESTING.md)**，本节只做摘要。

* **测试工具**：[Stryker.js](https://stryker-mutator.io/)，配置见 `stryker.config.json`（`mutate` 覆盖 `src/core/logic/**/*.ts`，排除纯 re-export 的 `src/core/logic/index.ts`）。
  * 全量：`npm run mutation`。
  * 只跑相对某 git ref 改动的逻辑文件：`npm run mutation:changed`（默认对比 `HEAD`，含未提交改动；可传 ref，如 `npm run mutation:changed -- HEAD~1`）。
  * 存活明细同时输出到控制台（`clear-text`，含文件/行号/变异类型与 `- / +` diff）与 `reports/mutation/mutation.json`（`reports/` 已 gitignore）。
* **执行时机（两条路径）**：
  1. **改动处跑**：`implement` 收尾时对本次改动的逻辑文件跑 `npm run mutation:changed`，当场补断言。
  2. **里程碑全量**：每个 spec 收尾 + 发版/提审前跑 `npm run mutation`。
* **运行机制**：Stryker 会故意修改你的业务代码（例如把 `if (score >= 1)` 改成 `if (score > 1)`），然后运行 Vitest。如果测试仍然通过，说明这个“突变体存活了”，意味着你的测试用例存在漏洞（没有覆盖到边界值）。
* **门禁 = 基线棘轮，不是固定阈值**：仓库入库一份基线 `mutation-baseline.jsonl`（当前 223 条 = Survived 122 + NoCoverage 101）。跑完变异后用 `npm run mutation:check` 与基线对比，**只对基线里没有的**存活/无覆盖报警：无新增退出 `0`，有新增退出 `1`，缺报告/缺基线退出 `2`。确认等价的突变体就地 `// Stryker disable next-line <Mutator>` 并写理由，不做全局排除；确认接受的新缺口用 `npm run mutation:baseline` 更新基线（diff 可 review）。
  * **不设全局固定阈值**：全库绝对变异分不可行、不可行动——Google《State of Mutation Testing at Google》(ICSE-SEIP 2018) 与《Practical Mutation Testing at Scale》(IEEE TSE 2021) 都只对改动的行跑变异，并把单个存活突变体作为 review 评论，而不是用分数当门禁。按成熟度的参考档位是 60/75/90，仅供定位水平，100% 不值得追（等价突变体是天花板）。理由与来源详见 `docs/MUTATION-TESTING.md` §5。
  * **现状（2026-10-10）**：全量变异分 **79.45%**（ActionCandidates 98.98 / ActionResolver 80.39 / EventBus 72.34 / ScoreCalculator 83.16 / State 91.62 / TurnManager 63.70），落在“活跃开发”与“稳定库”之间，是状态快照而非门禁。

> **阻断问题的修复（2026-10-10）**：
>
> 1. `tests/core/candidate-validation.test.ts` 的重仿真用例在 Stryker 插桩下超过默认 `hookTimeout`，已通过 `vitest.stryker.config.ts` 将其排除出 Stryker 测试集（该用例只覆盖 `src/core/headless/CandidateValidation.ts`，而 Stryker 只 mutate `src/core/logic/**`，排除不损失被 mutate 文件的覆盖信号）。
> 2. **非 static 突变体误报存活**：`@stryker-mutator/vitest-runner@10.0.0` + `vitest@5.0.3` 下，runner 用**空格**连接套件链构造 `testNamePattern`，而 Vitest 5 用 `' > '` 连接，导致过滤不中任何用例、实际执行 **0 个测试**，突变体被一律误报为 `Survived`（报告里 `testsCompleted: 0`）。**这才是“0 个测试/突变体”的真正根因**——与 `coverageAnalysis` 无关，`coverageAnalysis: "off"` 也绕不开它（该配置维持既有值不变）。上游 [stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210)，修复 PR [#6214](https://github.com/stryker-mutator/stryker-js/pull/6214) 尚未发版，故本地用 `patch-package` 落地修复。
>
> - **补丁文件**：`patches/@stryker-mutator+vitest-runner+10.0.0.patch`（已入库）。
> - **补丁内容**：把两处 `collectTestName` 的 `nameParts.join(' ')` 改为 `nameParts.join(' > ')`——`dist/src/test-helpers.js`（`vitest-test-runner.js` **经 `vitest-helpers.js` 间接**引用它来构造 test id / `testNamePattern`）与 `dist/src/stryker-setup.js`（沙箱内收集 per-test 覆盖）。两者必须一致，否则覆盖 id 与过滤 pattern 对不上。
> - **与上游 #6214 的区别**：上游 #6214 是**按 Vitest 版本选择分隔符**并注入 `testNameSeparator`；本补丁是**版本无关的硬编码** `' > '`。
> - **生效方式**：`package.json` 的 `postinstall` 已设为 `patch-package`，`patch-package` 在 `devDependencies`；`npm install` / `npm ci` 后自动打补丁。
> - **⚠️ 维护告警**：升级 `@stryker-mutator/vitest-runner` 或**降级 `vitest` 到 4.x** 时都必须重新生成/复核补丁。升级 runner：新版本若已含 #6214，应删除本补丁并移除 `postinstall`；若仍含该 bug，需对新 dist 重新生成 patch（`npx patch-package @stryker-mutator/vitest-runner`），否则 `postinstall` 会因 patch 上下文不匹配而失败。降级 Vitest 到 4.x：4.x 用**空格**分隔符，硬编码 `' > '` 会**反向失效**，突变体重新误报存活，必须先确认版本对应的分隔符再决定是否改写补丁。
> - **验证**：修复前 `EventBus.ts` 为 0 杀 / 45 存活 / `testsCompleted` 恒为 0；修复后 34 杀 / 11 存活 / 2 无覆盖（突变分 72.34%，平均每突变体执行 9.21 个测试），存活项 `testsCompleted` 不再为 0。

---

## 4. 小游戏验收与人工真机测试 (QA Runbook)

底层脱水逻辑验证通过后，进行小游戏表现层集成与验收：

* **测试步骤**：
  1. 在 WSL 执行 `npm run build:minigame` 构建单文件 `minigame/game.js`（或 `npm run dev:minigame` 启动监听）。
  2. 打开 Windows 微信开发者工具，导入项目目录（`\\wsl.localhost\Ubuntu\home\easonlao\projects\guiyuan-game\minigame`）。
  3. **模拟器验收**：
     - 切换不同机型（iPhone 14/15/16、Android 经典款），验证顶部比分栏是否成功避让刘海屏/灵动岛；
     - 验证底部动作按钮布局与触控命中是否顺畅；
     - 验证 P1 操作与 P2 (天道) AI 思考出招的节奏流畅度。
  4. **真机性能 Profiling**：点击微信开发者工具的“预览”，用手机微信扫码真机试玩，监控触控延迟、帧率与 GC 表现。

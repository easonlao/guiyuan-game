# 归元弈 (Guiyuan) - 测试计划与质量保障体系 (Test Plan)

在 AI-First 的架构下，测试不仅是用来发现 Bug 的，更是给 AI Agent 提供**确定性反馈循环**的“眼”和“耳”。通过执行测试，AI 能知道自己写的代码是对是错。

本测试计划分为三个维度：单元测试 (Unit Test)、无头推演测试 (Headless Match) 以及突变体检 (Mutation Test)。

---

## 1. 单元测试 (Unit Testing)

这是项目最核心、最高频的测试环节，必须在每次 Commit 之前确保 100% 绿灯。

* **测试框架**：`Vitest` (利用其极速特性与原生 TypeScript 支持)
* **测试目录**：与源码同级存放，命名为 `*.test.ts` (例如 `src/logic/ActionResolver.test.ts`)
* **覆盖率红线 (Coverage)**：
  * **Layer 1 (核心逻辑层)**：如 `ActionResolver`, `ScoreCalculator` 必须达到 **100% 的分支覆盖率 (Branch Coverage)**。因为它们是纯函数，构造输入输出极其简单。
  * **Layer 2 (适配器层)**：针对 `StorageAdapter` 等，要求达到 80% 以上覆盖率，依赖注入处需提供 `MockStorage` 进行测试。
  * **Layer 3 (UI 层)**：Cocos 脚本不强制要求单测，由人工进行 UI 回归。

**对 AI 的要求 (TDD)**：当 Agent 实现一个 `ActionType.BURST` 的逻辑前，必须先写出 `ActionResolver.execute` 在输入 `BURST` 时的期望结果（失败/报错的 Case，以及成功的 Case）。

---

## 2. 无头对战模拟测试 (Headless Match)

《归元弈》是一款高强度策略游戏。AI 决策的效率和胜率，不能仅仅通过单元测试来证明，需要放到无头模拟器中“真刀真枪”地跑。

* **测试脚本存放处**：`.scratch/headless-strategy-evaluation/` 或 `docs/headless/` 相关目录下。
* **执行方式**：通过 Node.js 运行纯粹的对战主循环（双方均由 AI 控制），不渲染任何 UI。
* **验收指标**：
  1. **性能基准 (Performance)**：在 Node.js 环境下单次 AI 完整推演与状态结算总耗时必须严格 `< 16ms`，这是为了保证后续在微信小游戏端达到 60FPS。
  2. **确定性 (Determinism)**：如果传入相同的随机数种子 (Seed)，执行 100 场对局的胜负结果必须 100% 绝对一致。一旦偏离，说明逻辑中混入了未追踪的副作用。
  3. **策略有效性 (Balance)**：通过跑 `batch-comparison-cli`，检验调整平衡性参数后，先后手的胜率是否在预期范围内（如 45% ~ 55% 之间）。

---

## 3. 突变测试与漏洞防御 (Mutation Testing)

由于 AI 生成的代码有时会看似通过了测试，但实际上只是“侥幸通过”（比如测试断言写得太宽泛），我们需要引入**突变测试 (Mutation Testing)** 来检验测试本身的健壮性。

* **测试工具**：[Stryker.js](https://stryker-mutator.io/)
* **执行时机**：**发布前 (Pre-release) 或 核心模块重构完毕后**。日常高频开发无需运行。
* **运行机制**：Stryker 会故意修改你的业务代码（例如把 `if (score >= 1)` 改成 `if (score > 1)`），然后运行 Vitest。如果测试仍然通过，说明这个“突变体存活了”，意味着你的测试用例存在漏洞（没有覆盖到边界值）。
* **准入红线**：核心模块 (如计分和伤害判定) 的 **Mutation Score 必须 >= 95%**。

---

## 4. UI 验收与人工测试 (QA Runbook)

底层脱水逻辑验证通过后，将由人类开发者介入进行集成。

* **测试步骤**：
  1. 打开 Cocos Creator 3.x，导入更新后的 TS 核心库。
  2. 在浏览器预览 (Web Preview) 模式下，验证 `EventBus` 抛出的事件是否能正确触发粒子特效、分数 Label 更新以及节点状态变化。
  3. **真机性能 Profiling**：打包为微信小游戏体验版，使用微信开发者工具与真机扫码，监控内存分配是否平稳，是否存在明显的 GC 掉帧。如遇由于 AI 思考深度导致的卡顿，应启用微信小游戏的原生 Worker 线程剥离计算。

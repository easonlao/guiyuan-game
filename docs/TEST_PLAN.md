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

由于 AI 生成的代码有时会看似通过了测试，但实际上只是“侥幸通过”（比如测试断言写得太宽泛），我们需要引入**突变测试 (Mutation Testing)** 来检验测试本身的健壮性。

* **测试工具**：[Stryker.js](https://stryker-mutator.io/) (`npm run stryker`)
* **执行时机**：**发布前 (Pre-release) 或 核心模块重构完毕后**。日常高频开发无需运行。
* **运行机制**：Stryker 会故意修改你的业务代码（例如把 `if (score >= 1)` 改成 `if (score > 1)`），然后运行 Vitest。如果测试仍然通过，说明这个“突变体存活了”，意味着你的测试用例存在漏洞（没有覆盖到边界值）。
* **准入红线**：核心计算逻辑的 **Mutation Score 必须 >= 80%**。

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

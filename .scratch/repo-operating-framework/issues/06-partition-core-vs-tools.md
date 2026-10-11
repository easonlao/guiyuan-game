# 06: 分区——无头推演搬出核心

**What to build:** 无头推演与命令行入口不再和游戏核心住一起；手机包不可能再被拖进 Node 内建模块。

**Blocked by:** 04（需要一份绿的验收来定义「改之前是绿的」）

**Status:** ready-for-agent

- [ ] 无头推演与 CLI 入口移出核心目录，成为独立的一块
- [ ] 核心的公开出口不再导出无头推演
- [ ] 全部引用改完，验收命令全绿
- [ ] 加一条依赖边界规则：**小游戏侧不得到达无头推演，也不得到达任何 `node:*`**
- [ ] 造一次故意的越界引用 → 规则报红；撤销 → 绿
- [ ] 写一条 ADR：分区按什么判据切、为什么切两块

**实现要点：**

- **这不是审美，是活的洞。** `src/core/index.ts:3` 有 `export * from './headless/index.js'`，而 `src/core/headless/` 是**全 `src/` 唯一** import `node:url` / `node:path` 的地方（`HeadlessBenchmark.ts:9-10`、`cli.ts:12-13`）。手机包里没有 Node 内建模块。
- 今天没炸只因为 `src/minigame/*` 全部写深路径引用、绕过 barrel。没有任何规则挡着任何人改回去。
- **只搬运不加规则，等于搬完还能被踩。** 本票的边界规则和搬运同等重要。
- 搬运是机械改动，但爆炸半径不小：23 个测试文件 import 了 `core/headless`。`stryker.config.json` 的 `mutate` 范围、`package.json` 的 `benchmark:*` 脚本、`tsconfig.json` 的 `include` 都要跟着动。
- ADR 的判据要写清：**独立消费者 / 独立运行时**。`logic`/`ai`/`types`/`utils`/`adapters` 最后都打成一个产物，它们之间加边界只买到命名空间。
- 参考仓库自己撞过「手写规则巡航不到」的坑（它的 `packages/tools` 在 `dist` 里没有 `.js`，depcruise 看不见），后来补了第二道门禁——这是本仓库为什么要往声明式走（见 07）的论据，写进 ADR。

**验证记录：**（待填）

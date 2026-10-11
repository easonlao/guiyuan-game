# 06: 分区——无头推演搬出核心

**Type:** task

**What to build:** 无头推演与命令行入口不再和游戏核心住一起；手机包不可能再被拖进 Node 内建模块。

**Blocked by:** 04（需要一份绿的验收来定义「改之前是绿的」）

**Status:** resolved

- [x] 无头推演与 CLI 入口移出核心目录，成为独立的一块
- [x] 核心的公开出口不再导出无头推演
- [x] 全部引用改完，验收命令全绿
- [x] 加一条依赖边界规则：**小游戏侧不得到达无头推演，也不得到达任何 `node:*`**
- [x] 造一次故意的越界引用 → 规则报红；撤销 → 绿
- [x] 写一条 ADR：分区按什么判据切、为什么切两块

**实现要点：**

- **这不是审美，是活的洞。** `src/core/index.ts:3` 有 `export * from './headless/index.js'`，而 `src/core/headless/` 是**全 `src/` 唯一** import `node:url` / `node:path` 的地方（`HeadlessBenchmark.ts:9-10`、`cli.ts:12-13`）。手机包里没有 Node 内建模块。
- 今天没炸只因为 `src/minigame/*` 全部写深路径引用、绕过 barrel。没有任何规则挡着任何人改回去。
- **只搬运不加规则，等于搬完还能被踩。** 本票的边界规则和搬运同等重要。
- 搬运是机械改动，但爆炸半径不小：23 个测试文件 import 了 `core/headless`。`stryker.config.json` 的 `mutate` 范围、`package.json` 的 `benchmark:*` 脚本、`tsconfig.json` 的 `include` 都要跟着动。
- ADR 的判据要写清：**独立消费者 / 独立运行时**。`logic`/`ai`/`types`/`utils`/`adapters` 最后都打成一个产物，它们之间加边界只买到命名空间。
- 参考仓库自己撞过「手写规则巡航不到」的坑（它的 `packages/tools` 在 `dist` 里没有 `.js`，depcruise 看不见），后来补了第二道门禁——这是本仓库为什么要往声明式走（见 07）的论据，写进 ADR。

## Answer

- **改之前是绿的**（`9dd7982`）：`npm run verify` 通过，39 文件 / 728 用例；`check:deps` 46 modules / 130 dependencies。
- **搬运**：`git mv src/core/headless tools`；`src/core/index.ts` 删掉 `export * from './headless/index.js'`。`tools/*.ts` 对核心的相对引用由 `../types|logic|ai|utils/` 改为 `../src/core/...`（`tools/` 与 `src/` 同级）。
- **引用改动面**：23 个测试文件、`package.json` 的 `benchmark:*` 与 `lint` 目录清单、`tsconfig.json` 的 `include`、`check:deps` 的巡航目标、`docs/DEVELOPMENT.md` / `docs/SRS.md` / `docs/MUTATION-TESTING.md` / `docs/adr/0011` / `docs/headless/*` / `docs/archive/*` 的路径引用。
- **边界规则**（`.dependency-cruiser.js`）两条：`game-side-not-to-local-outside-src`（`^src/` 不得依赖 `src/` 之外的本地模块，`pathNot: '^src/'` + `dependencyTypesNot` 排掉 npm/core）与 `game-side-not-to-node-builtins`（`^src/` → `dependencyTypes: ['core']`）。第二条按类型而非路径匹配，因为 depcruise 会剥掉 `node:` 前缀（`node:fs` 记为 `fs`）。第一条是笼统的那条：无头推演只是被它拦住的最典型一块，`src/ → scripts/ → node:*` 这类经其他本地目录的传递路径也被封住。已知缺口：npm 依赖内部是否用 Node 内建模块，depcruise 因 `doNotFollow` 看不见（已写进 ADR 0013）。
- **红/绿实证**：临时在 `src/` 下加探针（`node:path`、`../tools/HeadlessMatch.js`、`../scripts/lib/mutation-baseline-core.mjs`）→ `check:deps` 退 `3`，两条规则分别报出三条 violation；删除探针 → 退 `0`、`46 modules / 129 dependencies`。
- **`stryker.config.json` 无需改**：`mutate` 只覆盖 `src/core/logic/**`，无头推演**从来不在**变异范围内（`docs/MUTATION-TESTING.md` 明列「暂不纳入 `src/core/headless/**`」）；本票的搬运没有动到被 mutate 的目录，故该配置保持不变。原票「`mutate` 范围要跟着动」的前提不成立。
- **改之后验收全绿**：`npm run verify` 通过，39 文件 / 728 用例，`check:deps` 0 violation。CLI 入口烟测：`npx tsx tools/CandidateValidationCli.ts --help` 正常输出。
- **ADR**：`docs/adr/0013-partition-core-vs-tools.md`。工程方案回写 `docs/HLD.md` §2（新增「开发工具块」）与 §4.2（边界规则改为真源指针）。
- **未改**：`docs/headless/low-state-redirect-experiment.md:384-385` 的旧路径是绑定 git ref `bbce7df` 的历史证据，按「不重写历史」保留。

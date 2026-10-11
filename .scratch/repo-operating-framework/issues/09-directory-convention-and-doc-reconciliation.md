# 09: 目录约定与文档对账

**What to build:** 东西放哪写清楚；文档里说的和实际做的一致。

**Blocked by:** 04（先有验收命令，才能验证「文档说的门禁真的存在」）

**Status:** closed

- [x] 目录约定写进 `AGENTS.md`：实验报告、归档、生成物、脚本各归哪
- [x] `CONTRIBUTING.md` §1 说的「core 引入 `cc`/`window`/`document`」与实际能力对齐（选「真正执行」：新增 `.oxlintrc.json` 的 lint 规则，而非收回）
- [x] `docs/HLD.md` §4.2 说的边界与实际规则对齐（复核 06 的回写，未改）
- [x] 消除 `docs/HLD.md` §4.3 与 `docs/MUTATION-TESTING.md` §2.1 关于变异节奏的矛盾

**实现要点：**

- **三处文档都在说谎，逐条修**：
  - `CONTRIBUTING.md` §1 说 depcruise 拦「core 引入 `cc`/`window`/`document`」。**做不到**——`window`/`document` 是全局量不是 import，depcruise 看不见；`cc` 是 npm 包，被 `doNotFollow` 排掉。要么用 lint 规则（如 `no-restricted-globals`）真正执行，要么把话收回。
  - `docs/HLD.md` §4.2 说拦「UI 视图层反向依赖核心逻辑层」。真正的风险是**反方向**（core → minigame），现有规则不拦。
  - `docs/HLD.md` §4.3 说变异「不介入高频的日常开发循环」；`docs/MUTATION-TESTING.md` §2.1 说 `mutation:changed` 在**每个** implement 收尾跑。**直接矛盾。**
- 修矛盾的原则按 `AGENTS.md`：**修矛盾的一方（删除或改指针），不要两边各留一份**。先判断哪一边是当前意图——从 `docs/MUTATION-TESTING.md` 的完整推导看，§2.1 是后来的落地结论，`docs/HLD.md` §4.3 那句是更早的规划口吻。
- `AGENTS.md` §4.1 的「标准化格式化」那句由 03 处理，本票不重复。
- **§4.2 已由 06 顺手对齐**（06 新增分区规则后回写：真源指针 + 两条规则的实名）。本票该项只需复核，勿重复改；本票剩下的重点是对 §4.3 与 `CONTRIBUTING.md` §1。
- 目录约定不要写成愿望清单。只写**现在成立**的，或者本 spec 的票落地后会成立的。

**验证记录：**

实现：

- **目录约定**：`AGENTS.md` 新增「## 目录约定」表——`src/`（核心，进 `game.js`）、`tools/`（开发工具，跑 Node）、`scripts/`（仓库基建脚本，共享实现 `scripts/lib/`）、`tests/`、`docs/`（含 `docs/adr/` / `docs/agents/`）、实验报告 `docs/headless/`、归档文档 `docs/archive/`、任务 `.scratch/<feature>/`（完成归档 `.scratch/archive/<feature>/`）、交付产物 `minigame/`、工具报告 `reports/`、其他构建输出 `dist/`；「什么不进库」指针指向 `.gitignore`。
- **`CONTRIBUTING.md` §1 对齐**：选「真正执行」而非收回。新增根目录 `.oxlintrc.json`，对 `src/core/**/*.ts` 开 `no-restricted-globals`（拦 `window` / `document`）与 `no-restricted-imports`（拦 `cc`）；§1 改为陈述这条由 `npm run lint` 执行、真源是配置文件，并把 depcruise 的职责精确成「依赖方向」（列三类规则，真源 `.dependency-cruiser.js`）。`docs/HLD.md` §4.1 补 `.oxlintrc.json` 指针。
- **`docs/HLD.md` §4.3 矛盾**：按「修矛盾的一方」，采信 `docs/MUTATION-TESTING.md` §2.1（后来的落地结论）。§4.3 的「定位于发布前…不介入高频的日常开发循环」改为两条路径（`mutation:changed` 在 `implement` 收尾 / `mutation:milestone` 在 spec 收尾与发版前），节奏与门禁口径指向 `docs/MUTATION-TESTING.md`（唯一规则来源）。
- **`docs/HLD.md` §4.2**：复核（06 已对齐）。它列的是真实存在的两条分区规则（`game-side-not-to-local-outside-src` / `game-side-not-to-node-builtins`），未声称拦 `core → minigame`——那条现有规则确实不拦，故无失真，未改。

证据：

| 场景 | 命令 | 结果 |
|---|---|---|
| 基线 | `npm run verify` | 退出 `0`：39 文件 / 728 用例全绿，`check:artifact` 逐字节一致 |
| 探针（`src/core/__probe.ts`：用 `window`/`document` + `import 'cc'`） | `npm run check:quick` | 退出 `1`：`no-restricted-globals` 报 2 条、`no-restricted-imports` 报 1 条 |
| 撤销探针 | `npm run check:quick` | 退出 `0` |
| 反向探针（`src/adapters/__probe.ts`：用 `window` + `import 'cc'`） | `npx oxlint src/adapters` | 退出 `0`（override 只作用于 `src/core/**`，未误伤适配层） |

复核发现见 `reviews/`（Standards / Spec 两轴）。

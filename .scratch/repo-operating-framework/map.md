# Map: 仓库治理骨架 (repo-operating-framework)

## Destination

让一个新来的 agent 不问人就能在这个仓库里开工、收尾、判断做没做完。判据是六层骨架各有落点：词汇 / 任务 / 环境 / 边界 / 验收 / 归置。

详见 [spec.md](spec.md)。

## Notes

- **参照框架，不参照内容。** 参考仓库（model-war）的包拓扑由「独立消费者 / 独立运行时」决定，本仓库只有一条这样的边界，所以切 2 块不切 6 块。
- **验收档和内循环档是两个入口。** 一个含测试和构建的命令没法给 AI 内循环用。
- **物理分区 > 手写规则。** depcruise 是枚举式（先想到才拦得住），包边界是声明式（没声明就解析不到）。
- **不挂定时。** 差分棘轮没有 diff 就产不出新发现。
- 每一条票的验收都必须能由 agent 自己跑出来，不能依赖需求方手工操作。

## Decisions so far

- [01: 版本库边界与任务层规格](issues/01-version-control-boundary.md)：`.scratch/` 入库；`.gitignore` 重写为有理由的边界清单（`.pi/` 只排 `.pi/skills/`，`.agents/` 整目录排除）；三份 codegraph MCP 配置收敛到 `.pi/mcp.json`；五项废弃 web 残骸（`vite.config.js`、`@supabase/supabase-js`、`wrangler.toml`、`public/vite.svg`、`.env.example`）判定为删。已验证 `npm test` 39 文件 / 728 用例全绿。
- [10: `.scratch/archive` 按 feature 目录归位](issues/10-archive-normalization.md)：7 个根下散文件收进 `headless-strategy-evaluation/`、`balance-diagnostics/`、`core-engine/wayfinder/`；archive 根下不再有游离文件。
- [11: 删除 `legacy/`](issues/11-legacy-removal.md)：反转 spec 的 Out of Scope（原写「删不得」）。旧 Web JS 资产无代码引用、联机届时重做，故整体删除并修掉 18 处文档引用；ADR 0003 文末追加勘误。
- [02: 提交纪律](issues/02-commit-discipline.md)：`.githooks/commit-msg` 拦 `Co-Authored-By`，默认剥离放行、`COMMIT_MSG_MODE=fail` 判红；`prepare` 与 `npm run setup:hooks` 两道安装。
- [03: 环境固化](issues/03-environment-pinning.md)：`engines` + `packageManager` 声明 Node/npm 版本（`.npmrc(engine-strict)` 强制 Node，npm 版本仅声明）；装 oxfmt 并全仓格式化，`npm run fmt:check` 当门禁（格式化会把 Stryker `next-line` 目标行拆行，11 处用 `// oxfmt-ignore` 钉住，并刷新 `mutation-baseline.jsonl` 行号）；删 `scripts/run-tests.mjs`（`/tmp` 符号链接机制随之删除），`npm test` = `vitest run` 直读 `vitest.config.ts`。
- [04: 验收命令分档](issues/04-verify-command-tiers.md)：验收入口收敛为两条命名脚本——`check:quick`（快速检查，实测 1.1s，不含测试与构建）与 `verify`（验收，实测 12s）；构成以 `package.json` 为真源。`lint` 目录清单补上 `src/minigame`、`scripts`；删重复别名 `check:lint` / `oxlint` / `stryker`。产物对账留位给 08，追加为 `verify` 第四段。
- [05: CI 快链与手动里程碑](issues/05-ci-pipelines.md)：`.github/workflows/fast.yml`（PR + push main 自动跑 `npm run verify`，`mutation:changed` 当观察项只落盘）；`.github/workflows/mutation-milestone.yml`（只有 `workflow_dispatch`，跑 `mutation:milestone`）。新增命名脚本 `mutation:milestone` = `mutation` + `mutation:check`；触发者写进 `AGENTS.md`；ADR 0012 记「不挂定时的理由是差分棘轮没有 diff」。工程方案回写 `docs/HLD.md` §4.5。
- [06: 分区——无头推演搬出核心](issues/06-partition-core-vs-tools.md)：`src/core/headless/` 整块搬到顶层 `tools/`（判据：独立运行时——`tools/` 跑 Node，`src/` 进 `game.js`）；`src/core/index.ts` 不再导出无头推演；新增两条 depcruise 规则 `game-side-not-to-local-outside-src` 与 `game-side-not-to-node-builtins`（后者按 `dependencyTypes: ['core']` 匹配，因 depcruise 会剥 `node:` 前缀）；23 个测试文件与各配置/文档引用改完，`npm run verify` 全绿（39 文件 / 728 用例）。`stryker.config.json` 的 `mutate` 无需改（无头推演本就不在变异范围）。ADR 0013 记判据与为什么切两块；工程方案回写 `docs/HLD.md` §2 与 §4.2。

## Tickets & Frontier

- [x] [Spec](spec.md): 定下六层骨架、9 条票的切法与 8 条决定。
- [x] [01: 版本库边界与任务层规格](issues/01-version-control-boundary.md)
- [x] [02: 提交纪律](issues/02-commit-discipline.md)
- [x] [03: 环境固化](issues/03-environment-pinning.md)
- [x] [04: 验收命令分档](issues/04-verify-command-tiers.md)
- [x] [05: CI 快链与手动里程碑](issues/05-ci-pipelines.md) (Blocked by: 04)
- [x] [06: 分区——无头推演搬出核心](issues/06-partition-core-vs-tools.md) (Blocked by: 04)
- [ ] [07: 包边界——没声明就不能用](issues/07-package-boundary.md) `[FRONTIER]` (Blocked by: 06)
- [ ] [08: 产物边界](issues/08-artifact-boundary.md) (Blocked by: 05)
- [ ] [09: 目录约定与文档对账](issues/09-directory-convention-and-doc-reconciliation.md) (Blocked by: 04)
- [x] [10: `.scratch/archive` 按 feature 目录归位](issues/10-archive-normalization.md)
- [x] [11: 删除 `legacy/`](issues/11-legacy-removal.md)

## 依赖图

```
01 ─┐
02 ─┼─→ (独立)
03 ─→ 04 ─┬─→ 05 ─→ 08
          ├─→ 06 ─→ 07
          └─→ 09
```

## Out of scope

- 改写 git 历史剥掉 70 条 `Co-Authored-By`（破坏性，单独决定）
- 切 `src/minigame` 第三块
- monorepo 的完整形态（项目引用 / `tsc -b` / 六包拓扑）
- 游戏规则与数值

## 注意

本 spec 与它的票在 01 落地前**不进版本库**（`.scratch/` 当前被忽略）。这是已知状态，不是缺陷——01 落地时它们随之入库。

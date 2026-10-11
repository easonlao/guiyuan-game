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
- [07: 包边界——没声明就不能用](issues/07-package-boundary.md)：`src/` 与 `tools/` 各成包（`@guiyuan/game` / `@guiyuan/devtools`），根 `package.json` 的 `workspaces` 连起来；`tsconfig.json` 改 `nodenext` 以真正读 `exports` 并强制相对导入带扩展名；`src/minigame` 的 13 处无后缀相对导入补 `.js`，`tools/` 的 46 处 `../src/...` 改走 `@guiyuan/game/...`。**关键发现**：npm 默认 hoisted 布局下未声明的跨区 import 仍能解析，改用 `.npmrc` 的 `install-strategy=linked`（pnpm 式）才成立；`linked` 带来的 Stryker 适配（`appendPlugins` + 沙箱内 `resolve.alias`）与包边界自检门禁 `check:boundary` 见 `docs/MUTATION-TESTING.md` §9。`npm run verify` 全绿（39 文件 / 728 用例），`stryker --dryRunOnly` 退 0。
- [08: 产物边界](issues/08-artifact-boundary.md)：`minigame/game.js` 入库（理由只有一条：`docs/DEVELOPMENT.md` 让人直接导入 `minigame/` 目录，省一次构建命令；**不借**参考仓库第三方契约的类比）；新增 `npm run check:artifact`（与 `build:minigame` 共用同一次构建调用，逐字节比对现打产物 == 入库产物，落点判定写死不得在任何 `dist/` 下），串进 `npm run verify` 作第四段；产物 `minify: false` 以保持 diff 可读。ADR 0014 记理由与「为什么不借那个类比」，工程方案回写 `docs/HLD.md` §4.4。入库产物已重建（此前停在旧源码），`npm run verify` 全绿（39 文件 / 728 用例）。
- [09: 目录约定与文档对账](issues/09-directory-convention-and-doc-reconciliation.md)：`AGENTS.md` 新增「目录约定」表（实验报告 `docs/headless/`、归档 `docs/archive/` + `.scratch/archive/`、生成物 `minigame/` + `reports/`、脚本 `scripts/` + `tools/` 各归哪）；`CONTRIBUTING.md` §1 的 `cc`/`window`/`document` 承诺改为**真正执行**——新增 `.oxlintrc.json` 对 `src/core/**` 开 `no-restricted-globals` / `no-restricted-imports`（探针实测红、撤销绿，不误伤 `src/adapters`），depcruise 的职责精确成「依赖方向」；`docs/HLD.md` §4.3 的变异节奏改为与 `docs/MUTATION-TESTING.md` §2.1 一致（两条路径），§4.2 复核确认无失真。`npm run verify` 全绿。

## Tickets & Frontier

- [x] [Spec](spec.md): 定下六层骨架、11 条票的切法与 8 条决定。
- [x] [01: 版本库边界与任务层规格](issues/01-version-control-boundary.md)
- [x] [02: 提交纪律](issues/02-commit-discipline.md)
- [x] [03: 环境固化](issues/03-environment-pinning.md)
- [x] [04: 验收命令分档](issues/04-verify-command-tiers.md)
- [x] [05: CI 快链与手动里程碑](issues/05-ci-pipelines.md) (Blocked by: 04)
- [x] [06: 分区——无头推演搬出核心](issues/06-partition-core-vs-tools.md) (Blocked by: 04)
- [x] [07: 包边界——没声明就不能用](issues/07-package-boundary.md) (Blocked by: 06)
- [x] [08: 产物边界](issues/08-artifact-boundary.md) (Blocked by: 05)
- [x] [09: 目录约定与文档对账](issues/09-directory-convention-and-doc-reconciliation.md) (Blocked by: 04)
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

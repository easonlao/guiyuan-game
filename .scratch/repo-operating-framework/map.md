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

## Tickets & Frontier

- [x] [Spec](spec.md): 定下六层骨架、9 条票的切法与 8 条决定。
- [x] [01: 版本库边界与任务层规格](issues/01-version-control-boundary.md)
- [ ] [02: 提交纪律](issues/02-commit-discipline.md) `[FRONTIER]`
- [ ] [03: 环境固化](issues/03-environment-pinning.md) `[FRONTIER]`
- [ ] [04: 验收命令分档](issues/04-verify-command-tiers.md) (Blocked by: 03)
- [ ] [05: CI 快链与手动里程碑](issues/05-ci-pipelines.md) (Blocked by: 04)
- [ ] [06: 分区——无头推演搬出核心](issues/06-partition-core-vs-tools.md) (Blocked by: 04)
- [ ] [07: 包边界——没声明就不能用](issues/07-package-boundary.md) (Blocked by: 06)
- [ ] [08: 产物边界](issues/08-artifact-boundary.md) (Blocked by: 05)
- [ ] [09: 目录约定与文档对账](issues/09-directory-convention-and-doc-reconciliation.md) (Blocked by: 04)

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
- `legacy/` 的处置

## 注意

本 spec 与它的票在 01 落地前**不进版本库**（`.scratch/` 当前被忽略）。这是已知状态，不是缺陷——01 落地时它们随之入库。

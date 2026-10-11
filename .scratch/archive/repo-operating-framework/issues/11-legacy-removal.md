# 11: 删除 `legacy/`

**Type:** task

**What to build:** 把 `legacy/`（132 文件 / 27470 行旧 Web JS）整体删除，并修掉所有指向它的文档引用。联机规划改为届时重做，不保留旧协议代码。

**Blocked by:** None (can start immediately)

**Status:** resolved

**验收清单：**

- [x] `legacy/` 不在版本库，工作区也不存在。证据：`git ls-files legacy` 为空；`test -d legacy` 失败。
- [x] `docs/` 下无指向 `legacy/` 的活引用。证据：剩余提及全部带「已删除」说明；`grep -rn '](.*legacy' docs/` 无命中。
- [x] `tsconfig.json` 与 `stryker.config.json` 不再为 `legacy` 留排除项。证据：`grep -rn legacy tsconfig.json stryker.config.json package.json` 无命中。
- [x] spec / map 的 Out of Scope 同步。证据：spec 删掉「删不得」那条；map 去掉 `legacy/` 的处置，Decisions so far 记入本票。
- [x] `npm test` / `typecheck` / `check:deps` / `lint` 全绿。证据：39 文件 / 728 用例；deps 46 模块 / 130 依赖零违规。

**已核实的事实：**

- `legacy/` 132 文件 / 27470 行；`src` / `tests` / `scripts` 无任何引用（`grep -rn legacy src tests scripts` 只命中测试里一个叫 `legacyUnlitSideSuppression` 的局部变量名）。
- 文档引用共 18 处：`docs/SRS.md`（5）、`docs/FSR.md`（2）、`docs/adr/0003-*.md`（1，正文）、`docs/adr/0002-*.md`（1，勘误节）、`docs/headless/guardrail-provenance.md`（2）、`docs/archive/`（7 个 banner）。
- 需求方判定：联机届时会重做，旧协议代码无参考价值，不提取。

**实现要点：**

- 本票反转了 spec 的 Out of Scope（原文写「删不得」）。反转记录写进 spec / map 与本票。
- ADR 是追加式的：`0003` 正文不动，文末追加勘误；`0002` 已有勘误节，就地更新路径状态。
- `docs/archive/` 的 7 处 banner 是同一行，统一加「该目录已于 2026-10 删除」。
- `.scratch/archive/` 里的历史票提到 `legacy` 的地方**不改**——归档件不重写。

## Answer

- `legacy/` 已删：`git ls-files legacy` 为空，工作区无该目录。
- `docs/` 无活引用：`grep -rn legacy docs/` 剩下的全是带「已删除」说明的历史记录；ADR 0003 正文那句保留（ADR 是追加式，不动正文），删除事实写在文末勘误。
- 配置：`tsconfig.json` / `stryker.config.json` / `package.json` 里 `grep legacy` 无命中。
- 全绿：`npm run typecheck`、`npm run check:deps`（46 模块 / 130 依赖零违规）、`npm test`（39 文件 / 728 用例）、`npm run lint`。
- 反转记录：spec 的 Out of Scope 删掉「删不得」那条；map 的 Out of scope 去掉 `legacy/` 的处置，Decisions so far 记入本票；ADR 0003 文末追加勘误；ADR 0002 勘误节更新路径状态。

**复核后补充（code-review 两轴，固定点 `5db0a2e`）：**

- `docs/FSR.md` 的「可基于其设计重建网络适配层」里「其」已无指代物 → 改为「重建网络适配层」。
- `docs/SRS.md` FR-5.1–5.3 括号里列了 `RoomManager` 等模块名，但删 legacy 后这些符号全仓无出处；且按 `AGENTS.md` 的归属表，模块名归 HLD、SRS 只写需求 → 去掉括号里的模块名。
- `docs/adr/0002` 勘误节里「（该目录不入版本库）」已失真（`.scratch/` 自票 01 起入库）→ 删掉该括号。
- 票 01 的「复核后补充」里有三句关于 `legacy/` 的描述被本票推翻，已在票 01 文末追加 `## Comments` 说明。
- `.scratch/archive/` 的处置政策（链接可修、结论不重写）未写进 `docs/agents/issue-tracker.md`；本票只记录实际做法，政策留 09 定。

# 11: 删除 `legacy/`

**What to build:** 把 `legacy/`（132 文件 / 27470 行旧 Web JS）整体删除，并修掉所有指向它的文档引用。联机规划改为届时重做，不保留旧协议代码。

**Blocked by:** None (can start immediately)

**Status:** closed

**验收清单：**

- [ ] `legacy/` 不在版本库，工作区也不存在
- [ ] `docs/` 下无指向 `legacy/` 的活引用
- [ ] `tsconfig.json` 与 `stryker.config.json` 不再为 `legacy` 留排除项
- [ ] spec / map 的 Out of Scope 同步
- [ ] `npm test` / `typecheck` / `check:deps` / `lint` 全绿

**已核实的事实：**

- `legacy/` 132 文件 / 27470 行；`src` / `tests` / `scripts` 无任何引用（`grep -rn legacy src tests scripts` 只命中测试里一个叫 `legacyUnlitSideSuppression` 的局部变量名）。
- 文档引用共 18 处：`docs/SRS.md`（5）、`docs/FSR.md`（2）、`docs/adr/0003-*.md`（1，正文）、`docs/adr/0002-*.md`（1，勘误节）、`docs/headless/guardrail-provenance.md`（2）、`docs/archive/`（7 个 banner）。
- 需求方判定：联机届时会重做，旧协议代码无参考价值，不提取。

**实现要点：**

- 本票反转了 spec 的 Out of Scope（原文写「删不得」）。反转记录写进 spec / map 与本票。
- ADR 是追加式的：`0003` 正文不动，文末追加勘误；`0002` 已有勘误节，就地更新路径状态。
- `docs/archive/` 的 7 处 banner 是同一行，统一加「该目录已于 2026-10 删除」。
- `.scratch/archive/` 里的历史票提到 `legacy` 的地方**不改**——归档件不重写。

**验证记录：**

- `legacy/` 已删：`git ls-files legacy` 为空，工作区无该目录。
- `docs/` 无活引用：`grep -rn legacy docs/` 剩下的全是带「已删除」说明的历史记录；ADR 0003 正文那句保留（ADR 是追加式，不动正文），删除事实写在文末勘误。
- 配置：`tsconfig.json` / `stryker.config.json` / `package.json` 里 `grep legacy` 无命中。
- 全绿：`npm run typecheck`、`npm run check:deps`（46 模块 / 130 依赖零违规）、`npm test`（39 文件 / 728 用例）、`npm run lint`。
- 反转记录：spec 的 Out of Scope 删掉「删不得」那条；map 的 Out of scope 去掉 `legacy/` 的处置，Decisions so far 记入本票；ADR 0003 文末追加勘误；ADR 0002 勘误节更新路径状态。

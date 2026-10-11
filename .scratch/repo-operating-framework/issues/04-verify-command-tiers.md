# 04: 验收命令分档

**What to build:** AI 内循环有一条秒级命令，收尾有一条完整命令。两条都只由命名脚本组成，跑一条就知道自己算不算做完了。

**Blocked by:** 03（formatter 要先存在，快档才能含格式化检查）

**Status:** closed

- [x] **快档**：格式化检查 + lint + 依赖边界检查。不含测试、不含构建，秒级返回
- [x] **全量档**：快档 + 类型检查 + 测试 + 产物对账（对账由 08 落地，本票留位）
- [x] `lint` 覆盖 `src/minigame` 与 `scripts`（现在漏了这两个）
- [x] 重复别名清掉：`lint`/`check:lint`/`oxlint` 留一个；`mutation`/`stryker` 留一个
- [x] 两档都**不含**变异测试（33 分钟的事，单独一条命令，见 05）
- [x] 故意改坏一处 → 快档红；撤销 → 绿

**实现要点：**

- 为什么要分档：一个含测试和构建的命令没法给 AI 内循环用。参考仓库是 `check:quick`（秒级）/ `verify:fast`（quick + 测试）/ `check`（全量）三级。本仓库的验收档含产物对账（要跑 vite 构建），所以它必然是慢档。
- 顺序按「快到慢」排，前面挂了就不跑后面。
- 全量档里的「产物对账」由 08 落地；本票先留位，落地前该项可以暂时缺席，但**不能**把构建本身塞进快档。
- 命名要让不懂开发的人一眼看懂：快档叫「快速检查」这类意思，全量档叫「验收」这类意思，不要用内部缩写。
- `lint` 的覆盖范围要写成明确的目录清单（例如 `src/core src/adapters tests/core`），不要用会把无关目录顺手扫进来的写法。

**验证记录：**

实现：

- `package.json` 新增两条命名脚本：
  - `check:quick`（快速检查）= `fmt:check` → `lint` → `check:deps`，实测 **1.1s**（`time` 单次：real 1.079s）。
  - `verify`（验收）= `check:quick` → `typecheck` → `test`，实测 **12s**（real 11.938s，其中 Vitest 7.04s）。
  - 顺序按「快到慢」，`&&` 串联，前一条挂了不跑后一条。两档都不含变异测试。
- `lint` 覆盖范围改为明确的目录清单 `src/core src/adapters src/minigame tests/core scripts`（补上此前漏掉的 `src/minigame`、`scripts`；`tests/` 下只有 `tests/core`）。
- 重复别名删除：`check:lint`、`oxlint` 删（留 `lint`）；`stryker` 删（留 `mutation`）。删后 `npm run oxlint` / `npm run check:lint` / `npm run stryker` 均退出 `1`（未知脚本）。
- **产物对账留位**：本票只落 `check:quick + typecheck + test` 三段；08 落地对账后追加为 `verify` 的第四段（已写进 `docs/HLD.md` §4.4）。
- 文档同步：`CONTRIBUTING.md` §5 的两步改为两条分档命令；`docs/HLD.md` 新增 §4.4「验收命令分档」并让 §4.1 指向它（**命令清单以 `package.json` 为真源，文档不复制**，遵循参考仓库 `docs/hld.md` 的做法）；`AGENTS.md` 加「验收命令」指针；`docs/adr/0003` 文末追加勘误（`npm run oxlint` 已并入 `npm run lint`，不改历史结论）。

门禁证据（故意改坏 → 红 → 撤销 → 绿）：

| 场景 | 改动 | 结果 |
|---|---|---|
| 基线 | 无 | `npm run check:quick` 退出 `0` |
| 格式化 | 往 `src/minigame/main.ts` 追加未格式化行 | `npm run check:quick` 退出 `1`，`fmt:check` 报 `src/minigame/main.ts` |
| 依赖边界 | 往 `src/core/index.ts` 追加 `import '../adapters/WechatStorageAdapter.js'` | `npm run check:quick` 退出 `1`，报 `core-not-to-adapters: src/core/index.ts → src/adapters/WechatStorageAdapter.ts` |
| 撤销 | 两个探针均恢复 | `npm run check:quick` 退出 `0` |

`lint` 覆盖新目录的证据（单独跑，不走 `check:quick`）：

| 改动 | 命令 | 结果 |
|---|---|---|
| 往 `scripts/__lint_probe.mjs` 写语法错误 | `npx oxlint scripts` | 退出 `1`，`scripts/__lint_probe.mjs:1:16: error: Unexpected token` |
| 往 `src/minigame/__lint_probe.ts` 写语法错误 | `npx oxlint src/minigame` | 退出 `1`，`src/minigame/__lint_probe.ts:1:16: error: Unexpected token` |
| 撤销两个探针 | `npm run lint` | 退出 `0` |

> 为何单独跑：`check:quick` 里 `fmt:check` 排在 `lint` 前，而语法错误同时是格式错误，所以「往新目录放语法错误」会让 `check:quick` 停在 `fmt:check`（退出 `2`），证不了 `lint` 覆盖。复核时初版记录把这一条错记成 `lint` 的证据，已改。

全量档证据：`npm run verify` 退出 `0`——`fmt:check` 91 文件、`lint` 干净、`check:deps` 46 modules / 130 dependencies、`typecheck` 干净、`npm test` 39 文件 / 728 用例全绿。

未做（有意）：

- 未加 `oxlint --deny-warnings`。oxlint 默认把规则报为 warning 且 warning 不改变退出码，所以「未使用的变量」这类问题只报不红；`CONTRIBUTING.md` §2.2 的口径也是「必须无 Error」而非无警告。要收紧是另一条决定，不在本票。
- 未改 `check:deps` 的覆盖（仍只巡航 `src`），本票只补 lint 的目录清单。

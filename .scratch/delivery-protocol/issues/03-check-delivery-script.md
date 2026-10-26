# 03: check-delivery 断言脚本

**Type:** task
**Blocked by:** 02
**Status:** resolved
**Slice:** S2

**What to build:** `scripts/check-delivery.mjs` + 命名脚本 `npm run check:delivery`。把交付策略里那几条「靠自觉」的约束变成断言。

**为什么：** spec 决定 2 的结论。本仓库两次先例都是「规则写在文档里没拦不住，加脚本才拦住」：worktree 落点（`scripts/check-worktrees.mjs`）、`.gitignore` 遮罩（同一脚本里的两条探针）。

**四条断言：**

1. **main 线性**：`git rev-list --merges <base>..<tip>` 输出为空。`<base>` 默认 `origin/main`，可用参数覆盖。
2. **快照一致**：`git diff --quiet <snapshot-commit> <delivery-tip>` 退出 0（比较整棵树，不是单个文件）。
3. **无新增孤儿提交**：`git fsck --unreachable --no-reflogs` 报出的 `unreachable commit` 条数 == 脚本内记录的基线。基线来历写进注释（2026-10-24 实测 42 个），语义同 `mutation-baseline.jsonl` 的棘轮：只对新增报红。
4. **worktree 清账**：`git worktree list` 只剩主 checkout。落点由 `check-worktrees.mjs` 管，本条只管「还剩几个」。

**接线（不要接错地方）：**

- 新增 `check:delivery`，**不进** `check:quick`：后者每轮编辑都跑，交付断言在编辑循环里必然红。
- **不进** `verify`：`verify` 的语义是「每个提交都得绿」，交付断言只在交付那一刻成立。混淆两者会让每个提交都跑不过。
- 文档里写明它由谁在什么时候跑（agent 在整理阶段跑），并给一条 `--` 直通参数用于 CI 之外的本地复核。

## Answer

已落地（2026-10-25）：`scripts/check-delivery.mjs` + `npm run check:delivery`。

**四条断言与实测（生产跑与破坏跑都做了）：**

| 断言 | 正例 | 破坏例 | 结果 |
|---|---|---|---|
| ① main 线性 | `origin/main..HEAD`（空区间）通过 | `--base origin/main --tip archive/pre-linear-2026-10-24` → 报 **40 个 merge** 并列出前 5 个 | 两端均符合预期 |
| ② 快照一致 | `--snapshot v2.0 --tip HEAD`（同树 `acd16be`）通过 | `--snapshot 'archive/pre-linear-2026-10-24~100'` → 报树不同 + `git diff --stat` | 两端均符合预期 |
| ③ 无新增孤儿 | 默认基线 479 通过 | `--unreachable-baseline 0` → 报「479 个，新增 479」并列出最近 8 个 | 两端均符合预期 |
| ④ worktree 清账 | 默认期望 1，实际 1，通过 | `--worktrees 2` → 报「有 1 个，期望 2」并列出路径 | 两端均符合预期 |

**两个参数化设计（否则无法在不动用仓库的前提下测）：**

- `--snapshot <rev>` 不传时断言② 报「跳过」而不是判红。快照比较只在交付整理时有对象；平时跑也红的话这条脚本就没人跑了。
- `--worktrees <n>` 声明期望值。收尾要求只剩主 checkout（默认 1），整理期间用参数声明。
- `--unreachable-baseline <n>` 是重钉路径，语义同 `mutation:baseline`。默认值 479 写在常量里，注释写明来历与「这是垃圾基线，不是允许 479 个孤儿」。

**接线核实：**

- `check:delivery` **不在** `check:quick`，也**不在** `verify`：前者每轮编辑都跑，后者要求每个提交都绿；交付断言只在整理那一刻成立。理由写进了脚本头注与 `CONTRIBUTING.md` §6.6。
- `package.json` 只新增一条脚本，未重命名已有脚本。
- `lint` 覆盖 `scripts/`，新脚本过了 oxlint 与 oxfmt（首次跑 `fmt:check` 报了一处格式问题，已 `oxfmt --write` 修）。
- `npm run verify` 全绿。

**与 `check-worktrees.mjs` 的分工：** 那条管「worktree 建在哪」，这条管「还剩几个」。两条不改，一条一个职责。

**遗留：**

- 断言③ 的基线是一个随时会被 `git gc` 改大的数（当前 479 里大多是线性化重写的垃圾）。`gc` 后它会下降，脚本不报红；但如果先 `gc` 再出现新的孤儿，比对会变敏感。这是可接受的。
- 切片依赖无环（票 04）仍无脚本。

**实现要点：**

- 断言 1 的 `<base>` 不能写死 `origin/main`：交付分支是从某个 main 提交长出来的，比对点是那个提交。默认值 + 参数覆盖。
- 断言 3 会踩到仓库现状：`git fsck --unreachable` 现在就有 42 个不可达 commit（含一份 3847 行的前端工作 `ccc3886`，见 doc-dedup 施工图）。所以是**棘轮**不是**清零**。清零是另一个决定。
- 输出给人看，别只给退出码：照 `check-worktrees.mjs` 的写法，每条失败给「违反了什么 + 怎么修」。

**参考：**

- `scripts/check-worktrees.mjs`：断言写法、失败输出风格、`--no-index` 探针技巧。
- `scripts/mutation-check.mjs` 与 `mutation-baseline.jsonl`：棘轮语义（只对基线之外的新增报红）。
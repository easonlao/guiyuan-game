# 03: check-delivery 断言脚本

**Type:** task
**Blocked by:** 02
**Status:** needs-triage

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

**验收清单：**

- [ ] 四条断言各有：正常样例通过、人为破坏后判红、错误信息指出违反了哪一条（照 `check-worktrees.mjs` 的失败输出风格）
- [ ] 退出码语义与仓库其他脚本一致：通过 0，判红 1
- [ ] 断言 2 的比较对象是**提交**而不是文件列表（避免「文件列表一样但内容不同」）
- [ ] 断言 3 的基线数字写进注释并说明来历与日期
- [ ] `npm run check:delivery` 在当前 `main` 上退出 0（现状只有 5 个历史 merge commit，不在 `base..tip` 区间内）
- [ ] `package.json` 脚本名只加一条，不重命名已有脚本
- [ ] 文档接线：02 落的规则正文里把「由 `scripts/check-delivery.mjs` 执行」写准

**实现要点：**

- 断言 1 的 `<base>` 不能写死 `origin/main`：交付分支是从某个 main 提交长出来的，比对点是那个提交。默认值 + 参数覆盖。
- 断言 3 会踩到仓库现状：`git fsck --unreachable` 现在就有 42 个不可达 commit（含一份 3847 行的前端工作 `ccc3886`，见 doc-dedup 施工图）。所以是**棘轮**不是**清零**。清零是另一个决定。
- 输出给人看，别只给退出码：照 `check-worktrees.mjs` 的写法，每条失败给「违反了什么 + 怎么修」。

**参考：**

- `scripts/check-worktrees.mjs`：断言写法、失败输出风格、`--no-index` 探针技巧。
- `scripts/mutation-check.mjs` 与 `mutation-baseline.jsonl`：棘轮语义（只对基线之外的新增报红）。
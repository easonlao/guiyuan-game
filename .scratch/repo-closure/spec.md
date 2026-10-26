# Spec: 补上交付闭环的三个缺口 (repo-closure)

## Problem Statement

2026-10-25 对整套环境的对齐里，「需求 → 修改 → 验证 → 提交」这条链有三处没有机制：

| 缺口 | 现状 |
|---|---|
| 验证 → 提交 | 没有 `pre-commit`（有意不加），CI 只在 push 之后跑。verify 跑没跑靠 agent 记得 |
| 需求 → 动手 | `.scratch/` 有票、有状态、有依赖图，`check:slices` 只验图合法，不报「现在能做哪张」 |
| 回退 | §6.1 定义了回退单位是切片，没写怎么回退 |

另有一处违反「一个事实一个家」：`docs/HLD.md` §4.4 复述了 `check-worktrees.mjs` 与
`check-minigame-artifact.mjs` 头注里的实现细节。

## 决定

1. **验证与提交用一条命令绑定，不加 hook。** `npm run ship` = 跑 verify，绿了才 push。
   理由：hook 只拦 `git commit`，拦不住 `git push`，而 agent 的收尾动作正是 push。
2. **frontier 由 `check:slices` 输出。** 规则已在 `docs/agents/issue-tracker.md`，只是没人读；
   把它变成每次跑快链都能看到的一行。
3. **回退用 `git revert`，不用 `reset`。** main 历史不改写是 §6 的立身之本。
4. **HLD 只留「有什么门禁、为什么」，实现细节归脚本头注。**

## 票据

三份并行作业，各在自己的 worktree 里做，写入范围互不重叠：

| 票 | 内容 | 改的文件 | 切片 |
|---|---|---|---|
| 01 | `npm run ship` | `scripts/ship.mjs`、`package.json` | S1 |
| 02 | frontier 输出 | `scripts/check-slices.mjs` | S2 |
| 03 | 回退流程 + HLD 去复述 | `CONTRIBUTING.md`、`docs/HLD.md` | S3 |

切片依赖：S1 / S2 / S3 各自独立，文件不重叠。无环。

## Out of Scope

- 给 `git push` 加钩子（`pre-push` 同样会被 `--no-verify` 绕过，且慢动作加在每个 push 上）。
- 让 frontier 自动改票面状态（读与写分开，改状态要人确认）。

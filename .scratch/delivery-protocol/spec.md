# Spec: 分支与交付策略 (delivery-protocol)

## Problem Statement

`main` 上已经有 5 个 merge commit（`a54990b`、`eca971d`、`bea84ff`、`317c97a`、`1c27a96`），但仓库里没有一处文档说该不该有。上一轮讨论达成的核心不变量——**main 只接收验证过的线性提交**——只存在于对话里。

后果不是「不整洁」，是三个具体问题：

1. **回退单位与验证单位对不上**：想回退一次改动，得先猜它落在哪个 commit 里。
2. **门禁没有落点**：`npm run verify` 在 push 到 main **之后**才跑，红了只能靠下一次提交修。
3. **约定不可执行**：谁都能凭习惯决定怎么合，而本仓库已经两次证明「没有脚本断言的规则会失效」。

需求方给的目标（2026-10-24 原话，摘）：

> ticket 按 agent 能稳定完成的范围拆分……main 只接收验证后的线性提交。
> 交付切片是在已声明的前置切片基础上，可以完整验证、可以作为一个单位回退的最小行为变更。
> 用 `git rebase --exec` 覆盖 main 基点之后的每个交付提交，包括最后一个。
> 整理阶段不新增测试。

### 现状（2026-10-24 实测）

- `main`：416 个提交，first-parent 319 个，其中 merge commit 5 个。
- 无分支保护（`gh api repos/:owner/:repo/branches/main/protection` → 404 `Branch not protected`）；仓库历史上零 PR（`gh pr list --state all` 为空）。
- CI 只有 `.github/workflows/fast.yml`，触发条件是 `pull_request` 与 `push: [main]`；`verify` 一次耗时 32–49 秒，所以**逐提交验证的成本可承受**。
- worktree 落点已有脚本断言：`scripts/check-worktrees.mjs`（`check:quick` 第一段）。
- 执行图约定已存在：`.scratch/<effort>/map.md` + `issues/NN-<slug>.md`，字段 `Type:` / `Status:` / `Blocked by:`（`docs/agents/issue-tracker.md`）。
- 构建产物 `minigame/game.js` 入库（ADR 0014），`verify` 末段 `check:artifact` 逐字节对账，产物 6080 行。
- 历史先例：`burst-plus-two` 已经用过「spec 分支 + ticket 分支 + `--no-ff` 合并」，main 上那 5 个 merge commit 就是它的产物。

## 决定

1. **目标不变量：main 只接收验证过的线性提交。** 不用 `--no-ff` 保留合并结构。
2. **不变量必须由脚本断言，不写成纯文档规则。** 依据是本仓库两次先例：worktree 被建到仓库外、`.gitignore` 反选静默失效——两次的修法都是加断言，不是加文字。
3. **必须定义快速通道。** 没有它，为一条文档措辞走完整流程不成立，流程会被绕过，然后变成一段没人遵守的文档。
4. **名词用本仓库的**：`npm run check:quick`（内循环）、`npm run verify`（收尾）、`npm run mutation:milestone`（spec 收尾的全量 + 棘轮）。本仓库没有 `ruff`，也没有 Python 工具链。
5. **执行图沿用 `.scratch` 既有约定**，只新增 `Slice:` 字段，不新造文件格式。
6. **交付切片 = 可完整验证、可整体回退的最小行为变更**，默认对应 main 上一个交付提交；切片依赖不得成环。
   **票与切片不是同一层**：一票可以拆成 N 个票内本地提交，squash 后成为 spec 上 **1 个带票号的提交**；该提交**不进 main**。只有切片完成时才按依赖顺序归组成 **1 个交付提交**进 main。所以交付提交的颗粒度 **大于** 票：一票单独能验证时才是 1:1，多票一片时 main 上只有 1 个提交。
   拆细票是为了让 agent 在聪明区工作；把交付提交做粗是为了让回退单位清楚。两者服务不同目的，不冲突。
7. **逐提交验证用 `git rebase --exec`**，覆盖基点之后每个提交，包括最后一个。
8. **整理阶段不新增测试**；快照 commit 与交付分支的最终文件树必须逐字节相等。
9. **squash 后的提交 body 写四要素**（D1）：**切片名 + 该片全部票号 + 该片的关键取舍（含被否决的做法及原因）+ 验证命令**。理由：`.scratch/` 里的票面会被清理，body 是唯一跟着代码走的地方。
    **squash 发生在「票 → spec」这一步，不是「spec → main」**。切片归组在 squash 之后做；先把所有票 squash 完，才能按切片依赖顺序归组成交付提交。
10. **快速通道的判据（D2）**：同时满足三条直推 main，仍跑 `npm run verify`——
    ① 改动路径全部落在白名单：`docs/`、`.scratch/`、根目录 `*.md`；
    ② 不动依赖（`package.json` / `package-lock.json`）；
    ③ 改动文件 ≤ 3 个。
    白名单**明确排除** `scripts/`、`.github/`、`tests/`、`src/`——这四处改错会静默降低门禁强度。判据是机器可判的（路径前缀 + 文件数），不是「小改动」。
11. **产物与切片重排（D3）**：每重排一个交付提交，解冲突后依次 `npm run build:minigame` → `git commit --amend` → `npm run verify`。产物始终与源码同提交，保住「每个交付提交自己就能过 verify」——这是 `rebase --exec` 的前提。
12. **回退与 bisect 的精度 = 切片**（2026-10-25 已确认接受）。回退一片会连带撤掉该片全部票；`git bisect` 定位到片后需在片内自行缩小范围。若将来不能接受，唯一改法是让交付提交 = 票（颗粒度回到 1:1），代价是 main 上提交数变多、回退单位变碎。

## Out of Scope

- 改写历史去掉那 5 个 merge commit（破坏性操作，历史结论由 ADR 与 git 承载）。
- 引入 PR 流程与分支保护（单人 + agent，多一层往返换不来等价收益）。
- 把 `mutation:milestone` 加回 CI（ADR 0012 已否决）。

## 票据

| 票 | 内容 | Blocked by | 切片 | 状态 |
|---|---|---|---|---|
| 01 | 拍三条开放项 | — | 决策票，不产出交付提交 | resolved |
| 02 | 规则正文落 `CONTRIBUTING.md`，`AGENTS.md` 只留指针 | — | S1 | 可开工 |
| 03 | `scripts/check-delivery.mjs` + 接进命名脚本 | 02 | S2 | 等 02 |
| 04 | 执行图 `Slice:` 字段 + 切片依赖循环检测 | — | S3 | 可开工 |

切片依赖：S1 → S2 → S3（S2 的对账点依赖 S1 的规则文本；S3 的字段语义已在决定 5–6 定下，不再等 01）。无环。

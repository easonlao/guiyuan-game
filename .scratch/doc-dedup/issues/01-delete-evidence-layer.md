# 01: 删证据层与过程档案

**Type:** task
**Blocked by:** None
**Status:** resolved
**Slice:** S1

**What to build:** 删掉已无读者的报告与归档。分三档按证据删，不按目录整块删。

**为什么要分档：**

`docs/headless/` **不是「完成的文档」，它是 ADR 的证据层**。存活文档引用它的有 8 个文件，其中 `docs/adr/0011-balance-route-fix-rules.md` 一份里就有 11 处引用。整块删掉，等于让 ADR 里的数字失去可核查性。ADR 记的是决定与理由，数字住在报告里——这是本仓库的分工，不是冗余。

## 三档（实测 2026-10-25）

**第一档：零引用，直接删 —— 已执行，15 个文件 172K**

| 目录 | 文件 |
|---|---|
| `docs/headless/` | `action-value-census.md`、`atk-marginal-return.md`、`dynamic-switching-policy.md`、`spf2t-character-animation-research.md` |
| `docs/archive/` | `crossover-confirmation.md`、`strategy-evaluation.md`、`experimental-scoring.md`、`dependency_graph.md`、`fixed-position-continuations.md`、`fsr-minigame-migration.md`、`headless-batch-comparison.md`、`headless-match.md`、`minigame-design-summary.md`、`seeded-strategies.md`、`srs-minigame.md` |

**第二档：修完反向引用再删（约 1.2M）**

- `.scratch/archive/`（160 文件）。前置条件：先删掉 5 处采信链上的反向引用（HLD 2 / SRS 1 / ADR 2，见 `.scratch/doc-dedup/ownership-map.md` C7）。
- 删完后 `git grep -n -E '\.scratch/' -- docs/adr docs/HLD.md docs/SRS.md docs/GDD.md docs/FSR.md GLOSSARY.md README.md` 应为 0 行。

**第三档：先搬数字，再决定删不删（8 份，约 200K）**

被 ADR / SRS / GDD / **源码与测试**引用的报告。**建议暂不删。**

| 报告 | 引用者 |
|---|---|
| `burst-plus-two-balance.md` | ADR 0017 + **`src/core/logic/ScoreCalculator.ts`** + 3 个测试文件 |
| `candidate-search.md` | GDD + ADR 0011 + 一个测试 |
| `knob-census.md` | SRS + ADR 0002 + ADR 0011 + 一个测试 |
| `board-value-without-scoring.md` | ADR 0011 |
| `guardrail-provenance.md` | ADR 0011 |
| `metric-definitions.md` | ADR 0011 |
| `low-state-redirect-experiment.md` | ADR 0010 |
| `candidate-rule-design-and-screening.md` | 留存的 `docs/archive/headless-rule-baseline.md` 当作「现行口径」引用 |

注意最后一行：这份原本按「零引用」被列入第一档，实测发现它被留存的报告引用，**已从第一档剔除**。删证据层要按「删完之后谁引用它」判，不是按当前引用数。

## 验收清单

- [x] 第一档 15 个文件删除；`docs/archive/` 只剩 `headless-rule-baseline.md`，`docs/headless/` 剩 8 份
- [x] 删前逐个复核引用数，剔除被留存文件引用的 `candidate-rule-design-and-screening.md`
- [x] 删除后 `npm run verify` 全绿
- [x] 删除后断链检查：存活文档（`docs/*.md`、`docs/adr/`、`docs/agents/`、`AGENTS.md`、`CONTRIBUTING.md`、`README.md`、`GLOSSARY.md`）零死链
- [ ] 第二档（`.scratch/archive/`）未开始：前置是清 5 处反向引用，属另一张票
- [x] 第三档不删，清单与理由记在上表

## 实现要点

- 用 `git rm`，不要 `rm` 后忘记 `git add`。
- `AGENTS.md` 的「报告类」一句不用改：`docs/archive/` 没删空，仍然存在，该句仍成立。
- 删除时不得「顺手改写」ADR 里的句子。要么原样留着，要么干净删掉整句——改写等于在 ADR 里造新论述，那是另一张票。
- 这些文件在 `.scratch/` 内还有引用（`strategy-evaluation` 8 处、`action-value-census` 6 处等）。`.scratch/` 是过程区且第二档就要清掉，断链可接受，但要在本票记录，不能不说。

## Answer

已执行（2026-10-25），走 `CONTRIBUTING.md` §6 的流程：spec 分支 `spec/doc-dedup`（worktree `.worktrees/spec-doc-dedup`）→ 票分支 `ticket/doc-dedup/01`（worktree `.worktrees/ticket-doc-dedup-01`）→ squash 回 spec → 切片验证 → 整理到 main。

**与原票的两处修正：**

1. **文件数**：原票写「32 个文件」，实测 **15 个**。原数把两个目录的全部文件都算成了零引用。
2. **移出一份**：`candidate-rule-design-and-screening.md` 原列第一档，实测被留存的 `docs/archive/headless-rule-baseline.md` 引用，**剔除**，留在第三档。

**删除明细：** `docs/headless/` 4 份 88K、`docs/archive/` 11 份 84K，合计 **15 文件 172K**。

**验证记录：**

| 检查 | 结果 |
|---|---|
| `npm run verify` | 全绿 |
| 留存文档断链检查 | 零死链 |
| `docs/archive/` 剩余 | 只有 `headless-rule-baseline.md` |
| `docs/headless/` 剩余 | 8 份 |
| `.scratch/` 内断链 | 10 份文件在 `.scratch/` 内有引用，属过程区，随第二档一并消失（已记录） |
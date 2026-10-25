# 01: 删证据层与过程档案

**Type:** task
**Blocked by:** None
**Status:** needs-triage

**What to build:** 删掉已无读者的报告与归档。分三档按证据删，不按目录整块删。

**为什么要分档（2026-10-25 实测，本票的关键发现）：**

`docs/headless/` **不是「完成的文档」，它是 ADR 的证据层**。存活文档引用它的有 8 个文件，其中：

- `candidate-search.md` → 被 9 个文档引用
- `candidate-rule-design-and-screening.md` → 被 7 个引用
- `knob-census.md` → 被 3 个引用
- `docs/adr/0011-balance-route-fix-rules.md` 一份里就有 **11 处**引用

整块删掉，等于让 ADR 里的数字失去可核查性。ADR 记的是决定与理由，数字住在报告里——这是本仓库的分工，不是冗余。

## 三档

**第一档：直接删（32 个文件，约 180K）**

| 目录 | 文件 | 实测引用数 |
|---|---|---|
| `docs/headless/` | `spf2t-character-animation-research.md`、`dynamic-switching-policy.md`、`atk-marginal-return.md`、`action-value-census.md` | 0 |
| `docs/archive/` | 除 `headless-rule-baseline.md` 外的 11 份 | 0 |

**第二档：修完反向引用再删（约 1.2M）**

- `.scratch/archive/`（160 文件）。前置条件：先删掉 5 处采信链上的反向引用（HLD 2 / SRS 1 / ADR 2，见 `.scratch/doc-dedup/ownership-map.md` C7）。删引用即可，不要改写。
- 删完后顺带删这 5 处指向 `.scratch` 的句子。删完 `git grep -n -E '\.scratch/' -- docs/adr docs/HLD.md docs/SRS.md docs/GDD.md docs/FSR.md GLOSSARY.md README.md` 应为 0 行。

**第三档：先搬数字，再决定删不删（8 个文件，约 200K）**

被 ADR / SRS / GDD 当作证据引用的 8 份报告。删之前每份要先把 ADR 引到的**具体数字**落进 ADR 正文。这不是「整理」，是内容迁移，可能不划算。

**建议：第三档暂不删。** 前提是先回答「ADR 里的数字需不需要能被复核」。需要 → 留着；不需要 → 先做迁移。

## 验收清单

- [ ] 第一档 32 个文件删除，`git ls-files docs/headless docs/archive` 的剩余项与第三档清单一致
- [ ] 第二档删除前，C7 的 5 处反向引用已清理，对账命令为 0 行
- [ ] 第三档不删，或已把被引数字搬进对应 ADR 并在本票记录搬了哪些
- [ ] 删除后 `npm run verify` 全绿
- [ ] 删除后重跑断链检查：存活文档（`docs/*.md`、`docs/adr/`、`AGENTS.md`、`README.md`）零死链
- [ ] `AGENTS.md` 里对 `docs/archive/` 的描述随之下修（该目录若删空，报告类只剩 `docs/headless/`）

## 实现要点

- 用 `git rm`，不要 `rm` 后忘记 `git add`。
- 每个文件删前跑一遍 `git grep -l -F "<文件名>"` 复核引用数，与上表比对。上表是 2026-10-25 的快照，引用会漂。
- 不要在删除时「顺手改写」ADR 里的句子。要么原样留着（引用指向已删文件是错的），要么干净删掉整句。改写等于在 ADR 里造新论述，那是另一张票。
- 删完把本票的实测数字与最终决策追加到文末 `## Answer`，不要另建文件。
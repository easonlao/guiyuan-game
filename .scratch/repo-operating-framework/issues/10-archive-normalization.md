# 10: `.scratch/archive` 按 feature 目录归位

**What to build:** `.scratch/archive/` 根下 7 个散落的 `.md` 收进各自的 feature 目录，archive 里不再有游离在 feature 目录外的文件。

**Blocked by:** None (can start immediately)

**Status:** closed

**验收清单：**

- [ ] `.scratch/archive/` 根下无 `.md` 文件，只剩 feature 目录
- [ ] `001-headless-strategy-evaluation.md` → `headless-strategy-evaluation/spec.md`
- [ ] `002-balance-diagnostics.md` → `balance-diagnostics/spec.md`
- [ ] `003`–`007`（milestone 1 的 wayfinder 代）→ `core-engine/wayfinder/`，与 `core-engine/` 现有的 spec + issues 分开存放
- [ ] 跨文件链接不悬空

**已核实的事实：**

- 7 个根下文件与 feature 目录的对应关系由文件名与 frontmatter 的 `parent:` 决定：`001`/`002` 是 spec（有 `## Problem Statement`），`003` 是 `wayfinder:map`，`004`–`007` 是它的 `wayfinder:task` 子票（`parent: "003-wayfinder-milestone1-map.md"`）。
- `003`–`007` 与 `core-engine/` 属同一 feature：`003` 的 Destination 与 `core-engine/spec.md` 的「里程碑 1」一致；`005`(T2 TurnManager) / `006`(T3 AI + Terminal) 与 `core-engine/issues/01-turn-manager.md` / `02-strategy-ai-and-terminal-viewer.md` 是同一批工作的两代写法，`004`(T1 ActionCandidates) / `007`(T0 PRNG) 是更早、已完成的票。
- 全仓只有 1 处入链指向这些文件：`.scratch/archive/headless-strategy-evaluation/issues/08-evaluation-and-human-cases.md` 里的 `../../002-balance-diagnostics.md`。
- `003` 自身的两处出链写成 `.scratch/007-deterministic-prng-and-record.md` / `.scratch/004-action-candidates.md`，从 archive 移动前就已悬空。

**实现要点：**

- `004`–`007` **保留原文件名**、原封不动放进 `core-engine/wayfinder/`。它们互相的 `parent:` / `blocked_by:` 引用是相对路径且同目录，改名就得改 frontmatter——归档件不值得动。编号不重排，因为这是历史产物、不是新票。
- `001`/`002` 改名成 `spec.md`：它们本来就是对应 feature 的规格书，目录里也正好缺 `spec.md`。

**验证记录：**

- `.scratch/archive/` 根下无 `.md`：`find .scratch/archive -maxdepth 1 -type f` 为空。
- `001` → `headless-strategy-evaluation/spec.md`、`002` → `balance-diagnostics/spec.md` 就位。
- `003`–`007` 在 `core-engine/wayfinder/` 下，文件名未改。
- 链接不悬空：唯一入链改为 `../../balance-diagnostics/spec.md`；`003` 的两处出链改为同目录相对路径（原先就已悬空，顺手修）。
- `git mv` 全部识别为 rename，内容除链接外未变。

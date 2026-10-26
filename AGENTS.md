## Design docs

阅读顺序见 `README.md` §文档（FSR → SRS → GDD → HLD → LLD），此处不重复。

每个事实只有一个家。写或改文档时，先看它归谁：

| 文档 | 唯一拥有 | 不写（留指针） |
|---|---|---|
| FSR | 定位、竞品、可行性结论、成本与时间估算、项目级风险 | 需求条目、规则机制与数值、工程方案 |
| SRS | 范围与交付时点、FR/NFR 与验收条款、验收口径 | 规则机制与数值、工程方案、可行性论证 |
| GDD | 规则机制、设计约束、参数的含义与意图、规则侧开放项 | 参数取值、需求条目、工程实现、交付时点 |
| HLD | 架构与包拓扑、进程模型、确定性手段、沙箱与预算机制、CLI、CI、工程侧开放项 | 规则机制与取值、需求定义、可行性论证、类型定义 |
| LLD | 数据格式与类型契约：状态结构、动作载荷、模块间接口签名、不可变性约定 | 规则机制与取值、需求定义、可行性论证、架构与包拓扑 |
| `CONTRIBUTING.md` | 贡献流程与交付纪律：提交信息规范、编码风格、分支与交付、快速通道、开发流程闭环 | 架构边界与依赖方向（→ 配置文件与 HLD）、验收命令的构成（→ `package.json`）、规则机制、可行性论证 |

两份文档冲突时采信顺序：LLD > HLD > GDD > SRS > FSR（类型定义本身以 `src/core/types/domain.ts` 为准）。发现冲突就修矛盾的一方（删除或改指针），不要两边各留一份。

参数取值以代码常量为准（`src/core/logic/`），GDD 只写含义与意图。

### 真源类与报告类

表外还有三类文档：

- **真源类**（进采信链）——`GLOSSARY.md` 管「叫什么」：术语 + 一两句「它是什么」+ `_Avoid_` 禁用别名，格式见 `.agents/skills/domain-modeling/GLOSSARY-FORMAT.md`；术语冲突以它为准，**禁止往里写规则正文、实现细节或决策记录**。它的范围停在「规则与棋盘」这一层：表现层只收了 `主印`、`半身` 两条，其余视觉词（如 `幽灵态`、`候选弧`）不进表，在 `docs/LLD.md` §4.1 定义。`docs/adr/` 管「为什么这么定」，决策冲突以最新 ADR 为准。
- **报告类**（只做证据与导航，不定义规则）——**已于 2026-10-25 删除**（原 `docs/headless/` 与 `docs/archive/`）。「引用它们时必须写明『这是证据，不是定义』」这条规矩仍有效，但此类目录已空。要取回某份报告：`git log --diff-filter=D -- docs/headless`，再 `git show <commit>:<path>`。
- **入口类**——`README.md` 面向人，可以概述玩法，但**不复述规则的条件与数值**（那些归 GDD），必须带指针；代码入口与模块职责归 `docs/HLD.md` §2。

### ADR 的边界

门槛与格式见 `domain-modeling` 技能的 `ADR-FORMAT.md`。本仓库按完整结构写：背景 + 决定 + 被否决的方案 + 后果（技能里后两项可选，这里不省）。另两条：

- 采纳后：规则正文回写 GDD、工程方案回写 HLD，ADR 只留决策与理由；现状勘误追加文末，不重写历史结论。**证据报告已于 2026-10-25 删除**（原 `docs/headless/`），只可取回于 git 历史；ADR 里指向被删报告处写作「原报告已删，见 git 历史」。
- 变更历史由 git 承载：文档头部不写版本号，也不写逐版本变更记录。

## 目录约定

- 仓库基建脚本（构建、门禁、突变对比）放 `scripts/`，共享实现放 `scripts/lib/`；`tools/` 是开发工具与 CLI，自成 npm 包。
- 单元测试放 `tests/`。
- 工具生成的产物放 `artifacts/`；根目录的 `mutation-baseline.jsonl` 是入库的棘轮基线，归 `docs/MUTATION-TESTING.md` §3.2 管。

包名与包拓扑见 `docs/HLD.md` §2；进不进库以根目录 `.gitignore` 为真源（例外：`minigame/game.js` 是入库的交付产物，理由见 ADR 0014）；实验报告与归档文档已于 2026-10-25 删除，见上一节。

版本库里的其余顶层目录：`.github/`（CI workflow）、`.githooks/`（提交信息 hook）、`patches/`（patch-package 补丁）、`.pi/`（pi 的工具配置）、`.agents/`（通用 Agent Skills 目录）。

## 提交纪律

提交信息门禁见 `CONTRIBUTING.md` §3；分支与交付策略（含快速通道）见 §6。

## 验收命令

内循环与收尾各一条命名脚本（`check:quick` / `verify`）；构成以 `package.json` 为真源，分档意图见 `docs/HLD.md` §4.4，工作流步骤见 `CONTRIBUTING.md` §5，交付档位与执行者见 §6.6。

## Agent skills

### 技能与 codegraph 索引

开工前先看 `.agents/skills/` 与 `.codegraph/` 在不在，缺任何一个先跑 `npm run bootstrap`。为什么它们不随 clone 来、哪个工具读哪个目录、遇到没见过的工具怎么查：`docs/agents/agent-tooling.md`。

### Issue tracker

Local markdown files in the `.scratch/` directory. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

### Mutation testing

门禁与做法见 `docs/MUTATION-TESTING.md`。

全量突变测试 + 棘轮对比（`npm run mutation:milestone`）由 **agent 在本地跑**——CI 不跑突变测试（见 `docs/HLD.md` §4.5）。何时跑、门禁口径见 `docs/MUTATION-TESTING.md`。

### Subagents

The main thread dispatches and aggregates; code questions go to `Explore`.

Dispatch `Explore` for a code question that is not one already-known path at one already-known line: architecture, "how does X work", bug diagnosis, or the reconnaissance before a ticket. The main thread reads only the ticket or issue text, and the file or symbol the user named verbatim — CodeGraph is there to write the brief, not to replace the dispatch.

Open the brief with: **"Start with `codegraph_explore`; use `read`/`grep` only for what it leaves unanswered."** Then give it the question, what you already ruled out, and the symbols you already know. It returns a conclusion plus `file:line` references, not a source dump. Dispatch it in the background.

| Subagent | Use for | Skills |
|---|---|---|
| `Explore` | code questions, recon | `research`, `diagnosing-bugs`, `codebase-design` |
| `Reviewer` | the two `code-review` axes, verification of landed work | `code-review` |
| `Executor` | implementing one ticket | `implement`, `tdd` |
| `ExpertAdvisor` | design and modeling decisions | — (`skills: false`) |

Inside a subagent there is no nested dispatch, so it calls `codegraph_explore` directly.

These rules also bind the exploration steps of the workflow skills (implement, code-review, …), and live only in this file: `.agents/skills/` is overwritten on update.

<!-- CODEGRAPH_START -->
## CodeGraph

This codebase is indexed (`.codegraph/` at the repo root). `codegraph_explore` is the fastest way in: one call returns the relevant symbols' verbatim line-numbered source, the call path between them (dynamic-dispatch hops grep cannot follow included), and a blast-radius summary. Treat the result as already read, and name a symbol or file to read its current source.

Without a `.codegraph/` directory there is nothing to query — indexing is the user's decision.
<!-- CODEGRAPH_END -->

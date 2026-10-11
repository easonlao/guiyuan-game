## Design docs

阅读顺序：`docs/FSR.md`（why）→ `docs/SRS.md`（what）→ `docs/GDD.md`（规则）→ `docs/HLD.md`（how）→ `docs/LLD.md`（契约）。

每个事实只有一个家。写或改文档时，先看它归谁：

| 文档 | 唯一拥有 | 不写（留指针） |
|---|---|---|
| FSR | 定位、竞品、可行性结论、成本与时间估算、项目级风险 | 需求条目、规则机制与数值、工程方案 |
| SRS | 范围与交付时点、FR/NFR 与验收条款、验收口径 | 规则机制与数值、工程方案、可行性论证 |
| GDD | 规则机制、设计约束、参数的含义与意图、规则侧开放项 | 参数取值、需求条目、工程实现、交付时点 |
| HLD | 架构与包拓扑、进程模型、确定性手段、沙箱与预算机制、CLI、CI、工程侧开放项 | 规则机制与取值、需求定义、可行性论证、类型定义 |
| LLD | 数据格式与类型契约：状态结构、动作载荷、模块间接口签名、不可变性约定 | 规则机制与取值、需求定义、可行性论证、架构与包拓扑 |

两份文档冲突时采信顺序：LLD > HLD > GDD > SRS > FSR（类型定义本身以 `src/core/types/domain.ts` 为准）。发现冲突就修矛盾的一方（删除或改指针），不要两边各留一份。

### 真源类与报告类

表外还有两类文档：

- **真源类**（进采信链）——`GLOSSARY.md` 管「叫什么」：术语 + 一两句「它是什么」+ `_Avoid_` 禁用别名，格式见 `.pi/skills/domain-modeling/GLOSSARY-FORMAT.md`；术语冲突以它为准，**禁止往里写规则正文、实现细节或决策记录**。`docs/adr/` 管「为什么这么定」，决策冲突以最新 ADR 为准。
- **报告类**（只做证据与导航，不定义规则）——`docs/headless/`、`docs/archive/`、`docs/DEVELOPMENT.md`。引用它们时必须写明「这是证据，不是定义」。
- **入口类**——`README.md` 面向人，可以概述玩法，但**不复述规则的条件与数值**（那些归 GDD），必须带指针；`docs/DEVELOPMENT.md` 只给代码入口路径，模块职责归 HLD。

### ADR 的边界

- 门槛（三条全中才写）：难以撤销 + 无上下文会令人困惑 + 是真实权衡的产物。
- 一条决策一个文件：背景 + 决定 + 被否决的方案 + 后果。ADR 采纳后，**规则正文回写 GDD、工程方案回写 HLD、证据留在 `docs/headless/`**，ADR 只留决策与理由。
- 现状勘误追加在文末，不重写历史结论；不复述被指向文档的内容。

变更历史由 git 承载：文档头部不写版本号，也不写逐版本变更记录。

## 提交纪律

提交信息禁止 `Co-Authored-By` trailer；门禁与安装见 `CONTRIBUTING.md` §3。

## Agent skills

### Issue tracker

Local markdown files in the `.scratch/` directory. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

### Mutation testing

门禁与做法见 `docs/MUTATION-TESTING.md`。

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

These rules also bind the exploration steps of the workflow skills (implement, code-review, …), and live only in this file: `.pi/skills/` is overwritten on update.

<!-- CODEGRAPH_START -->
## CodeGraph

This codebase is indexed (`.codegraph/` at the repo root). `codegraph_explore` is the fastest way in: one call returns the relevant symbols' verbatim line-numbered source, the call path between them (dynamic-dispatch hops grep cannot follow included), and a blast-radius summary. Treat the result as already read, and name a symbol or file to read its current source.

Without a `.codegraph/` directory there is nothing to query — indexing is the user's decision.
<!-- CODEGRAPH_END -->

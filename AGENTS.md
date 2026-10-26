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

### 表外三类文档

- **真源类**（进采信链）——`GLOSSARY.md` 管「叫什么」：术语 + 一句「它是什么」+ `_Avoid_` 禁用别名（格式见 `.agents/skills/domain-modeling/GLOSSARY-FORMAT.md`）。冲突以它为准；**禁止往里写规则正文、实现细节或决策记录**。范围停在「规则与棋盘」：表现层只收 `主印`、`半身`，其余视觉词在 `docs/LLD.md` §4.1 定义。`docs/adr/` 管「为什么这么定」，冲突以最新 ADR 为准。
- **入口类**——`README.md` 面向人，可以概述玩法，但**不复述规则的条件与数值**，必须带指针。
- **报告类**——已于 2026-10-25 删除（原 `docs/headless/`、`docs/archive/`）。取回某份：`git log --diff-filter=D -- docs/headless`，再 `git show <commit>:<path>`。将来重建此类目录时，引用要写明「这是证据，不是定义」。

### ADR 的边界

门槛与格式见 `domain-modeling` 的 `ADR-FORMAT.md`。本仓库写完整四段：背景 + 决定 + 被否决的方案 + 后果（技能里后两段可选，这里不省）。另三条：

- 采纳后：规则正文回写 GDD、工程方案回写 HLD，ADR 只留决策与理由。
- 勘误追加文末，不重写历史结论；指向已删材料时写「原报告已删，见 git 历史」。
- 变更历史由 git 承载：文档头部不写版本号，也不写逐版本变更记录。

## 目录约定

- 仓库基建脚本（构建、门禁、突变对比）放 `scripts/`，共享实现放 `scripts/lib/`；`tools/` 是开发工具与 CLI，自成 npm 包。
- 单元测试放 `tests/`。
- 工具生成的产物放 `artifacts/`；根目录的 `mutation-baseline.jsonl` 是入库的棘轮基线，归 `docs/MUTATION-TESTING.md` §3.2 管。

包名与包拓扑见 `docs/HLD.md` §2；进不进库以根目录 `.gitignore` 为真源（例外：`minigame/game.js` 是入库的交付产物，理由见 ADR 0014）。

版本库里的其余顶层目录：`.github/`（CI workflow）、`.githooks/`（提交信息 hook）、`patches/`（patch-package 补丁）、`.pi/`（pi 的工具配置）、`.agents/`（通用 Agent Skills 目录）。

## 提交纪律

提交信息门禁见 `CONTRIBUTING.md` §3；分支与交付策略（含快速通道）见 §6。

## 验收命令

内循环与收尾各一条命名脚本（`check:quick` / `verify`）；构成以 `package.json` 为真源，分档意图见 `docs/HLD.md` §4.4，工作流步骤见 `CONTRIBUTING.md` §5，交付档位与执行者见 §6.6。

## Agent skills

| 什么时候 | 读什么 |
|---|---|
| 开工前，`.agents/skills/` 或 `.codegraph/` 不在 | 先跑 `npm run bootstrap`；哪个工具读哪个目录、没见过怎么查：`docs/agents/agent-tooling.md` |
| 领任务、开票、改状态 | `.scratch/`（`docs/agents/issue-tracker.md`）；标签见 `docs/agents/triage-labels.md` |
| 动领域词或写 ADR | `docs/agents/domain.md`（单上下文） |
| 动 `src/core/logic/` | `docs/MUTATION-TESTING.md`；全量与棘轮由 agent 本地跑，CI 不跑（ADR 0012） |
| 要派子代理 | 见下 |

### 派子代理

主线派发与汇总，代码问题交 `Explore`。一个问题若不是「已知路径上的已知行」——架构、某个东西怎么跑、bug 定位、开票前的侦查——就派它。主线只读票面或用户点名的文件与符号：CodeGraph 用来写简报，不代替派发。

简报开头写死这句：**"Start with `codegraph_explore`; use `read`/`grep` only for what it leaves unanswered."** 然后给：问题、已排除的、已知符号。它回结论加 `file:line`，不回源码。后台派。

| Subagent | 什么时候用 | Skills |
|---|---|---|
| `Explore` | 代码问题、侦查 | `research`, `diagnosing-bugs`, `codebase-design` |
| `Reviewer` | code-review 两轴、校验已落地的工作 | `code-review` |
| `Executor` | 实现一张票 | `implement`, `tdd` |
| `ExpertAdvisor` | 设计与建模决策 | — (`skills: false`) |

子代理里没有嵌套派发，直接用 `codegraph_explore`。这些规则也约束 implement / code-review 等技能的探索步骤，而且只写在这里：`.agents/skills/` 更新时会被覆盖。

## 报告之前

四问，答不上就先别报：

| 问 | 判据 |
|---|---|
| **当场跑过吗？** | 写进文档与提交信息的数字，必须来自当场跑过的命令。「应该是 0」这类推断不算——哪怕它显然得像废话（2026-10-25 就是把「gc 之后不可达提交归零」当显然，实际是 131） |
| **全量还是采样？** | 数字来自不带 `head` / `tail` 的完整命令；只看几条就明写「前 N 条」 |
| **比内容还是比计数？** | 门禁与对账先比内容（树、逐字节、对象），比不了才退到计数或结构 |
| **红过吗，红了凭什么变绿？** | 新断言先在自己造的破坏上红一次，再在真实流程里绿一次；每次都红的断言不算门禁 |

<!-- CODEGRAPH_START -->
## CodeGraph

This codebase is indexed (`.codegraph/` at the repo root). `codegraph_explore` is the fastest way in: one call returns the relevant symbols' verbatim line-numbered source, the call path between them (dynamic-dispatch hops grep cannot follow included), and a blast-radius summary. Treat the result as already read, and name a symbol or file to read its current source.

Without a `.codegraph/` directory there is nothing to query — indexing is the user's decision.
<!-- CODEGRAPH_END -->

# 突变测试 (Mutation Testing)

**一句话**：Stryker 往 `src/core/logic/**` 里注入小 bug（突变体），跑一遍 Vitest，看测试抓不抓得住。抓不住的是「存活突变体」，指向测试缺口。本仓库的门禁是**基线棘轮**——只对基线里没有的存活/无覆盖报警，**不设全局固定分数阈值**。

这份文档是突变测试的唯一规则来源。它被 gitignore 之外的路径引用（`AGENTS.md` 的 Mutation testing 小节），改动会被提交，活得过工具更新。

**叫法**：全篇用「突变测试」「突变体」，不用「变异测试」「变异分析」。名字定在这里、而不是 `GLOSSARY.md`，因为后者的格式约定（`.agents/skills/domain-modeling/GLOSSARY-FORMAT.md`）不收通用编程概念；而历史上确实同时存在两个叫法。

---

## 快速上手

| 场景 | 命令 |
| --- | --- |
| 改完核心逻辑（`implement` 收尾） | `npm run mutation:changed`（**只看存活、补断言**；子集报告不做棘轮对比） |
| 里程碑全量（自上次刷基线后 `src/core/logic/**` 有改动的 spec 收尾 / 发版 / 提审前） | `npm run mutation:milestone`（= 全量突变测试 + 棘轮对比，棘轮只认全量） |
| 只跑相对某个 ref 的改动 | `npm run mutation:changed -- HEAD~1`（默认 `HEAD`，含未提交改动） |
| 确认等价突变体后接受进基线 | `npm run mutation`（全量）→ `npm run mutation:baseline` |

- **门禁红**的定义：`npm run mutation:check` 报出「基线之外的存活/无覆盖突变体」，退出码 `1`。
- **棘轮只对全量跑有效**：`mutation:check` 若发现报告来自子集跑（`mutation:changed` 的 `--mutate` 结果），退出码 `2` 并提示先跑 `npm run mutation`——子集跑的覆盖集不同，直接对比会报出**假的新增存活**。
- 报告产物：`artifacts/mutation/mutation.json`（`artifacts/` 已 gitignore，不入库）。存活明细同时打到控制台（`clear-text`，含文件 / 行号 / 突变类型 / `- / +` diff）。
- 基线文件：`mutation-baseline.jsonl`（**入库**、JSONL、可 diff）。

---

## 1. 为什么在这里做突变测试

测试全绿不等于测试有用。这个仓库是 AI 主导开发的，代码和测试由同一个 agent 写，最典型的失效模式就是「测试看起来绿了，但没断言到行为」。覆盖率抓不到这个——跑过一行不等于断言了它的结果。突变测试直接针对它：改坏了代码，测试还过，就是缺口。

## 2. 两条路径：什么时候跑

### 2.1 改动处跑（`implement` 收尾用）

- **命令**：`npm run mutation:changed`，默认对比 `HEAD`（含未提交改动），只对 `src/core/logic/**` 里改动的 `.ts` 文件跑（排除纯 re-export 的 `src/core/logic/index.ts`）。
- **时机**：`implement` 收尾。反馈最紧——刚写的代码、刚写的测试，改动小、跑得快，能当场把漏掉的断言补上。补测试本来就属于 `implement` 的职责，所以突变测试收敛到这一步，而不是留到事后。
- **为什么不用全量**：全量一次耗时较长（1073 个突变体 / 6 个文件，其中 993 个计分），不适合每次改动都跑。
- **子集报告不能做棘轮对比**：Stryker 的 perTest 覆盖按**被注入突变的文件集**选测试，子集跑出的存活集与全量不同。`mutation:check` 会识别并**拒绝**子集报告（退出 `2`），见 §3.1。
- **实际覆盖粒度是 per-test，与 `coverageAnalysis` 配置无关**：`stryker.config.json` 里的 `coverageAnalysis: "off"` **并不生效**——`@stryker-mutator/vitest-runner@10.0.0` 的 `dryRun()` 无条件调用 `readMutantCoverage()`，实际总是按 per-test 收集覆盖（报告里每个 mutant 都带 `coveredBy`）。保留 `off` 只是沿用既有值，**不代表**「所有测试都打每个突变体」；也因此 `NoCoverage` 是真实存在的状态（不是结构性恒 0），纳入棘轮有意义（§3.1）。
- **无改动文件时**：退出 `0`（合法状态，不是失败）。

### 2.2 里程碑全量（自上次刷基线后 `src/core/logic/**` 有改动的 spec 收尾 + 发版/提审前）

- **命令**：`npm run mutation:milestone`（= `npm run mutation` → `npm run mutation:check`）。前者跑 `stryker.config.json` 里 `mutate` 的全部目标，后者拿报告和基线比一次。
- **时机一：动过 `src/core/logic/**` 的 spec 收尾**。条件是**基线最后一次刷新之后这份目录有改动**：

  ```bash
  git diff --name-only "$(git log -1 --format=%H -- mutation-baseline.jsonl)"..HEAD -- src/core/logic
  ```

  有输出就跑（跑完按 §3.2 刷基线），空就跳过。
  - **为什么可以跳过**：突变体只存在于 `mutate` 覆盖的 `src/core/logic/**`（§6）。这份目录自上次全量以来没变，存活集合就不会变，全量在定义上产不出新发现——那一次纯属白跑（耗时口径见 §2.1）。基线最后一次刷新就是「上次全量跑到哪」的记录（基线只能由全量报告写出，§3.2），所以不需要另外记 spec 起点。
  - **为什么条件成立时必须跑**：`mutation:changed` 只对本次改动的文件注入突变，棘轮又只认全量（§3.1），所以**没被本次 spec 碰过的逻辑文件**在增量路径里是结构性盲区。实证：burst-plus-two 收尾的全量暴露了 7 个真实可杀存活，全在它没碰过的 `TurnManager.ts` / `State.ts`（commit `d8cbfb1`）。跨多个 `implement` 的累积效果也在这里体检，防止「每次改动都过、合起来漏了」。
  - **已知偏差，都是保守方向**：① 某次改了逻辑却没刷基线，条件就一直为真，直到补跑一次全量；② 两人在主分支上交错提交时，对方的逻辑改动也会触发你这次收尾跑。两者都是多跑一次，不丢信号。
  - **会漏的方向一**：只削弱覆盖 `src/core/logic/**` 的测试、完全不碰 `src/core/logic` 的改动。基线之后没有逻辑改动，条件为空，新增存活要等下一次逻辑改动才暴露。这种改动罕见，而且 `npm run verify` **挡不住它**——断言被削弱后测试照样绿，只能靠 code review 或下一次全量发现。
  - **会漏的方向二**：`mutation:baseline` 只看报告结构、不看报告新鲜度。如果拿一份陈旧的 `artifacts/mutation/mutation.json` 刷基线，边界提交会指向一次并不是在那个源码状态下跑的全量，条件随即变成「跳过」。所以要守纪律：**刷基线必须紧跟同一次全量跑**，不要复用旧的 `artifacts/` 报告。
- **时机二：发版 / 提审前**——对外交付前的最后一道体检，无条件跑。
- **触发者只能是 agent**：需求方不会去按按钮，所以全量 + 棘轮的触发责任写进了 `AGENTS.md`（条件见上）。为什么不自动触发（不挂 CI 定时）见 ADR 0012。

### 2.3 为什么门禁必须落在「本地/agent 循环」

CI 只把 `mutation:changed` 当**观察项**（红了不阻断、只落盘），全量 + 棘轮由 agent 在本地手动跑（工程现状见 `docs/HLD.md` §4.5，理由见 ADR 0012）。所以棘轮门禁的「红」没有流水线兜底，唯一消费者是跑它的那个 agent。`mutation:check` 自己算退出码（仓库刻意不配 `thresholds.break`，Stryker 不会因存活而失败），这条必须在 agent 内循环里成立。

---

## 3. 门禁：基线棘轮（不是全局固定阈值）

### 3.1 机制

- 仓库里存一份基线 `mutation-baseline.jsonl`，记录**当前全部**「未被测试抓住」的突变体（`status ∈ {Survived, NoCoverage}`）。
- 每行一条 JSON（`#` 开头为注释行，读取时跳过）：`{file, line, column, mutatorName, replacement}`，按 `file → line → column → mutatorName → replacement` 稳定排序。
- 跑完突变测试后，`npm run mutation:check` 拿报告和基线对比，**只报告基线里没有的**存活/无覆盖。
- 有新增 → 退出 `1`；无新增 → 退出 `0`；缺报告、缺基线、或报告来自**子集跑** → 退出 `2`。
- **子集报告防护**：`mutation:check` 读 `stryker.config.json` 的 `mutate`，并比对报告 `config.mutate`（Stryker 回填的是 CLI 覆盖后的**最终**值）。两者不一致、或报告缺 `config.mutate`，即判定为子集跑，退出 `2` 并提示「棘轮只对全量跑有效，请先跑 `npm run mutation`」。`mutation:baseline` 同样只接受全量报告（§3.2），否则会把基线缩到子集、与门禁口径不一致。
- **覆盖粒度是 per-test（非配置决定）**：`coverageAnalysis: "off"` 字段不生效，runner 总是回传 per-test 覆盖（见 §2.1）。所以 `NoCoverage` 是真实存在的状态、不是结构性恒 0，纳入棘轮有意义。
- 棘轮只收 `Survived + NoCoverage`。`Timeout` 既不入基线、又被 Stryker 计入「已探测」，所以 Killed↔Timeout 的抖动对门禁与分数**都无影响**（见 §3.4）。
- 身份键是 `{file, mutatorName, line, column, replacement}`，**不是** Stryker 的 `mutants[].id`（那个只在单次报告内唯一）。
- **身份键含行号，所以格式化会移动基线**：任何改变 `src/core/logic/**` 行号的改动（含 `npm run fmt`）都会让基线条目的 `line`/`column` 失效，下一次 `mutation:check` 把它们报成「疑似只是移位」的新增。改完按 §3.2 重跑全量并刷基线，diff 应只体现行列位移、不增删条目。
- **`next-line` 依赖目标行不换行**：`// Stryker disable next-line` 禁用的是注释后那个 AST 节点所在的行；若格式化把该行拆成多行，禁用会落到错误的行上，目标突变体变成未禁用（`Survived`/`NoCoverage`）。这类目标行要用 `// oxfmt-ignore` 钉住不换行（例见 `src/core/logic/ActionResolver.ts` 的不可达 `return` 守卫）。

棘轮的对象是 `Survived` **和** `NoCoverage` 两者：「故意加一段没被测到的行为」产出的是 `NoCoverage`，只盯 `Survived` 会漏。

### 3.2 更新基线的纪律

确认某个存活是**等价突变体**（见 §4）后，用 `npm run mutation:baseline` 重新生成基线。基线是入库文本，更新后 `git diff` 里新增/删除的行就是「新出现 / 消失」的存活，可 review。

- **只能对全量报告刷基线**：`mutation:baseline` 与 `mutation:check` 一样校验报告来自全量跑（读 `stryker.config.json` 的 `mutate` 并比对报告 `config.mutate`），且拒绝结构无效 / 空的报告。缺报告、结构无效或报告来自子集跑（`mutation:changed` 的 `--mutate` 结果）都退出 `2`。**禁止对子集报告刷基线**——那会把基线缩到子集，使口径与门禁不一致（后续 `mutation:check` 会报更多新增）。
- **不要**为了让门禁变绿而无脑重刷基线——那等于把门禁关掉。只有「确认等价」或「有意识接受一个新缺口」才更新。
- 基线收缩（删掉已杀死的条目）是好信号，会在 diff 里体现。

### 3.3 现状快照（截至 2026-10-11）

- 基线规模：**34 条**（Survived 34 + NoCoverage 0）。全部是「同一行同一 mutator 上还有可杀兄弟、无法单独 disable」的等价 / 不可观测突变体（逐条理由见 `mutation-baseline.jsonl` 与阶段 4a commit `57e8029`）。
- 全量突变分 **96.58%**：共 **1073** 个突变体，其中 **993** 个计分（Killed + Timeout 959 / Survived 34 / NoCoverage 0）；另有 **80 个**被**就地 disable**、Stryker 记为 `Ignored`（来自 **54 行** `// Stryker disable next-line` 注释，一行可覆盖多个 mutator）。
- **这个分数不是门禁，也不值得追高**：它只是当前状态快照，会随代码变化浮动。门禁只盯「有没有新增存活 / 无覆盖」（§3.1）。
- **诚实说明（阶段 3a → 4a 的纠正）**：阶段 3a 一度把 disable 加到 **71 行**，对外呈现基线 **0 条** / 分数 **100.00%**。但 Stryker 的 disable 是「行 + mutator」粒度：一行 disable 会把该行该 mutator 的**全部取值**一起禁掉，其中 **35 个本可被现有测试杀死**。阶段 4a（`57e8029`）机械重做——只保留「该行该 mutator 全部取值都未被测试抓住」的 disable（54 行 / 80 个 `Ignored`），其余等价项落回基线（34 条）。所以「0 条 / 100%」是**过度 disable 造成的假象**，**34 条 / 96.58%** 才是准确口径。

### 3.4 Timeout：为什么抬到 30s，且不影响门禁

- `stryker.config.json` 设了 `timeoutMS: 30000`（默认 5000）。原因：少数突变体（如 `ActionResolver.ts` 440:23 的 `state.round + 1` → `state.round - 1`）会让轮次永不递增，使同步自对弈用例（含 `matches:2000`）慢一个数量级但不死循环；这类「慢而可杀」的突变体会在负载相关的超时线上下翻转 Killed/Timeout。把常量下限抬到 30s 后超时由常量项主导、对负载噪声不敏感。
- **棘轮只收 `Survived + NoCoverage`，Timeout 不入基线**；而 Stryker 把 Timeout 计入「已探测」，所以 Killed↔Timeout 翻转对 `mutation:check` 与分数**都无影响**。
- 因此不去彻底消除翻转（需再把超时抬 2–3 倍，每次多等数分钟，却不改善门禁稳定性）。完整推导见 `stryker.config.json` 的 `_timeoutComment`。

---

## 4. 等价突变体：就地 disable，不做全局排除

有些突变体和原代码**行为完全等价**（例如某个比较在边界上永远走同一分支、某些常量替换被后续逻辑吸收），测试再怎么补也杀不掉它。处理办法：

- **就地**加 `// Stryker disable next-line <Mutator>` 注释，**并写清为什么等价**。
- **disable 的粒度是「行 + mutator」，必须整组都不可杀才用**：`next-line` 会把**该行该 mutator 的全部取值**（如 `ConditionalExpression` 的 `true` / `false` 两个方向）一并禁掉。所以只有当这一整组取值都未被现有测试抓住时才 disable；**只要同行同 mutator 还有可杀的兄弟（Killed / Timeout），就绝不能用 disable**——那会顺带掩盖可杀突变体，制造假绿。这类「同行有可杀兄弟、自己又等价」的突变体走**基线**（`mutation-baseline.jsonl`），不用 disable。
- 只对**已确认等价**的突变体这么做，不要因为「懒得补测试」而 disable。
- **不做全局排除规则**（不在 `stryker.config.json` 里加 `mutator.excludedMutations`）。原因：本仓库的计分表本身就是一堆数字常量，禁掉字面量突变（`StringLiteral` / 数值替换）等于把**最该测的东西**排除掉。全局规则会随一次误判永久生效，就地注释则带上下文、可 review。

**现状（阶段 4a 后）**：活代码上的存活已用真实行为断言清零；剩余杀不掉的**等价 / 不可观测**突变体按上面两条分别处置：**整组不可杀**的 **54 行 / 80 个**用就地 `// Stryker disable next-line` 并附理由（Stryker 记为 `Ignored`）；**同行有可杀兄弟**的 **34 条**留在基线里。这个划分是「行 + mutator」粒度的**必然结果**，不是可以自由选择的——想给某个等价突变体单独 disable，只能连带禁掉同组可杀的兄弟，所以它只能进基线。

示例（语法，非本仓库现有内容）：

```ts
// Stryker disable next-line ConditionalExpression: 该分支两侧在定义域上等价，不可区分
if (score >= 0) { /* ... */ }
```

---

## 5. 为什么不设全局固定阈值（附来源）

**结论：全库绝对突变分不可行、不可行动，所以不拿它当门禁。**

### 5.1 Google 的做法（一手依据）

- Goran Petrović, Marko Ivanković, *State of Mutation Testing at Google*, ICSE-SEIP 2018（ACM，DOI [10.1145/3183519.3183521](https://doi.org/10.1145/3183519.3183521)）。
- Goran Petrović, Marko Ivanković, Gordon Fraser, René Just, *Practical Mutation Testing at Scale: A view from Google*, IEEE TSE 48(10), 2022（在线 2021-08，DOI [10.1109/TSE.2021.3107634](https://doi.org/10.1109/TSE.2021.3107634)）。

要点：

1. **只对改动的行跑**（diff-based / changelist 级别）。两篇论文的核心设计都是「突变测试在 code review 时，只对本次改动且被覆盖的行生成突变体」——和本仓库 `mutation:changed` 的思路一致。
2. **全库绝对分不可行**：TSE 2021 原文说，即使有各种选择性突变优化，「it remains infeasibly expensive to compute the absolute mutation score for the codebase at any given fixed point」。
3. **分数不可行动**：同一篇说这个分数「is neither concrete nor actionable, and it does not guide testing」，所以他们**不把分数当门禁**，而是把**单个存活突变体**作为 code review 评论发出来（ICSE-SEIP 2018：有用率从 20% 提到 80%；TSE 2021：productive 比例从 80% 提到 89%）。单个突变体带文件/行号/diff，能直接指导「该补哪条断言」——这正是本仓库 `mutation:check` 输出存活清单的形态。
4. **固定阈值的实践问题**：固定阈值会被跟测试无关的变化误报——删死代码分数涨、加新模块分数跌，最后必然被关掉。基线棘轮只盯「有没有变差」，不追「分数够不够好看」，作为**防回退下限**更稳。

   注：上面 4 点里，1–3 有 Google 两篇论文作一手依据；第 4 点的「棘轮优于固定阈值」是**工程实践判断，无权威出处**——两篇论文只否定了「拿绝对分数当门禁」，并未给出棘轮方案。本仓库选棘轮是工程决定，不假托引用。

### 5.2 参考档位（成熟度，仅供参考，不是门禁）

下面这组档位是**业界经验档位（非权威标准，无权威出处）**，只用来粗略定位「我们现在大概在什么水平」：

| 阶段 | 参考突变分 |
| --- | ---: |
| 活跃开发 | 60% |
| 稳定库 | 75% |
| 高保障 | 90% |

- 这些是**参考**，用来判断「我们现在大概在什么水平」，**不是**要接线的红线。
- **100% 不值得追**：等价突变体是理论天花板，永远杀不完；把突变分当 KPI 会逼出「为杀而杀」的测试（断言内部实现细节，反而更脆）。
- 本仓库当前全量 **96.58%**（等价项按 §4 分别 disable 或入基线），高于「高保障」档——但这只是现状快照，**不是**要守住的 KPI。门禁是基线棘轮（§3），不是这个档位。

---

## 6. 范围与边界

- **纳入**：`src/core/logic/**/*.ts`，排除纯 re-export 的入口 `src/core/logic/index.ts`。
- **暂不纳入**：`src/core/ai/**`、`tools/**`（实验 / 工具代码，错了不污染对局结果）。
- **`EventBus` 这类管道**的低价值存活不单独追：框架管道噪音确认等价后就地 disable，不靠全局规则排除。
- 突变测试是**测试质量的反馈**，不是团队 KPI，也不是绝对质量指标。

---

## 7. 规则为什么不放在 `.agents/skills/`

- `.agents/skills/` 是**上游技能的副本**（38 个入库，见根 `.gitignore` 注释），按 `AGENTS.md` 的说明，`skills update` 会**整目录覆盖**——写进去的规则活不过一次工具更新。
- 所以规则写在这份 **committed** 的 `docs/MUTATION-TESTING.md`，由 `AGENTS.md` 的 Mutation testing 小节导航。改动进版本库，可 diff、可 review、可追溯。

### 7.1 为什么不立 ADR（决策 7）

`domain-modeling` 建议只在三条门槛**全中**时才立 ADR：**难以逆转 + 反直觉 + 真实权衡**。本决定（基线棘轮、不设全局固定阈值、规则放 committed 文档）里「难以逆转」不成立——它只是本仓库的本地工程约定，改回固定阈值或换门禁形态的成本很低（改一个脚本 + 重刷基线），也不与任何外部契约绑定。门槛缺一即跳过 ADR，故本决定不单立 ADR，决策与理由就记在本文件（§3、§5）。

---

## 8. runner 补丁（升级 / 降级必须复核）

### 8.1 问题

`@stryker-mutator/vitest-runner@10.0.0` + `vitest@5.x` 下，**非 static 突变体的判定全部不可信**：

- runner 用**空格**连接套件链，构造 `testNamePattern`；而 Vitest 5 用 **`' > '`** 连接。
- 结果：过滤不中任何用例、实际执行 **0 个测试**，突变体被一律误报为 `Survived`（报告里 `testsCompleted: 0`）。
- 只有 static 突变体（不套名字过滤）判定正确。
- 上游 issue：[stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210)。

### 8.2 本仓库的修法

- 补丁文件：`patches/@stryker-mutator+vitest-runner+10.0.0.patch`（**已入库**）。
- 生效方式：`package.json` 的 `postinstall` 设为 `patch-package`（`patch-package` 在 `devDependencies`），`npm install` / `npm ci` 后自动打补丁。
- 补丁内容：把两处 `collectTestName` 的 `nameParts.join(' ')` 改成 `nameParts.join(' > ')`：
  - `dist/src/test-helpers.js`（`vitest-test-runner.js` **经 `vitest-helpers.js` 间接**引用它来构造 test id / `testNamePattern`）；
  - `dist/src/stryker-setup.js`（沙箱内收集 per-test 覆盖）。
  - 两者必须一致，否则覆盖 id 与过滤 pattern 对不上。

### 8.3 与上游 #6214 的区别

上游修复 PR [#6214](https://github.com/stryker-mutator/stryker-js/pull/6214) 的做法是**按 Vitest 版本选择分隔符**并注入 `testNameSeparator`；本补丁是**版本无关的硬编码 `' > '`**。两者达到同样效果，但实现方式不同——本补丁在降级 Vitest 时不会自动适配（见下）。

### 8.4 ⚠️ 维护告警

**以下任一情况都必须重新生成 / 复核补丁：**

- **升级 `@stryker-mutator/vitest-runner`**：新版本若已含 #6214，应删除本补丁并移除 `postinstall`；若仍含该 bug，需对新 dist 重新生成 patch（`npx patch-package @stryker-mutator/vitest-runner`）。否则 `postinstall` 会因 patch 上下文不匹配而失败。
- **降级 `vitest` 到 4.x**：Vitest 4.x 用的是**空格**分隔符，硬编码 `' > '` 会**反向失效**——runner 与 Vitest 的分隔符再次对不上，突变体重新误报存活。降级前必须先确认版本对应的分隔符，再决定是否保留 / 改写补丁。

---

## 9. `linked` 安装布局（声明式包边界的安装前提）

`.npmrc` 的 `install-strategy=linked`（见 `docs/HLD.md` §4.2）把依赖放进 `node_modules/.store` 下的 per-package `node_modules`，而不是平铺到根。它动了三处与突变测试/包边界相关的解析与加载，**改动 `.npmrc` 时必须复核**：

- **插件加载**：Stryker 默认按 `@stryker-mutator/*` 从 **core 自己所在目录**枚举插件；`linked` 下那里只有 core 自己的依赖，找不到作为根 devDependency 的 vitest-runner。`stryker.config.json` 用 `appendPlugins: ["./scripts/stryker-vitest-plugin.mjs"]` 补一条稳定路径；该 wrapper 从仓库根解析裸包名再把插件的导出原样再导出，不写死 vitest-runner 内部的 `dist/src/index.js`。
- **沙箱内的模块身份**：Stryker 沙箱把 `node_modules` 目录**符号链接**回真实仓库，于是 `tools/` 里的 `@guiyuan/game/…` 会解析到**真实仓库的 `src/`**，而测试用相对路径 `../../src/…` 解析到**沙箱自己的 `src/`**——同一份源码出现两个模块实例。后果不只是 `toBe` 身份断言假红（曾见于 `tests/core/candidate-search.test.ts`），更严重的是被 mutate 的沙箱源码与 tools 实际加载的源码不是同一份，突变信号失真。`vitest.stryker.config.ts` 用 `resolve.alias` 把 `@guiyuan/game` 钉回**运行目录**（沙箱根）的 `src/`。
- **包边界自检**：`npm run check:boundary`（已进 `check:quick`）断言「从 `src/` 解析不到 `@guiyuan/devtools`」这条机制仍成立。`linked` 一旦失效（npm 默认布局变回 hoisted、或有人手写 `--install-strategy=hoisted`），它会立刻判红，不会静默。
- 前两处都只影响 Stryker 路径；`npm test` 仍走真实的 `node_modules` 解析（`vitest.config.ts` 不加别名），这样包边界在常规测试里也真的被走一遍。

---

## 10. 命令与产物参考

| 命令 | 作用 | 退出码 |
| --- | --- | --- |
| `npm run mutation` | 全量突变测试（`mutate` 全部目标） | Stryker 自身（无 `thresholds`，存活不改退出码） |
| `npm run mutation:milestone` | 里程碑全量 + 棘轮（= `mutation` → `mutation:check`） | 棘轮无新增 `0` / 有新增 `1` / 报告来自子集跑 `2` |
| `npm run mutation:changed [-- <ref>]` | 只对相对 `<ref>`（默认 `HEAD`）改动的逻辑文件 | 无改动文件 → `0`；否则透传 Stryker |
| `npm run mutation:baseline` | 从报告生成 / 刷新基线 `mutation-baseline.jsonl`（只接受全量报告） | 缺报告 / 结构无效 / 非全量跑 → `2` |
| `npm run mutation:check` | 报告与基线对比，只报基线之外的存活/无覆盖 | 无新增 `0` / 有新增 `1` / 缺报告、缺基线或报告来自子集跑 `2` |

产物：

- `artifacts/mutation/mutation.json` —— Stryker JSON 报告（**gitignore，不入库**）。
- `mutation-baseline.jsonl` —— 基线（**入库**）。
- 控制台 `clear-text` —— 存活明细（文件 / 行号 / 突变类型 / diff）。

配置：`stryker.config.json`（`mutate`、`reporters`、`jsonReporter`、`timeoutMS`、`appendPlugins`；`coverageAnalysis: "off"` 字段名不副实、实际不生效，见 §2.1）、`vitest.stryker.config.ts`（Stryker 专用 Vitest 配置，含 `resolve.alias`，见 §9）。

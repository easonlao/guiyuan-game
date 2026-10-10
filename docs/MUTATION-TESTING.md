# 变异测试 (Mutation Testing)

**一句话**：Stryker 往 `src/core/logic/**` 里注入小 bug（突变体），跑一遍 Vitest，看测试抓不抓得住。抓不住的是「存活突变体」，指向测试缺口。本仓库的门禁是**基线棘轮**——只对基线里没有的存活/无覆盖报警，**不设全局固定分数阈值**。

这份文档是变异测试的唯一规则来源。它被 gitignore 之外的路径引用（`AGENTS.md` 一行指针 + `docs/TEST_PLAN.md` §3），改动会被提交，活得过工具更新。

---

## 快速上手

| 场景 | 命令 |
| --- | --- |
| 改完核心逻辑（`implement` 收尾） | `npm run mutation:changed` → `npm run mutation:check` |
| 里程碑全量（每个 spec 收尾 / 发版 / 提审前） | `npm run mutation` → `npm run mutation:check` |
| 只跑相对某个 ref 的改动 | `npm run mutation:changed -- HEAD~1`（默认 `HEAD`，含未提交改动） |
| 确认等价突变体后接受进基线 | `npm run mutation:baseline` |

- **门禁红**的定义：`npm run mutation:check` 报出「基线之外的存活/无覆盖突变体」，退出码 `1`。
- 报告产物：`reports/mutation/mutation.json`（`reports/` 已 gitignore，不入库）。存活明细同时打到控制台（`clear-text`，含文件 / 行号 / 变异类型 / `- / +` diff）。
- 基线文件：`mutation-baseline.jsonl`（**入库**、JSONL、可 diff）。

---

## 1. 为什么在这里做变异测试

测试全绿不等于测试有用。这个仓库是 AI 主导开发的，代码和测试由同一个 agent 写，最典型的失效模式就是「测试看起来绿了，但没断言到行为」。覆盖率抓不到这个——跑过一行不等于断言了它的结果。变异测试直接针对它：改坏了代码，测试还过，就是缺口。

## 2. 两条路径：什么时候跑

### 2.1 改动处跑（`implement` 收尾用）

- **命令**：`npm run mutation:changed`，默认对比 `HEAD`（含未提交改动），只对 `src/core/logic/**` 里改动的 `.ts` 文件跑（排除纯 re-export 的 `src/core/logic/index.ts`）。
- **时机**：`implement` 收尾。反馈最紧——刚写的代码、刚写的测试，改动小、跑得快，能当场把漏掉的断言补上。补测试本来就属于 `implement` 的职责，所以变异收敛到这一步，而不是留到事后。
- **为什么不用全量**：全量一次约 33 分钟（1085 个突变体 / 6 个文件），不适合每次改动都跑。
- **无改动文件时**：退出 `0`（合法状态，不是失败）。

### 2.2 里程碑全量（每个 spec 收尾 + 发版/提审前）

- **命令**：`npm run mutation`，跑 `stryker.config.json` 里 `mutate` 的全部目标。
- **时机**：
  1. **每个 spec 收尾**——跨多个 `implement` 的累积效果在这里体检，防止「每次改动都过、合起来漏了」。
  2. **发版 / 提审前**——对外交付前的最后一道体检。
- 全量后跑 `npm run mutation:check`，把结果和基线比一次。

### 2.3 为什么门禁必须落在「本地/agent 循环」

本仓库没有 CI，也没有 pre-commit hook。所以门禁的「红」没有流水线兜底，唯一消费者是跑它的那个 agent。`mutation:check` 自己算退出码（仓库刻意不配 `thresholds.break`，Stryker 不会因存活而失败），这条必须在 agent 内循环里成立。

---

## 3. 门禁：基线棘轮（不是全局固定阈值）

### 3.1 机制

- 仓库里存一份基线 `mutation-baseline.jsonl`，记录**当前全部**「未被测试抓住」的突变体（`status ∈ {Survived, NoCoverage}`）。
- 每行一条 JSON：`{file, line, column, mutatorName, replacement}`，按 `file → line → column → mutatorName → replacement` 稳定排序。
- 跑完变异后，`npm run mutation:check` 拿报告和基线对比，**只报告基线里没有的**存活/无覆盖。
- 有新增 → 退出 `1`；无新增 → 退出 `0`；缺报告或缺基线 → 退出 `2`。
- 身份键是 `{file, mutatorName, line, column, replacement}`，**不是** Stryker 的 `mutants[].id`（那个只在单次报告内唯一）。

棘轮的对象是 `Survived` **和** `NoCoverage` 两者：「故意加一段没被测到的行为」产出的是 `NoCoverage`，只盯 `Survived` 会漏。

### 3.2 更新基线的纪律

确认某个存活是**等价突变体**（见 §4）后，用 `npm run mutation:baseline` 重新生成基线。基线是入库文本，更新后 `git diff` 里新增/删除的行就是「新出现 / 消失」的存活，可 review。

- **不要**为了让门禁变绿而无脑重刷基线——那等于把门禁关掉。只有「确认等价」或「有意识接受一个新缺口」才更新。
- 基线收缩（删掉已杀死的条目）是好信号，会在 diff 里体现。

### 3.3 现状快照（截至 2026-10-10）

- 基线规模：**223 条** = Survived 122 + NoCoverage 101（6 个被变异文件）。
- 全量变异分 **79.45%**，分文件：ActionCandidates 98.98 / ActionResolver 80.39 / EventBus 72.34 / ScoreCalculator 83.16 / State 91.62 / TurnManager 63.70。
- 这个分数**不是门禁**，只是当前状态的一个快照，会随代码变化浮动。

---

## 4. 等价突变体：就地 disable，不做全局排除

有些突变体和原代码**行为完全等价**（例如某个比较在边界上永远走同一分支、某些常量替换被后续逻辑吸收），测试再怎么补也杀不掉它。处理办法：

- **就地**加 `// Stryker disable next-line <Mutator>` 注释，**并写清为什么等价**。
- 只对**已确认等价**的突变体这么做，不要因为「懒得补测试」而 disable。
- **不做全局排除规则**（不在 `stryker.config.json` 里加 `mutator.excludedMutations`）。原因：本仓库的计分表本身就是一堆数字常量，禁掉字面量突变（`StringLiteral` / 数值替换）等于把**最该测的东西**排除掉。全局规则会随一次误判永久生效，就地注释则带上下文、可 review。

示例（语法，非本仓库现有内容）：

```ts
// Stryker disable next-line ConditionalExpression: 该分支两侧在定义域上等价，不可区分
if (score >= 0) { /* ... */ }
```

---

## 5. 为什么不设全局固定阈值（附来源）

**结论：全库绝对变异分不可行、不可行动，所以不拿它当门禁。**

### 5.1 Google 的做法（一手依据）

- Goran Petrović, Marko Ivanković, *State of Mutation Testing at Google*, ICSE-SEIP 2018（ACM，DOI [10.1145/3183519.3183521](https://doi.org/10.1145/3183519.3183521)）。
- Goran Petrović, Marko Ivanković, Gordon Fraser, René Just, *Practical Mutation Testing at Scale: A view from Google*, IEEE TSE 48(10), 2022（在线 2021-08，DOI [10.1109/TSE.2021.3107634](https://doi.org/10.1109/TSE.2021.3107634)）。

要点：

1. **只对改动的行跑**（diff-based / changelist 级别）。两篇论文的核心设计都是「变异测试在 code review 时，只对本次改动且被覆盖的行生成突变体」——和本仓库 `mutation:changed` 的思路一致。
2. **全库绝对分不可行**：TSE 2021 原文说，即使有各种选择性变异优化，「it remains infeasibly expensive to compute the absolute mutation score for the codebase at any given fixed point」。
3. **分数不可行动**：同一篇说这个分数「is neither concrete nor actionable, and it does not guide testing」，所以他们**不把分数当门禁**，而是把**单个存活突变体**作为 code review 评论发出来（ICSE-SEIP 2018：有用率从 20% 提到 80%；TSE 2021：productive 比例从 80% 提到 89%）。单个突变体带文件/行号/diff，能直接指导「该补哪条断言」——这正是本仓库 `mutation:check` 输出存活清单的形态。
4. **固定阈值的实践问题**：固定阈值会被跟测试无关的变化误报——删死代码分数涨、加新模块分数跌，最后必然被关掉。基线棘轮只盯「有没有变差」，不追「分数够不够好看」，作为**防回退下限**更稳。

   注：上面 4 点里，1–3 有 Google 两篇论文作一手依据；第 4 点的「棘轮优于固定阈值」是**工程实践判断，无权威出处**——两篇论文只否定了「拿绝对分数当门禁」，并未给出棘轮方案。本仓库选棘轮是工程决定，不假托引用。

### 5.2 参考档位（成熟度，仅供参考，不是门禁）

下面这组档位是**业界经验档位（非权威标准，无权威出处）**，只用来粗略定位「我们现在大概在什么水平」：

| 阶段 | 参考变异分 |
| --- | ---: |
| 活跃开发 | 60% |
| 稳定库 | 75% |
| 高保障 | 90% |

- 这些是**参考**，用来判断「我们现在大概在什么水平」，**不是**要接线的红线。
- **100% 不值得追**：等价突变体是理论天花板，永远杀不完；把变异分当 KPI 会逼出「为杀而杀」的测试（断言内部实现细节，反而更脆）。
- 本仓库当前全量 79.45%，落在「稳定库」与「高保障」之间，属于合理区间。

---

## 6. 范围与边界

- **纳入**：`src/core/logic/**/*.ts`，排除纯 re-export 的入口 `src/core/logic/index.ts`。
- **暂不纳入**：`src/core/ai/**`、`src/core/headless/**`（实验 / 工具代码，错了不污染对局结果）。
- **`EventBus` 这类管道**的低价值存活进基线后不再追（`EventBus` 当前 72.34%，其存活多是框架管道噪音）。
- 变异测试是**测试质量的反馈**，不是团队 KPI，也不是绝对质量指标。

---

## 7. 规则为什么不放在 `.pi/skills/`

- `.pi/skills/` 被 **gitignore**（见仓库根 `.gitignore` 的 `.pi/`），而且按 `AGENTS.md` 的说明，该目录**会被更新覆盖**——写进去的规则活不过一次工具更新。
- 所以规则写在这份 **committed** 的 `docs/MUTATION-TESTING.md`，由 `AGENTS.md` 放一行指针导航。改动进版本库，可 diff、可 review、可追溯。

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

## 9. 命令与产物参考

| 命令 | 作用 | 退出码 |
| --- | --- | --- |
| `npm run mutation` | 全量变异（`mutate` 全部目标） | Stryker 自身（无 `thresholds`，存活不改退出码） |
| `npm run mutation:changed [-- <ref>]` | 只变异相对 `<ref>`（默认 `HEAD`）改动的逻辑文件 | 无改动文件 → `0`；否则透传 Stryker |
| `npm run mutation:baseline` | 从报告生成 / 刷新基线 `mutation-baseline.jsonl` | 缺报告 → `2` |
| `npm run mutation:check` | 报告与基线对比，只报基线之外的存活/无覆盖 | 无新增 `0` / 有新增 `1` / 缺报告或缺基线 `2` |

产物：

- `reports/mutation/mutation.json` —— Stryker JSON 报告（**gitignore，不入库**）。
- `mutation-baseline.jsonl` —— 基线（**入库**）。
- 控制台 `clear-text` —— 存活明细（文件 / 行号 / 变异类型 / diff）。

配置：`stryker.config.json`（`mutate`、`reporters`、`coverageAnalysis: "off"`）、`vitest.stryker.config.ts`（Stryker 专用 Vitest 配置）。

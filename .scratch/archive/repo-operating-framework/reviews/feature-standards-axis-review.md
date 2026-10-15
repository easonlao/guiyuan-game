# 仓库治理骨架（repo-operating-framework）— Standards 轴 feature 级复核

被审对象：`579cc16..HEAD`（23 提交）的**最终态**，不审机械噪声（`fbb45e5` 全仓格式化、23 个测试文件改引用、`legacy/` 删除）。范围：`AGENTS.md`、`CONTRIBUTING.md`、`docs/HLD.md`、`docs/MUTATION-TESTING.md`、`docs/DEVELOPMENT.md`、`docs/adr/0012-0014`、`.oxlintrc.json`、`.oxfmtrc.json`、`.dependency-cruiser.js`、`.gitignore`、`.npmrc`、`.githooks/commit-msg`、`package.json` scripts、`.github/workflows/*`、`scripts/*.mjs`。

方法与证据：结论全部来自最终态文件 + 本机实测；被审工作未改——`git status --porcelain` 在本轮开始时为空，结束时除本复核报告与后台 memory 插件自己写入的 `.scratch/hindsight-survey/`（与本 feature 无关）外无任何变更。实测：`npm run fmt:check` 退 0（95 文件，`minigame/game.js` 被 `.oxfmtrc.json:3` 的 `ignorePatterns` 排除——单独 `npx oxfmt --check minigame/game.js` 退 2「全被忽略」证实排除生效）；`npm run check:quick` 退 0（46 模块 / 129 依赖）；`npm run check:artifact` 退 0。解析本机全量报告 `artifacts/mutation/mutation.json`（mtime 2026-10-11 10:39）：1073 突变体 / 993 计分 / Killed 954 / Timeout 5 / Survived 34 / NoCoverage 0 / Ignored 80 → 96.58%。引入者归属用 `git blame` + `git merge-base --is-ancestor` 判定，凡「本 feature 之前已存在」的都在条目里注明。

结论：**硬违规 4 条（A1–A4，其中 3 条是文档声称的事实与实际不符）、跨文档单一事实源 3 组（C1–C3，C1 价值最高）、判断项 7 条（B1–B7）**。工具链本身（lint 真会红、分档构成、depcruise 规则实名、产物逐字节对账、CI 只调命名脚本、`actions/*@v7` 存在）均复核为真，见末节。

---

## (c) 跨文档单一事实源（最高价值的检查）

### C1（最高价值）变异节奏有三个家，其中一个自称唯一来源

- **标准**：`AGENTS.md:5`（每个事实只有一个家）+ `AGENTS.md:15`（「发现冲突就修矛盾的一方（删除或改指针），**不要两边各留一份**」）+ `docs/MUTATION-TESTING.md:5`（「这份文档是变异测试的**唯一规则来源**」）。
- **同一事实的三处正文**：
  - 真源：`docs/MUTATION-TESTING.md:29-31`（改动处 = `implement` 收尾）、`:37-40`（里程碑全量 = 每个 spec 收尾 + 发版 / 提审前）。
  - `docs/HLD.md:114`：「**流程定位**：两条路径。**改动处**（`npm run mutation:changed`）在 `implement` 收尾跑…**全量 + 棘轮**（`npm run mutation:milestone`）在每个 spec 收尾、发版 / 提审前跑…节奏、门禁口径与理由见 `docs/MUTATION-TESTING.md`（唯一规则来源）。」——**同一句里既复述节奏又指认真源**。
  - `AGENTS.md:79`：「…**由 agent 在每个 spec 收尾时跑**（也用于发版 / 提审前）。改动处变异（`npm run mutation:changed`）由 CI 快链自动跑，只是观察项、不做门禁。」
- **判定**：HLD 表（`AGENTS.md:12`）把「CI、工程侧开放项」归 HLD，所以 HLD 有权写「哪条变异命令挂在 CI 的哪一档」；但「改动处 = implement 收尾 / 全量 = spec 收尾 + 发版」是**节奏规则**，归 MUTATION-TESTING。HLD 该处只留指针即可（它已经在同一句里写了指针），现在属「两边各留一份」。`AGENTS.md:79` 有**部分豁免**：ADR 0012 决定 4（`docs/adr/0012-…md:20`）明确要求把**触发责任**写进 `AGENTS.md`；但同一句后半的「由 CI 快链自动跑、只是观察项」是 HLD §4.5（`docs/HLD.md:129`）的工程事实，不在豁免内。
- **附带自相矛盾**：`docs/MUTATION-TESTING.md:161` 说「由 `AGENTS.md` 放**一行指针**导航」，实际 `AGENTS.md:79` 是一整段复述。
- **引入者**：`docs/HLD.md:114` 由 `f1d6857`（09 票复核跟进）写入、`AGENTS.md:79` 由 `9dd7982`（05 票）写入，**两者都在本 feature 内**。09 票自己的记录（`issues/09-…md`「复核后修」）写明这次改写是「节奏与门禁口径指向 MUTATION-TESTING（唯一规则来源）」——正是这次改写把复述留了下来。

### C2 模块职责与 Layer 3 目标架构：HLD §2 与 `docs/DEVELOPMENT.md` 各一份，且 DEVELOPMENT 与 README 都声称后者管模块职责

- **标准**：`AGENTS.md:23`（「`docs/DEVELOPMENT.md` **只给代码入口路径，模块职责归 HLD**」）+ `AGENTS.md:12`（HLD 拥有架构）+ `AGENTS.md:22`（报告类「只做证据与导航，不定义规则」）。
- **同一事实的两处正文**：
  - `docs/HLD.md:28-32`：`State` / `ActionResolver` / `ScoreCalculator` / `TurnManager` / `Strategy & ActionEvaluator` 各一句职责；`docs/HLD.md:47-52`：Layer 3「实现状态 + 目标架构 + ADR 0005 + 在办 spec」。
  - `docs/DEVELOPMENT.md:7-16`：同一批模块的职责（`TurnManager`「回合生命周期驱动器」、`ActionResolver`「纯函数动作解析器…」等）；`docs/DEVELOPMENT.md:34-36`：同一段「实现状态 + `engine/`/`views/`/`GameScene.ts` 是目标架构，依据 ADR-0005 与 `.scratch/minigame-view-upgrade`」。
- **额外冲突**：`docs/DEVELOPMENT.md:3`（「本文只提供代码入口**和模块职责**」）与 `README.md:65`（「[开发导航](docs/DEVELOPMENT.md)：主要代码流程**与模块职责**」）**都在正文里把模块职责判给 DEVELOPMENT.md**，与 `AGENTS.md:23` 直接相反。
- **引入者**：这一组文本全部早于 `579cc16`（blame：`AGENTS.md:23`=`579cc16`、`DEVELOPMENT.md:3`=`a7c986c6`、`:5`=`0a7d7575`、`:34`=`0678ae68`、`README.md:65`=`a7c986c6`）。但 09 票自称「目录约定与文档对账」且**改过** `docs/DEVELOPMENT.md`（`:42`）与 `AGENTS.md`，这组既没删正文也没改指针——属**最终态仍存在**的跨文档重复，非本 feature 引入。

### C3 验收分档的「意图」在 HLD §4.4 与 CONTRIBUTING §5 各一份

- **标准**：`AGENTS.md:57` 自己划的归属——「构成以 `package.json` 为真源，**分档意图见 `docs/HLD.md` §4.4，工作流步骤见 `CONTRIBUTING.md` §5**」。
- **重复**：`docs/HLD.md:120-121`（「给 AI 内循环用，秒级返回，只做静态检查；**不含**测试与构建」/「四段 = 快速检查 → 类型检查 → 测试 → 产物对账」）vs `CONTRIBUTING.md:78-79`（「改一处跑一次，秒级返回，不含测试与构建」/「收尾时跑这一条，绿了才算做完」）。按 AGENTS 的划法，§5 该只留步骤与指针，**分档理由**归 HLD §4.4。
- **同族一条（一并判断）**：`CONTRIBUTING.md:15` 复述 `docs/HLD.md:66-70` 的包边界事实（`tools/` 只能用包名且必须在 `tools/package.json` 声明、`src/` 解析不到 `@guiyuan/devtools`）。这条**可接受**——它是给贡献者的规则，工程机制在 HLD §4.2；列在此处只为说明「正文复述 + 指针并存」是同一类写法。
- **引入者**：`CONTRIBUTING.md:78` 与 `docs/HLD.md:120` 由 `d3e2321`（04 票）写入，都在本 feature 内。09 票的跟进（`f1d6857`）已删掉 §5 里更硬的那句「前三项在 `check:quick` 内」，但把两档的**性质描述**留下了。

---

## (a) 违反成文规范（硬）

### A1 `CONTRIBUTING.md:19` 声称「提交将被拒绝」，仓库里没有任何机制会拒绝

- **原文**：「以上门禁均由命名脚本执行（见 §5）；任一门禁报红，**提交将被拒绝**。」
- **事实**：仓库唯一的 git hook 是 `.githooks/commit-msg`（`ls .githooks/` 只有这一个文件；`git config core.hooksPath` = `.githooks`；`package.json:16-17` 的 `setup:hooks` 只设 hooksPath）。没有 `pre-commit` / `pre-push`；`.github/workflows/fast.yml:21-22` 在 push **之后**跑，Actions 无法拒绝一次 push。所以 `lint` / `check:deps` / `check:boundary` 报红**不会**阻止 `git commit`。同文件 `CONTRIBUTING.md:60` 自己把 `commit-msg` 描述为只管 trailer 那一道，与此句口径不一。
- **引入者**：原句在 `579cc16` 已存在（「若依赖探测工具…提交将被拒绝」），本 feature 的 `f1d6857` 改写了这句并**保留**「提交将被拒绝」，同时新增的 `.githooks` 只拦 trailer——即最终态的「声明」比「实现」更宽，收尾时未收敛（blame：`CONTRIBUTING.md:19` = `f1d6857`，在范围内）。

### A2 `docs/MUTATION-TESTING.md:159` 指向的 `.gitignore` 条目已不存在

- **原文**：「`.pi/skills/` 被 **gitignore**（见仓库根 `.gitignore` 的 **`.pi/`**）」。
- **事实**：`.gitignore:40` 是 `.pi/skills/`；`.pi/` 整目录那条在 `579cc16` 的 `.gitignore:19`，已被本 feature 的 01 票收窄（`docs/agents/issue-tracker.md:39` 解释了为什么不能整目录排除）。声明本身（`.pi/skills/` 被忽略）仍成立，**失效的是括号里的指针**。
- **引入者**：这句早于 `579cc16`（blame `5327235a`），但 01 票改了 `.gitignore` 却没同步它——属本 feature 遗留的失效指针。

### A3 `docs/SRS.md:4` 与 `docs/SRS.md:22` 就「无头诊断平台在哪」互相矛盾

- `docs/SRS.md:4`：「**基准实现：** `src/core/`（TS 确定性规则库 **+ 无头诊断平台**）…」
- `docs/SRS.md:22`：「无头仿真与诊断平台…**已实现于 `tools/`**。」
- 后者对（06 票把 `src/core/headless/` 整块搬到 `tools/`，见 `docs/HLD.md:53-59`），前者是迁移后的残留。**本 feature 改过这一行**（`2e07c3d`，11 票：只把 `legacy/` 那句改成「已删除」），没顺手修同一行里的路径归属。

### A4 `docs/SRS.md:80` 的强制手段指针指向一个拦不住它的地方

- **原文**：「核心逻辑库（`src/core/`）**严禁**导入任何 DOM、BOM、Canvas、CSS 或具体游戏引擎 API（**CI 强制手段见 `docs/HLD.md` §4.2**）。」
- **事实**：`docs/HLD.md:105`（§4.2 流程定位）讲的是 dependency-cruiser 的两条分区规则（`src/` 不得依赖 `src/` 之外的本地模块、不得 import Node 内建模块），**不覆盖 DOM / BOM / Canvas / CSS / 引擎 API**；真正执行「`window` / `document` / `cc`」的是 `.oxlintrc.json:7-28`，其范围也只这三个。这正是 spec 现状诊断里那条「承诺了它做不到的事」（`spec.md:36`），CONTRIBUTING §1 在本 feature 已改成准确表述（`CONTRIBUTING.md:13` + `:17`），**SRS §4.1 同一类缺陷未同步**。
- **引入者**：`docs/SRS.md:80` 早于 `579cc16`（blame `579cc16`），本 feature 未改；列为「同类缺陷未收口」。

---

## (b) 判断项与基线 smell

1. **B1 快照数字漂移（判断项，与最后一个提交同主题）**：`docs/MUTATION-TESTING.md:82` 写「**Killed 957 / Timeout 2**」，本机最新全量报告（`artifacts/mutation/mutation.json`，mtime 2026-10-11 10:39）是 **Killed 954 / Timeout 5**；总分与 96.58% 完全一致。该文自己 `:89`（§3.4，标题 `:86`）声明这个拆分随负载翻转、对门禁无影响——那么把它写成精确数字就是同一类「会漂的精确值」，而 `623cfbf`（HEAD）刚专门去掉了会漂的「33 分钟」。建议只留「Killed+Timeout 合计 959」或定性表述。
2. **B2 基线文件格式描述与文件不符（判断项，低）**：`docs/MUTATION-TESTING.md:59`「每行一条 JSON」，而 `mutation-baseline.jsonl:1-4` 是 4 行 `#` 注释（共 38 行 = 4 注释 + 34 条 JSON，与 `:81` 的「34 条」一致；读取侧 `scripts/lib/mutation-baseline-core.mjs:149-155` 显式跳过空行与 `#`）。一句「允许 `#` 注释行」即可对齐。
3. **B3 `AGENTS.md:19`「表外还有**两类**文档」下挂三个 bullet（判断项，pre-existing）**：真源类（`:21`）/ 报告类（`:22`）/ 入口类（`:23`）；且 `docs/DEVELOPMENT.md` 同时被 `:22` 与 `:23` 归入两个类别。blame 显示与 `579cc16` 相同（pre-existing），但与 C2 是同一个根因（DEVELOPMENT.md 的定位没定死）。
4. **B4 永久文件里指向本 feature 票面的路径（判断项，低）**：`.npmrc:5` 指向 `.scratch/repo-operating-framework/issues/07-package-boundary.md`、`.githooks/commit-msg:7` 指向「spec 的 02 号票」。`AGENTS.md:46` 规定完成的 feature 归档到 `.scratch/archive/<feature>/`，归档即断链。指针应指向 `docs/HLD.md` §4.2 / `CONTRIBUTING.md` §3 这类稳定落点。
5. **B5 `.dependency-cruiser.js:21` 的 comment 比规则宽（判断项，pre-existing）**：comment 写「Layer 1 核心逻辑层禁止反向依赖 Layer 2 适配层**或外部运行时**」，而该规则的 `to` 只有 `^src/adapters`（`:26-28`）；「外部运行时」实际由 `:51` 的 `game-side-not-to-node-builtins` 与 oxlint 分工覆盖。属 spec 诊断的「承诺做不到的事」的同类残留，本 feature 未改（blame `71e94f96`）。
6. **B6 任务状态词表漂移（判断项；Mysterious Name / 词表无家）**：本 feature 11 张票里 `issues/06-…md:7` 与 `issues/07-…md:7` 用 `**Status:** done`，其余 9 张用 `closed`；全仓 4 个同义词并存（`closed` 47 / `done` 9 / `completed` 8 / `resolved` 6）。`docs/agents/triage-labels.md:5-9` 只定义 5 个 triage label，`docs/agents/issue-tracker.md:10` 却把它当状态词表指过去——**完成态的词表没有家**，机器扫描（如按 `Status` 统计）会得到四套结果。
7. **B7 workflow yaml 注释复述规则正文（判断项，低）**：`.github/workflows/fast.yml:13-15` 复述「观察项不能当门禁 + 子集报告做不了棘轮对比」（`docs/MUTATION-TESTING.md:36`、`:47`），`mutation-milestone.yml:5-7` 复述触发责任（`AGENTS.md:79`）。配置注释带本地上下文是合理的，但与 C1 同源，建议留一句指针 + 一句「为什么在这里」。

---

## 已核实为真（不作为发现，附证据）

- `CONTRIBUTING.md:13` 的「由 `npm run lint` 真正执行」成立：`.oxlintrc.json:5` 的 `src/core/**/*.ts` + `package.json:22` 的 lint 目录清单；`check:quick` 串 lint（`package.json:18`）→ `verify`（`:19`）→ `fast.yml:54`。
- `CONTRIBUTING.md:17` 的指针与 `docs/HLD.md:105` 实名一致，规则真源 `.dependency-cruiser.js:30` / `:51` 存在且 `check:deps` 退 0（46 模块 / 129 依赖）。
- 分档构成与 `package.json:18-19` 一致（`check:quick` 不含测试与构建；`verify` 四段）；`AGENTS.md:57`、`docs/HLD.md:116-125`、`CONTRIBUTING.md:78-81` 三处的脚本名都能解析到真实脚本。
- 包边界陈述为真：`src/package.json:2` = `@guiyuan/game`、`tools/package.json:2` = `@guiyuan/devtools` + `:8` 声明 `@guiyuan/game`；`tsconfig.json:7` = `nodenext`；`check:boundary` 实测退 0。
- ADR 0014 的两处引用**不是编造**：参考仓库 `docs/adr/0007-runtime-bundle-artifact-is-committed.md` 确实记过「产物落点不得在任何 `dist/` 下」（其 Consequences 第 3 条）。「不借第三方契约类比」说的是**入库理由**，与 后果 里引它记 dist/ 坑是两件事，不构成矛盾。
- ADR 0012 遵守「ADR 只留决策与理由」：`docs/adr/0012-…md:23` 明确把「哪个 workflow / 权限 / 基线 ref 怎么取」交回 `docs/HLD.md` §4.5。
- `docs/MUTATION-TESTING.md:81` 的「34 条」与 `mutation-baseline.jsonl` 的 34 条 JSON 一致；`:82` 的「54 行 `// Stryker disable next-line`」实测 54 行；`:82` 的 1073 / 993 / 80 / 96.58% 与本机报告一致；`stryker.config.json:22-25` 的 `mutate` 与 `:23` 的描述一致。
- 补丁链与 §8.2 描述一致：`patches/@stryker-mutator+vitest-runner+10.0.0.patch:9-10,:22-23` 两处 `join(' > ')`；`package.json:15` 的 `postinstall`。
- 三条 workflow 都只调命名脚本（`fast.yml:54,:82`、`mutation-milestone.yml:44`），权限只读，无凭证引用；`actions/checkout@v7` / `actions/setup-node@v7` / `actions/upload-artifact@v7` 的主版本 tag 存在（GitHub API 实测 latest：checkout v7.0.1 / setup-node v7.1.0 / upload-artifact v7.0.2）。
- `tools/` 迁移的文档侧指针已改对：`docs/DEVELOPMENT.md:18-19`、`docs/headless/*.md`、`docs/archive/*.md` 全部指向 `tools/`，全仓无残留 `src/core/headless` 引用（除 ADR 0013 描述搬运本身）；`docs/FSR.md:10,50` 与 `docs/SRS.md:4,24,101` 的 `legacy/` 指代已改成「已删除」或带勘误（`docs/SRS.md:22,86` 的 `tools/` 路径也对，唯 `:4` 那处归属漏改，见 A3）。
- `.gitignore` 每条规则都带理由（符合其 `:1-5` 自述）；`.pi/mcp.json`、`.pi/subagents.json` 确在库（`git ls-files .pi`），与 `docs/agents/issue-tracker.md:39` 一致。
- `package.json` 的 `benchmark:*` 目标文件全部存在（`tools/HeadlessBenchmark.ts`、`ExperimentRunner.ts`、`AtkMarginalReturn.ts`、`ActionValueCensusCli.ts`、`CandidateValidationCli.ts`、`DynamicSwitching.ts`）；`docs/HLD.md:53-59` 的工具清单与 `tools/` 目录对得上。
- `.oxfmtrc.json` 的 `ignorePatterns` 确实生效（95 = 96 个追踪 JS/TS 文件 − `minigame/game.js`），无遗漏门禁文件。

## 与 Spec 轴的重叠

未发现与 Spec 轴结论重叠的条目；B6（状态词表）可能同时被 Spec 轴从「票面完成度」角度提出，若两轴都报，以 Spec 轴的口径为准，此处只作词表证据。

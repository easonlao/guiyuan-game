# 归元弈 (Guiyuan) - 贡献与代码规范指南 (Contributing & Style Guide)

欢迎参与《归元弈》的开发！本项目采用了 **AI-First** 架构，这意味着绝大多数的代码将由人类与 AI Agent 协同编写。

为了保障代码库在高速迭代和高频重构下依然保持工业级整洁，请无论是**人类**还是 **AI 代理**，都必须严格遵守以下规范。

---

## 1. 架构边界红线 (Architecture Boundaries)

在 `HLD.md` 和 `LLD.md` 中，我们确立了分层架构与纯数据驱动。
**核心纪律：**
* **Layer 1 (核心逻辑层 `src/core/*`) 不得引用引擎库或浏览器全局**（`cc`、`window`、`document`）。这条由 `npm run lint` 真正执行：`.oxlintrc.json` 对 `src/core/**` 开了 `no-restricted-globals`（拦 `window` / `document` 全局引用）与 `no-restricted-imports`（拦 `cc` 导入）；规则真源以该配置文件为准。
* **Layer 1 必须保持纯粹（Pure）**：所有动作解析 (`ActionResolver`) 必须是**纯函数**。任何依赖随机数的地方（如天干生成），必须通过传入 Seed 或 RandomGenerator 的方式注入，确保 100% 可重现。
* **跨区引用走包名，且先声明**：`src/`（包 `@guiyuan/game`）与 `tools/`（包 `@guiyuan/devtools`）是两块独立的包。`tools/` 只能用 `@guiyuan/game/…` 引用核心，并在 `tools/package.json` 里声明；`src/` 不得引用 `@guiyuan/devtools`——没声明，类型检查期就解析不到。机制与安装布局前提见 `docs/HLD.md` §4.2。

**依赖方向**由 `dependency-cruiser`（`npm run check:deps`）拦；规则真源为根目录 `.dependency-cruiser.js`，工程方案见 `docs/HLD.md` §4.2。

以上门禁均由命名脚本执行（见 §5）：本地由 agent 在提交前跑。CI 只做兜底——它在 push 到 main 之后重跑同一条 `npm run verify`，红了只能靠下一次提交修；拦截靠交付前的本地验收（见 §6）。仓库没有 `pre-commit` hook，`git commit` 本身不拦这些检查（唯一的 hook 是 §3 的 `commit-msg`）。

---

## 2. 编码风格 (Coding Style)

本项目采用严格的 TypeScript 规范，并通过极速工具链进行保障。

### 2.1 命名规范
* **类名、接口名、类型别名**：使用大驼峰 `PascalCase`（如 `ActionResolver`, `GameState`, `NodeData`）。
* **变量、函数、参数名**：使用小驼峰 `camelCase`（如 `executeAction`, `p1Nodes`, `currentPlayerId`）。
* **常量、枚举值**：使用全大写加下划线 `UPPER_SNAKE_CASE`（如 `MAX_ROUNDS`, `ActionType.BURST_ATK`）。
* **布尔值**：必须以 `is`, `has`, `can`, `should` 等开头（如 `isGameFinished`, `hasEnoughEnergy`）。

### 2.2 工具链与静态检查 (Toolchain)
* **oxlint / oxc**：我们使用 `oxlint` 进行极速的代码静态检查。代码在提交前必须无 Error。禁止滥用 `// @ts-ignore`。
* **oxfmt**：统一格式化，消除 diff 里的风格噪声。`npm run fmt` 就地修复，`npm run fmt:check` 作门禁；配置见根目录 `.oxfmtrc.json`。
* **TypeScript 严格模式**：必须保持 `"strict": true`，禁止隐式的 `any` 类型。

---

## 3. Git 提交规范 (Conventional Commits)

所有的 Git Commit Message 必须遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/) 规范。

**格式：** `<type>[optional scope]: <description>`

**允许的 Type：**
* `feat`: 增加新功能或新逻辑
* `fix`: 修复 Bug
* `refactor`: 重构代码（不改变功能，仅优化内部实现）
* `test`: 新增或修改测试用例（如 Vitest 或 Headless Match 脚本）
* `docs`: 文档变更（修改 MD 文件、注释等）
* `style`: 纯格式化，不改变语义（如 `npm run fmt` 的结果）
* `chore`: 构建过程或辅助工具的变动（如更新 npm 依赖）

**示例：**
* `feat(core): implement BURST_ATK action resolver`
* `test(headless): add deterministic matches for Phase 1`
* `docs(lld): update state management paradigm to immutable`

**禁止 `Co-Authored-By` trailer：** 提交信息里不得出现 `Co-Authored-By`（任意大小写）。GitHub 会把 trailer 里的邮箱算作 contributor，于是仓库页面多出并非本项目作者的贡献者。`.githooks/commit-msg` 负责拦这道：默认剥离该行并警告后放行，`COMMIT_MSG_MODE=fail` 则判红中止。

新克隆装上门禁：`npm install` 会自动装（`prepare`），也可显式跑 `npm run setup:hooks`。

---

## 4. 给 AI Agent 的特别指引 (AI Agent Guidelines)

当 AI 代理（如 Executor, Reviewer）在执行任务时，必须：
1. **先看契约，再写代码**：在编写 `src/core/` 下的代码前，先读取 `src/core/types/domain.ts`（类型定义真源）与 `docs/LLD.md`（字段语义与契约约定）。
2. **纯数据优先**：不要使用 ES6 Class 实例去封装 `State` 属性，`State` 只能是 `readonly` 的 Interface 对象。
3. **Test-Driven (TDD)**：每实现一个功能或修复，必须同步在 `*.test.ts` 中补充覆盖该分支的用例，并通过红绿循环验证。

## 5. 开发流程闭环

0. **环境**：Node 用 `.nvmrc` 的版本（`nvm use`），npm 版本见 `package.json#packageManager`。`npm install` 在 Node 版本不符时判红（`engines` + `.npmrc` 的 `engine-strict`）。
1. **领取任务**：阅读对应的 Issue 或 `.scratch/` 里的 Markdown 规范。
2. **脱水开发**：在纯 TS 环境下实现功能并跑通 `npm test`（内部调用 Vitest）。
3. **内循环检查**：`npm run check:quick`——改一处跑一次。
4. **收尾验收**：`npm run verify`——收尾时跑这一条。
5. **提交代码**：按照上述 Git 规范 `git commit`。
6. **表现层打包**：`npm run build:minigame`（`scripts/build-minigame.mjs`）把 `src/minigame/` 打成 IIFE 产物 `minigame/game.js`；在微信开发者工具中导入 `minigame/` 目录做真机预览。产物**入库**：改了 `src/` 后要重跑并把新产物一并提交，`npm run verify` 的产物对账会拦住忘记重建（见 ADR 0014）。

---

## 6. 分支与交付 (Branch and Delivery)

本节管「改动怎么从工作区走到 main」。提交信息的格式见 §3，本节不重复。

### 6.1 三层颗粒度：票不是提交

| 层 | 单位 | 数量关系 | 进 main 吗 | 验证档 |
| --- | --- | --- | --- | --- |
| ① 票内本地提交 | 进度点 | 1 票 → N 个提交 | 不进，squash 掉 | 局部：`npm run check:quick` + 本票相关测试 |
| ② 票级提交 | 一张票 | 1 票 → 1 个提交（带票号） | 不进，活在 spec 分支 | 局部检查 + 切片集成验证 |
| ③ 交付提交 | 一个切片 | 1 切片 → 1 个提交 | **只有这层进 main** | 逐提交 `npm run verify` |

**交付切片**：在已声明的前置切片基础上，可以完整验证、可以作为一个单位回退的最小行为变更。

**票拆细，交付提交做粗。** 拆细票是为了让 agent 在聪明区工作；把交付提交按切片归组，是为了让回退单位清楚。两者服务不同目的。一票单独能验证时才是 1:1；多票一片时 main 上只有 1 个提交。

**回退与 `git bisect` 的精度 = 切片。** 回退一片会连带撤掉该片全部票。`git bisect` 定位到片后，需在片内自行缩小范围。

### 6.2 分支与 worktree

- `spec/<slug>` 从**最新的 main** 分出，配独立 worktree。它只做集成，不直接出交付物。
- `ticket/<spec>/<编号>` 从该 spec 分出，配独立 worktree。不同票的 worktree 可以并行。
- worktree 落点固定在 `<主 checkout>/.worktrees/<ticket>`，由 `npm run check:worktrees` 断言。
- **每个新 worktree 都要跑一次 `npm ci`。** `node_modules` 不进版本库，也不跨 worktree 共享。不装的话 `npm run verify` 会在包边界那一段判红（`tools/` 解析不到 `@guiyuan/…`），看起来像代码问题，实际是没装依赖。第一次跑这套流程就撞上了。
- **同一时间只有一个协调代理写集成分支。** 票的产出先交协调代理，不直接进 spec。

### 6.3 回 main 的路径

1. **票 → spec**：协调代理把最新 spec 合入该票，解冲突，跑局部检查；然后把这票 **squash 成 spec 上 1 个带票号的提交**。这一步是唯一的 squash 点，不要留到进 main 时做。
2. **切片验证**：一个切片的票全部集成后，在 spec 上做该切片的完整行为验证，记录结果与当时的 spec tip。
3. **交付整理**：所有 agent 停止写入后，协调代理选定一个 main 提交，把 spec 同步到它、解冲突、保留快照；然后在交付分支上去掉同步 merge，**按切片依赖顺序**归组票据提交，整理到该 main 提交之上。
   **同步要分两种情况**：spec 基点仍是那个 main 提交时（即 main 未前进）无需同步，直接整理；main 已前进时先 `merge` 再继续第 4–5 步。（2026-10-25 首次跑时是前者。）
4. **逐提交验证**：用 `git rebase --exec` 覆盖基点之后**每个交付提交，包括最后一个**。每个提交跑 **`npm run verify`**（它含 `check:quick`、类型检查、全部测试、产物对账；约 40 秒，比漏检便宜）。失败立即停止，记录实际运行结果。
5. **快照比较**：第 3 步的快照与交付分支最终文件树必须逐字节一致；有差异先查原因。main 再次前进时，更新基点与快照，重跑第 3–5 步。
6. **合入 main**：合入前把改动范围、提交列表、验证结果告诉需求方。以 **fast-forward** 合入，合入后核对 main 与交付分支一致。
7. **收尾**：核对分支实际 tip 与交付清单一致；逐项检查 worktree 里未提交、未跟踪、被忽略的文件（尤其本地配置）的走向；确认后删 ticket 分支、worktree 和已完成的 spec 分支。

**收尾删分支用内容判据，不用 `git branch -d`。** squash 与 rebase 都改了哈希，ticket 与 spec 分支按「是否 main 的祖先」判，**永远算未合并**，`git branch -d` 会拒绝。删前用下面两条比内容，**满足任一条即可删**：

**判据一：整树相等。** 分支的树与快照（或交付树）逐字节相等，即内容已全部并入 main。

```bash
# 三者应当输出同一个 tree hash
git rev-parse <分支>^{tree} <快照>^{tree} main^{tree}
```

**判据二：本分支改过的文件与 main 逐文件一致。** 只比这个分支真正动过的文件：

```bash
# 列出本分支相对基点的改动文件，再与 main 逐个比
base=$(git merge-base main <分支>)
git diff --stat main..<分支> -- $(git diff --name-only "$base"..<分支>)
# 输出为空（或只差本分支之外的更新版本）即可删
```

**树相等只是「一票一片、整片交付」时的特例。** 多票并行时，每张 ticket 分支只含自己那一片的改动，它的整树天然不等于 main——但它的每一个文件都已进了 main。这时只能用判据二。（2026-10-25 首次碰到：三个并行子代理的 ticket 分支，其中一个分支只差一行—— main 上那份比它还新。）

**不要为了跳过 `git branch -d` 的拒绝改用 `-D`**——那会失去唯一的安全网。`-d` 拒绝不是 bug，是它用的判据不适配 squash + rebase。

**删完跑 `git gc --prune=now`，再跑 `npm run check:delivery`。** squash、rebase 与 amend 都会弃掉旧提交，这些垃圾只能靠 gc 清。清完不可达提交归零，`check:delivery` 的断言③ 才能干净通过（否则它会把上一轮交付的旧版本报成孤儿）。

gc **不可恢复**，所以要保存的东西必须先打 tag：tag 就是「gc 不该回收」的豁免名单。例如 `archive/ccc3886-frontend-full-experience` 保存了一整条没合并的前端工作。交付收尾的完整顺序：

```bash
# 1. ff 合入并核对
 git merge --ff-only delivery/<slug>
# 2. 删 worktree 与分支（先用判据一或判据二的任一条比内容，见上）
# 3. 清瞬态垃圾
 git gc --prune=now
# 4. 门禁
 npm run check:delivery
```

**整理阶段不新增测试。** 整理只搬历史，不改行为。要靠补测试才能变绿，说明该票没做完，回到第 1 步。

**交付提交的 body 写四要素**：切片名 + 该片全部票号 + 该片的关键取舍（含被否决的做法及原因）+ 验证命令。`.scratch/` 里的票面会被清理，body 是唯一跟着代码走的地方。

**回退一个切片，用 `git revert`，不用 `git reset`。** §6 的立身之本是 main 的历史不改写；`reset` 加 force-push 会重写 main 上的提交，所有 clone 与 fork 从此分叉。**回退的粒度是交付提交**：一个切片在 main 上就是一个提交，`git revert <交付提交>` 撤掉整片。

**依赖它的后续切片一并回退，从后往前。** 切片依赖关系见 §6.1；撤掉一片会让依赖它的片悬空，所以按依赖顺序倒着撤。

**回退后必须重跑 `npm run verify`。** 回退动到 `src/core/logic/**` 时，按 `docs/MUTATION-TESTING.md` §3.2 重跑全量突变并刷基线。

**回退本身也是一个交付提交。** body 写清撤了哪一片、为什么、影响了哪些后续切片，走正常交付路径（`npm run ship`）。

### 6.4 快速通道

同时满足三条时，改动**直接提交到 main**，仍跑 `npm run verify`：

1. 改动路径全部在 `docs/`、`.scratch/` 或根目录 `*.md` 之内；
2. 不动依赖（`package.json` / `package-lock.json`）；
3. 改动文件 ≤ 3 个。

白名单**排除** `scripts/`、`.github/`、`tests/`、`src/`：这四处改错会静默降低门禁强度。

判断由提交者做。判据是路径前缀与文件数，不是「改动很小」。

**`scripts/` 的改动默认走常规通道。** 只有同时满足下面四条时，才可以走快速通道直接提交：

1. **只清 lint 警告或格式**，不碰行为、不碰门禁的判据阈值；
2. **改动范围限于被清掉的那个警告**，不顺手改旁边的代码；
3. 提交信息里附**改前与改后的输出逐字节比对**，证明行为未变——比的是该脚本自己的输出，或 `npm run lint` 的输出；
4. 它仍受快速通道的三条前提约束（路径、依赖、文件数）。

例子（允许）：`new Set([...xs])` → `new Set(xs)`，并附 `check:slices` 改动前后输出完全相同。

例子（不允许）：顺手删一个没人用的分支、把字符串拼成模板量、替一个 `??` 为 `||`——它们看上去像清理，但改的是行为或可读判断，走常规通道。

**为什么要留这条窄口径**：一条清不掉的长期警告会变成背景噪声，下次真警告来了没人看得出。代价是证据必须带上——「改前改后一致」是这条通道唯一的安全网，没附就不算数。

### 6.5 产物与切片重排

`minigame/game.js` 是入库产物，`npm run verify` 末段做逐字节对账。所以每重排一个交付提交，按这个顺序做：

```bash
# 解冲突后：
npm run build:minigame
git commit --amend --no-edit
npm run verify
```

产物与源码必须同提交。这样每个交付提交自己就能过 `verify`——这是第 4 步 `rebase --exec` 的前提。

### 6.6 验证档与执行者

| 档 | 命令 | 什么时候跑 |
| --- | --- | --- |
| 内循环 | `npm run check:quick` | 改一处跑一次 |
| 收尾 | `npm run verify` | 每个交付提交、以及所有本地收尾 |
| spec 收尾全量 | `npm run mutation:milestone` | 全量突变 + 棘轮对比，由 agent 在本地跑（ADR 0012） |

执行者：

- **协调代理**执行 §6.2–§6.3 的全部步骤。
- **agent** 在每个交付提交上跑 `npm run verify`。
- **脚本**断言不变量，共五项，不需要人工核对：
  - `check:worktrees`（`check:quick`）：worktree 落点与 `.gitignore` 遮罩。
  - `check:slices`（`check:quick`）：`Slice:` 归属一致、票据与切片依赖无环。
  - `check:refs`（`check:quick`）：长期文档里的本地路径引用零死链。
  - `check:facts`（`check:quick`）：环境基线、CI 配置、ADR 命名、术语表、技能锁、突变基线结构等 12 条不变式。
  - `check:delivery`（按需，交付整理时跑）：main 线性、快照一致、无内容未并入 main 的孤儿提交、worktree 清账。
  `check:delivery` 不在 `check:quick` 也不在 `verify`——前者的语义是「每轮编辑都跑」，后者是「每个提交都得绿」，交付断言只在整理那一刻成立。用法：`npm run check:delivery -- --base <rev> --snapshot <rev> --tip <rev> --worktrees <n>`。
- **CI** 只做兜底：push 到 main 后重跑 `npm run verify`。突变测试不在 CI。

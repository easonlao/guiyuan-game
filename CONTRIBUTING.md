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
- **同一时间只有一个协调代理写集成分支。** 票的产出先交协调代理，不直接进 spec。

### 6.3 回 main 的路径

1. **票 → spec**：协调代理把最新 spec 合入该票，解冲突，跑局部检查；然后把这票 **squash 成 spec 上 1 个带票号的提交**。这一步是唯一的 squash 点，不要留到进 main 时做。
2. **切片验证**：一个切片的票全部集成后，在 spec 上做该切片的完整行为验证，记录结果与当时的 spec tip。
3. **交付整理**：所有 agent 停止写入后，协调代理选定一个 main 提交，把 spec 同步到它、解冲突、保留快照；然后在交付分支上去掉同步 merge，**按切片依赖顺序**归组票据提交，整理到该 main 提交之上。
4. **逐提交验证**：用 `git rebase --exec` 覆盖基点之后**每个交付提交，包括最后一个**。每个提交跑 **`npm run verify`**（它含 `check:quick`、类型检查、全部测试、产物对账；约 40 秒，比漏检便宜）。失败立即停止，记录实际运行结果。
5. **快照比较**：第 3 步的快照与交付分支最终文件树必须逐字节一致；有差异先查原因。main 再次前进时，更新基点与快照，重跑第 3–5 步。
6. **合入 main**：合入前把改动范围、提交列表、验证结果告诉需求方。以 **fast-forward** 合入，合入后核对 main 与交付分支一致。
7. **收尾**：核对分支实际 tip 与交付清单一致；逐项检查 worktree 里未提交、未跟踪、被忽略的文件（尤其本地配置）的走向；确认后删 ticket 分支、worktree 和已完成的 spec 分支。

**整理阶段不新增测试。** 整理只搬历史，不改行为。要靠补测试才能变绿，说明该票没做完，回到第 1 步。

**交付提交的 body 写四要素**：切片名 + 该片全部票号 + 该片的关键取舍（含被否决的做法及原因）+ 验证命令。`.scratch/` 里的票面会被清理，body 是唯一跟着代码走的地方。

### 6.4 快速通道

同时满足三条时，改动**直接提交到 main**，仍跑 `npm run verify`：

1. 改动路径全部在 `docs/`、`.scratch/` 或根目录 `*.md` 之内；
2. 不动依赖（`package.json` / `package-lock.json`）；
3. 改动文件 ≤ 3 个。

白名单**排除** `scripts/`、`.github/`、`tests/`、`src/`：这四处改错会静默降低门禁强度。

判断由提交者做。判据是路径前缀与文件数，不是「改动很小」。

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
- **脚本**断言不变量：`npm run check:worktrees`（已落地）；main 线性、快照一致、无新增孤儿提交、worktree 清账由 `scripts/check-delivery.mjs` 断言，切片依赖无环由 `scripts/check-slices.mjs` 断言——**这两个脚本尚未落地**（见 `.scratch/delivery-protocol/` 票 03、04），落地前这四类不变量由协调代理人工核对。
- **CI** 只做兜底：push 到 main 后重跑 `npm run verify`。突变测试不在 CI。

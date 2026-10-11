# 01: 版本库边界与任务层规格

**What to build:** 克隆下来就能看到「有哪些任务、做到哪了」，以及每条边界为什么这么划。库里不留临时垃圾和废弃路径的残骸。

**Blocked by:** None (can start immediately)

**Status:** closed

**验收清单：**

- [x] `.scratch/` 进版本库；干净克隆后 `git ls-files .scratch` 非空。证据：`git ls-files .scratch | wc -l` = 109。
- [x] `.gitignore` 重写成一份**有理由的边界清单**：每条规则写清它为什么不在库里，不是只写分类标题。证据：`.gitignore` 每条规则带理由，文件头写明四类判据。
- [x] 不再出现「排除了某个目录、又想反选它里面的文件」的情形。证据：`grep -c '^!' .gitignore` = 0；`.pi/` 改为只排 `.pi/skills/`。
- [x] 删掉模板残留行（Vite / VS / Windows 的默认条目，与本项目无关）。证据：`dist-ssr/`、`yarn-*/pnpm-*/lerna-*` 日志、`*.suo`、`*.ntvs*`、`*.njsproj`、`*.sln`、`*.sw?`、`Thumbs.db`、`.DS_Store` 均已删。
- [x] `.pi/skills/` 排除；`.pi/subagents.json` 与 `.pi/mcp.json` 入库；`.agents/` 整个排除并写明理由。证据：`git ls-files .pi` = `.pi/mcp.json`、`.pi/subagents.json`；`git check-ignore .pi/skills/tdd/SKILL.md` 与 `.agents/skills.json` 均命中。
- [x] 三份 codegraph MCP 配置收敛成一份。证据：`git ls-files | grep mcp` 只剩 `.pi/mcp.json`；根 `.mcp.json` 删除，`.agents/plugins/codegraph/mcp_config.json` 随 `.agents/` 排除。
- [x] 补上 `.stryker-tmp/`；`minigame/project.private.config.json` 出库并进 `.gitignore`。证据：两者 `git check-ignore` 均命中，且后者不再出现在 `git ls-files`。
- [x] 废弃 web 路径的残骸逐项判定归属，每项给出「删 / 留 / 忽略」并说明理由：`vite.config.js`、`@supabase/supabase-js`、`wrangler.toml`、`public/vite.svg`、`.env.example`。证据：见文末「废弃 web 路径残骸的归属判定」，五项均判「删」。
- [x] `docs/agents/issue-tracker.md` 与 `.pi/skills/setup-matt-pocock-skills/issue-tracker-local.md` 一致，且描述的目录形状与 `.scratch/` 实际一致。证据：前者前 30 行与后者逐字节相同（`diff` 无输出）；`.scratch/repo-operating-framework/` 实际为 `spec.md` + `map.md` + `issues/NN-slug.md`，与规格一致。
- [x] 「为什么 `.scratch/` 入库而 `.pi/skills/` 不入库」写进 `docs/agents/issue-tracker.md`。证据：文末新增同名小节。

**已核实的事实**（可直接采信，也可用给出的命令复核）：

- `.scratch/` 体积 **724K**，全是 `.md`，无二进制；扫过 `sk-` / `api_key` / `Bearer` / 机器绝对路径，**无密钥**。两个文件里有机器绝对路径的链接（`.scratch/archive/balance-formalization/spec.md`、`.scratch/archive/phase1/map-phase1.md`），无害，修不修都行。
- `.scratch/` **已经按 tracker 约定组织好了**（`<feature>/spec.md` + `issues/NN-slug.md` + `map.md`，另有 `archive/`）。不需要重整目录结构，本票只解决「进不进库」。
- `.pi/` 下只有 `skills/`、`mcp.json`、`subagents.json` 三样。**没有 `.pi/agents/`**。
- `.agents/` 下只有 `skills.json`、`plugins/codegraph/{plugin.json,mcp_config.json}`；除 `.gitignore` 外全仓库无任何地方引用它——是工具自动注册的，可再生。
- `.env.example` 只写了两个 `VITE_SUPABASE_*` 变量，而 `src` / `tests` / `scripts` / `vite.config.js` 里没有任何地方读 `import.meta.env` 或 `VITE_`。属于废弃 web 路径。
- 复核命令：`git ls-files .scratch | wc -l`、`du -sh .scratch`、`find .pi .agents -type f`、`grep -rn "import.meta.env" src tests scripts`

**实现要点：**

- tracker 协议里 `Resolve` 一步要往 `map.md` 追加决定，产出的是**要持久存在的文件**。`.scratch/` 不入库，整个任务层协议就是空转——写进去的答案下一个 clone 看不到。
- `.pi/skills/` 被更新覆盖（`AGENTS.md` 明写这句），来源与 hash 已由 `skills-lock.json` 记录，所以不该入库。该入库的是 `.pi/subagents.json`（子代理行为配置：并发、深度、工作树隔离等）。
- **整目录排除是坑的来源。** `.pi/` 排除的是目录，而 git 的规则是「父目录被排除时其内文件无法再被包含」，所以 `!.pi/subagents.json` 会被**静默忽略**——不报错，只是不生效。参考仓库的做法是**只排除具体的文件**（它只排 `.pi/subagents-lite.json` 一个），从根上不需要反选。本票照这个做法。
- **`.gitignore` 是边界清单，不是分类清单。** 参考仓库的 36 行几乎每行都写了理由（「观测项产物：每次重算的落盘快照，不入库」），并在注释里指向文档（`hld §3.1`）。本仓库现在只有 `# Build outputs` 这类分类标题。**理由写不出「为什么不进库」的条目，就是该删的条目。**
- **模板残留要清。** 本仓库 39 行里约 10 行是 Vite / VS / Windows 的默认内容（`dist-ssr/`、`yarn-error.log*`、`lerna-debug.log*`、`*.suo`、`*.ntvs*`、`*.njsproj`、`*.sln`、`*.sw?`、`Thumbs.db`、`.DS_Store`），与本项目无关。
- **三份 codegraph MCP 配置在漂移**：`.mcp.json`（已跟踪）写 `directTools: true`；`.pi/mcp.json`（被忽略）写 `exposure: "direct"`；`.agents/plugins/codegraph/mcp_config.json`（被忽略）两个键都没有。同一个事实三个家，本票收敛成一份。
- 判定残骸时先看 `tsconfig.json` 的 `exclude` 与 `stryker.config.json` 的 `ignorePatterns` 里已列了哪些，别把还在生效的当死配置删掉。
- 本 spec 与它的 9 条票就在 `.scratch/repo-operating-framework/`，本票落地时随之入库——这是本票的第一份战利品。

**参考仓库：**

`https://github.com/orionpax1997/model-war`，本地可能在 `/tmp/model-war-*`（clone 会丢，需要时重新 clone）。只看它的 `.gitignore` 与 `docs/agents/issue-tracker.md` 两个文件——本票的做法都从这两处来。**不要**照抄它的目录结构（它是 6 包的 monorepo，判据不同，见 `spec.md` 的决定 1）。

**验证记录：**

复核命令与结果（本票改动后，索引即下一次提交的内容）：

- `.scratch/` 入库且干净：`git ls-files .scratch | wc -l` = 109；`du -sh .scratch` = 728K；`find .scratch -type f ! -name '*.md'` 为空（无二进制）；`sk-` / `api_key` / `Bearer` 扫描无命中。
- 无「已跟踪但被忽略」的文件：`git ls-files -i -c --exclude-standard` 为空。
- 全绿：`npm run typecheck` 通过；`npm test` 39 文件 / 728 用例全绿；`npm run check:deps` 无违规；`npm run lint` 通过。
- 删 `vite.config.js` 后 `vitest` 仍读 `vitest.config.ts`（优先级更高），`npm test` 结果不变，佐证其确为死配置。

**废弃 web 路径残骸的归属判定：**

| 项 | 判定 | 理由 |
|---|---|---|
| `vite.config.js` | 删 | 小游戏构建走 `scripts/build-minigame.mjs`，用 `build({ configFile: false, outDir: 'minigame' })`，不读它；测试走 `vitest.config.ts`，优先级高于 `vite.config.js`。两份都不引用它。 |
| `@supabase/supabase-js` | 删 | `src`/`tests`/`scripts` 无任何 import；ADR-0003 已把 Supabase 云联机判为废弃。从 `package.json` 移除，`package-lock.json` 同步重算（`grep -c supabase package-lock.json` = 0）。 |
| `wrangler.toml` | 删 | Cloudflare Pages 部署配置，正文只提到 Supabase 环境变量；仓库已无 web 部署路径。 |
| `public/vite.svg` | 删 | Vite 模板 logo；构建脚本设 `publicDir: false`，仓库内无引用者。 |
| `.env.example` | 删 | 只声明 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`，而 `grep -rn "import.meta.env" src tests scripts` 无命中。 |

**MCP 配置收敛：** 唯一在库的 codegraph 配置是 `.pi/mcp.json`（pi 的项目级 MCP 配置，`exposure: "direct"` 是 pi 的合法键）。根目录 `.mcp.json` 删除——pi 不读它，且其 `directTools` 键对 pi 无效；`.agents/plugins/codegraph/mcp_config.json` 随 `.agents/` 整目录排除（工具自动注册、可再生）。

**复核后补充（code-review 两轴，固定点 `579cc16`）：**

- **范围外的 `.gitignore` 删除**：除清单列出的模板残留外，还删了 `.claude/`、`.keeper/`、`logs/`、`*.log`、`npm-debug.log*`、`*.local`。判据是票面自己的「理由写不出就不进库」——前两者属本机工具数据（`.keeper/` 全仓无引用且不存在；`.claude/` 仅被 `git-guardrails` 技能当作安装目标提及），后四者属通用日志与 Vite 残留（本项目唯一日志 `stryker.log` 已单独保留，`*.local` 是 Vite 专用）。
- **`.scratch/` 目录形状的历史偏离**（按票面「不重整目录结构」记录，不修）：`.scratch/mutation-honesty-audit.md` 是根下独立审计报告；`.scratch/dead-scoring-code-removal/` 只有 `issues/` 无 `spec.md`；`.scratch/mutation-testing/` 有文档未描述的 `reviews/` 与根下 `00-fix-vitest-runner-separator.md`。另：tracker 文档的 wayfinding 字段（`Type:` / `Status: claimed|resolved`）与现有票写法（`**Status:**` + triage 标签）不一致，属既有偏离，留给 09。
- **`@supabase/supabase-js` 的遗留后果**：`legacy/src/network/supabaseClient.js:10` 仍 import 它。`legacy/` 被 `tsconfig.json` 排除、lint 也不覆盖，是联机协议参考而非可运行代码（spec 的 Out of Scope），故移除依赖不破坏任何受检路径；但 `legacy/` 从此不能独立运行，这是「废弃 web 路径」的应有结果。
- **`dist/` 无当前写入者**：`scripts/build-minigame.mjs` 用 `configFile: false` + `outDir: 'minigame'`；`dist/` 条目作为通用构建产物兜底保留。

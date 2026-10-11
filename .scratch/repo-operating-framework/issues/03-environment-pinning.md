# 03: 环境固化

**Type:** task

**What to build:** 一台新机器按文档装出来的环境与现在一致；代码有统一的格式化，diff 里不混进风格噪声。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `package.json` 声明 Node 版本要求与包管理器版本（现在两者都没有，`.nvmrc` 写了一个没人强制）
- [x] 装上 formatter，并有一条**命名脚本**可检查（不只是「能跑」，是能当门禁用）
- [x] 三份 vitest 配置收敛：`vitest.config.ts` 与 `scripts/run-tests.mjs` 里那份内联到 `/tmp` 的配置合并，`npm test` 读的是仓库里那一份
- [x] 决定 `scripts/run-tests.mjs` 的 `/tmp` 符号链接机制**留还是删**，并说明理由
- [x] `docs/HLD.md` §4.1 对 oxc 的描述与实际一致（要么落地格式化，要么把「标准化格式化」那句收回）

**实现要点：**

- 现状：`engines` / `packageManager` / `fmt` / `build` 四个字段全部 `undefined`。
- **没有 formatter**，而 `docs/HLD.md` §4.1 已经白纸黑字说 oxc「承担…标准化格式化」。文档承诺了一个不存在的工具——这正是本仓库「每个事实只有一个家」规则要修的东西。
- 三份配置里，根目录 `vitest.config.ts` 是**死的**：`npm test` 走 `scripts/run-tests.mjs`，它自己往 `/tmp/vitest.config.mjs` 写一份内容几乎相同的配置。另一份 `vitest.stryker.config.ts` 被 `stryker.config.json` 引用，是活的。
- 合并时以 `run-tests.mjs` 里那份的实际行为为准（它带 `include: ['tests/core/**/*.test.ts']`、`environment: 'node'`、`globals: true`），别只看根目录那份就以为等价。
- `/tmp` 符号链接机制是为了在只读沙箱环境下给 Vitest 准备可写临时目录。删之前先确认当前环境还需不需要。

## Answer

实现：

- `package.json` 加 `packageManager: "npm@11.13.0"` 与 `engines.node: "^24.16.0"`；新增 `.npmrc`（`engine-strict=true`）让 `engines` 真正生效，`.nvmrc`（`24.16.0`）保留为人类精确 pin；`CONTRIBUTING.md` §5 加「环境」一步指向这两处。
- 装 `oxfmt@0.72.0`（devDependency），配置 `.oxfmtrc.json`（`singleQuote: true`，忽略生成的 `minigame/game.js`）。命名脚本 `npm run fmt`（就地写）与 `npm run fmt:check`（只检查、非零退出），匹配全仓代码文件 `"**/*.{ts,mts,cts,js,mjs,cjs}"`（尊重 `.gitignore`，当前 91 个）——不是手写白名单，新顶层目录自动落入。
- 全仓按 oxfmt 格式化一次（76 个文件：73 个源文件 + 3 个根配置文件；纯格式改动，`typecheck` / `lint` / 728 用例均无变化）。
- `scripts/run-tests.mjs` 整体删除，`npm test` 改为 `vitest run`，直接读仓库里的 `vitest.config.ts`。`vitest.stryker.config.ts` 保留（`stryker.config.json` 引用，承载 Stryker 专属的 `hookTimeout` 与 `exclude`，理由见文件头注）。
- `docs/HLD.md` §4.1 改写为「oxlint 检查 + oxfmt 格式化」并点名 `npm run lint` / `npm run fmt:check`；`CONTRIBUTING.md` §2.2 与 §5 同步加格式化一条。

`/tmp` 符号链接机制：**删**。理由：

- 它只为「只读沙箱下 `node_modules/.vite-temp` 不可写」准备。当前环境实测 `node_modules/` 可写：`touch node_modules/.write-test` 成功；把 `node_modules/.vite-temp` 移走后直接 `vitest run --config vitest.config.ts tests/core` 退出 0 并重建该目录。
- 它是配置分裂的根源（往 `/tmp` 写第二份 config）。删掉后 vitest 配置只剩「根目录一份 + Stryker 一份」。
- 若将来沙箱又变只读，症状是 Vitest 明确报错，而不是静默走错配置；届时再决定是改沙箱还是恢复 workaround。

门禁证据：

| 命令 | 结果 |
|---|---|
| `npm run fmt:check`（91 文件全已格式化） | 退出 0 |
| `npm run fmt:check`（放入未格式化探针 `scripts/__fmt_probe.mjs`） | 退出 1，列出该文件 |
| `npm run lint`（oxlint） | 退出 0 |
| `npm run typecheck`（tsc --noEmit） | 退出 0 |
| `npm run check:deps`（depcruise） | 退出 0（46 modules / 130 dependencies） |
| `npm test`（`vitest run`） | 39 文件 / 728 用例全绿 |
| `npm run mutation:check`（全量报告 + 刷过的基线） | 退出 0（34 条存活/无覆盖均在基线内） |

**格式化撞上 Stryker `next-line`（复核发现，已修）**：`// Stryker disable next-line` 禁用的是注释后那个 AST 节点**所在的行**。oxfmt 把 `ActionResolver.ts` 里 11 处超 100 列的目标行（9 个不可达 `return` 对象 + 2 个 `const sourceElement` 赋值）拆成多行，禁用落到错误的行上，目标突变体变成未禁用：全量跑从「Killed 957 / Survived 34 / NoCoverage 0」变成「Killed 954 / Survived 37 / NoCoverage 22」。修法是在这 11 处 Stryker 注释前加 `// oxfmt-ignore` 钉住不换行（`oxfmt` 支持该指令，实测 `// oxfmt-ignore` 后跟 `// Stryker disable next-line` 仍能同时生效）。修后重跑全量，指标恢复为 Killed 957 / Timeout 2 / Survived 34 / NoCoverage 0（与格式化前的文档快照一致）。这条约束已写进 `docs/MUTATION-TESTING.md` §3.1。

**基线刷新**：格式化移动了行号，基线身份键 `{file, mutatorName, line, column, replacement}` 随之失效。全量重跑后 `npm run mutation:baseline` 重生成 `mutation-baseline.jsonl`：条目仍为 34 条，`git diff` 只有 29 处 `line`/`column` 位移，无任何 `file`/`mutatorName`/`replacement` 增删（脚本比对：added=0 / removed=0）。

`engines` 生效证据：临时工程写 `engines.node: "^99.0.0"` + `.npmrc engine-strict=true`，`npm install --dry-run` 退出 1 并打印 `Required: {"node":"^99.0.0"} / Actual: v24.16.0`；本仓 `npm install`（Node 24.16.0 / npm 11.13.0）退出 0。

干净克隆端到端（`git clone` 到 `/tmp`，在票的收尾提交上）：克隆后 `core.hooksPath` 为空 → `npm install` 退出 0（Node 24.16.0 / npm 11.13.0，`engine-strict` 通过），`prepare` 把 `core.hooksPath` 设为 `.githooks`；`scripts/run-tests.mjs` 不存在；`npm run fmt:check` 退出 0（91 文件）、`npm run lint` 退出 0、`npm run typecheck` 退出 0、`npm test` 39 文件 / 728 用例全绿。

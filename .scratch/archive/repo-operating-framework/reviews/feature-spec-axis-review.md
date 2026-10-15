# repo-operating-framework — Spec 轴复核（Reviewer，独立复核）

- 被审范围：`579cc16..HEAD`（HEAD = `623cfbf`），重点审**最终状态**，不逐行审 382 文件的机械改动。
- 复核方式：工作区只读（只跑门禁与探针），所有破坏性探针在 `git clone` 出的 `/tmp/rvf-clone-HSOZ/repo`（同一 HEAD）里做。
- 说明：复核期间工作区出现两个未跟踪文件（`.scratch/hindsight-survey/`、`.scratch/repo-operating-framework/reviews/feature-standards-axis-review.md`），非本次提交内容；`git status` 相对 HEAD 无跟踪文件改动。

## 结论

**六层骨架各有落点，这一条成立；spec 的核心承诺全部兑现，我没有找到能让 feature「不成立」的反例。** 发现 5 条问题，全部是局部/文档级：1 条「验收条款比实际宽」（任务层协议与实际票面不一致，且 01 明确留给 09、09 没接），3 条文档残留（`.github` 里一句已被删掉的耗时数字、根目录 `_headers` 未被判定、`map.md` 的「9 条票」），1 条 pre-existing 的 ADR 命令漂移。无一条影响六层落点或门禁有效性。

## 一、独立复现（不是读票面自述）

干净克隆端到端（`git clone` → `npm ci` → `npm run verify`，同一 HEAD）：

| 项 | 结果 |
|---|---|
| `npm ci` | 退出 0（`npm warn reify The "linked" install strategy is EXPERIMENTAL`；`postinstall` patch-package 应用 `@stryker-mutator/vitest-runner@10.0.0` 补丁）；`prepare` 把 `core.hooksPath` 从空设为 `.githooks` |
| 安装布局 | 根 `node_modules/` 无 `@guiyuan/`；`src/node_modules/@guiyuan/`、`tools/node_modules/@guiyuan/` 各自存在（声明式边界的前提成立） |
| `npm run verify` | 退出 0，11.1s：`fmt:check` 95 文件、`lint` 干净、`check:boundary` 退 0、`check:deps` 46 modules / 129 dependencies / 0 violation、`tsc --noEmit` 干净、39 文件 / 728 用例全绿、`check:artifact` 逐字节一致 |
| `npm run check:quick`（主仓） | 退出 0，1.76s（「秒级」属实） |
| `npm run mutation:check`（主仓） | 退出 0，报告 `artifacts/mutation/mutation.json`（2026-10-11 10:39，全量跑）34 条存活/无覆盖全在基线内——**spec 决定 6 的「spec 收尾由 agent 跑全量 + 棘轮」有实据** |

红/绿探针（全部在克隆里做，做完还原，`git status` 干净）：

| 门禁 | 探针 | 结果 |
|---|---|---|
| `check:boundary` | 在根 `node_modules/@guiyuan/` 建 `devtools -> ../../tools`（模拟 hoisted 布局） | 退出 1，报「src/ 解析到了未声明的 @guiyuan/devtools」；删链接后回 0 |
| `check:deps` | `src/__probe_node.ts`（`node:path`）+ `src/__probe_tools.ts`（`../tools/HeadlessMatch.js`） | 两条规则分别报红（`game-side-not-to-node-builtins` / `game-side-not-to-local-outside-src`）；删除后回 0 |
| `lint` | `src/core/__probe.ts`（`import 'cc'` + `window` + `document`） | 退 1，三条 error；同内容放 `src/adapters/` 退 0（未误伤） |
| `fmt:check` | `src/minigame/__probe.ts` 写未格式化内容 | 退 1 并点名该文件 |
| `check:artifact` | 改 `src/minigame/action-button-formatter.ts` 字面量不重建 | 退 1，报「首个差异在第 66077 字节」；还原后回 0 |
| `check:artifact` | `ARTIFACT_PATH` 改到 `dist/minigame/game.js` | 退 1，落点判定先报红（08 复核修过的「单一真源」确实生效） |
| `.githooks/commit-msg` | 九种输入 × 模式 | strip 剥离并打印、`fail` 退 1、`STRIP`（拼错）退 1、全大写剥离、缩进行原样、只有 trailer 一行退 1、干净信息逐字节不变 |
| 真实提交 | `git commit --allow-empty` 带 trailer | 默认模式落库信息无 trailer（`%(trailers)` 为空）；`COMMIT_MSG_MODE=fail` 时 HEAD 不动；`--no-verify` 可绕过（钩子注释已说明） |

Out of Scope 核对：`git diff 579cc16..HEAD -- docs/GDD.md` 为空；`git rev-list --max-parents=0 HEAD` 仍是最初提交，`%(trailers:key=Co-Authored-By)` 真 trailer 仍 70 条、范围内 0 条（未改写历史）；`workspaces` 仍只有 `src`/`tools`（无第三包）；`tsconfig.json` 无 `composite`/`references`、无 `tsc -b`。决定 8 核对：`.pi/skills/setup-matt-pocock-skills/issue-tracker-local.md` 与 `/tmp/model-war-1791694334/docs/agents/issue-tracker.md` 逐字节相同。

## 二、(a) 未做到 / 只做了一半

1. **任务层协议与实际票面不一致，且 01 明确留给 09、09 没接（唯一有实质影响的一条）。**
   - 票面条款：`.scratch/repo-operating-framework/issues/01-version-control-boundary.md:19`「…且描述的目录形状与 `.scratch/` 实际一致」。
   - 实际：`docs/agents/issue-tracker.md:9-10` 规定「一个 feature 一个目录、spec 是 `.scratch/<feature>/spec.md`」「Triage 状态记为 `Status:` 行」，`:26-30` 规定 `Type:` 行、`Status: claimed|resolved`、答案写 `## Answer`。而全仓 `.scratch/` 里 `## Answer` 标题 **0 个**、`Status: claimed|resolved` **0 处**，实际写法是 `**Status:** closed|done|completed`（如 `issues/01-version-control-boundary.md:7`、`issues/06-partition-core-vs-tools.md:7`）；`.scratch/dead-scoring-code-removal/` 只有 `issues/` 没有 `spec.md`；`.scratch/mutation-honesty-audit.md` 是 `.scratch/` 根下的游离文件。
   - 交接断了：01 的复核补充 `issues/01-version-control-boundary.md:70` 写「tracker 文档的 wayfinding 字段…与现有票写法不一致，属既有偏离，**留给 09**」；但 09 的四条验收（`issues/09-directory-convention-and-doc-reconciliation.md:9-12`）与 map 的 09 决定条目（`map.md` 09 行）都没有这一项。
   - 影响：一个新 agent 照 `docs/agents/issue-tracker.md` 找 `Status: claimed` 会找不到；票 01 的这条 `[x]` 只对 `repo-operating-framework/` 自己成立（它的证据也只举了这一个目录）。`docs/agents/issue-tracker.md` 是照抄参考仓库的「复制题」（spec 决定 8），所以偏差在既有票一侧——但落地状态与票面声称不一致是事实。

2. **`_headers` 是未被判定的废弃 web 残骸。** 票 01 的目标句是「库里不留临时垃圾和**废弃路径的残骸**」（`issues/01-version-control-boundary.md:3`），验收清单只列了 5 项（`:18`）且都判「删」；根目录 `_headers` 是第 6 项同类物——Cloudflare Pages/Netlify 的 HTTP 头配置（`X-Frame-Options`、`/assets/*` 缓存），`grep -rn '_headers'` 全仓零引用，`wrangler.toml` 判「删」的理由（「仓库已无 web 部署路径」）逐字适用。它也不在 `AGENTS.md:51` 的「其余顶层目录」句里（那句只列目录），属归置层的漏网点。

3. **`map.md:33` 的票数已失真**：「定下六层骨架、**9 条票**的切法与 8 条决定」，实际落地 11 条（10、11 是后加的，`map.md` 的票单本身有 11 行）。次要，但这是任务层自己的「做到哪了」。

4. **`tsconfig.json:19-21` 的 `paths: {"@/*": ["src/*"]}` 是死配置**，全仓无 `from '@/` 使用、也没有对应运行时/构建别名。票 01 的「死配置判定」只覆盖 `.gitignore` 相关项，归置层「死配置与产物边界未判定」（spec 现状诊断表）没落到这条。pre-existing，非本 feature 引入。

## 三、(b) 越界 / 计划漂移

1. **spec 的 Out of Scope 被中途反转**：原文把 `legacy/` 列为「删不得」，票 11 整体删除并同步改了 spec（现 spec 的 Out of Scope 已无 legacy 条目，`spec.md` 末尾四行）、map、ADR 0003/0002 勘误。三处都记了反转，最终状态自洽，所以**不算违规**；但要如实说：这是「按已完成的工作回改 spec」，不是「按 spec 约束工作」，且票数从 9 变 11。
2. **08 的构建面重构**（`scripts/lib/minigame-build.mjs`、`check:minigame-artifact.mjs`、`check:boundary`）超出票面字面清单，但票面/ADR 0014 后果段已给出理由（写回侧与核查侧必须共用同一次构建调用），前两轴复核也已覆盖，不另计。
3. 其余无越界：`.oxlintrc.json` 是票 09 明示的两条路径之一；ADR 0012/0013/0014 是决定 7 要求的；`.scratch/` 入库、CI、`mutation:milestone` 均在票面内。

## 四、(c) 看着做到了、但落地有问题

1. **`.github/workflows/mutation-milestone.yml:25` 仍在引用一个已被删掉的数字**：「全量实测约 33 分钟（见 `docs/MUTATION-TESTING.md`）」。HEAD 的最后一个提交 `623cfbf`（「全量耗时改为定性描述——去掉会随负载漂的精确分钟」）把 HLD、MUTATION-TESTING、ADR 0012 里的 33 分钟都改掉了，唯独漏了这个 workflow 注释：`grep -rn '33 分钟' docs/` 无命中，`grep -rn '33 分钟' .github/` 命中这一行。它同时犯了两个错——把刚删掉的负载相关数字又写回来，并把它归给一份不再这么说的文档。
2. **pre-existing、非本 feature 引入**：`docs/adr/0010-reject-low-state-redirect-variant-b.md:15` 仍以现在时点名 `npm run benchmark:ai-preference` / `npm run benchmark:score-lever`，这两个脚本在 package.json 里不存在（随变体 B 否决一并移除）。`docs/headless/low-state-redirect-experiment.md:18,117` 都带了「已随变体 B 否决移除」的括注，只有 ADR 0007/0009/0010 这条没有勘误。按本仓「ADR 现状勘误追加在文末」的规则，这是 09 的对账目标附近但票面没点名的漂移。`npm run oxlint` 在 `docs/adr/0003:25` 出现属正常——同文件 `:51` 有勘误，符合 ADR 追加式规则。

## 五、我试图证伪但没成功的（供后续复核省事）

- 六层落点逐个查过实物：词汇 `GLOSSARY.md`（入库、被 `README.md:33/55` 与 `AGENTS.md` 引用）；任务 `.scratch/`（`git check-ignore` 不命中，114 文件入库，spec/map/11 票/reviews 齐全）；环境 `.nvmrc`+`engines`+`packageManager`+`.npmrc(engine-strict)`+`.oxfmtrc.json`（探针：把 `engines` 改 `^99.0.0` → `npm install --dry-run` 报 `Unsupported engine`）；边界 `.dependency-cruiser.js`（5 条规则，含 06 的两条）+`.oxlintrc.json`+两包+`workspaces`+`.npmrc(linked)`；验收 `check:quick`/`verify`+`.github/workflows/`；归置 `AGENTS.md:33-51` 目录表+`.gitignore`（0 条 `!` 反选、每条带理由、`git ls-files -i -c --exclude-standard` 为空）。
- 后来提交没把先前票的门禁改坏：`package.json` 里没有 `check:lint`/`oxlint`/`stryker` 残留别名；`scripts/run-tests.mjs` 不存在、`npm test` = `vitest run` 读根 `vitest.config.ts`；`lint` 目录清单含 `src/minigame`、`tools`、`scripts`；两档都不含变异；`check:artifact` 是 `verify` 第四段；`check:boundary` 已进 `check:quick`；`src/core/index.ts` 不再导出无头推演，`src/core/headless/` 不存在；`tools/` 无 `../src` 相对引用、全仓相对导入都带 `.js`；`tsconfig` 为 `nodenext`。
- 文档命令对账：把 `README/AGENTS/CONTRIBUTING/docs/**` 里 33 处 `npm run X` 与 `package.json` 的 29 个脚本比对，只有第四节列出的 3 处对不上（ADR 0010 两条 + ADR 0003 历史正文），其余全部存在。
- CI：两个 workflow 用 python yaml 解析通过；`on` 分别为 `pull_request`/`push main` 与 `workflow_dispatch`，无 `schedule`；`run:` 只有 `npm ci`（安装）+ 三条命名脚本；`permissions: contents: read`，无 secrets 引用。
- 产物：`minigame/game.js` 94210 字节、`minify: false`、无 `import.meta`/`require(`（唯二 `node:` 命中是 `EventBus.ts:18` 的事件名 `node:stateChanged`），干净克隆里重建逐字节一致。

## 六、未验证 / 不确定

- **CI 真实 runner 执行**没验（与票 05 的诚实说明一致）：本机只做了 YAML 解析与命令层验证。`actions/checkout@v7`、`actions/setup-node@v7`、`actions/upload-artifact@v7` 这三个大版本我无法核对是否存在于 GitHub；但同环境下参考仓库 `/tmp/model-war-1791694334/.github/workflows/*.yml` 用的是同一组 `@v7`，与本仓一致，未见孤立。
- `.npmrc install-strategy=linked` 被 npm 标为 experimental；本机（Node 24.16.0 / npm 11.13.0，Linux）干净克隆 `npm ci` 通过，未覆盖其他平台/镜像源的失败模式。
- `mutation:milestone` 全量 + 棘轮我没重跑（33 分钟量级）；用现成的全量报告 + `mutation:check` 退 0 作为替代证据。

# 08: 产物边界

**Type:** task

**What to build:** 发出去的包和源码对得上，不会悄悄分叉。

**Blocked by:** 05（对账检查要挂在流水线里才有意义）

**Status:** resolved

- [x] `minigame/game.js` 的入库决定写成 ADR，**理由写真实的那条**
- [x] 加一条对账检查：重新构建后与入库产物逐字节比对，不一致即红
- [x] 对账检查接进验收命令或流水线
- [x] 落点判定写死「**不得落在任何 `dist/` 下**」

**实现要点：**

- **决定是「进库」，理由只有一条，而且比看起来弱**：`docs/DEVELOPMENT.md` 让人在微信开发者工具里导入 `minigame/` 目录，文件在库里就不用每次先构建。省下的是一次命令。
- **不要借参考仓库那个类比。** 它的 `runtime.iife.js` 入库是因为那串字节是**第三方契约**（sha256 写进回放 meta，别人靠它复算历史对局，ADR-0007）。`game.js` 是微信小游戏的 UI 包，没有任何第三方依赖它的确切字节。这不是同一类决定。
- 进库的风险是**源码改了忘了重新构建，工具里看到的还是旧的**。对账检查就是专门杀这个的。参考仓库 ADR-0007 的 Consequences 也说了「产物与源码可以分叉，因此必须有一道门禁盯着」。
- **`dist/` 陷阱**：`.gitignore` 里那条是无锚点的 `dist/`，产物落进**任何层级**的 `dist/` 都会静默消失。参考仓库的 ADR-0007 专门记过这个坑。落点判定要写死，不能只靠 `.gitignore`。
- `scripts/build-minigame.mjs` 现在是 `outDir: 'minigame'`，构建产物可直接 diff（未压缩），这是对账可行的前提，别顺手打开压缩。

## Answer

实现：

- **ADR**：新增 `docs/adr/0014-minigame-artifact-is-committed.md`。理由只写真实的那条（`docs/DEVELOPMENT.md` 让人直接导入 `minigame/` 目录，省一次构建命令），并在「被否决的方案」里**明确拒绝**借参考仓库的第三方契约类比——它的 `runtime.iife.js` 是 sha256 写进回放 meta 的对外契约（model-war ADR-0007），`game.js` 没有任何第三方依赖它的确切字节。另记 `dist/` 陷阱与「产物与源码可以分叉，因此必须有一道门禁盯着」。
- **构建面收拢到一处**：新增 `scripts/lib/minigame-build.mjs`，把 vite 配置与构建调用抽出来，`build:minigame`（写回）与 `check:artifact`（对账）**共用同一次 `buildMiniGameCode()`**。写回侧与核查侧各写一份配置就可能悄悄用上两条不同的构建命令，那正是分叉的入口。`scripts/build-minigame.mjs` 改为薄 CLI，`dev:minigame`（`--watch`）仍由 vite 自己写盘。
- **对账门禁**：新增 `scripts/check-minigame-artifact.mjs`（`npm run check:artifact`）。两段判定：① 落点——`ARTIFACT_PATH.split('/').includes('dist')` 即红，写死在脚本里，不靠 `.gitignore`；② 逐字节——`buildMiniGameCode()` 现打一份与入库产物比对，不一致即红并报出**首个差异的字节位置**。比对走 `write: false`（产物只在内存里），门禁不改工作区。
- **接进验收**：`package.json` 的 `verify` 追加为第四段（`check:quick` → `typecheck` → `test` → `check:artifact`）；`check:artifact` 单列为命名脚本。CI 快链跑 `npm run verify`，因此自动覆盖。
- **产物不压缩**：构建配置保持 `minify: false`，入库的那份在 diff 里可读（ADR 0014 记为「入库这个决定能被人复核」的前提）。
- **重建入库产物**：`minigame/game.js` 此前停在**旧源码**（07 票留的账，见 07 验证记录末条）。本次重建并入库，入库字节 = 现打字节。
- **复核跟进（Standards 轴）**：落点这一个事实原先写在三处（`ARTIFACT_PATH`、产物文件名、`outDir: 'minigame'`）——把 `outDir` 改到 `dist/` 下时，落点判定仍只看常量、照样绿，正是本票要防的洞。现改为 `outDir: dirname(ARTIFACT_PATH)`、`fileName: () => basename(ARTIFACT_PATH)`，落点只有一个家。对账改为 `Buffer.equals` 真逐字节比（原先读 utf8 字符串再比）；`catch` 只吞 `ENOENT`，其余 fs 错误照抛。HLD §4.4「验收入口只有两条命名脚本」改为「验收分两档，每档一条命名脚本」，与新文档化的 `check:artifact` 对齐。
- **复核跟进（Spec 轴）**：构建面重构确是本票的额外改动（票只写「别顺手打开压缩」）——理由记在 ADR 0014 后果（写回侧与核查侧必须共用同一次构建调用，否则两条构建命令会分叉）；重构引入的 `logLevel: 'silent'` 曾把 `dev:minigame` 的监听输出一起静音，现改为门禁侧传 `silent`、`dev:minigame` 保持 vite 默认 `info`。ADR 0014 里误抄的 `.gitignore:5` 行号改为不带行号（长期文档不钉行号）。

红/绿实证：

| 场景 | 改动 | 命令 | 结果 |
|---|---|---|---|
| 基线 | 无 | `npm run check:artifact` | 退出 `0` |
| **源码改了没重建** | 改 `src/minigame/action-button-formatter.ts` 的 `'【吸纳】'` 字面量，不重建 | `npm run check:artifact` | 退出 `1`，报「入库 94210 字节 / 重构建 94211 字节，首个差异在第 66077 字节」 |
| 还原 | 还原源码 | `npm run check:artifact` | 退出 `0` |
| **产物被改** | 往 `minigame/game.js` 追加一个换行 | `npm run check:artifact` | 退出 `1`，报首个差异在第 94210 字节 |
| **落点落进 `dist/`** | 临时把 `ARTIFACT_PATH` 改为 `dist/minigame/game.js` | `npm run check:artifact` | 退出 `1`，报「落在 dist/ 下……进不了版本库」 |
| 还原 | 还原 `ARTIFACT_PATH` | `npm run check:artifact` | 退出 `0` |

- **产物确定性**：连续两次 `npm run build:minigame`，`sha256(minigame/game.js)` 均为 `81f2eee1b088d6f0f130aae9420f12a2291f0abdebb7a4538386eb91e5841b5d`（94210 字节）——逐字节对账的前提。
- **验收**：`npm run verify` 全绿——`fmt:check` 95 文件、`lint` 干净、`check:boundary` 退 0、`check:deps` 46 modules / 129 dependencies / 0 violation、`typecheck` 干净、`npm test` 39 文件 / 728 用例全绿、`check:artifact` 逐字节一致且落点不在任何 `dist/` 下。

未做（有意）：

- **未加「产物不含模块语法」判定**：那是参考仓库 QuickJS 载入期的约束（它的 ADR-0007）；`game.js` 是 IIFE、由微信小游戏环境载入，本票没点这条，不扩范围。
- **未改 `.oxfmtrc.json`**：`minigame/game.js` 早已在 `ignorePatterns` 里，formatter 不会动入库产物（否则对账必红）。

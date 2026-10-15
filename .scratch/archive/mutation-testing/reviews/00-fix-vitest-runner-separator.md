# Review: MT00 修复 vitest-runner testNamePattern 分隔符

- 固定点：`b5ef31e`，被审提交：`5eb92df`
- diff：`git diff b5ef31e...5eb92df`（4 文件：`patches/@stryker-mutator+vitest-runner+10.0.0.patch`、`package.json`、`package-lock.json`、`docs/TEST_PLAN.md`）
- Spec：`.scratch/mutation-testing/issues/00-fix-vitest-runner-separator.md`
- Standards：`CONTRIBUTING.md`、`docs/DEVELOPMENT.md`、`AGENTS.md` + Fowler smell baseline
- 只读复核，未改动被审文件。

## 独立核对（不采信提交信息）

| 核对项 | 方法 | 结果 |
|---|---|---|
| 补丁只改两处 `join(' ')` → `join(' > ')` | `cat patches/...patch` | 仅 2 hunk（`stryker-setup.js:66`、`test-helpers.js:11`），无夹带 |
| patch 头部版本/路径 | 比对 `node_modules/.../package.json` version | `10.0.0` 与文件名一致；路径为 patch-package 标准 `node_modules/...` 布局；`100644` 模式正确 |
| `index` blob 哈希真伪 | `git hash-object --no-filters` | 原文件 `56cc786…`/`aecfacb…`、打后 `2cd9786…`/`bbb824c…` 与补丁 `index` 行逐字节吻合 |
| 对官方 tarball 可复现 | 下载 `@stryker-mutator/vitest-runner@10.0.0` tarball → `git apply -p1` | 干净通过；`diff -r` 打后树 vs 现 node_modules **零差异**（即 node_modules = 原版 + 本补丁，无第三处改动） |
| 幂等性 | 已打补丁的树上再跑 `npx patch-package` | 退出 0，文件哈希不变 |
| 版本守卫 | 读 `node_modules/patch-package/dist/applyPatches.js:157-176` | 安装版本 ≠ 补丁文件名版本时告警；版本不匹配会大声失败而非静默 |
| 语义完整性（id 一致性） | `grep` 全部 dist/src 的 `collectTestName`/`toRawTestId`/`testNamePattern`/`join(` | 全仓仅两处构造套件链：`test-helpers.js:11`、`stryker-setup.js:66`，补后均为 `' > '`。`vitest-helpers.js:3` 从 test-helpers 导入（构造 id 用 `:23`，过滤用 `:60-61` 只按 `#` 切分）；`vitest-test-runner.js:152` 的 `testNamePattern` 由 `fromTestId` 的名字拼出。沙箱侧（stryker-setup 由 `vitest-test-runner.js:11` 以同目录文件拷贝）与 runner 侧一致，无错配 |
| `postinstall` 接线 | 读 `package.json`、lockfile、`grep` 生命周期脚本 | `postinstall: patch-package`（`:7`）+ `patch-package: ^8.0.1`（`:36`）已在 lockfile 中；仓内无其他 pre/post/install/prepare 脚本冲突；无 `npm install`/`ignore-scripts` 调用点 |
| 误动配置 | `git diff b5ef31e...5eb92df -- stryker.config.json vitest.stryker.config.ts` | 空 → `coverageAnalysis: "off"` 与 stryker vitest 配置均未动 |
| `npm test` | 实跑 | 665 passed / 38 files |
| lint / deps | `npm run lint`、`npm run check:deps` | 均干净 |
| 上游事实 | GitHub API `issues/6210`、`pulls/6214`、`npm view` | #6210 open；#6214 open（未合、未发版）；latest 仍 `10.0.0` |

`artifacts/mutation/mutation.json`（补丁后 12:58 生成，4 文件全量）：ActionResolver 362 / ScoreCalculator 95 / TurnManager 292 / ActionCandidates 98，合计 614 Killed、132 Survived、97 NoCoverage、4 Timeout，分 72.49%；**存活突变体中 `testsCompleted == 0` 的个数为 0** —— 修复机制生效的直接证据。

## Standards

硬违规：无。提交信息 `fix(mutation): …` 符合 CONTRIBUTING §3；§5 工具链三项检查全绿。

判断项（smell baseline，均非硬违规）：

1. **`postinstall` 依赖 devDependency**（`package.json:7` 与 `:36`）。被补丁的 runner 与 `patch-package` 同在 `devDependencies`，patch-package 对 dev-only 包的惯例命名是 `*.dev.patch`。若出现 `npm ci --omit=dev` 或 `NODE_ENV=production`，根 `postinstall` 会因 `patch-package` 不可执行而失败（patch-package 自身只在 `NODE_ENV=production` 且补丁名为 `*.patch` 时对缺失 dev 包报错，救不了「二进制不存在」）。本仓无此安装路径（已 grep `omit=dev`/`NODE_ENV`/`--production`，无命中），故低危。
2. **Primitive Obsession / Data Clump**：`' > '` 以裸字面量重复出现在补丁两处（`patch:9`、`patch:22`），上游 #6214 用命名常量 `VITEST_5_TEST_NAME_SEPARATOR` / `LEGACY_TEST_NAME_SEPARATOR`。两处必须永远一致（`docs/TEST_PLAN.md:56` 自己也承认这点），无名字面量把这条不变量交给了读者。受限于「只能改 dist」的媒介，改造成本高，判断项。
3. **Duplicated Code**：`collectTestName` 上游本就存在两份（`test-helpers.js:4`、`stryker-setup.js:59`），补丁必须同改两处。这是上游自带重复，非本次引入，且 test-helpers 的注释已说明不能合并。
4. **版本无关硬编码**：补丁把分隔符写死为 `' > '`，在 Vitest 4.x 下会反向失效（id 用 `' > '`、pattern 按空格匹配）。仓内 `vitest: ^5.0.3` 锁住 5.x，当前安全。

## Spec

验收标准逐条：

- 补丁两文件 + 入库 `patches/`：**达成**（独立核对见上表，对官方 tarball 可复现）。
- `postinstall` + devDependency：**达成**，且重复执行幂等（退出 0）。
- `npm test` 665 用例全绿：**已验证**（665 passed）。
- 存活突变体 `testsCompleted` 不再恒为 0：**佐证成立**（补丁后报告 0 例 `testsCompleted == 0`）。
- `EventBus.ts` 34 杀 / 11 存活 / 2 无覆盖 / 72.34%：**无法复核**。仓内无 EventBus 报告，`stryker.config.json` 的 `mutate` 也不含该文件，说明该数据来自一次性临时配置，无留存证据。72.34% 与「34/(34+11+2)」自洽，且「修复前 45 存活」+ 2 无覆盖 = 47 与修复后 47 个突变体自洽，逻辑上无矛盾，但仍是未验证数字。
- 更新 `docs/TEST_PLAN.md`：**达成**，两处表述不实（下）。

不实点：

- **(a) `docs/TEST_PLAN.md:53` 称「本地用 `patch-package` 落地同一修法」——不准确。** 实测上游 #6214 的 patch（GitHub API `pulls/6214/files`）不是把 `join(' ')` 换成 `join(' > ')`，而是：`test-helpers.ts` 新增 `VITEST_5_TEST_NAME_SEPARATOR`/`LEGACY_TEST_NAME_SEPARATOR` 常量并给 `collectTestName`/`toRawTestId` 加 `separator` 参数；`vitest-test-runner.ts` 新增 `get #testNameSeparator()`，按 `semver.satisfies(vitestWrapper.version, '>=5.0.0')` 选择；`stryker-setup.ts` 与 `vitest-helpers.ts` 通过注入/传参把该分隔符贯穿下去。本补丁是**版本无关的硬编码**版本——在 Vitest 5 上效果等价，但不是同一修法，也不带 #6214 的版本守卫。
- **(b) `docs/TEST_PLAN.md:56` 称「`vitest-test-runner.js` 经它构造 test id」——不精确。** `vitest-test-runner.js:10` 是从 `vitest-helpers.js` 导入 `fromTestId`/`convertTestToTestResult`，由后者（`vitest-helpers.js:3`）再引 `test-helpers.js`；「经它」只在传递意义上成立。
- 附带风险（判断项）：硬编码 `' > '` 使得旧文里「或把 Vitest 降到 4.x」这条备选路径在补丁存在时会**反向静默失效**（Vitest 4 按空格匹配、id 却是 `' > '`），且 `docs/TEST_PLAN.md:58` 的升级告警只覆盖「升级 runner」，未覆盖「降级 Vitest」。`package.json` 的 `^5.0.3` 目前兜住了。

越界：无。4 个文件都在工单点名范围内（`package-lock.json` 是加 devDependency 的必然产物）；`stryker.config.json` 与 `vitest.stryker.config.ts` 未动。

## 复核范围外备注

复核时工作树并非停在 `5eb92df`：`git status` 显示 `M package.json`（新增 `mutation:baseline` / `mutation:check` 两条脚本）与未跟踪的 `scripts/lib/`、`scripts/mutation-baseline.mjs`、`scripts/mutation-check.mjs`，属后续工单的未提交改动。上述结论均基于 `5eb92df` 的提交内容（`git diff b5ef31e...5eb92df`），未受其影响，但复核「当前工作树」时需注意这点。

另：`./.stryker-tmp/`（Oct 6 遗留沙箱目录）既未被跟踪也未在 `.gitignore` 中，属既有仓库卫生问题，非本提交引入。

## 结论

- Standards：0 硬违规，4 项判断项；最严重为 `postinstall` 把根安装生命周期挂在 devDependency 上（生产化安装会失败，本仓当前无此路径）。
- Spec：6 条验收 4 条已验证/佐证、1 条无法复核（EventBus 数字）、1 条达成但含不实表述；最严重为 `docs/TEST_PLAN.md:53` 把版本无关的硬编码补丁称作「同一修法」。

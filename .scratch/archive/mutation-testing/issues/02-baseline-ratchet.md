# 02: 基线棘轮——只对新增存活报警

**What to build:** 仓库里存一份基线，记录当前**全部**存活突变体。跑完变异后自动与基线对比，**只报告基线里没有的存活突变体**，并据此决定退出码；基线可以用命令更新，且更新后的 diff 可读、可 review。

**Blocked by:** 01；`.scratch/dead-scoring-code-removal` 的 01、02（先删死代码，基线才干净）

**Status:** resolved

- [x] 干净检出、`npm test` 全绿后跑全量变异，**不报任何"新增存活"**
- [x] 故意在核心逻辑里加一段没被测到的行为 → 报出新增存活，退出非 0
- [x] 撤销该改动 → 不再报
- [x] 有更新基线的命令；更新后的 diff 能看清"新增/消失"了哪些存活
- [x] 基线是文本、可 diff、入库；HTML 报告等产物不入库
- [x] 基线的对比不依赖 CI（仓库没有 CI，这条必须在本地/agent 内循环里成立）

**备注：** 死代码删除那两条票是本票的硬前置（按 spec 决定 6）。若判断该前置可放宽（先建基线、删完死代码再刷新基线也不会误报），可在动工前把这条阻塞边去掉，但要在票里说明。

**前置状态：** 已满足——死代码删除两条票已落地（`078c240` 删计分死符号、`16ebe25` 删未接线选项旋钮），上游 vitest-runner 分隔符 bug 也已由 `5eb92df` 用 patch-package 修好，变异结果现在可信。阻塞边无需放宽。

**交付提交：** 见本票所在提交。

**实现要点：**

- 基线文件 `mutation-baseline.jsonl`（入库、JSONL、每行一条）。行内字段 `{file, line, column, mutatorName, replacement}`，按 `file → line → column → mutatorName → replacement` 稳定排序；`git diff` 里新增/删除的行即"新出现/消失"的存活。`reports/` 保持 gitignore，不入库。
- 身份键沿用 Stryker IncrementalDiffer 的 `{file, mutatorName, location.start.line, location.start.column, replacement}`（**不用** `mutants[].id`，它只在单次报告内唯一）。
- 棘轮对象为 `status ∈ {Survived, NoCoverage}`——"故意加一段没被测到的行为"产出的是 `NoCoverage`，只盯 `Survived` 会漏。
- `npm run mutation:baseline`：`scripts/mutation-baseline.mjs`，从报告抽键、去重、排序、写基线。
- `npm run mutation:check`：`scripts/mutation-check.mjs`，只打印基线之外的存活/无覆盖，有新增 `exit 1`、无则 `exit 0`；缺报告/缺基线 `exit 2`。退出码由脚本自算（仓库没配 `thresholds.break`，Stryker 不会因存活失败）。
- 共享逻辑在 `scripts/lib/mutation-baseline-core.mjs`，保证生成与对比用同一套键。对"同 file+mutatorName+replacement 但行列变了"的新增给"疑似只是移位"提示（仅当老位置确实从本次报告消失时提示，避免同类替换误报）。

## Answer

1. 干净工作树 + `npm test` 665 全绿后全量变异（`npm run mutation`，33m10s，1085 mutants / 6 files），`npm run mutation:check` → "没有新增存活/无覆盖（基线内 223 条全部命中）"，`exit 0`。
2. 在 `src/core/logic/ActionCandidates.ts` 末尾加一段无测试覆盖的 `__baselineRatchetProbe`，`npx stryker run --mutate src/core/logic/ActionCandidates.ts` 后 `mutation:check` 报出 7 个新增（`ActionCandidates.ts:205:63`、`206:7`×4、`206:18`、`207:12`），`exit 1`。
3. `git checkout -- src/core/logic/ActionCandidates.ts` 撤销后重跑该文件变异，`mutation:check` → 0 新增，`exit 0`。

**基线规模：** 223 条 = Survived 122 + NoCoverage 101（6 个被变异文件）。全量变异分文件分数：ActionCandidates 98.98、ActionResolver 80.39、EventBus 72.34、ScoreCalculator 83.16、State 91.62、TurnManager 63.70（总 79.45%）。

# 03: 统一护栏带的唯一定义 (Unify the Guardrail Band)

**What to build:** 消除护栏带在仓库里的第二份副本，让「护栏带」只有一个定义。

**背景（由工单 01/02 的侦察发现，不在原工单范围内）：** 仓库里有**两处**护栏带，值不同：

| 位置 | 归元率 | 先手胜率 | 状态 |
| --- | --- | --- | --- |
| `tests/core/ai-evaluator-benchmark-guardrails.test.ts:168-173` | `[0.86, 0.95]` → 工单 02 收紧为 `[0.89, 0.95]` | `[0.47, 0.54]` → 工单 02 收紧为 `[0.47, 0.51]` | live 断言 |
| `src/core/headless/CandidateValidation.ts:78-84`（`GUARDRAIL_*`） | `[0.75, 0.95]` | `[0.45, 0.55]` | **工单 06 从未更新** |

`git blame` 显示 `CandidateValidation.ts` 的常量最后一次被改是 `cd78f01`（候选验证命令落地时），工单 06 的 `b8e6cb1` / `fd34b5a` 只动了测试文件。spec 决策 13 要求「复跑并**重设**护栏带——现有带描述的是改动前的现状，不是新游戏的目标值」，这条要求对两个副本同样成立，但只执行了一半。

**后果：** `npm run benchmark:candidate-validation` 用 `[0.75, 0.95]` 判定候选是否满足验收标准 3。下界 0.75 比工单 06 的旧带还松，任何回退都拦不住——**它是工单 02 想解决的问题在另一个入口上的完整复现**。同时 `docs/headless/candidate-search.md:45` 把这条过期带当作工具的现行口径记录着。

**要做的事：** 让两处共用同一个定义，并把值对齐到工单 02 定下的新带。

## 要做的（代码）

1. 让 `GUARDRAIL_*` 常量成为**唯一来源**，`tests/core/ai-evaluator-benchmark-guardrails.test.ts` 改为 import 它们，而不是各自硬编码字面量。这样下一次重设带时不会再只改一处。
   - 若实现上更合适（例如 `tests/` 不应依赖 `src/core/headless/` 的具体模块），可把常量提到一个中立的共享模块再被两处引用；由实现者判断，但**必须消除字面量重复**，而不是再加一条「记得同步」的注释约定。
2. `GUARDRAIL_GUIYUAN_MIN` → `0.89`、`GUARDRAIL_GUIYUAN_MAX` → `0.95`、`GUARDRAIL_P1_WIN_MIN` → `0.47`、`GUARDRAIL_P1_WIN_MAX` → `0.51`（与工单 02 定下的带一致）。
3. 更新常量处的注释：锚点（500 局平衡自对弈、种子 10000、30 大回合 → 归元率 90.40% / 先手 50.40%）、每个界的余量、以及每个界要拦住的回退值（无进度定价时 88.40% / 51.20%）。`CandidateValidation.ts:17` 的文件头注释也写着旧带 `[0.75, 0.95] / [0.45, 0.55]`，要一起改。
4. `docs/headless/candidate-search.md:45` 记录的是工具的现行口径，按新带更新。**不要**改动该文档里记录历史测量结果的段落（例如候选 B/E 在采纳时以旧带判定为「过（88.40%）」）——那是历史事实，不是现行口径。
5. 检查 `tests/core/candidate-validation.test.ts` 里依赖 `GUARDRAIL_*` 的断言（已知 `:167` 用了 `GUARDRAIL_GUIYUAN_MAX`）是否会因下界收紧而改变结论。若某个候选的验收结论翻转，**如实更新断言并在报告里说明**，不要为了让测试变绿而放宽新带。

## 约束

- 只动护栏带的定义与引用它的测试/文档。**不改游戏规则、不改任何计分或结算逻辑、不改 `ATTACK_PROGRESS_SCALE` 的取值。**
- 不要改工单 02 已定的带值（`0.89` 不是 `0.88`——断言是 `>= 下界`，`0.884 >= 0.88` 仍会通过）。
- 数值必须能追溯到锚点与回退实测，不得新造数字。

## 要加的断言

- 一条**防再漂移**的断言：两处带值必须来自同一个常量，或直接断言 live 测试所用的带等于 `GUARDRAIL_*`。断言要能在有人重新硬编码字面量时变红（例如用一个类型/导出约束，或断言测试引用的对象恒等于导出的常量）。

**Blocked by:** 02（工单 02 定下带值后才好对齐；实际实现应在 02 合入集成分支之后开始）

**Status:** resolved

- [x] 护栏带只剩一个定义，live 测试改为引用它，不再硬编码字面量。证据：`e44a882` 新建 `src/core/headless/GuardrailBand.ts` 作为唯一定义，`CandidateValidation.ts` 与 live 测试改为 import；`433caf6` 让 live 测试与 CLI 都用共享常量。**评审后进一步收紧：`864cadf` 让 `GuardrailBand.ts` 导出共享谓词 `checkGuardrailBand(metrics)`，两个消费方都改为调用它，因此消费方里已经不存在任何与数字的比较**——漂移在结构上不再可能，而不只是被断言盯住。
- [x] `GUARDRAIL_*` 对齐到 `[0.89, 0.95]` / `[0.47, 0.51]`，注释写清锚点、余量与要拦住的回退值。证据：`e44a882`，`GuardrailBand.ts` 逐界注释给出锚点（90.40% / 50.40%）、余量（−1.4pp / +4.6pp / −3.4pp / +0.6pp）与要拦住的回退（88.40% / 51.20%）；文件头说明「历史上两份副本值不同」的缺陷与唯一口径。`GUARDRAIL_HEAP_MAX_MB` 一并纳入（live 测试原本也硬编码了 15）。
- [x] `CandidateValidation.ts:17` 文件头注释与 `docs/headless/candidate-search.md:45` 的现行口径更新。证据：`e44a882` 改文件头注释为 `[0.89, 0.95] / [0.47, 0.51]`；`825be4e` 更新 `docs/headless/candidate-search.md:45-48` 的现行口径与 `docs/headless/guardrail-provenance.md`。历史测量段落（候选 B/C/E 当时以旧带判「过」）保留未改，另加一条明确标注的「注（工单 03 / ppf）」说明那是**当时带**的判定。
- [x] 加一条防再漂移的断言，硬编码字面量时会变红。证据：`433caf6` 初版四层断言，其中两层的**源码文本 grep** 被评审判为脆弱（只读两个具名文件，新消费方硬编码会漏；子串匹配 `0.51` 会命中 `0.512`/`0.518`；断言精确源码子串会因重排/改 import 别名而假红）。`864cadf` 删除这两层，改为**行为断言**：锚点指标 → 无违规，回退指标 → 恰好报出 `guiYuanRate.min` 与 `p1WinRate.max`。红探针：把 `GUARDRAIL_GUIYUAN_MIN` 悄悄改回 `0.86`，断言报 `expected [ 'p1WinRate.max' ] to deeply equal [ 'guiYuanRate.min', 'p1WinRate.max' ]`；还原后全绿。
- [x] `tests/core/candidate-validation.test.ts` 受影响断言的结论变化如实记录。证据：`433caf6`。在 `--matches 50 --guardrail-matches 500` 下，旧带时 B/C/E 记为「通过（88.40% / 80.80% / 88.40%）」；新带下 **B weaken-zero 88.40% 失败、C race-diff 80.80%（先手 45.40%）失败、E board-progress-settlement 88.40% 失败**，D 本就失败，`production` 与 `progress-pricing` 通过。这些候选都建在「无进度定价」基线上，即正是要拦住的回退。`candidate-validation.test.ts` 中 `dominance` 候选的标准 3 结论由 true 翻为 false，已如实更新；另把该测试的护栏样本从 120 局对齐到带的口径 500 局（120 局下生产先手 0.4667 落在带外，是抽样口径产物，不是真实失败）。
- [x] 测试全绿；不动游戏规则与计分取值。证据：集成分支 `864cadf` 上 `npm test` 693/693、38 文件全绿；`npm run typecheck`、`npm run lint`、`npm run check:deps`（46 模块、130 依赖、0 违规）全绿；`git diff --stat 9419c64..HEAD -- src/core/logic/` 为空，`src/` 改动仅 `GuardrailBand.ts`（新增）与 `CandidateValidation.ts`（改调用共享谓词）。

## 补充：本工单是编排阶段新立的

原 spec 只有工单 01、02。工单 03 由本次实现的侦察阶段发现后补立（见工单 02「与原工单的偏离」第 3 条），目的是让「护栏带能拦住回退」这条目标在两个入口上都成立，而不是只修 live 测试那一处。工单 01/02 的所有验收标准均已独立达成，与本工单无关。

## 附带修正（同一缺陷类，非本工单要求）

- `docs/adr/0011-balance-route-fix-rules.md:86` 原文称旧带「是当前 `npm test` 实际执行的红线」——一句已失效的现在时陈述（与工单 01 修的「生产不设置该字段」同类）。`3c61e79` 改为「**当时的** live 红线」，并指向 §4 采纳记录表里的现行带值（不重复写数字，避免制造第三份副本）。

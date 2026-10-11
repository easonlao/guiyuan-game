# 01: 记录与普查准确性 (Record and Census Accuracy)

**What to build:** 让记录与实际可达范围一致，并给死旋钮普查加一条完整性断言。

**背景：** 工单 06 采纳了「进度定价」，四条验收标准已独立复现（`npm test` 681 全绿；对拼矩阵逐格一致；无策略 6/6 占优；绊线经实测会红）。但记录里有四处与实际不符，其中第一处会让读者以为机制的有效范围比实际宽一倍。

## 要修的四处（记录）

### 1. 上限写错——把不可达的 1.2 写成机制上限

ADR 0011 采纳记录、GDD §2.1、候选搜索报告都写系数范围「0.3 → **1.2**」。

但 `countBoardGuiYi = 5` 等价于该方已达成五行归元；一旦达成即锁定，对局当场判定。**正常对局里行动方行动时，对手最多 4 个归一节点 → 有效上限 1.02。**

1.2 只在揭牌分支可达（对手已锁定归元、己方听牌揭牌）。揭牌约占 33% 的对局，所以不是完全打不到，但它只出现在终局那一下。

应改为「**有效上限 1.02（揭牌分支可达 1.2）**」，并给出「5 个归一节点 = 该方已获胜」的依据。

### 2. 缺过零点——机制的实际形状没写出来

过零点在 `0.3 + 0.9n/5 = 1` → **n ≈ 3.89**。

即对手 0–3 个归一节点**全部是打折**，只有 4 个才是加成。这个形状记录里完全没有。应写明。

### 3. 候选搜索报告的三处漂移

- 一句「生产 `POINTS_CONFIG` **不设置** `ATTACK_PROGRESS_SCALE`……生产行为逐字节不变（ticket 06 才决定是否采纳）」——工单 06 已采纳，这句现在是**错的**。
- 一句「采纳 0.3/0.9（**居中**且离两侧边界最远）」——可行域 0.25–0.45 × 0.7–0.95 的中心是 **0.35/0.825**；0.3 距下界只有 0.05。该断言**不成立**，应删除或改为对实际依据的陈述。
- 「改动前后逐格对照」一节现在复跑得到 **0 格翻转**（工具默认基线已等于候选）。文档已在口径说明里承认，但应把这一点提到该节**开头**，而不是留在注里——否则读者会以为证据丢了。

### 4. 动作价值普查报告要补两条口径说明

- **白送的最优**：AUTO / DISSIPATE / PASS 三个动作的「最优」全部来自「该盘面上它是唯一可用动作」。真正有竞争的最优判定只来自 ATK / BURST / BURST_ATK / TRANS / CONVERT 五个。
- **度量的性质**：普查的价值函数是 **AI 自己的估值函数**，不是游戏的真实价值。这是可辩护的口径（AI 怎么看就怎么打），但要写明。

不写这两条，报告里「8 个动作全部有价值」读起来比实际强。

## 要加的一条断言（代码）

### 5. 死旋钮普查的完整性断言

普查文档声称有可执行断言「使本表不能静默腐烂」，但参数清单是**手写**的，没有任何完整性断言。本轮新增的两个计分字段（已采纳的进度定价、未采纳的赛跑差定价）**都没进清单**——它现在是快照，不是监视器。

加一条断言：把生产计分配置的键与清单做差集，**差集非空即红**，并报告缺了哪些键。

**Blocked by:** None

**Status:** closed

- [x] 上限改为「有效上限 1.02（揭牌分支可达 1.2）」，并给出「5 个归一节点 = 该方已获胜」的依据。证据：`f33dfc8` 在 `docs/adr/0011-balance-route-fix-rules.md:184`、`docs/GDD.md:31`、`docs/headless/candidate-search.md:105,179` 写出「有效上限 1.02」与「5 个归一节点 ⇔ `isBoardGuiYuan` ⇔ 对局当场判定」的依据（`State.ts:70,239`、`ActionResolver.ts:326,352-353,368-369`）。**括注「揭牌分支可达 1.2」经复核为假，已在 `8ba35cb` 改为「1.2 规则上不可达」——见下方「与原工单的偏离」。**
- [x] 补上过零点 3.89，说明 0–3 个归一节点是打折、4 才加成。证据：`f33dfc8`，同上四处，写法为「过零点在 `0.3 + 0.9n/5 = 1` ⇒ `n ≈ 3.89`：对手 0–3 个归一节点全部是打折，只有 4 个才是加成」。
- [x] 删掉或改正「居中且离两侧边界最远」这一不成立的断言。证据：`f33dfc8` 改为「选点依据是搜索实测——A(0.3, 0.9) 四条验收标准全过，见 §2；并非「居中」，可行域中心实为 0.35/0.825，0.3 距下界仅 0.05」（`docs/adr/0011:251`、`docs/headless/candidate-search.md:76`）。
- [x] 修正「生产不设置该字段」这句已失效的陈述。证据：`f33dfc8`，`docs/headless/candidate-search.md:102` 改为「生产 `POINTS_CONFIG` 已设置 `ATTACK_PROGRESS_SCALE: { floor: 0.3, span: 0.9 }`（ticket 06 采纳）；未配置时 `attackProgressScale` 返回恒等 1」。仓库内已无 `ATTACK_PROGRESS_SCALE` 附近的「不设置」残留。
- [x] 把「逐格对照已不可复跑」提到该节开头。证据：`f33dfc8`，`docs/headless/candidate-search.md` §5 标题下新增「口径说明（先读）」段，说明复跑得 0 格翻转是预期而非证据丢失，并指向工单 06 提交历史中的 42 对归档。
- [x] 普查报告补两条口径说明（白送的最优 / 用 AI 估值函数）。证据：`f33dfc8`，`docs/headless/action-value-census.md` 开头新增「口径（先读，两条）」：AUTO/DISSIPATE/PASS 的最优来自唯一可用动作（`ActionCandidates.ts:98,110,197`、`Strategy.ts:172-173`）；价值函数是 AI 自身估值（`ActionEvaluator.evaluate`）。并在 ADR 0011 §2 标准 2 行加了口径指针。
- [x] 加完整性断言：生产计分配置键与普查清单的差集非空即红。证据：`8312d65` 新增 `tests/core/dead-knob-census.test.ts` 的「完整性：PointsConfig 的每个声明字段都出现在 SCORING_KNOBS 清单中」；`4c599ed` 按评审意见补上**嵌套叶子路径**覆盖（原实现只比顶层键，`ACTION.NEW_FIELD` 之类会被静默吞掉）。同时补进两条缺失的普查行（`ATTACK_PROGRESS_SCALE` 活、`RACE_DIFF_PRICING` 死）与 `docs/headless/knob-census.md` 的表格/计数（86 → 93）。
- [x] 断言失败时报告缺失的键名。证据：`8312d65` 的 `expect(missing, \`SCORING_KNOBS 清单缺少 PointsConfig 字段：${missing.join('、')}\`).toEqual([])`；红探针输出 `SCORING_KNOBS 清单缺少 PointsConfig 字段：ATTACK_PROGRESS_SCALE`。`4c599ed` 的嵌套探针输出 `SCORING_KNOBS 清单缺少 POINTS_CONFIG 叶子路径：ACTION.NEW_FIELD_PROBE`。
- [x] 测试全绿；纯文档与测试改动，不动游戏规则。证据：集成分支 `864cadf` 上 `npm test` 693/693、38 文件全绿；`npm run typecheck`、`npm run lint`、`npm run check:deps` 全绿；`git diff --stat 9419c64..HEAD -- src/core/logic/` 为空。

## 与原工单的偏离（已复核，非遗漏）

1. **「揭牌分支可达 1.2」是错的。** 独立复核（结论已记入本 ADR 采纳记录与 `docs/headless/candidate-search.md` §3.1）：`attackProgressScale` 的唯一调用点是 `ActionResolver.scaledAttackTransitionPoints`（`ActionResolver.ts:42-58`，传行动前对手盘面 `:202-207,:267-272`）；5 个归一节点 ⇔ `isBoardGuiYuan`，达成即在**同一次 `resolve` 调用内**终局（`ActionResolver.ts:347-369`），或交给揭牌分支；而揭牌分支（`TurnManager.ts:141-226`，`HeadlessMatch.ts:239-296` 同构）直接写 `isGameOver`/`winner`/`endReason` 并 `return []`，**从不调用 `resolver.resolve`**。故 1.2 在真实对局中不可达。1.2 只会被 headless 夹具求值到（`ActionValueCensus.ts:218-241,276-280`；`tests/core/attack-progress-scale.test.ts:105-108` 明确断言该端点）。文档已按此改写（`8ba35cb`）；原工单「约占 33% 的对局」一句随之删除（该数字本身有出处——`docs/GDD.md:21`、`docs/adr/0007-showdown-draw-and-strict-tingpai.md:48` 记录揭牌约占 33.3%——但与 1.2 的可达性无关，且该处并不计分）。
2. **完整性断言的覆盖面比工单字面要求更宽。** 工单说「生产计分配置的键与清单做差集」；若照 `Object.keys(POINTS_CONFIG)` 实现，可选且生产未设置的 `RACE_DIFF_PRICING` 永远抓不到。实现改为「`PointsConfig` 声明字段集（含可选）+ 生产配置的嵌套叶子路径」双向覆盖，`Record<keyof PointsConfig, true>` 让漏字段在 `typecheck` 阶段就报错。

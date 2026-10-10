# 旋钮普查 (Dead Knob Census)

> Ticket 05 的交付物。本文逐参数回答三个问题：
>
> 1. **AI 估值是否读取它** —— 消费者是 `ActionEvaluator.evaluate`（AI 的动作估值函数）；
> 2. **终局判定是否读取它** —— 消费者是 `ActionResolver.resolve` 的终局分数/胜负判定；
> 3. **扰动它，输出是否变化** —— 用 `ActionResolver.resolve` 的 `scoreDelta` + 终局分数 + 盘面快照观测。
>
> 可执行断言在 `tests/core/dead-knob-census.test.ts`（86 条），使本表不能静默腐烂。
> 判定所用的两个接缝（spec Implementation Decisions 1–3，不新增第三个）：
> 主接缝 `HeadlessMatch.run` / `HeadlessBenchmark.run`；场景接缝 `ActionResolver.resolve`。
>
> 术语以 `GLOSSARY.md` 为准；指标口径见 `docs/headless/metric-definitions.md`。
> 本票只做普查：**不删除、不接线、不改规则**。死参数的「处置建议」是建议，接线属于新机制，不在本票范围。

## 0. 结论速览

| 分类 | 参数 |
| --- | --- |
| **活参数（AI 估值读取）** | `PointsConfig.ACTION.{AUTO,CONVERT,TRANS,ATK,BURST,BURST_ATK}`、`PointsConfig.STATE_CHANGE.*`（9 个标量）、`PointsConfig.GUI_YI_MILESTONE`、`StrategyWeights.*`（12 个）、`RuleSwitches.isBoardOnly`（经策略构造器或权重模板策略绑定） |
| **仅终局生效（终局读、AI 不读）** | `PointsConfig.DAMAGE_PENALTY`（**当前唯一成员**） |
| **死参数（AI 不读、终局不读、扰动无变化）** | `PointsConfig.ACTION.DISSIPATE`、`PointsConfig.ACTION.PASS`、`PointsConfig.RARITY_MULTIPLIER`、`PointsConfig.NO_RARITY_ACTIONS`、`ACTION_PROBABILITY`、`ScoreConfig`/`DEFAULT_SCORE_CONFIG`、`ScoreCalculator.applyRarityBonus`/`isNoRarityAction` |
| **接线但无消费者（转发死参数）** | `TurnManagerOptions.rules`、`ActionCandidatesOptions.rules`、`BenchmarkOptions.recordActions` |

---

## 1. 计分参数 (`PointsConfig`)

`PointsConfig` 定义在 `src/core/logic/ScoreCalculator.ts:29`。所有叶子字段如下。
「AI 估值读取」= `ActionEvaluator` 读 `result.scoreDelta`（`ActionEvaluator.ts:188`）时该字段是否进入 `scoreDelta`；
「终局判定读取」= 最终分数/胜负是否依赖它。证据行号指 `ActionResolver.ts`。

| 参数 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 | 读取点 / 证据 |
| --- | :---: | :---: | :---: | --- | --- |
| `ACTION.AUTO` | 是 | 是 | 是 | 活 | `ActionResolver.ts:92`（`calculateActionPoints(AUTO)`） |
| `ACTION.CONVERT` | 是 | 是 | 是 | 活 | `:120` |
| `ACTION.TRANS` | 是 | 是 | 是 | 活 | `:133` |
| `ACTION.ATK` | 是 | 是 | 是 | 活 | `:152` |
| `ACTION.BURST` | 是 | 是 | 是 | 活 | `:174` |
| `ACTION.BURST_ATK` | 是 | 是 | 是 | 活 | `:204` |
| `ACTION.DISSIPATE` | 否 | 否 | 否 | **死** | `DISSIPATE` 分支直接 `scoreDelta = 0`（`:235`），从不调用 `calculateActionPoints` |
| `ACTION.PASS` | 否 | 否 | 否 | **死** | `PASS` 分支直接 `scoreDelta = 0`（`:243`），从不调用 `calculateActionPoints` |
| `STATE_CHANGE.REPAIR_DMG.yang` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts:206`（-1→0 己方建设） |
| `STATE_CHANGE.REPAIR_DMG.yin` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts:207` |
| `STATE_CHANGE.LIGHT_UP` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts:210`（0→1） |
| `STATE_CHANGE.BLESSING` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts:213`（1→2） |
| `STATE_CHANGE.CAUSE_DMG.yang` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts:189`（攻击 0→-1） |
| `STATE_CHANGE.CAUSE_DMG.yin` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts:190` |
| `STATE_CHANGE.BREAK_LIGHT.yang` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts:194`（攻击 1→0） |
| `STATE_CHANGE.BREAK_LIGHT.yin` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts:195` |
| `STATE_CHANGE.WEAKEN` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts:198`（攻击 2→1） |
| `GUI_YI_MILESTONE` | 是 | 是 | 是 | 活 | `ActionResolver.ts:265` 进入 `scoreDelta`；`ScoreCalculator.ts:130` 提供缺省回退 60 |
| `DAMAGE_PENALTY` | 否 | 是 | 是 | **仅终局生效** | `ActionResolver.ts:331-332`，只在 `MAX_ROUNDS` 结算分支从 `finalScore` 扣减，**从不进入 `scoreDelta`**；`ScoreCalculator.ts:134` 缺省回退 50 |
| `RARITY_MULTIPLIER` | 否 | 否 | 否 | **死** | 仅被 `ScoreCalculator.applyRarityBonus` 的默认参数读取（`:232`），该方法无调用点 |
| `NO_RARITY_ACTIONS` | 否 | 否 | 否 | **死** | 仅被 `isNoRarityAction`（`:222-223`）读取，后者只被 `applyRarityBonus`（`:235`）调用，无调用点 |

**同族但不在 `PointsConfig` 内的死物**（一并列出，避免被误认为生效）：

| 符号 | 位置 | 结论 |
| --- | --- | --- |
| `ACTION_PROBABILITY` | `ScoreCalculator.ts:89` | 死：只被 `applyRarityBonus` 读取（`:238`） |
| `ScoreConfig` / `DEFAULT_SCORE_CONFIG` | `ScoreCalculator.ts:103` / `:113` | 死：生产路径只消费 `PointsConfig`；`ScoreConfig` 仅被 `tests/core/score-calculator.test.ts` 引用，数值与 `POINTS_CONFIG` 巧合相等 |
| `ScoreCalculator.applyRarityBonus` / `isNoRarityAction` | `ScoreCalculator.ts:229` / `:222` | 死：生产路径无调用点 |
| 常量 `GUI_YI_MILESTONE` / `DAMAGE_PENALTY` | `ScoreCalculator.ts:39` / `:42` | 活（作为 `PointsConfig` 可选字段缺省时的回退值，经 getter `:130`/`:134` 读取） |

### 1.1 两个必须说明的口径细节

- **`ACTION.AUTO` 在生产路径中不会被估值**：低位态（天干对应侧 ≤ 0）时 `getAvailableActions` 恒返回单候选 `[AUTO]`（`ActionCandidates.ts:98`），而 `createStrategy` 对单候选短路、不调用估值器（`Strategy.ts:172-173`）。因此结构上估值器会读 `ACTION.AUTO`，但生产对局里 AUTO 的数值实际只影响终局分数，不影响 AI 选择。`DISSIPATE`、`PASS` 同理恒为单候选（`ActionCandidates.ts:110`、`:197`）。
- **`DAMAGE_PENALTY` 的「AI 不读」不是因为分支没执行**：AI 估值时也会调用 `resolve`，若模拟状态已达上限，`MAX_ROUNDS` 分支会执行并扣减 `finalScore`；但估值器只读 `result.scoreDelta`（`ActionEvaluator.ts:188`），而惩罚扣的是 `finalActiveScore`/`finalOpponentScore`，不在 `scoreDelta` 内，故 AI 不可见。

---

## 2. 规则开关与选项参数

「AI 估值读取」中「间接」指该值先进入 `GameState`/候选集，AI 再经状态读取（而非直接读该配置）。
「扰动输出变化」指任一可观测输出（对局轨迹、终局分数、指标、记录、事件）是否变化。

### 2.1 `RuleSwitches`（`ActionCandidates.ts:63`）

| 参数 | 消费者 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | --- | :---: | :---: | :---: | --- |
| `isBoardOnly` | `ActionEvaluator.evaluate`（`ActionEvaluator.ts:188`）：为 true 时 `scoreDeltaPoints = 0` | 是 | 否 | 是 | 活 |

**活路径**：`createStrategy(weights, { rules })`（`Strategy.ts:176`）或 `createScoreBoundStrategy(weights, config, rules)`（`Strategy.ts:203-207`）把 `rules` 交给估值器；`GameManager` 走这条路（`game-manager.ts:95`）。
无头入口新增第三条活路径（ticket 01/04 修复）：`HeadlessMatch.run(strategy=weights, { rules })` 与 `HeadlessBenchmark.run({ strategyP1: weights, rules })` 由 `resolveStrategy`（`HeadlessMatch.ts`）用同一份 `rules` 构造 score-bound 策略，因此 `MatchOptions.rules`（`HeadlessMatch.ts`）、`BenchmarkOptions.rules`（`HeadlessBenchmark.ts`）、`HeadlessMatchConfig.rules`（`HeadlessMatch.ts`）在策略为权重模板时都到达 AI 估值器。
**仍无消费者的转发路径**：`getAvailableActions` 只读 `options?.isExtraTurn`，从不读 `options?.rules`（`ActionCandidates.ts:168`；`rules` 字段在 `:56` 声明后无人读）。因此 `TurnManagerOptions.rules`（`TurnManager.ts:250`）与 `ActionCandidatesOptions.rules` 仍是转发死参数。

### 2.2 `ActionCandidatesOptions`（`ActionCandidates.ts:50`）

| 参数 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | :---: | :---: | :---: | --- |
| `isExtraTurn` | 间接（过滤候选集） | 否 | 是（爆发候选被过滤，`ActionCandidates.ts:168`） | 活（行为过滤；由连动状态派生，非调参旋钮） |
| `rules` | 否 | 否 | 否 | 死转发（候选接缝不读） |

### 2.3 `TurnManagerOptions`（`TurnManager.ts:40`）

| 参数 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | :---: | :---: | :---: | --- |
| `initialState` | 间接（经状态） | 间接（经状态） | 是 | 活（输入，非调参旋钮） |
| `prng` | 间接（决定抽天干） | 间接 | 是 | 活（输入） |
| `resolver` | 否 | 是（动作结算/终局分数） | 是 | 活（结算注入） |
| `eventBus` | 否 | 否 | 仅事件（不改状态/分数） | 观察通道，非平衡旋钮 |
| `rules` | 否 | 否 | 否 | 死转发（只转发到候选接缝） |

### 2.4 `GameManagerOptions`（`game-manager.ts:30`）

| 参数 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | :---: | :---: | :---: | --- |
| `seed` | 间接 | 间接 | 是 | 活 |
| `initialState` | 间接 | 间接 | 是 | 活 |
| `prng` | 间接 | 间接 | 是 | 活 |
| `rules` | 是（绑定到 `createStrategy`，`game-manager.ts:95`） | 否 | 是 | 活（游戏内把 `isBoardOnly` 接到 AI 的入口） |

### 2.5 `MatchOptions`（`HeadlessMatch.ts:37`）

| 参数 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | :---: | :---: | :---: | --- |
| `seed` | 间接 | 间接 | 是 | 活 |
| `maxRounds` | 间接（影响对局长度） | 是（触发 `MAX_ROUNDS`） | 是 | 活 |
| `recordActions` | 否 | 否 | 是（`record.actions`，`HeadlessMatch.ts:248`） | 活（仅输出采集） |
| `scoreConfig` | 是（策略为权重模板时经 `resolveStrategy` 绑定 AI 估值器） | 是（终局分数，`HeadlessMatch.ts:157-159`） | 是 | 活：同时到达解析器与 AI 估值器；已构造的 `DecisionStrategy` 仍按自身估值器运行 |
| `rules` | 是（策略为权重模板时） | 否 | 是 | 活（同上；候选接缝仍不读） |
| `shouldCollectStats` | 否 | 否 | 是（`MatchResult.stats`） | 活（仅输出采集） |
| `isBoardSettlement` | 否 | 是（回合上限按盘面进度判胜负，不读计分） | 是（仅 MAX_ROUNDS 局的胜者） | 活（ticket 09 board-only 实验模式；默认 false，生产规则不变） |

### 2.6 `BenchmarkOptions`（`HeadlessBenchmark.ts:23`）

| 参数 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | :---: | :---: | :---: | --- |
| `matches` | 否 | 否 | 是（样本量/聚合） | 活（仅批量聚合） |
| `baseSeed` | 间接 | 间接 | 是 | 活 |
| `maxRounds` | 间接 | 是 | 是 | 活 |
| `strategyP1` / `strategyP2` | 是（权重模板经 `resolveStrategy` 绑定 AI 估值器；已构造策略按其自身估值器） | 间接 | 是 | 活（接受 `DecisionStrategy` 或 `StrategyWeights`） |
| `recordActions` | 否 | 否 | **否** | 死转发：转发到 `HeadlessMatch`（`HeadlessBenchmark.ts:83`），但 `BenchmarkMetrics` 不暴露逐动作记录 |
| `scoreConfig` | 是（策略为权重模板时） | 是（平均分） | 是 | 活：同时到达解析器与 AI 估值器 |
| `rules` | 是（策略为权重模板时） | 否 | 是 | 活（同上） |
| `isBoardSettlement` | 否 | 是（回合上限按盘面进度判胜负） | 是 | 活（ticket 09 board-only 实验模式；默认 false） |

### 2.7 `HeadlessMatchConfig`（`HeadlessMatch.ts:28`）与 `StrategyOptions`（`Strategy.ts:132`）

| 参数 | 消费者 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | --- | :---: | :---: | :---: | --- |
| `HeadlessMatchConfig.resolver` | `HeadlessMatch` 结算 | 否 | 是 | 是 | 活（结算注入） |
| `HeadlessMatchConfig.scoreCalculator` | 构造 resolver | 否 | 是 | 是 | 活（结算注入） |
| `HeadlessMatchConfig.scoreConfig` | AI 估值路径的计分配置 | 是（策略为权重模板时） | 否 | 是 | 活 |
| `HeadlessMatchConfig.rules` | 转发到候选接缝，并作为权重模板策略的规则默认值 | 是（策略为权重模板时） | 否 | 是 | 活（权重模板策略） |
| `StrategyOptions.evaluator` | `createStrategy` | 是 | 否 | 是 | 活 |
| `StrategyOptions.tieBreaker` | `createStrategy` 并列裁决 | 是（并列时改选动作） | 否 | 是 | 活 |
| `StrategyOptions.rules` | `evaluateAll` → 估值器 | 是 | 否 | 是 | 活 |

---

## 3. AI 估值权重 (`StrategyWeights`)

`StrategyWeights`（`src/core/ai/types.ts:11`）是 AI 估值的唯一权重表，全部为**活参数**：估值器逐项读取，终局判定完全不读。逐项断言见 `tests/core/dead-knob-census.test.ts`（`StrategyWeights 全部为活参数` 小节）。

| 参数 | AI 估值读取 | 终局判定读取 | 读取点 |
| --- | :---: | :---: | --- |
| `repairDamage` | 是 | 否 | `ActionEvaluator.ts` 自保修复段 |
| `lightVoid` | 是 | 否 | 归元推进段（0→1） |
| `reachGuiYi` | 是 | 否 | 归元推进段（达成归一） |
| `reachKangJi` | 是 | 否 | 归元推进段（1→2 / 亢极） |
| `guiyuanProgress` | 是 | 否 | 归元推进段（净归一增量与接近度） |
| `breakOpponentGuiYi` | 是 | 否 | 压制克破段（破归一） |
| `causeDamage` | 是 | 否 | 压制克破段（0→-1） |
| `suppressNode` | 是 | 否 | 压制克破段（普通降级） |
| `burstExtraTurn` | 是 | 否 | 连动收益段 |
| `scoreDeltaWeight` | 是 | 否 | 规则得分段（`ActionEvaluator.ts:187`） |
| `winReward` | 是 | 否 | 达成五行全归元奖励 |
| `baseActionBias` | 是 | 否 | 动作基础偏好段 |

预设策略（`BALANCED_WEIGHTS`、`RUSH_GUIYUAN_WEIGHTS`、`AGGRESSIVE_WEIGHTS`、`DEFENSIVE_WEIGHTS`、`PURE_RUSH_WEIGHTS`、`PURE_SUPPRESS_WEIGHTS`、`SCORE_STRIPPED_WEIGHTS`）只是权重取值，不是死旋钮；某个预设把某权重设为 0 是设计选择，不是「未接线」。

---

## 4. 活参数清单

**计分（AI 估值读取，扰动改变 AI 行为与终局分数）**

- `PointsConfig.ACTION.AUTO` / `CONVERT` / `TRANS` / `ATK` / `BURST` / `BURST_ATK`
- `PointsConfig.STATE_CHANGE.REPAIR_DMG.{yang,yin}` / `LIGHT_UP` / `BLESSING` / `CAUSE_DMG.{yang,yin}` / `BREAK_LIGHT.{yang,yin}` / `WEAKEN`
- `PointsConfig.GUI_YI_MILESTONE`
- 常量 `GUI_YI_MILESTONE`（缺省回退）

**仅终局生效（见第 6 节）**

- `PointsConfig.DAMAGE_PENALTY`（常量 `DAMAGE_PENALTY` 为缺省回退）

**规则与选项（到达真实消费者）**

- `RuleSwitches.isBoardOnly`（经 `createStrategy({rules})` / `createScoreBoundStrategy(..., rules)` / 无头入口的权重模板策略绑定）
- `ActionCandidatesOptions.isExtraTurn`
- `TurnManagerOptions.{initialState,prng,resolver}`
- `GameManagerOptions.{seed,initialState,prng,rules}`
- `MatchOptions.{seed,maxRounds,recordActions,scoreConfig,rules,shouldCollectStats,isBoardSettlement}`
- `BenchmarkOptions.{matches,baseSeed,maxRounds,strategyP1,strategyP2,scoreConfig,rules,isBoardSettlement}`
- `HeadlessMatchConfig.{resolver,scoreCalculator,scoreConfig,rules}`
- `StrategyOptions.{evaluator,tieBreaker,rules}`
- `StrategyWeights.*`（全部 12 项）

---

## 5. 死参数清单与处置建议

处置只给建议，本票不实施。**接线属于新机制，明确不在本票范围。**

| 死参数 | 死因 | 处置建议 |
| --- | --- | --- |
| `PointsConfig.RARITY_MULTIPLIER` | `applyRarityBonus` 无调用点 | **DELETE**（连同 `applyRarityBonus`、`isNoRarityAction`、`ACTION_PROBABILITY`、`NO_RARITY_ACTIONS`）。若稀有度机制要复活，属于新机制，应另开票重新接线，而不是保留一个会被误认为生效的字段 |
| `PointsConfig.NO_RARITY_ACTIONS` | 同上 | **DELETE**（与上同一组） |
| `ACTION_PROBABILITY` | 只被 `applyRarityBonus` 读取 | **DELETE**（与上同一组） |
| `ScoreCalculator.applyRarityBonus` / `isNoRarityAction` | 生产路径无调用点 | **DELETE**（与上同一组） |
| `ScoreConfig` / `DEFAULT_SCORE_CONFIG` | 生产路径只消费 `PointsConfig`；仅测试引用 | **DELETE**（或把测试改为引用 `POINTS_CONFIG` 后删除） |
| `PointsConfig.ACTION.DISSIPATE` | 规则规定亢极散气计 0 分；`resolve` 强制 `scoreDelta = 0` | **DELETE**（保留字段会诱导「调它试试」的无效实验） |
| `PointsConfig.ACTION.PASS` | 规则规定消散过牌计 0 分；`resolve` 强制 `scoreDelta = 0` | **DELETE** |
| `MatchOptions.rules` / `BenchmarkOptions.rules` / `HeadlessMatchConfig.rules` | **已接线**（ticket 01/04 修复）：策略为权重模板时经 `resolveStrategy` 绑定 AI 估值器 | **已移出死参数清单** |
| `TurnManagerOptions.rules` / `ActionCandidatesOptions.rules` | 只转发到候选接缝，而候选接缝从不读 `rules` | **WIRE 或 DELETE（二选一）**：若规则模式应同时影响候选生成，则让 `getAvailableActions` 读 `isBoardOnly`（统一入口）；若规则只属于策略，则删除这些转发字段 |
| `BenchmarkOptions.recordActions` | 转发到 `HeadlessMatch`，但 `BenchmarkMetrics` 不暴露逐动作记录 | **WIRE 或 DELETE**：若批量报告需要逐动作证据，在 `BenchmarkMetrics` 暴露；否则删除该字段，避免误以为批量运行会采集动作 |

---

## 6. 「仅终局生效」类：穷举

**一般化结论**：任何**只在终局分支生效、且从不进入 `ActionResolver.resolve` 的 `scoreDelta`** 的计分项，对当前 AI 都不可见。AI 估值器只读 `result.scoreDelta`（`ActionEvaluator.ts:188`），所以只要一个计分项不走 `scoreDelta`，换它任何数值都不会改变 AI 行为——这类实验必然得出「无影响」。

**穷举当前代码中的成员：**

| 成员 | 终局读取点 | 是否进入 `scoreDelta` | 结论 |
| --- | --- | :---: | --- |
| `PointsConfig.DAMAGE_PENALTY` | `ActionResolver.ts:331-332`（`MAX_ROUNDS` 分支，从 `finalScore` 扣减） | 否 | **唯一成员** |
| 常量 `DAMAGE_PENALTY` | 经 `ScoreCalculator.ts:134` getter 作为缺省回退，最终仍只在 `:331-332` 被读 | 否 | 与上同一成员的回退值 |
| `ScoreConfig.damagePenalty`（legacy） | 若接线则会落入同一分支；当前**未接线** | 否 | 不是终端成员，是死参数 |

**终局分支清单（确认没有遗漏）：**

- `ActionResolver.resolve` 的 `MAX_ROUNDS` 结算分支（`ActionResolver.ts:324-338`）：只读 `DAMAGE_PENALTY`。胜负为「扣损后分高者胜，同分 P2 胜」；P2 平局优先是规则，不是可调计分参数。
- `ActionResolver.resolve` 的 `GUI_YUAN` 分支（`:291-322`）：只按盘面锁定与听牌判定胜负，**不读任何计分参数**。
- `HeadlessMatch.run` 的天命揭牌分支（`HeadlessMatch.ts:172-227`）：只改盘面与胜负，不读计分参数。
- `TurnManager.startTurn` 的天命揭牌分支（`TurnManager.ts:141-228`）：同上。

因此，**当前终端生效类 = { `DAMAGE_PENALTY` }，无其它成员。** 未来若新增「终局才结算」的计分项（例如终局归元奖励、终局剩余资源折算），它天然落入此类；届时应同时（a）加入本表，（b）决定是否把它并入 `scoreDelta` 让 AI 可见。把这条规则写进普查，是为了让下一个调参者不再对终端项白跑一整格实验。

---

## 7. 复跑与维护

```bash
npm test -- tests/core/dead-knob-census.test.ts   # 86 条逐参数断言
npm run typecheck
npm run lint
```

维护约定：

- 新增/删除 `PointsConfig` 叶子、`RuleSwitches` 字段或选项参数时，必须同步 `tests/core/dead-knob-census.test.ts` 的 `SCORING_KNOBS` / `WEIGHT_KNOBS` 表与本文两张清单。
- 若把某个死参数接线（新机制），必须把它从「死参数」移到「活参数」，并让对应断言从「相等」翻转为「不等」——测试会强制这一变更被显式做出。
- 本表只描述**读取关系**，不评价数值好坏；具体候选数值属于诊断票（08/09/10）。

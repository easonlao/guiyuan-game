# 旋钮普查 (Dead Knob Census)

> Ticket 05 的交付物。本文逐参数回答三个问题：
>
> 1. **AI 估值是否读取它** —— 消费者是 `ActionEvaluator.evaluate`（AI 的动作估值函数）；
> 2. **终局判定是否读取它** —— 消费者是 `ActionResolver.resolve` 的终局分数/胜负判定；
> 3. **扰动它，输出是否变化** —— 用 `ActionResolver.resolve` 的 `scoreDelta` + 终局分数 + 盘面快照观测。
>
> 可执行断言在 `tests/core/dead-knob-census.test.ts`，使本表不能静默腐烂。
> 判定所用的两个接缝（spec Implementation Decisions 1–3，不新增第三个）：
> 主接缝 `HeadlessMatch.run` / `HeadlessBenchmark.run`；场景接缝 `ActionResolver.resolve`。
>
> 术语以 `GLOSSARY.md` 为准；指标口径见 `docs/headless/metric-definitions.md`。
> 本票只做普查：**不删除、不接线、不改规则**。死参数的「处置建议」是建议，接线属于新机制，不在本票范围。
> 后续 `dead-scoring-code-removal` 工单已按本表建议删除死参数（见 §5），本文其余内容与当前代码一致。

## 0. 结论速览

| 分类 | 参数 |
| --- | --- |
| **活参数（AI 估值读取）** | `PointsConfig.ACTION.{AUTO,CONVERT,TRANS,ATK,BURST,BURST_ATK}`、`PointsConfig.STATE_CHANGE.*`（9 个标量）、`PointsConfig.GUI_YI_MILESTONE`、`PointsConfig.ATTACK_PROGRESS_SCALE`、`StrategyWeights.*`（12 个）、`RuleSwitches.isBoardOnly`（经策略构造器或权重模板策略绑定） |
| **仅终局生效（终局读、AI 不读）** | `PointsConfig.DAMAGE_PENALTY`（**当前唯一成员**） |
| **死参数（AI 不读、终局不读、扰动无变化）** | 无。原列的 `PointsConfig.RACE_DIFF_PRICING`、`PointsConfig.ACTION.DISSIPATE`、`PointsConfig.ACTION.PASS`、`PointsConfig.RARITY_MULTIPLIER`、`PointsConfig.NO_RARITY_ACTIONS`、`ACTION_PROBABILITY`、`ScoreConfig`/`DEFAULT_SCORE_CONFIG`、`ScoreCalculator.applyRarityBonus`/`isNoRarityAction` 已由 dead-scoring-code-removal 工单删除（见 §5） |
| **接线但无消费者（转发死参数）** | 无。原列的 `TurnManagerOptions.rules`、`ActionCandidatesOptions.rules`、`BenchmarkOptions.recordActions` 已由 dead-scoring-code-removal 工单删除（见 §5） |

---

## 1. 计分参数 (`PointsConfig`)

`PointsConfig` 定义在 `src/core/logic/ScoreCalculator.ts`。所有叶子字段如下。
「AI 估值读取」= `ActionEvaluator` 读 `result.scoreDelta`（`ActionEvaluator.ts`）时该字段是否进入 `scoreDelta`；
「终局判定读取」= 最终分数/胜负是否依赖它。证据指 `ActionResolver.ts` 的对应分支/调用点。

| 参数 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 | 读取点 / 证据 |
| --- | :---: | :---: | :---: | --- | --- |
| `ACTION.AUTO` | 是 | 是 | 是 | 活 | `ActionResolver.ts`（`calculateActionPoints(AUTO)`） |
| `ACTION.CONVERT` | 是 | 是 | 是 | 活 | `ActionResolver.ts`（`calculateActionPoints(CONVERT)`） |
| `ACTION.TRANS` | 是 | 是 | 是 | 活 | `ActionResolver.ts`（`calculateActionPoints(TRANS)`） |
| `ACTION.ATK` | 是 | 是 | 是 | 活 | `ActionResolver.ts`（`calculateActionPoints(ATK)`） |
| `ACTION.BURST` | 是 | 是 | 是 | 活 | `ActionResolver.ts`（`calculateActionPoints(BURST)`） |
| `ACTION.BURST_ATK` | 是 | 是 | 是 | 活 | `ActionResolver.ts`（`calculateActionPoints(BURST_ATK)`） |
| `STATE_CHANGE.REPAIR_DMG.yang` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts`（-1→0 己方建设） |
| `STATE_CHANGE.REPAIR_DMG.yin` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts` |
| `STATE_CHANGE.LIGHT_UP` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts`（0→1） |
| `STATE_CHANGE.BLESSING` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts`（1→2） |
| `STATE_CHANGE.CAUSE_DMG.yang` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts`（攻击 0→-1） |
| `STATE_CHANGE.CAUSE_DMG.yin` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts` |
| `STATE_CHANGE.BREAK_LIGHT.yang` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts`（攻击 1→0） |
| `STATE_CHANGE.BREAK_LIGHT.yin` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts` |
| `STATE_CHANGE.WEAKEN` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts`（攻击 2→1） |
| `GUI_YI_MILESTONE` | 是 | 是 | 是 | 活 | `ActionResolver.ts` 进入 `scoreDelta`；`ScoreCalculator.ts` 提供缺省回退 60 |
| `DAMAGE_PENALTY` | 否 | 是 | 是 | **仅终局生效** | `ActionResolver.ts`，只在 `MAX_ROUNDS` 结算分支从 `finalScore` 扣减，**从不进入 `scoreDelta`**；`ScoreCalculator.ts` 缺省回退 50 |
| `ATTACK_PROGRESS_SCALE` | 是 | 是 | 是 | 活 | `ScoreCalculator.ts`（`attackProgressScale` = floor + span×count/5）；`ActionResolver.ts` 缩放 ATK/BURST_ATK 的攻击状态分 |

**同族但不在 `PointsConfig` 内的死物**（一并列出，避免被误认为生效）：

| 符号 | 位置 | 结论 |
| --- | --- | --- |
| 常量 `GUI_YI_MILESTONE` / `DAMAGE_PENALTY` | `ScoreCalculator.ts` | 活（作为 `PointsConfig` 可选字段缺省时的回退值，经 getter 读取） |

> 原有死物 `ACTION_PROBABILITY`、`ScoreConfig`/`DEFAULT_SCORE_CONFIG`、`ScoreCalculator.applyRarityBonus`/`isNoRarityAction` 已由 dead-scoring-code-removal 工单删除（见 §5）。

### 1.1 两个必须说明的口径细节

- **`ACTION.AUTO` 在生产路径中不会被估值**：低位态（天干对应侧 ≤ 0）时 `getAvailableActions` 恒返回单候选 `[AUTO]`（`ActionCandidates.ts`），而 `createStrategy` 对单候选短路、不调用估值器（`Strategy.ts`）。因此结构上估值器会读 `ACTION.AUTO`，但生产对局里 AUTO 的数值实际只影响终局分数，不影响 AI 选择。`DISSIPATE`、`PASS` 同理恒为单候选（`ActionCandidates.ts`）。
- **`DAMAGE_PENALTY` 的「AI 不读」不是因为分支没执行**：AI 估值时也会调用 `resolve`，若模拟状态已达上限，`MAX_ROUNDS` 分支会执行并扣减 `finalScore`；但估值器只读 `result.scoreDelta`（`ActionEvaluator.ts`），而惩罚扣的是 `finalActiveScore`/`finalOpponentScore`，不在 `scoreDelta` 内，故 AI 不可见。

---

## 2. 规则开关与选项参数

「AI 估值读取」中「间接」指该值先进入 `GameState`/候选集，AI 再经状态读取（而非直接读该配置）。
「扰动输出变化」指任一可观测输出（对局轨迹、终局分数、指标、记录、事件）是否变化。

### 2.1 `RuleSwitches`（`ActionCandidates.ts`）

| 参数 | 消费者 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | --- | :---: | :---: | :---: | --- |
| `isBoardOnly` | `ActionEvaluator.evaluate`（`ActionEvaluator.ts`）：为 true 时 `scoreDeltaPoints = 0` | 是 | 否 | 是 | 活 |

**活路径**：`createStrategy(weights, { rules })`（`Strategy.ts`）或 `createScoreBoundStrategy(weights, config, rules)`（`Strategy.ts`）把 `rules` 交给估值器；`GameManager` 走这条路（`game-manager.ts`）。
无头入口新增第三条活路径（ticket 01/04 修复）：`HeadlessMatch.run(strategy=weights, { rules })` 与 `HeadlessBenchmark.run({ strategyP1: weights, rules })` 由 `resolveStrategy`（`HeadlessMatch.ts`）用同一份 `rules` 构造 score-bound 策略，因此 `MatchOptions.rules`（`HeadlessMatch.ts`）、`BenchmarkOptions.rules`（`HeadlessBenchmark.ts`）、`HeadlessMatchConfig.rules`（`HeadlessMatch.ts`）在策略为权重模板时都到达 AI 估值器。
**已删除的转发死路径**：`TurnManagerOptions.rules` / `ActionCandidatesOptions.rules` 只转发到候选接缝而无人读，已由 dead-scoring-code-removal 工单删除（`ActionCandidatesOptions` 现只保留 `isExtraTurn`）。

### 2.2 `ActionCandidatesOptions`（`ActionCandidates.ts`）

| 参数 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | :---: | :---: | :---: | --- |
| `isExtraTurn` | 间接（过滤候选集） | 否 | 是（爆发候选被过滤，`ActionCandidates.ts`） | 活（行为过滤；由连动状态派生，非调参旋钮） |

### 2.3 `TurnManagerOptions`（`TurnManager.ts`）

| 参数 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | :---: | :---: | :---: | --- |
| `initialState` | 间接（经状态） | 间接（经状态） | 是 | 活（输入，非调参旋钮） |
| `prng` | 间接（决定抽天干） | 间接 | 是 | 活（输入） |
| `resolver` | 否 | 是（动作结算/终局分数） | 是 | 活（结算注入） |
| `eventBus` | 否 | 否 | 仅事件（不改状态/分数） | 观察通道，非平衡旋钮 |

### 2.4 `GameManagerOptions`（`game-manager.ts`）

| 参数 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | :---: | :---: | :---: | --- |
| `seed` | 间接 | 间接 | 是 | 活 |
| `initialState` | 间接 | 间接 | 是 | 活 |
| `prng` | 间接 | 间接 | 是 | 活 |
| `rules` | 是（绑定到 `createStrategy`，`game-manager.ts`） | 否 | 是 | 活（游戏内把 `isBoardOnly` 接到 AI 的入口） |

### 2.5 `MatchOptions`（`HeadlessMatch.ts`）

| 参数 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | :---: | :---: | :---: | --- |
| `seed` | 间接 | 间接 | 是 | 活 |
| `maxRounds` | 间接（影响对局长度） | 是（触发 `MAX_ROUNDS`） | 是 | 活 |
| `recordActions` | 否 | 否 | 是（`record.actions`，`HeadlessMatch.ts`） | 活（仅输出采集） |
| `scoreConfig` | 是（策略为权重模板时经 `resolveStrategy` 绑定 AI 估值器） | 是（终局分数，`HeadlessMatch.ts`） | 是 | 活：同时到达解析器与 AI 估值器；已构造的 `DecisionStrategy` 仍按自身估值器运行 |
| `rules` | 是（策略为权重模板时） | 否 | 是 | 活（同上；候选接缝仍不读） |
| `shouldCollectStats` | 否 | 否 | 是（`MatchResult.stats`） | 活（仅输出采集） |
| `isBoardSettlement` | 否 | 是（回合上限按盘面进度判胜负，不读计分） | 是（仅 MAX_ROUNDS 局的胜者） | 活（ticket 09 board-only 实验模式；默认 false，生产规则不变） |

### 2.6 `BenchmarkOptions`（`HeadlessBenchmark.ts`）

| 参数 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | :---: | :---: | :---: | --- |
| `matches` | 否 | 否 | 是（样本量/聚合） | 活（仅批量聚合） |
| `baseSeed` | 间接 | 间接 | 是 | 活 |
| `maxRounds` | 间接 | 是 | 是 | 活 |
| `strategyP1` / `strategyP2` | 是（权重模板经 `resolveStrategy` 绑定 AI 估值器；已构造策略按其自身估值器） | 间接 | 是 | 活（接受 `DecisionStrategy` 或 `StrategyWeights`） |
| `scoreConfig` | 是（策略为权重模板时） | 是（平均分） | 是 | 活：同时到达解析器与 AI 估值器 |
| `rules` | 是（策略为权重模板时） | 否 | 是 | 活（同上） |
| `isBoardSettlement` | 否 | 是（回合上限按盘面进度判胜负） | 是 | 活（ticket 09 board-only 实验模式；默认 false） |

### 2.7 `HeadlessMatchConfig`（`HeadlessMatch.ts`）与 `StrategyOptions`（`Strategy.ts`）

| 参数 | 消费者 | AI 估值读取 | 终局判定读取 | 扰动输出变化 | 结论 |
| --- | --- | :---: | :---: | :---: | --- |
| `HeadlessMatchConfig.resolver` | `HeadlessMatch` 结算 | 否 | 是 | 是 | 活（结算注入） |
| `HeadlessMatchConfig.scoreCalculator` | 构造 resolver | 否 | 是 | 是 | 活（结算注入） |
| `HeadlessMatchConfig.scoreConfig` | AI 估值路径的计分配置 | 是（策略为权重模板时） | 否 | 是 | 活 |
| `HeadlessMatchConfig.rules` | 作为权重模板策略的规则默认值 | 是（策略为权重模板时） | 否 | 是 | 活（权重模板策略） |
| `StrategyOptions.evaluator` | `createStrategy` | 是 | 否 | 是 | 活 |
| `StrategyOptions.tieBreaker` | `createStrategy` 并列裁决 | 是（并列时改选动作） | 否 | 是 | 活 |
| `StrategyOptions.rules` | `evaluateAll` → 估值器 | 是 | 否 | 是 | 活 |

---

## 3. AI 估值权重 (`StrategyWeights`)

`StrategyWeights`（`src/core/ai/types.ts`）是 AI 估值的唯一权重表，全部为**活参数**：估值器逐项读取，终局判定完全不读。逐项断言见 `tests/core/dead-knob-census.test.ts`（`StrategyWeights 全部为活参数` 小节）。

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
| `scoreDeltaWeight` | 是 | 否 | 规则得分段（`ActionEvaluator.ts`） |
| `winReward` | 是 | 否 | 达成五行全归元奖励 |
| `baseActionBias` | 是 | 否 | 动作基础偏好段 |

预设策略（`BALANCED_WEIGHTS`、`RUSH_GUIYUAN_WEIGHTS`、`AGGRESSIVE_WEIGHTS`、`DEFENSIVE_WEIGHTS`、`PURE_RUSH_WEIGHTS`、`PURE_SUPPRESS_WEIGHTS`、`SCORE_STRIPPED_WEIGHTS`）只是权重取值，不是死旋钮；某个预设把某权重设为 0 是设计选择，不是「未接线」。

---

## 4. 活参数清单

**计分（AI 估值读取，扰动改变 AI 行为与终局分数）**

- `PointsConfig.ACTION.AUTO` / `CONVERT` / `TRANS` / `ATK` / `BURST` / `BURST_ATK`
- `PointsConfig.STATE_CHANGE.REPAIR_DMG.{yang,yin}` / `LIGHT_UP` / `BLESSING` / `CAUSE_DMG.{yang,yin}` / `BREAK_LIGHT.{yang,yin}` / `WEAKEN`
- `PointsConfig.GUI_YI_MILESTONE`
- `PointsConfig.ATTACK_PROGRESS_SCALE`
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

## 5. 死参数清单与处置结果

本票（工单 05）只给建议；后续工单 `dead-scoring-code-removal` 已按下表实施删除。三个未接线的选项旋钮（工单 02）一律 **DELETE**，不接线：规则只属于策略层，批量报告不需要逐动作证据。

| 死参数 | 死因 | 处置 |
| --- | --- | --- |
| `PointsConfig.RACE_DIFF_PRICING`（连同 `raceDiffPoints` 与 `ActionResolver` 应用点） | 生产 `POINTS_CONFIG` 不设置该字段，`raceDiffPoints` 恒等 0；机制代码存在但未接线 | **已删除**（工单 02） |
| `TurnManagerOptions.rules` / `ActionCandidatesOptions.rules` | 只转发到候选接缝，而候选接缝从不读 `rules` | **已删除**（工单 02；规则只属于策略层，不影响候选生成） |
| `BenchmarkOptions.recordActions` | 转发到 `HeadlessMatch`，但 `BenchmarkMetrics` 不暴露逐动作记录 | **已删除**（工单 02） |
| `RARITY_MULTIPLIER`、`NO_RARITY_ACTIONS`、`ACTION_PROBABILITY`、`applyRarityBonus`/`isNoRarityAction`、`ScoreConfig`/`DEFAULT_SCORE_CONFIG`、`ACTION.DISSIPATE`、`ACTION.PASS` | 稀有度链与零分动作旋钮在生产路径无消费者 | **已删除**（工单 01） |
| `MatchOptions.rules` / `BenchmarkOptions.rules` / `HeadlessMatchConfig.rules` | **已接线**（ticket 01/04 修复）：策略为权重模板时经 `resolveStrategy` 绑定 AI 估值器 | **已移出死参数清单**（保留为活参数） |

至此本文活/死清单中的死参数为空；唯一保留的「非活」类是「仅终局生效」的 `DAMAGE_PENALTY`（见 §6）。

---

## 6. 「仅终局生效」类：穷举

**一般化结论**：任何**只在终局分支生效、且从不进入 `ActionResolver.resolve` 的 `scoreDelta`** 的计分项，对当前 AI 都不可见。AI 估值器只读 `result.scoreDelta`（`ActionEvaluator.ts`），所以只要一个计分项不走 `scoreDelta`，换它任何数值都不会改变 AI 行为——这类实验必然得出「无影响」。

**穷举当前代码中的成员：**

| 成员 | 终局读取点 | 是否进入 `scoreDelta` | 结论 |
| --- | --- | :---: | --- |
| `PointsConfig.DAMAGE_PENALTY` | `ActionResolver.ts`（`MAX_ROUNDS` 分支，从 `finalScore` 扣减） | 否 | **唯一成员** |
| 常量 `DAMAGE_PENALTY` | 经 `ScoreCalculator.ts` getter 作为缺省回退，最终仍只在 `ActionResolver` 的 `MAX_ROUNDS` 结算分支被读 | 否 | 与上同一成员的回退值 |
| `ScoreConfig.damagePenalty`（legacy） | 已由 dead-scoring-code-removal 工单随 `ScoreConfig` 接口一并删除 | 否 | 已删除，不再是成员 |

**终局分支清单（确认没有遗漏）：**

- `ActionResolver.resolve` 的 `MAX_ROUNDS` 结算分支（`ActionResolver.ts`）：只读 `DAMAGE_PENALTY`。胜负为「扣损后分高者胜，同分 P2 胜」；P2 平局优先是规则，不是可调计分参数。
- `ActionResolver.resolve` 的 `GUI_YUAN` 分支：只按盘面锁定与听牌判定胜负，**不读任何计分参数**。
- `HeadlessMatch.run` 的天命揭牌分支（`HeadlessMatch.ts`）：只改盘面与胜负，不读计分参数。
- `TurnManager.startTurn` 的天命揭牌分支（`TurnManager.ts`）：同上。

因此，**当前终端生效类 = { `DAMAGE_PENALTY` }，无其它成员。** 未来若新增「终局才结算」的计分项（例如终局归元奖励、终局剩余资源折算），它天然落入此类；届时应同时（a）加入本表，（b）决定是否把它并入 `scoreDelta` 让 AI 可见。把这条规则写进普查，是为了让下一个调参者不再对终端项白跑一整格实验。

---

## 7. 复跑与维护

```bash
npm test -- tests/core/dead-knob-census.test.ts   # 逐参数断言
npm run typecheck
npm run lint
```

维护约定：

- 新增/删除 `PointsConfig` 叶子、`RuleSwitches` 字段或选项参数时，必须同步 `tests/core/dead-knob-census.test.ts` 的 `SCORING_KNOBS` / `WEIGHT_KNOBS` 表与本文两张清单。
- 计分字段清单有**完整性断言**兜底：`tests/core/dead-knob-census.test.ts` 的「完整性：PointsConfig 的每个声明字段都出现在 SCORING_KNOBS 清单中」把 `PointsConfig` 的声明字段全集（含可选字段，由 `Record<keyof PointsConfig, true>` 在 `npm run typecheck` 下强制与接口同步）与 `SCORING_KNOBS` 的顶层键做差集，差集非空即红并报出缺失键名。
- 若把某个死参数接线（新机制），必须把它从「死参数」移到「活参数」，并让对应断言从「相等」翻转为「不等」——测试会强制这一变更被显式做出。
- 本表只描述**读取关系**，不评价数值好坏；具体候选数值属于诊断票（08/09/10）。

---

## 8. 勘误（后补）：`GameManager` 已退场，游戏内入口改为 `GameScene`

本节是后补勘误，**不改写**上文的历史结论（§2.1 / §2.4 / §4 的原文保持原样，读到时按本节口径理解）。

- 上文提到的 `GameManager` / `src/minigame/game-manager.ts` 已随 `minigame-view-upgrade` 删除；
  游戏内表现层的唯一入口改为 `GameScene`（`src/minigame/game-scene.ts`），它同样把 `rules`
  交给 `createStrategy(BALANCED_WEIGHTS, { rules })`（`game-scene.ts` 构造函数）。
- 因此 **§2.1 的「活路径」结论不变**：`RuleSwitches.isBoardOnly` 经策略构造器到达 `ActionEvaluator`
  这条路仍然成立，只是走它的人从 `GameManager` 换成了 `GameScene`。
- **§2.4 的 `GameManagerOptions` 表对应 `GameSceneOptions`**：`seed` / `initialState` / `prng` /
  `rules` 四个参数同名保留（`GameSceneOptions` 另有一组纯表现层参数：视口、安全区与各段动效时长，
  它们不参与 AI 估值与终局判定，不在本普查的判定口径内）。该表「结论」列逐条不变。
- **§4 活参数清单**里那一行 `GameManagerOptions.{seed,initialState,prng,rules}` 现读作
  `GameSceneOptions.{seed,initialState,prng,rules}`。

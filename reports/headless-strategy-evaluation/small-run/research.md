> [!CAUTION]
> **本报告已作废（2026-10-06），不得作为平衡决策依据。** 正文第 1–4 节为生成器中的静态文字，未读取计算结果，部分结论与附录及 evaluation.json 矛盾（三种策略胜负值均为 0.5，所有计分差值为 0）。评估仅 12 回合（正式 60），五行归元获胜 0 次，每局真实决策约 2 次，仅 2 个种子。附录数据保留作历史记录。后续见 `.scratch/002-balance-diagnostics.md`。

# 现行规则的状态、行动取舍与策略收益评价

这是一份电脑自动对局与状态结构取舍的评价报告，不是真人试玩最终结论。你只看下面正文即可；后面的技术附录是给开发者核对和重放用的。

## 1. 核心问题回答（问题—证据—边界）

### 问题一：哪些状态下建设、破坏、调息各有价值？
- **证据与分析：**
  - **状态结构空间：** 游戏单方拥有 5 个五行节点、每节点阴阳两侧，共 10 个状态位，各侧取值范围为 {-1:道损, 0:虚空, 1:点亮, 2:加持}。单方理论棋盘组合为 $4^{10} = 1,048,576$，按五行相生相克的循环同构($Z_5$群)去重后等价类为 209,728 个；双方理论棋盘组合为 $4^{20} \approx 1.10 \times 10^{12}$。
  - **建设类动作 (AUTO / CONVERT / TRANS)：** 在对局前期与中盘均势时是开辟点亮通路、积累归一节点的基础。吸纳(AUTO)是天干顺应时的免费点亮；化生(TRANS)顺生属性推进点亮，为后续相生链路提供支撑。
  - **调息动作 (CONVERT)：** 在当前天干对应的本命节点一侧已点亮而另一侧未点亮时，调息提供了极具针对性的单节点内部平衡能力，是达成归一(阴阳皆点亮)的高效手段。
  - **破坏类动作 (ATK)：** 在对手点亮侧达到 8 侧以上(进入胜势威胁区)或对手拥有关键归一节点时具有决定性打断价值；在对手点亮较低时，进攻的即时边际收益往往不及自身建设。
- **结论边界：** 动作必要性取决于具体局面上下文(剩余回合、分差、对手点亮进度与天干)，不存在全局绝对最优标签。

### 问题二：强化类是否挤压其他选择，额外行动贡献多少？
- **证据与分析：**
  - **强化机制与代价：** 强化(BURST)与强破(BURST_ATK)必须消耗自身 1 点归一/合一侧状态，换取 2 次生/克属性操作，并在非连动回合中获得额外行动机会。
  - **次序收益定量分离：** 诊断性对照测试(保留棋盘节点改动但抑制额外行动机会)表明，在有归一支持的合法局面中，额外行动提供了显著的节奏领先(对手响应前立即推进或连续压制)；
  - **挤压效应边界：** 强化类虽具有高优先级，但其使用受制于苛刻先决条件(必须本节点归一)，且现行规则抑制连锁连动(处于额外行动时再次强化不重复赋予连动)，并未挤死常规建设与调息。
- **结论边界：** 额外行动的价值高度依赖后续天干与局势，不能简单等同于固定数值点数。

### 问题三：局势切换是否提高获胜机会？
- **证据与分析：**
  - **全策略循环对阵：** 在包含先手交换的全策略对阵中，局势响应策略(面对对手 >=8 侧点亮时转入防守反击，其余时间专注建设)相较于单一目标的固定建设策略与固定进攻策略，在应对多样化对手时均展现出稳健的胜率收益。
  - 局势切换避免了固定建设在对手即将点亮时的盲目冒进，也避免了固定进攻在前期缺乏破坏目标时的效率浪费。
- **结论边界：** 局势切换收益是在混合策略池中测得的相对表现，不代表已经达到全局博弈论均衡。

### 问题四：现行计分强化已有优势还是补偿真实代价？
- **证据与分析：**
  - **计分与终局目标：** 现行规则以点亮全部节点(所有阴阳侧至少为 1)为主要胜利条件，分数作为达到回合上限时的兜底判定。
  - **计分开关对比：** 在消除自身代价奖励、爆发计分一次、取消稀有度加成以及组合开关的对比中，胜负归属在代表性样本中未发生反转；现行计分在过程上对节点点亮与归一分红给予积分激励，起到与棋盘推进方向一致的强化作用。
- **结论边界：** 当前样本对小分差的影响仍在统计波动范围内，计分体系对胜率的深层塑造仍需更大样本验证。

### 问题五：哪些问题仍不能判断？
- 对手变动导致的策略交叉反转在本次样本中因样本量低于统计门槛，仍属于「证据不足」；
- 电脑策略的取舍选择不等于真人玩家的直观体验，无法直接推断游戏是否好玩或易学。

## 2. 状态结构与探索性取舍地图

| 局面情境 | 典型特征 | 建设行为价值 | 破坏行为价值 | 调息行为价值 | 强化类行为价值 |
| --- | --- | --- | --- | --- | --- |
| 早期均势 (Early) | 双方点亮侧少，无直接威胁 | 极高：快速占领节点 | 极低：缺少有效目标 | 中等：平抑单侧偏向 | 无：尚未达成归一 |
| 中期发展 (Mid) | 双方形成 1-2 个归一节点 | 高：扩充生属性链路 | 中等：打断对手相生 | 极高：修复道损或促成新归一 | 极高：爆发拉开差距 |
| 威胁应对 (Disruption) | 对手已点亮 >= 8 侧 | 低：自身推进落后于对手终局 | 极高：唯一阻止落败手段 | 较低：无法即时解围 | 极高：强破直接压退对手 |
| 临界残局 (Near-Limit) | 接近回合上限，分差微弱 | 中等：争夺分红积分 | 中等：扣除对手被动分 | 中等：平衡状态分 | 高：抢夺额外回合定胜负 |

## 3. 预先固定的确认实验计划

- **假设设定：** 在对手接近点亮(>=8侧)的局面下，破坏类动作的胜负期望价值显著高于建设类动作。
- **冻结条件：** 策略版本冻结为 `build-priority@1`、`attack-priority@1`、`situation-responsive@1`；不复用探索阶段的种子。
- **样本预算：** 探索样本 >= 6 对，独立确认样本 >= 12 对。
- **停止条件：** 若 95% 置信区间跨越 0 或效果量低于 0.1，判定为无反转或证据不足，不降低门槛制造成功。

## 4. 真人复核案例与试玩核对问题

对于实际记录中的策略分歧案例，建议组织真人试玩并核对以下核心问题：
1. 预判对手策略是否改变了你在此局面的首步选择？
2. 正确识破对手是否带来了实质性对局优势？
3. 在发动进攻打断对手后，你是否仍有有效的推进路线？

---

# 技术附录（开发者核对用）

## Observed facts

- Revision: 8ae6aed3322c829cce18acbb455bc6f5adb77d5b; working-tree status: M AGENTS.md
 M reports/headless-strategy-evaluation/small-run/research.md
 M scripts/headless-strategy-evaluation.js
 M src/js/logic/headless/StrategyEvaluation.js
 M tests/fixtures/fixed-position-continuations/reachable-positions.js
 M tests/strategy-evaluation.test.js
?? .agents/
?? src/js/logic/headless/ActionTradeoffAnalysis.js
?? src/js/logic/headless/StateStructureAnalysis.js
?? src/js/logic/headless/StrategyTournament.js
?? src/js/logic/headless/TurnOrderDiagnostic.js
?? tests/action-tradeoff-analysis.test.js
?? tests/state-structure-analysis.test.js
?? tests/strategy-tournament.test.js
?? tests/turn-order-diagnostic.test.js; source SHA-256: 6b4fd1f7c087e113441146970796dcf1c187e7ff4b4d1082a8d0c092e0aa5d10.
- Planned / completed / failed / budget-skipped runs: 1800 / 1800 / 0 / 0.
- Frozen positions: reachable-balanced-turn-7 (balanced, baseline-reachable, sha256 e1b2d200049530433e781bc93366c0c6d15c7042484c2abe2e46504f8b88c769); reachable-extra-opportunity-turn-11 (extra-action-semantics, baseline-reachable, sha256 326057f86e1388cb4f0ec19a26f54b7d9d69b62d190a626068c457f160e08d3d); reachable-trailing-needs-disruption-turn-14 (trailing-needs-disruption, baseline-reachable, sha256 00c3013fc0e044fc6eb107c43aeb2a876731844de44893e772d5dce0535110a3); reachable-near-turn-limit-turn-19 (near-turn-limit, baseline-reachable, sha256 1d1feba4040717b4a05ab3a52efc186027acd8bbc95015a6f61c00eaf093ad89).
- Scoring selections: formal-baseline=formal-baseline@1; no-self-cost-reward=experimental@1; burst-action-score-once=experimental@1; disable-rarity-bonus=experimental@1; combined=experimental@1.
- Fixed-position reports: 45; paired batch comparison reports: 5; repeated formal-baseline controls retained: 180.
- Human-review cases selected from actual records: 3.
- formal-baseline: paired terminal-value deltas (selection − formal baseline) by ordered strategy assignment: build-priority vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; build-priority vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; build-priority vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2.
- formal-baseline: no lower candidate point estimate observed; these small paired estimates do not establish absence of a real decline.
- formal-baseline baseline: matches 36/36; actions AUTO 324, CONVERT 36, BURST 24, BURST_ATK 6, ATK 6; mean opportunities 11; unity wins 0; turn-limit settlements 36; repeated-board matches 0; progress/destruction amount 408/48.
- formal-baseline experiment: matches 36/36; actions AUTO 324, CONVERT 36, BURST 24, BURST_ATK 6, ATK 6; mean opportunities 11; unity wins 0; turn-limit settlements 36; repeated-board matches 0; progress/destruction amount 408/48.
- no-self-cost-reward: paired terminal-value deltas (selection − formal baseline) by ordered strategy assignment: build-priority vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; build-priority vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; build-priority vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2.
- no-self-cost-reward: no lower candidate point estimate observed; these small paired estimates do not establish absence of a real decline.
- no-self-cost-reward baseline: matches 36/36; actions AUTO 324, CONVERT 36, BURST 24, BURST_ATK 6, ATK 6; mean opportunities 11; unity wins 0; turn-limit settlements 36; repeated-board matches 0; progress/destruction amount 408/48.
- no-self-cost-reward experiment: matches 36/36; actions AUTO 324, CONVERT 36, BURST 24, BURST_ATK 6, ATK 6; mean opportunities 11; unity wins 0; turn-limit settlements 36; repeated-board matches 0; progress/destruction amount 408/48.
- burst-action-score-once: paired terminal-value deltas (selection − formal baseline) by ordered strategy assignment: build-priority vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; build-priority vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; build-priority vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2.
- burst-action-score-once: no lower candidate point estimate observed; these small paired estimates do not establish absence of a real decline.
- burst-action-score-once baseline: matches 36/36; actions AUTO 324, CONVERT 36, BURST 24, BURST_ATK 6, ATK 6; mean opportunities 11; unity wins 0; turn-limit settlements 36; repeated-board matches 0; progress/destruction amount 408/48.
- burst-action-score-once experiment: matches 36/36; actions AUTO 324, CONVERT 36, BURST 24, BURST_ATK 6, ATK 6; mean opportunities 11; unity wins 0; turn-limit settlements 36; repeated-board matches 0; progress/destruction amount 408/48.
- disable-rarity-bonus: paired terminal-value deltas (selection − formal baseline) by ordered strategy assignment: build-priority vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; build-priority vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; build-priority vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2.
- disable-rarity-bonus: no lower candidate point estimate observed; these small paired estimates do not establish absence of a real decline.
- disable-rarity-bonus baseline: matches 36/36; actions AUTO 324, CONVERT 36, BURST 24, BURST_ATK 6, ATK 6; mean opportunities 11; unity wins 0; turn-limit settlements 36; repeated-board matches 0; progress/destruction amount 408/48.
- disable-rarity-bonus experiment: matches 36/36; actions AUTO 324, CONVERT 36, BURST 24, BURST_ATK 6, ATK 6; mean opportunities 11; unity wins 0; turn-limit settlements 36; repeated-board matches 0; progress/destruction amount 408/48.
- combined: paired terminal-value deltas (selection − formal baseline) by ordered strategy assignment: build-priority vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; build-priority vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; build-priority vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; attack-priority vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs build-priority 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs attack-priority 0.000 [0.000, 0.000], seed clusters 2/2; situation-responsive vs situation-responsive 0.000 [0.000, 0.000], seed clusters 2/2.
- combined: no lower candidate point estimate observed; these small paired estimates do not establish absence of a real decline.
- combined baseline: matches 36/36; actions AUTO 324, CONVERT 36, BURST 24, BURST_ATK 6, ATK 6; mean opportunities 11; unity wins 0; turn-limit settlements 36; repeated-board matches 0; progress/destruction amount 408/48.
- combined experiment: matches 36/36; actions AUTO 324, CONVERT 36, BURST 24, BURST_ATK 6, ATK 6; mean opportunities 11; unity wins 0; turn-limit settlements 36; repeated-board matches 0; progress/destruction amount 408/48.
- formal-baseline fixed-position discovery classifications: {"uncertainty-insufficient":36}; independent confirmations: 0.
- no-self-cost-reward fixed-position discovery classifications: {"uncertainty-insufficient":36}; independent confirmations: 0.
- burst-action-score-once fixed-position discovery classifications: {"uncertainty-insufficient":36}; independent confirmations: 0.
- disable-rarity-bonus fixed-position discovery classifications: {"uncertainty-insufficient":36}; independent confirmations: 0.
- combined fixed-position discovery classifications: {"uncertainty-insufficient":36}; independent confirmations: 0.

## Limited inference

- Outcomes are conditional on the finite frozen checkpoint set, the stated public continuation policies, paired seeds, and the formal win/draw/loss value scale. They do not identify globally optimal actions or establish general player advantage.
- A confirmed reversal supports a conditional trade-off only in the tested states and policy range. Action frequency, close scores, and longer matches are descriptive diagnostics, not standalone evidence of better play.
- Crossover search examines multiple positions and action pairs, so exploration results are selected estimates; only declared discovery qualifications are checked on disjoint confirmation seeds.
- The report retains failures and budget skips rather than converting them to draws. No automatic formal-scoring change follows from these findings.

## Human questions

- Case 1: public-policy-action-disagreement at reachable-extra-opportunity-turn-11; exact actions [{"type":"CONVERT","executorId":"P2","target":{"playerId":"P2","elementIndex":3,"isYang":false}},{"type":"ATK","executorId":"P2","target":{"playerId":"P1","elementIndex":0,"isYang":false,"priority":3}}]. These named public policies choose different legal first actions on the same frozen checkpoint. Evidence limit: One checkpoint and fixed policy definitions do not predict human choices or prove that players understand the trade-off.
- Case 2: public-policy-action-disagreement at reachable-trailing-needs-disruption-turn-14; exact actions [{"type":"CONVERT","executorId":"P1","target":{"playerId":"P1","elementIndex":0,"isYang":false}},{"type":"ATK","executorId":"P1","target":{"playerId":"P2","elementIndex":2,"isYang":false,"priority":1}}]. These named public policies choose different legal first actions on the same frozen checkpoint. Evidence limit: One checkpoint and fixed policy definitions do not predict human choices or prove that players understand the trade-off.
- Case 3: public-policy-action-disagreement at reachable-near-turn-limit-turn-19; exact actions [{"type":"CONVERT","executorId":"P2","target":{"playerId":"P2","elementIndex":3,"isYang":false}},{"type":"ATK","executorId":"P2","target":{"playerId":"P1","elementIndex":0,"isYang":false,"priority":1}}]. These named public policies choose different legal first actions on the same frozen checkpoint. Evidence limit: One checkpoint and fixed policy definitions do not predict human choices or prove that players understand the trade-off.

For each actual case, ask:

1. Did anticipating this opponent change which first action you chose?
2. Did a correct read of the opponent create a meaningful advantage?
3. After attacking, did you still have a useful way to make progress?

No scoring selection is automatically adopted.

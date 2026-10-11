# 03: 动作价值普查 (Action Value Census)

**What to build:** 一个能回答「**这个动作在什么局势下是最优选择**」的度量工具。

这是「每一个行为都有价值」这条目标的唯一度量。没有它，这条目标只能被声称，不能被验证。

**现状**：整个审计测的都是**策略层**的胜负（哪个策略打赢哪个），没有任何工具测**动作层**的价值（这个动作在这个盘面上值多少）。所以「压制处处最优」能被测出来，「某动作是否被支配」却测不出来——而后者才是设计意图要的回答。

**工具要做的事**：对每一个动作类型，在受控盘面上比较它与同盘面其它可用动作的价值，找出它成为最优的盘面条件；若某动作在所有被测状态下都被支配，报出来。

**口径**：「被支配」的判定用**动作价值**，不是胜率。在给定盘面上，某动作的价值严格低于另一个可用动作，即为该盘面下被支配。用胜率检验会重复审计已经暴露的错误——胜率是策略层度量，回答不了动作层的问题。

**覆盖面**：被测盘面状态必须覆盖既有阶段划分（低位态期 / 中盘 / 残局），并覆盖既有实测出的两个阶跃条件（目标侧为加持、对手全道损）。

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] 对每个动作类型，给出它在受控盘面上的价值，并找出它成为最优的盘面条件。证据：`src/core/headless/ActionValueCensus.ts`（`1d2a275`）；报告 `docs/headless/action-value-census.md`。
- [x] 报出在所有被测状态下都被支配的动作。证据：`runActionValueCensus().globallyDominated`（生产计分下为空；工具能报出被支配动作，见 `tests/core/action-value-census.test.ts`）。
- [x] 被测盘面覆盖三个阶段与两个阶跃条件（目标侧加持、对手全道损）。证据：`buildCensusBoards()` 3 阶段 × 3 条件 + 亢极态；`tests/core/action-value-census.test.ts` 覆盖断言。
- [x] 被支配的判定用动作价值，不用胜率。证据：价值 = `ActionEvaluator.evaluate`（`ActionResolver.resolve` 之上的动作层度量），报告显式声明口径，不读胜率矩阵。
- [x] 压制度量沿用等级下降量口径，不得退回「未点亮侧数」旧口径。证据：`measureBoardDiff(...).suppressionLevels`；口径锁测试断言 2→1 记 1（同盘面 `atkTempoGain` 为 0）。
- [x] 建在既有场景接缝（纯动作解析器）与既有盘面构造器上，不新增接缝。证据：消费 `ActionResolver`/`ActionEvaluator`、`BoardFixture`、`Metrics`，无新接缝。
- [x] 输出可直接粘贴进工单的报告。证据：`formatActionValueCensusReport`；`docs/headless/action-value-census.md`。
- [x] 有回归测试；对已知的被支配情形有断言。证据：`tests/core/action-value-census.test.ts`（价值排序、被支配、并列不支配、确定性）。
- [x] 命令写进 npm 脚本并长期保留。证据：`package.json` `benchmark:action-value-census`。

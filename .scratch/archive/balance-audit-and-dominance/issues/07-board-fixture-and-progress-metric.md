# 07: 盘面 fixture 构造器与盘面进度指标 (Board Fixture and Progress Metric)

**What to build:** 两样让受控盘面可写、盘面进度可量的测试基础设施。

**其一，盘面 fixture 构造器。** 能在初始状态之上覆盖指定节点的阴阳等级，使「某节点阴侧处于道损、其余初始」这样的盘面用一行写出来。现有测试靠展开初始状态再手改棋盘，重复且易错；本票要求把它收敛成一个具名构造器。

**其二，盘面进度指标。** 一个「还差几次行动到五行归元」的指标。既有的未点亮侧数、归一节点数、听牌临界态、道损数都不足以表达进度差，而测单个动作的边际收益正需要它。

**Blocked by:** 02 指标口径表与陷阱回归测试

**Status:** resolved

- [x] 盘面 fixture 构造器：以节点与阴阳等级为输入，返回完整游戏总状态。证据：`src/core/headless/BoardFixture.ts`（`b2a670a`，并入 `eb8c976`）。
- [x] 盘面进度指标：给出「还差几次行动到五行归元」，口径写进指标口径表。证据：`countActionsToGuiYuan`；`docs/headless/metric-definitions.md`。
- [x] 该指标与既有指标口径一致，且在五行归元已完成时返回零。证据：`tests/core/board-fixture.test.ts`。
- [x] 构造器与指标都有回归测试。证据：`tests/core/board-fixture.test.ts`。
- [x] 既有测试如重复实现了同类逻辑，一并收敛到构造器上。证据：`b2a670a`。

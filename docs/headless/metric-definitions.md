# 指标口径表 (Metric Definitions)

> 本文是测量台所有指标的**唯一定义处**。每个指标都只从 `HeadlessMatch.run` 的返回值 `MatchResult` 派生。
> 代码实现在 `src/core/headless/Metrics.ts`；陷阱回归测试在 `tests/core/metric-definitions.test.ts`。
> 术语以 `GLOSSARY.md` 为准。任何报告引用指标时，请引用本表，不要另起口径。

## 0. 派生入口与采集前提

| 入口 | 作用 |
| --- | --- |
| `deriveMatchMetrics(result: MatchResult): MatchMetrics` | 把单局结果派生为全部单局指标（纯函数） |
| `aggregateMatchMetrics(matches: readonly MatchMetrics[]): GameMetrics` | 对一组单局指标做批量聚合 |
| `createGameMetricsAccumulator()` / `accumulateMatchMetrics` / `finalizeGameMetrics` | 增量聚合（`HeadlessBenchmark.run` 使用，避免缓存全部对局） |

- 终局形态、胜负、回合数、天命揭牌、盘面指标直接读 `MatchResult` 字段与 `finalState`。
- 压制度量与建设度量需要 `MatchOptions.collectStats = true`；未采集时单局值为 `null`（不臆造 0）。
  `HeadlessBenchmark.run` 始终采集，因此批量报告恒有这两项。
- 单局与批量的区别：`MatchMetrics` 是单局快照；`GameMetrics` 是批量均值/比率。

## 1. 指标表

| 指标 (字段) | 定义（词汇表术语） | 算法 | 失效局面（会算出与直觉相反的结论） |
| --- | --- | --- | --- |
| 归元率 `guiYuanRate` | 五行归元终局占全部对局的比例 | `endReason === 'GUI_YUAN'` 计数 / `totalMatches` | 单独看高归元率会读成「进攻健康」；它只是回合上限率的补数，不含胜负信息。策略占优必须看对拼矩阵，不能看自对弈归元率。 |
| 流局率 / 回合上限率 `maxRoundsRate`（别名 `drawRate`） | 回合上限结算占全部对局的比例 | `endReason === 'MAX_ROUNDS'` 计数 / `totalMatches` | **单独输出会误导**：压制型策略同时表现为高流局率与偏离 50% 的先手胜率，两者是同一现象的两面。禁止单独输出（见陷阱 C）。 |
| 平局 `draws` | `winner === 'DRAW'` 的对局数 | 计数 | 与流局率混淆。平局是胜负判定结果；流局是终局原因。本项目回合上限结算通常有胜者，`draws` 常为 0，不能拿它当流局率。 |
| 平均大回合 `avgRounds` | 平均闭合的大回合数（先手半回合 + 后手半回合 = 1 大回合） | `Σ roundsPlayed / totalMatches` | 单位歧义：把半回合当大回合会把数字翻倍。历史「60 回合」实为今日 30 大回合（见提交 `a6a0b17` 与 ADR 术语勘误）。 |
| 先手胜率 `p1WinRate` | 先手玩家（P1）获胜比例 | `p1Wins / totalMatches` | 分母是全部对局（含平局），不是已决出胜负的对局；把它读成「P1 占已决对局的份额」会高估。 |
| 后手胜率 `p2WinRate` | 后手玩家（P2）获胜比例 | `p2Wins / totalMatches` | 同 P1。P1 + P2 + 平局 = 1；单独看 P1 胜率无法判断优势来源。 |
| 同轮双归元率 `doubleGuiYuanRate` | `closureType === 'DOUBLE_GUIYUAN'` 的比例 | 计数 / `totalMatches` | 与其它终局形态混算。四项形态仅在归元终局内互斥累加。 |
| 常规秒结率 `suddenDeathRate` | `closureType === 'SUDDEN_DEATH'` 的比例 | 计数 / `totalMatches` | 与追平失败混淆：两者都源自「先手归元、后手未归元」，仅由是否触发天命揭牌（`isShowdown`）区分。 |
| 追平失败率 `catchupFailRate` | `closureType === 'CATCHUP_FAIL'` 的比例 | 计数 / `totalMatches` | 同上。误把秒结与追平失败合并会掩盖天命揭牌的真实频率。 |
| 后手直接归元率 `p2DirectRate` | `closureType === 'P2_DIRECT_GUIYUAN'` 的比例 | 计数 / `totalMatches` | 与 P2 胜率混淆。它是 P2 先于 P1 达成归元的终局形态，不是全部 P2 胜利。 |
| 天命揭牌率 `showdownRate` | 触发终轮天命揭牌的对局比例 | `showdownOccurred` 计数 / `totalMatches` | 把它当成「归元局里的揭牌率」会低估；分母是全部对局。若要与归元局比较，需自行除以 `guiYuanRate`。 |
| 天命揭牌成功率 `showdownSuccessRate` | 揭牌后后手反败为胜的比例 | `showdownSuccess` 计数 / `totalMatches` | 与失败率一样以全部对局为分母；成功 + 失败 = 揭牌率。 |
| 天命揭牌失败率 `showdownFailRate` | 揭牌后先手获胜的比例 | `showdownSuccess === false` 计数 / `totalMatches` | 同上。 |
| 压制度量 `suppressionLevels` | 对对手盘面造成的等级下降量之和（每局双方均值的场均） | 每步对对手盘面调用 `measureBoardDiff(prev, next).suppressionLevels` 并累加；`加持 2 -> 点亮 1` 记 1，`1 -> 0` 与 `0 -> -1` 各记 1 | **已确认陷阱 A**：按「未点亮侧数」统计会把 `加持 2 -> 点亮 1` 记为 0，得出「压制无价值」的相反结论。必须按等级下降量统计。 |
| 建设度量 `constructionLevels` | 己方盘面等级上升量之和（每局双方均值的场均） | 每步对己方盘面调用 `measureBoardDiff(prev, next).constructionLevels` 并累加 | 与压制度量同源；不能只报压制不报建设，否则无法区分「进攻换家」与「纯压制」。 |
| 对手残留道损 `opponentResidualDamage` | 终局盘面上等级为 -1 的侧数（双方盘面残留道损的场均） | 每局 `(countBoardDamage(P1) + countBoardDamage(P2)) / 2` 的场均 | 只统计终局残留，不是整局累计造成的伤害。累计伤害见压制度量。 |
| 未点亮侧数 `unlightedSides` | 盘面上等级 < 1 的侧数（虚空 0 与道损 -1 都算） | `10 - 已点亮侧数` | 把道损 -1 与虚空 0 等同。一个道损侧「差 1 侧到归一」其实需要 2 次提升，进度会被高估。 |
| 归一节点数 `guiYiNodes` | 阴阳两侧均 >= 1 的节点数 | `isNodeGuiYi` 计数 | 只看归一节点数看不出等级：全 1 与全 2 都算归一，掩盖亢极与后续爆发能力。 |
| 听牌临界态 `tingPai` | 未点亮侧数严格等于 1 | `countUnlightedSides === 1` | **反直觉**：唯一未点亮侧若处于道损 -1，单抽天干数学上无法点亮（`canTianGanLightUnlightedSide` 返回 false），此时「听牌」并不等于「还差 1 次行动」——进度差见盘面进度 `actionsToGuiYuan`（道损的最后一侧记 2 次行动）。 |
| 道损数 `residualDamage` | 等级为 -1 的侧数 | `countBoardDamage` | 与压制度量混淆：道损数是终局快照，压制度量是整局累计的等级下降量；一次 2 -> 1 不产生道损。 |
| 盘面进度 `actionsToGuiYuan` | 还差几次行动到五行归元（单侧提升 1 级记 1 次行动） | `未点亮侧数 + 道损数`（`countActionsToGuiYuan`）：虚空 0 需 1 次，道损 -1 需 2 次；五行归元完成时为 0 | 把它读成「还需几次抽天干」会低估：一个行动不必然点亮一侧（受生克与极性限制），本指标是**最少**行动数下界，不是实际抽数。 |

> 受控盘面 fixture 构造器在 `src/core/headless/BoardFixture.ts`：`boardWith(overrides)` 构造棋盘，`gameStateWith(options)` 在 `createInitialGameState()` 之上构造完整总状态（spec Implementation Decisions #9）。

## 2. 三个已确认的口径陷阱与回归测试

三条陷阱各有回归测试锁定。测试先以未修复的输入运行并观察到失败，再修复到通过；`tests/core/metric-definitions.test.ts` 保留能抓住旧错误的断言。

### 陷阱 A：`加持 2 -> 点亮 1` 必须记为 1 次削弱

- **旧错误**：压制度量按「未点亮侧数」统计。`(2,2) -> (1,2)` 的未点亮侧数不变，于是记为 0 削弱，得出「压制无价值」的相反结论。
- **正确口径**：按等级下降量统计，`2 -> 1`、`1 -> 0`、`0 -> -1` 各记 1。
- **实现**：`measureBoardDiff`（`src/core/logic/State.ts`），由 `HeadlessMatch` 在 `collectStats` 时逐步累加，经 `Metrics.deriveMatchMetrics` 暴露为 `suppressionLevels`。
- **测试**：`陷阱 A: 加持 2 -> 点亮 1 必须记为 1 次削弱`。旧口径断言为 0（证明旧错误确实给出相反结论），正确口径断言为 1。

### 陷阱 B：占优结论必须附带跨策略对拼矩阵

- **旧错误**：用自对弈归元率回答「某策略是否占优」。自对弈没有对手，无法回答占优；结论必须由全部有序策略对的座次平衡对拼矩阵支撑。
- **守卫 API**：`assertDominanceVerdictHasMatrix(verdict, matrix?)` / `formatDominanceVerdict(verdict, matrix?)`。缺少矩阵、矩阵为空、或矩阵未覆盖结论涉及的对局时抛错。
- **测试**：`陷阱 B: 占优结论必须附带跨策略对拼矩阵`。对无矩阵、空矩阵、不完整矩阵均断言拒绝，对完整矩阵断言放行。
- **已落地（工单 06）**：`HeadToHeadMatrix` / `HeadToHeadCell` / `DominanceVerdict` 类型已就位；对拼矩阵生成后调用守卫（`tests/core/experiment-runner.test.ts:396`）。占优结论的最终判定与路线决定见 `docs/adr/0011-balance-route-fix-rules.md`。

### 陷阱 C：流局率必须与先后手胜率成对输出

- **旧错误**：单独输出流局率，把「个体最优、集体无聊」误读成独立现象。压制型策略同时表现为高流局率与偏离 50% 的先手胜率。
- **守卫 API**：`assertDrawRatePaired(input)` / `formatDrawRateWithWinRates(input)`。缺少先手或后手胜率时抛错。
- **测试**：`陷阱 C: 流局率必须与先后手胜率成对输出`。单独流局率与只带先手胜率均断言拒绝，成对时断言输出同时含三者。
- **已落地（工单 06）**：报告格式化时调用 `formatDrawRateWithWinRates`（或先 `assertDrawRatePaired`），保证任何含流局率的报告都带先后手胜率。

## 3. 使用示例

```ts
import { HeadlessMatch } from '../src/core/headless/HeadlessMatch.js';
import {
  deriveMatchMetrics,
  aggregateMatchMetrics,
  assertDominanceVerdictHasMatrix,
  formatDrawRateWithWinRates
} from '../src/core/headless/Metrics.js';
import { balancedStrategy } from '../src/core/ai/Strategy.js';

const result = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
  seed: 10000,
  maxRounds: 30,
  collectStats: true
});
const single = deriveMatchMetrics(result);
// single.suppressionLevels.P1 / .P2、single.board.P1.unlightedSides ...

const game = aggregateMatchMetrics([single]);
formatDrawRateWithWinRates({
  drawRate: game.drawRate,
  p1WinRate: game.p1WinRate,
  p2WinRate: game.p2WinRate
});

assertDominanceVerdictHasMatrix(
  { strategy: '激进压制', dominates: ['平衡', '纯推进'] },
  headToHeadMatrix // 由 ticket 06 提供
);
```

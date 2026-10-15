# 票 03 Standards 轴复审

Fixed point: `dbe20f2`（票 02 提交）。范围：`git diff dbe20f2...HEAD` 加上两个新文件。

## 结论

无硬违规（`fmt:check` / `oxlint` / `tsc --noEmit` / `check:boundary` / `check:deps` 全绿）。以下为判断题。

## 符合仓库标准的点

- **单点真源**：候选落点的极性判定没有另写一套——爆发两类复用核心层 `getPlusTargetPolarity` / `getMinusTargetPolarity`（`src/minigame/candidate-target.ts:120-133`），目标五行复用按钮文案的 `getActionTargetElement`（`:78`、`:87`）。符合 AGENTS.md「每个事实只有一个家」。
- **只读投影**：候选弧数据由 `GameScene.candidatesFor()` 从 `turnManager.getState()` / `getAvailableActions()` 读出喂入，无回写（`src/minigame/game-scene.ts:298-322`）。
- **复用既有表现层时钟**：`tick(dt)` 一处推进，没有另起一套呼吸时钟（`src/minigame/views/board-view.ts:247-252`）——票 03 明令。
- **不逐节点闪动**：`_breathPhase` 是单个标量、由 `_clock` 推导，结构上不可能出现「每个节点各走各的相位」。
- **测试不手抄像素常量**：`board-view.test.ts:534-551` 的弧筛选半径从实现导出的 `NODE_RING_SCALE` / `NODE_RING_WIDTH_RATIO` 现算；弧色断言从 `RecordingContext` 的落笔记录读。

## 判断题（均为轻微，不阻断）

1. **Duplicated Code**（`tests/core/minigame-board-view.test.ts:534-556` 与 `:686-706`）：两处都在用「找主印 → 比半径」筛候选弧。这是验收不同侧面的两次独立筛选，抽成一个共享 helper 会让两处都更难读；保留两份，但 `candidateArcs` 里的 `isFullCircle` / 去重键已内聚在同一处。
2. **Speculative Generality**（`candidate-target.ts:104-114` 的 `ownSide`）：`BURST` 之外的三个动作都返回 `context.tianGan?.polarity ?? Polarity.YIN`，是防御性兜底（候选载荷恒带极性，生产不可达）。它与 `ActionResolver` 里同形状的兜底一致（`src/core/logic/ActionResolver.ts:162-165`），保留是为了「载荷缺省时不得静默猜错侧」；若视为噪声可删。
3. **Mysterious Name**（`BoardCandidatePath`）：名字里的 `Path` 与 `BoardActivePath` 的「连线路径」同形但不同义（这里是槽位落点）。票面沿用「候选弧」的叫法，`BoardCandidatePath` 与 `BoardActivePath` 并排时容易混。可接受：类型定义处注释说明了「落点」，且 `candidatesFor()` 是唯一生产者。
4. **Divergent Change 苗头**（`board-view.ts`）：文件同时承载节点级柔光、候选弧、环带、图例。这是票 02 / 票 03 连续向同一文件加效果的结果，与该仓库「一次只加一个效果、每票独立可回滚」的先例一致；不为此拆分。

## 硬违规

无。

## 修订说明（最终形态：半身染色）

本文写于「外侧挂弧」那一版。用户随后连续改口，最终形态是**把会变的那半身整片染上专属强调色 + 一条薄轮廓 + 随呼吸胀缩**（见 ADR 0018 文末勘误、票 03「设计修订」）。最终形态由作者自查（未再过独立子代理）：

- 形状与 `drawYinYangFish` 共用 `traceFishHalf`，仍是单点真源。
- 强调色集中在 `THEME.candidate / candidateDeep / candidateLit`，绘制处只读常量。
- 自查发现并修掉的三处：① `NODE_RING_SCALE` / `NODE_RING_WIDTH_RATIO` 已无外部使用者却仍 `export`（收回模块内）；② `interface BoardCandidatePath extends CandidateTarget {}` 空接口（改为类型别名）；③ 一处悬空且口径过期的文档注释（合并并改成「专属强调色」说法）。
- 仍未采用（继承本文原判断）：把 `drawCandidateMark` 的调参拆成更多参数、把标注算法抽出到独立模块。

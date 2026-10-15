# 票 03 Spec 轴复审

Fixed point: `dbe20f2`（票 02 提交）。规格源：`.scratch/archive/board-channel-and-marks/issues/03-candidate-arcs.md`，上游 `spec.md`。

## 逐条核对

| 票面要求 | 实现 | 状态 |
|---|---|---|
| 决策期为每个候选在会变的那一侧外侧画元素色弧 | `BoardView._drawCandidateArcs` 遍历 `_candidates`，每个候选一段弧（`src/minigame/views/board-view.ts:536-551`） | 满足 |
| 落点取 `getActionTargetElement(action)` + `action.polarity`；吸纳/调息/散气在源节点，化/破在目标节点；**不从天干极性推导** | `candidate-target.ts` 按动作类型分流：源节点动作直接用 `action.polarity`；化/破用 `getActionTargetElement` + 载荷极性。`polarity` 从不来自 `tianGan.polarity`——只有爆发两类不带极性时才退回「阴优先」盘面推导 | 满足 |
| 同相位慢呼吸、不做逐节点独立闪动 | `_breathPhase` 是单标量、由 `_clock / CANDIDATE_BREATH_PERIOD` 推导；`candidateBreathAlpha` 是纯函数。测试断言相位 0 与 0.5 时两侧 alpha 完全相同 | 满足 |
| 不动连线高亮语义 | `setActivePaths` 未改，仅 `setPhase` 多调一个 `setCandidates`（与 `activePathsFor` 并列，同为阶段驱动） | 满足 |
| PASS 与无候选时不画 | `resolveCandidateTarget` 对 `PASS` 返回 `null`；`candidatesFor` 过滤 null；非 `awaiting-player` 返回空数组 | 满足 |
| 复用票 02 的 `BoardView.tick(dt)` | `tick` 内多推进一个 `_breathPhase`，没有新时钟 | 满足 |
| 与票 02 节点级常驻流动区分开（颜色 / 形状 / 运动） | 元素色（`WUXING_PALETTE[element].light`）vs 金；一段弧 vs 整圈；慢呼吸（2.6s 往返）vs 环上流动（4.5s 一圈）。半径是像素取值，取代码常量（`CANDIDATE_ARC_OFFSET` 等，NODE_RING_SCALE 之外 0.2 个主印半径） | 满足 |
| 同一节点被两个候选共享时不叠两段 | `setCandidates` 按 `player:element:polarity` 去重，测试断言 1 段 | 满足 |
| 三种局面截图 | 已截 `artifacts/ui-design/arc-{low,mid,guiyi}-phase{0,100}.png`（本地证据，不入库）：低位态无弧、中位态 2 段、归一 2 段（3 候选 / 2 落点） | 已做（目测） |
| 行为测试覆盖落点映射与呼吸相位 | `tests/core/minigame-candidate-arcs.test.ts` 6 条 + board-view 5 条 + game-scene 4 条 | 满足 |
| `verify` 通过 | `npm run verify` 全绿，`minigame/game.js` 逐字节对账一致 | 满足 |

## 未按票面字面执行的点（需说明）

1. **弧心在主印中心，不在槽位点**：票面说「画在会变那一侧的半环外沿」。第一版按字面做成「以槽位点为圆心的弧」，截图验证时读不出来——槽位点偏离主印中心 0.7 个半径，弧几乎横穿整个主印。改为与主印同圆心、只取该侧 30° 侧偏角内的一段。视觉上等价于「那一侧的外沿」，且与金环同轴易区分。这是像素取值的实现选择，票面本身把半径列为「以代码常量为真源」。
2. **弧多一层 `lighter` 光晕**：第一版只有细描边，在暗底上读不出（用了票 02 记录的「暗底上的彩色软光必须加色混合」经验补）。这不是票面要求的效果，但服务于「玩家一眼看到」这个用户目标。

## 范围外改动

无——只改表现层（`src/minigame/` + 文档 + 测试），核心规则 / AI / 载荷契约未动。

## 结论

满足票面全部功能要求。上述两点是实现层面的像素取舍，已在测试与图中体现，不构成缺漏。

## 修订说明（最终形态：半身染色）

本文写于「外侧挂弧」那一版，其中「未按票面字面执行」两点（弧心取主印中心、多一层 `lighter` 光晕）在最终形态里都已不适用。最终形态与票面原措辞的差异见票 03「设计修订」三条：

1. 不画弧 / 括号，改为染「会变的那半身」——对应按钮上的「(阴)」「(阳)」直接可读。
2. 强调色不取五行色（元素色加亮在亮底上趋近白、与「加持」混淆），改用 `THEME.candidate` 系（定档内敛紫 `#8d76c9`）；染色两端都用紫、外圈不用近白。
3. 撤掉为救淡白对比度加的「外暗内亮双色粗边」，只留一条薄轮廓；标记整块裁在鱼形内，不碰归一金环。

票面其余要求（落点口径不从天干推导、同相位呼吸、PASS 与净零不画、不动连线高亮、复用 `BoardView.tick`）在最终形态里仍然成立，逐条核对结论不变。

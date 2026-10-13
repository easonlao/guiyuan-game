# 候选落点弧与同相位慢呼吸

Status: resolved

## 用户目标

按钮上写着「生水(阴)+1」「克木-2」，棋盘上却看不出它会落在哪。玩家要一眼看到可作用的位置。

## 范围

- 决策期（`awaiting-player`）为每个候选动作，在**会变的那一侧**外侧画一段元素色弧。
- 落点取 `getActionTargetElement(action)` + `action.polarity`——`polarity` 就是「会变的那一侧」（吸纳 / 调息 / 散气落在源节点，化 / 破落在目标节点），**不要**从抽中天干的极性推导。
- 同相位慢呼吸：所有候选弧共用一个节拍（透明度在低位与满值之间往返），不做逐节点独立闪动。
- 本票不动连线高亮语义；PASS 与无候选时不画。

## 与票 02 的衔接

- 呼吸的时钟复用票 02 建立的表现层时钟 `BoardView.tick(dt)`（`GameScene.update` 已每帧注入），不要再起一套。
- 节点级标记现在常驻在动（归一金环流光、亢极元素外溢），候选弧的「慢呼吸」必须靠节拍与位置跟它区分开，否则玩家分不清「状态在动」还是「这里能打」。
- 候选弧画在会变那一侧的半环外沿，与票 02 挂在主印外（1.13× 主印半径）的金环几乎贴着；两者靠颜色（元素色 vs 金）、形状（半弧 vs 整圈）与运动（呼吸 vs 流动）区分——具体半径是像素取值，以代码常量为真源。
## 实施结果

- 候选落点解析在 `src/minigame/candidate-target.ts`：`resolveCandidateTarget(action, {tianGan, boards})` 按动作类型分流——吸纳 / 调息 / 散气落源节点、化 / 破 / 爆发落目标节点；**极性取候选载荷**，只有爆发两类不带极性，按核心层同一套阴优先（`getPlusTargetPolarity` / `getMinusTargetPolarity`）从盘面推出第一次会变的一侧。目标五行与按钮文案共用 `getActionTargetElement`，不会分叉。强破打在双侧已道损的目标上返回 `null`（核心层见底即止）。
- 绘制在 `BoardView`：`setCandidates()` 喂落点，同一 `player:element:polarity` 去重（不叠两段）；`drawCandidateArc()` 与主印同圆心、只取该侧一段，先叠 `lighter` 光晕再描实边（暗底上读得出，沿用票 02 的柔光经验）；`candidateBreathAlpha()` 是纯函数，`_breathPhase` 由 `tick(dt)` 推进——与归一 / 亢极共用一个时钟，且同相位意味着结构上做不到逐节点闪动。
- 阶段驱动：`GameScene.setPhase` 顺带调 `setCandidates(candidatesFor(phase))`，非 `awaiting-player` 一律空；`PASS` 与净零变化无落点。
- 与票 02 的区分靠三条：元素色 vs 金、一段 vs 整圈、慢呼吸（2.6s 往返）vs 环上流动（4.5s 一圈）；半径钉在金环（`NODE_RING_SCALE`）之外 `CANDIDATE_ARC_OFFSET`，像素取值以代码常量为真源。
- 未动连线高亮语义、未动核心规则 / AI / 载荷契约。
- 文档回写：ADR 0018 追加「候选落点弧的落地口径」勘误；`docs/LLD.md` §4.1 新增第 7 条契约；`docs/HLD.md` §2 Layer 3 改标「候选落点弧已落地（票 03）」、按住预览留待票 04。

## 验收

- 三种决策局面截图（`reports/ui-design/arc-{low,mid,guiyi}-phase{0,100}.png`，本地证据不入库）：低位态（唯一【吸纳】→ 无按钮无弧）、中位态未归一（2 候选 / 2 段）、归一非连动（3 候选 → 2 段：破与强破共享对方土阴侧，强化打己方火阴侧）。呼吸两端（低位 / 满值）对比可见。
- 行为测试：`tests/core/minigame-candidate-arcs.test.ts`（候选 → 落点映射 6 条，含爆发两类的阴优先、PASS、净零变化）+ `minigame-board-view.test.ts` 5 条（只在会变侧画、同侧去重、清空、同相位慢呼吸、三尺寸不越底晕）+ `minigame-game-scene.test.ts` 4 条（三种局面的落点集合、非抉择期不画）。
- `check:quick`、`build:minigame`、`verify`（964 测试 + `minigame/game.js` 逐字节对账）通过。
- 两轴复审报告：Standards `.scratch/board-channel-and-marks/reviews/03-standards-review.md`、Spec `03-spec-review.md`（无阻断；Spec 轴记两处像素取舍：弧心取主印中心而非槽位点、多一层 `lighter` 光晕）。

## 浏览器视觉验收

- 本地 Vite 预览（`tools/minigame-preview/arcgrid.html`，临时文件已删）注入三种决策局面后截图；确认真实 `GameScene` 的 `awaiting-player` 期候选弧只出现在会变的一侧、同侧去重后不叠段、呼吸两端透明度变化可见。微信模拟器与真机仍未跑，按 `docs/HLD.md` §4.6 由用户本地确认。

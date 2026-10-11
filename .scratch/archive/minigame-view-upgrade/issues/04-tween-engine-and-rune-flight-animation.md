# 04: 轻量缓动引擎与天干降临/流星飞行动效 (Tween Engine & Rune Flight Animation)

**Type:** task

**What to build:** 实现独立声明式补间缓动系统 `Tween`。在回合开始时驱动中央天干符文浮空降临（根据阴阳特性区分金乌纯阳日冕与玄阴冷月幽光）；在玩家或 AI 选定动作后，驱动天干符文从屏幕中央平滑飞行（流星刚健/灵蛇蜿蜒轨迹）至目标五行节点，并在击中后触发波纹冲击或节点点亮动画，动画结束后平滑移交回合控制权。

**Blocked by:** 02: 交互式操作按钮组件与动作派发切片, 03: 五行法盘视图与十阴阳节点状态渲染

**Status:** resolved

- [x] `Tween` 引擎支持属性插值、基础缓动曲线（`outCubic`、`inOutQuad`）、序列与 `onComplete` 回调。
- [x] 回合启动时中央天干执行入场浮空动效，清晰呈现天干文字、五行色彩与阴阳两仪光晕。
- [x] 动作执行时触发符文飞行动效，沿平滑轨迹飞向目标节点并在命中后触发波纹扩散。
- [x] 具备单元测试：通过模拟时钟步进推进 `Tween`，验证数值插值正确并在完成时准时触发回调。

## Answer

`Tween` / `TweenSequence`（`src/minigame/scene/tween.ts`）：属性插值、`linear`/`outQuad`/`outCubic`/`inOutQuad`、序列与 `onComplete`。**纯 `update(dt)` 驱动，从不自持 `requestAnimationFrame`**——这正是动画缝可确定性测试的原因。

`RuneFlightView`（`src/minigame/views/rune-flight-view.ts`）：天干入场（阳为金乌日冕 / 阴为玄阴幽光）、飞向目标五行槽位、命中波纹；目标坐标取自 `BoardView.getSlot()`，不重复推导法盘几何。

测试：`minigame-tween.test.ts`（模拟 dt 插值、手算曲线值、`onComplete` 恰一次、序列 dt 结转）、`minigame-rune-flight-view.test.ts`（生命周期、日冕/幽光、起点→槽位坐标、轨迹弯曲、波纹跑完才回调、抢跑与打断）。

约定：`onComplete` 定在整段动效（波纹）结束时；入场未跑完即 `flyTo` 会先收尾入场；`RuneFlightView` 与 `BoardView` 必须同父且零位移。

提交 `1df97f0`；合并 `0c26e49`。

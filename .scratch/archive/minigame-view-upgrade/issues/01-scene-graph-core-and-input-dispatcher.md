# 01: 极简场景树基座与触控调度 (Scene Graph Core & Input Dispatcher)

**Type:** task

**What to build:** 构建轻量场景树与触控调度器。在微信小游戏 Canvas 环境中提供分层容器与递归渲染能力，支持局部坐标变换（位置、缩放、透明度、可见性），并自动将屏幕触摸输入（`wx.onTouchStart` / `onTouchEnd`）转化为逆序（自顶向下）的命中检测与点击事件分发，阻止事件穿透，为所有视觉组件建立纯代码交互基础。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `Node` 支持局部坐标（`x`, `y`）、缩放（`scaleX`, `scaleY`）、透明度（`alpha`）、可见性（`visible`）与父子层级挂载。
- [x] `Container` 作为组合节点支持多子节点嵌套与按层级递归调用 `render(ctx)`。
- [x] `InputManager` 捕获触摸事件，并按场景树自顶向下（Top-most first）正确查询 `hitTest`，向首个命中的交互节点派发事件，支持阻止冒泡。
- [x] 提供独立单元测试，覆盖嵌套容器局部坐标转换、透明度传递与触摸命中判定。
- [x] 在 `src/minigame/main.ts` 初始化根舞台（Stage）并验证构建流水线正常产出 `minigame/game.js`。

## Answer

场景树基座落地：`Node` / `Container` / `InputManager` 在 `src/minigame/scene/`，`main.ts` 挂载根舞台。触摸按自顶向下命中、命中即停——实现为**单目标派发**，不做祖先冒泡、不可穿透（"阻止冒泡"取此义）。

测试：`tests/core/minigame-scene-graph.test.ts`（嵌套变换/透明度合成、可见性门控、挂载/卸载/环检测、嵌套命中、最上层优先、隐藏不命中）、`tests/core/minigame-input-manager.test.ts`（派发、未命中静默、`onTap` 需起止同节点、`wx` 绑定含 `changedTouches`）。

提交 `e45f0a7`；合并 `6df2845`、产物 `8ca1aa5`。

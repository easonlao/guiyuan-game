# 01: 极简场景树基座与触控调度 (Scene Graph Core & Input Dispatcher)

**Type:** task

**What to build:** 构建轻量场景树与触控调度器。在微信小游戏 Canvas 环境中提供分层容器与递归渲染能力，支持局部坐标变换（位置、缩放、透明度、可见性），并自动将屏幕触摸输入（`wx.onTouchStart` / `onTouchEnd`）转化为逆序（自顶向下）的命中检测与点击事件分发，阻止事件穿透，为所有视觉组件建立纯代码交互基础。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `Node` 支持局部坐标（`x`, `y`）、缩放（`scaleX`, `scaleY`）、透明度（`alpha`）、可见性（`visible`）与父子层级挂载。
- [ ] `Container` 作为组合节点支持多子节点嵌套与按层级递归调用 `render(ctx)`。
- [ ] `InputManager` 捕获触摸事件，并按场景树自顶向下（Top-most first）正确查询 `hitTest`，向首个命中的交互节点派发事件，支持阻止冒泡。
- [ ] 提供独立单元测试，覆盖嵌套容器局部坐标转换、透明度传递与触摸命中判定。
- [ ] 在 `src/minigame/main.ts` 初始化根舞台（Stage）并验证构建流水线正常产出 `minigame/game.js`。

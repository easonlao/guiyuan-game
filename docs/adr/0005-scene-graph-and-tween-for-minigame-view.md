---
status: accepted
---

# ADR 0005: 微信小游戏表现层从“手绘像素点阵”演进为“轻量场景树与补间引擎”架构

## 状态
Accepted (已接受)

## 背景与问题

根据 ADR 0004，本项目确立了“WSL 纯代码终端开发 + Vite 构建直出微信小游戏 Canvas 2D（`minigame/game.js`）”的技术基准。但在实际落地初期：
1. **纯手绘像素与坐标硬编码导致研发极度沉重**：在 `pixel-art.ts` 中手写了 900+ 行 `ctx.fillRect` 点阵拼绘五官与装饰；在 `game-manager.ts` 中针对所有按钮手动计算矩形并逐一做 `if (x >= btn.x ...)` 碰撞检测；
2. **缺乏状态机与动画解耦**：天干飞行、震屏、连线发光与全局逻辑循环强耦合在单一时间步长计数器中；
3. **扩展性极差**：想要增加一个带按压反馈的按钮、一个角色表情气泡或一段法术飞行轨迹，都需要几十行数学公式与矩阵换算。

因此，需要在坚守 ADR 0004（零外部 GUI 软件强依赖、WSL 纯 TS 极速构建、微信小游戏 < 1MB 启动）的前提下，大幅降低表现层研发与维护负担。

## 决策

1. **保留核心逻辑（Layer 1）100% 不变**：
   - `src/core/` 下的 `TurnManager`、`ActionResolver`、AI、计分器与 PRNG 保持纯函数与不可变数据模型，不引入任何视图书写污染。
2. **在表现层（Layer 3: `src/minigame/`）构建轻量场景树（Scene Graph）**：
   - **`Node` 与 `Container` 基类**：支持局部坐标系、缩放（`scale`）、透明度（`alpha`）、可见性（`visible`）与层级递归渲染；
   - **声明式组件 `Button`**：内置自动边界盒命中判定、按下缩放回弹微动和禁用态样式，彻底移除手动 `handleTouch` 范围判定；
   - **统一输入调度器 `InputManager`**：将微信触摸事件（`wx.onTouchStart` / `onTouchEnd`）映射到场景树，逆序（自上而下）分发捕获，自动阻止事件冒泡穿透。
3. **引入独立轻量缓动引擎（Tween Engine）**：
   - 建立声明式补间系统（支持 `Cubic.Out`, `Quad.InOut` 等曲线与 `onComplete` 回调）；
   - 将天干符文飞向阵盘、受击顿帧、暴击震屏交给补间管线驱动，主循环只负责每帧步进。
4. **业务表现层解耦与模块化**：
   - `BoardView`：五行（金木水火土）10 个阴阳节点环形阵盘与生克动态连线；
   - `ActionBarView`：响应 `TurnManager.getAvailableActions()` 自动排布与高亮可选动作按钮；
   - `CharacterView`：双方角色头像、表情与气泡播报；
   - `RuneFlightView`：天干降临与流星吸收轨迹；
   - `GameScene`：总协调控制器，将纯数据 `GameState` 只读投影到各 View。

## 被否决的备选方案

1. **方案 A：引入 React DOM + Tailwind（如 Athena Crisis 模式）**：
   - 否决原因：微信小游戏底层无 DOM 树和 CSS 引擎，强行引入 Kbone 等 DOM 模拟层包体巨大、存在布局兼容坑，违背轻量化目标。
2. **方案 B：继续手工 Canvas 2D 像素点阵硬写**：
   - 否决原因：研发心智负担极大，视觉表现力上限低，无法支撑后续技能连动、Q版化身表情与战术面板需求。
3. **方案 C：重型游戏引擎（Cocos Creator / Unity）**：
   - 否决原因：违背 ADR 0004，破坏 WSL 命令行与 AI 协作的高效闭环。

## 后果与收益

- **开发效率提升数倍**：新增 UI 元素只需实例化组件并 `addChild`，按钮事件直接绑定 `onTap`，动画只需一行 `Tween.to()`。
- **继续恪守 ADR 0004 契约**：0 外部依赖，Vite 极速编译，包体依然 < 1MB，微信开发者工具零感知平滑热更新。
- **高测试性**：场景树与输入判定脱离浏览器/微信真机，在 Node.js / Vitest 环境中具备 100% 单元测试可行性。

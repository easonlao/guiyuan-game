# Wayfinder Map: minigame-view 表现层模块化重构与视觉对比

## Destination

通过模块化拆分与可交互对比原型，完成《归元弈》表现层（minigame-view）的视觉体验重构，实现高品质的五行生克流动、天干降临吸收与对战反馈。

## Notes

- 核心原则：**做出来对比看，不凭空脑补**；**模块化小步快跑，不一口吃成胖子**。
- 技术基调：围绕微信小游戏 Canvas 2D 实际渲染效果，提供低成本、高质感的具体实现方案对比。

## Tickets & Frontier

- [x] [Spec](spec.md): 确定基于轻量场景树（Scene Graph & Container）与补间缓动（Tween）重构前端表现层，保持 Layer 1 核心引擎 100% 不变。
- [x] [01: 极简场景树基座与触控调度](issues/01-scene-graph-core-and-input-dispatcher.md)
- [x] [02: 交互式操作按钮组件与动作派发切片](issues/02-interactive-action-buttons-and-turn-dispatch.md)
- [x] [03: 五行法盘视图与十阴阳节点状态渲染](issues/03-pentagram-board-view-and-node-rendering.md)
- [x] [04: 轻量缓动引擎与天干降临/流星飞行动效](issues/04-tween-engine-and-rune-flight-animation.md)
- [x] [05: 双方对战角色卡与完整对局主场景串联](issues/05-dual-characters-and-full-scene-integration.md)

全部五票已 resolved，功能完成于集成分支 `feat/minigame-view-upgrade`（`npm run verify` 全绿，46 文件 / 799 用例，`check:artifact` 逐字节一致）。（勘误：本地分支已合并，该分支及其余 feature 分支均已删除，全部内容现位于 `frontend-design`。）

## Decisions so far

- 场景树与补间引擎落地在 `src/minigame/scene/`（`Node` / `Container` / `InputManager` / `Button` / `Tween`），业务视图在 `src/minigame/views/`，由 `GameScene` 总协调。架构正文归 `docs/HLD.md` §2 Layer 3，决策理由归 ADR 0005。
- `Tween` 纯 `update(dt)` 驱动、**不自持 `requestAnimationFrame`**：这是动画缝可确定性测试的前提；帧循环归 `main.ts`。
- 触摸派发是**单目标、命中即停**（自顶向下，命中即停），不做祖先冒泡、不可穿透。
- ADR 0006 / 0008 契约在 `GameScene` 保留：`actions.length === 1` 时自动流转、不渲染按钮（低位态 `AUTO` 与极位态 `DISSIPATE` 直接动画）；仅中位态多候选才出按钮。唯一候选的自动流转属 `GameScene`，不属 `ActionBarView`。
- 旧命令式 `game-manager.ts` 删除；`pixel-art.ts` 保留（新视图复用其绘制原语，零引用函数已在复核后清除）。
- 两处**表现层选择**（GDD 无明文，仅记录）：法盘取「木居正上方、顺时针相生」且可经 `startAngle` 覆盖；生克连线 `active` = 源主印任一侧 ≥ 1。
- 终轮天命揭牌呈现经 `turnManager.getEventBus()` 的 `showdown:draw` 订阅保留。

## Out of scope

- 引入重量级 GUI 游戏引擎（如 Cocos Creator GUI，违背 WSL 命令行轻量纯代码开发初衷）
- 引入重型 DOM/WebGL 模拟层与破坏性跨平台抽象
- 涉及 Layer 1 核心博弈规则和数值调整（保持与现有无头推演逻辑完全解耦）
- 外部贴图资产切片加载（第一阶段采用纯代码矢量自闭环，后续通过 Sprite 扩展）

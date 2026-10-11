# Wayfinder Map: minigame-view 表现层模块化重构与视觉对比

## Destination

通过模块化拆分与可交互对比原型，完成《归元弈》表现层（minigame-view）的视觉体验重构，实现高品质的五行生克流动、天干降临吸收与对战反馈。

## Notes

- 核心原则：**做出来对比看，不凭空脑补**；**模块化小步快跑，不一口吃成胖子**。
- 技术基调：围绕微信小游戏 Canvas 2D 实际渲染效果，提供低成本、高质感的具体实现方案对比。

## Tickets & Frontier

- [x] [Spec](spec.md): 确定基于轻量场景树（Scene Graph & Container）与补间缓动（Tween）重构前端表现层，保持 Layer 1 核心引擎 100% 不变。
- [ ] [01: 极简场景树基座与触控调度](issues/01-scene-graph-core-and-input-dispatcher.md) `[FRONTIER]`
- [ ] [02: 交互式操作按钮组件与动作派发切片](issues/02-interactive-action-buttons-and-turn-dispatch.md) (Blocked by: 01)
- [ ] [03: 五行法盘视图与十阴阳节点状态渲染](issues/03-pentagram-board-view-and-node-rendering.md) (Blocked by: 01)
- [ ] [04: 轻量缓动引擎与天干降临/流星飞行动效](issues/04-tween-engine-and-rune-flight-animation.md) (Blocked by: 02, 03)
- [ ] [05: 双方对战角色卡与完整对局主场景串联](issues/05-dual-characters-and-full-scene-integration.md) (Blocked by: 04)

## Out of scope

- 引入重量级 GUI 游戏引擎（如 Cocos Creator GUI，违背 WSL 命令行轻量纯代码开发初衷）
- 引入重型 DOM/WebGL 模拟层与破坏性跨平台抽象
- 涉及 Layer 1 核心博弈规则和数值调整（保持与现有无头推演逻辑完全解耦）
- 外部贴图资产切片加载（第一阶段采用纯代码矢量自闭环，后续通过 Sprite 扩展）

# 开发导航

本文只提供代码入口和模块职责；游戏术语见根目录 [`GLOSSARY.md`](../GLOSSARY.md)，玩法说明见 [`README.md`](../README.md)。代码行为以当前实现为准。

## 一局游戏的主要流程

- [`GameEngine`](../src/js/logic/GameEngine.js)：协调游戏事件、回合决策和动作执行。
- [`GameSequence`](../src/js/logic/flow/GameSequence.js)：管理游戏开始与先手流程。
- [`TurnManager`](../src/js/logic/flow/TurnManager.js)：推进回合、生成天干并检查游戏结束。
- [`ActionResolver`](../src/js/logic/actions/ActionResolver.js)：应用游戏动作造成的状态变化。
- [`StateManager`](../src/js/state/StateManager.js)：保存和更新对局状态，并发出状态变化事件。

## 对手与联机

- [`AIController`](../src/js/logic/ai/AIController.js)：接入 AI 决策、对局记录与统计。
- [`SimplifiedPVPManager`](../src/js/network/SimplifiedPVPManager.js)：处理在线 PVP 的消息与状态同步。

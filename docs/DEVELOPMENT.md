# 开发导航

本文只提供代码入口和模块职责；游戏术语见根目录 [`GLOSSARY.md`](../GLOSSARY.md)，玩法说明见 [`README.md`](../README.md)。代码行为以当前实现为准。

## 一局游戏的主要流程 (Layer 1: 核心计算与状态层 `src/core/`)

- [`TurnManager`](../src/core/logic/TurnManager.ts)：回合生命周期驱动器，调度天干生成、合法动作过滤、动作执行、连动判定与 60 回合终局判定。
- [`ActionCandidates`](../src/core/logic/ActionCandidates.ts)：纯函数合法动作候选生成器，对齐吸纳/调息/化/破/强化/强破规则。
- [`ActionResolver`](../src/core/logic/ActionResolver.ts)：纯函数动作解析器，基于轻量增量 Patch 与结构共享演进 `GameState`。
- [`State`](../src/core/logic/State.ts)：创建初始棋盘状态（包含五行节点阴阳两仪）与状态校验。
- [`ScoreCalculator`](../src/core/logic/ScoreCalculator.ts)：基于动作与五行状态变动进行实时计分。
- [`EventBus`](../src/core/logic/EventBus.ts)：轻量事件总线，用于驱动表现层与视窗解耦渲染。

## 对手与策略推演

- [`Strategy`](../src/core/ai/Strategy.ts) & [`ActionEvaluator`](../src/core/ai/ActionEvaluator.ts)：纯 TS 策略 AI 与权重估值器，支持多套博弈倾向。
- [`HeadlessMatch`](../src/core/headless/HeadlessMatch.ts) & [`HeadlessBenchmark`](../src/core/headless/HeadlessBenchmark.ts)：无头推演与万局自动化基线评测。
- [`TerminalBoardViewer`](../src/core/headless/TerminalBoardViewer.ts)：纯文本控制台 ASCII 棋盘检视器。

## 多端存储适配 (Layer 2: `src/adapters/`)

- [`IStorageManager`](../src/adapters/IStorageManager.ts)：统一持久化接口。
- [`WechatStorageAdapter`](../src/adapters/WechatStorageAdapter.ts)：微信小游戏本地持久化适配器（`wx.getStorageSync`）。
- [`LocalStorageAdapter`](../src/adapters/LocalStorageAdapter.ts)：Web 预览环境适配器。
- [`MockStorage`](../src/adapters/MockStorage.ts)：Node.js 测试环境内存适配器。

## 表现层与小游戏交付 (Layer 3: `src/minigame/` & `minigame/`)

依据 ADR-0004 与 ADR-0005，表现层采用纯代码轻量场景树与组件化架构，打包输出至 `minigame/`：

- `engine/`：微型场景树与动画基础设施（`Node`、`Container`、`Button`、`Tween`、`InputManager`）。
- `views/`：数据驱动业务组件（`BoardView` 五行阵盘、`ActionBarView` 动作面板、`CharacterView` 角色化身、`RuneFlightView` 天干流星动效）。
- `GameScene.ts`：场景总控制器，连接 `TurnManager` 快照并调度交互与动画。
- `main.ts`：微信小游戏入口（`wx.createCanvas` 初始化与事件挂载）。

# 归元 (Guiyuan Game) 软件需求规格说明书 (SRS)
**版本：** V1.0 (MVP 纯单机版)  
**目标平台：** 微信小游戏 (通过 Cocos Creator 构建)

---

## 1. 引言 (Introduction)
### 1.1 编写目的
本文档旨在明确《归元》小游戏版本（MVP）的软件需求，指导后续的架构设计、TypeScript 重构及引擎（Cocos Creator）开发。
### 1.2 项目范围
本项目为《归元》的“纯单机、零云端成本”的小游戏移植版本。它将完全剥离现有的 Supabase 后端依赖，所有核心对战逻辑、AI 计算和数据存档均在客户端本地运行。

---

## 2. 核心功能需求 (Functional Requirements)

### 2.1 游戏对战与循环 (Core Gameplay Loop)
系统必须支持基础的回合制/状态驱动的游戏循环，玩家可通过行为影响局内状态。
*   **支持的行为指令 (Actions)：** 吸纳 (AUTO)、调息 (CONVERT)、化 (TRANS)、破 (ATK)、强化 (BURST)、强破 (BURST_ATK)。
*   **道损与加持机制 (State Changes)：**
    *   **攻击判定：** 系统需判断行为是否造成伤害（如“致阳道损”、“致阴道损”），或打破特定状态（“破阳点亮”）。
    *   **防御/增益判定：** 必须支持状态的恢复与升级，如“修复道损”、“点亮”、“加持”及“削弱加持”。

### 2.2 计分与裁决系统 (Scoring & Resolution)
基于现有的 `ScoreCalculator`，系统需严格执行双轨制计分规则：
*   **行为分 (Action Score)：** 触发特定行为获得基础分。
*   **状态分 (State Score)：** 根据行为改变前后环境状态（阴/阳）的差异计算分值。
*   **稀有度系统 (Rarity System)：** 计分系统需根据动作及命中概率，动态计算乘区与稀有度加成（Rarity Bonus），包含对攻击指令的特别 Buff 加成判定。

### 2.3 AI 战斗模块 (AI & Headless Match)
*   **AI 评估 (AI Controller)：** 游戏内置 AI 必须能够在本地运行，具备一套独立的权重分析和策略选择（StrategySelector）机制。
*   **离线学习/统计 (Stats Collector)：** 需要在本地收集对战胜负与行为偏好，并在本地微调权重。

### 2.4 数据存储系统 (Local Save System)
完全放弃远端数据库，改用本地缓存机制。
*   **对局记录与统计：** 存储玩家胜率、历史最高分。
*   **机制要求：** 提供统一的 `StorageManager` 接口，底层使用微信小游戏的 `wx.setStorageSync` 和 `wx.getStorageSync` 进行持久化存储。

---

## 3. 非功能需求 (Non-Functional Requirements)

### 3.1 性能需求 (Performance)
*   **AI 运算阈值：** 复杂的 AI 搜索（如 Headless 模拟）计算时间不得阻塞主线程超过 `16ms`（即保证游戏运行帧率不低于 60FPS）。如果 AI 权重计算过重，必须支持使用微信小游戏 Worker（子线程）剥离计算。
*   **包体大小：** 小游戏首包体积需严格控制在 **4MB** 以内（微信免加载标准）。

### 3.2 运行环境与兼容性 (Compatibility)
*   **语言规范：** 业务逻辑必须 100% 使用强类型 `TypeScript`，杜绝任何对 Browser DOM / BOM（如 `document.getElementById`）的隐式依赖。
*   **宿主环境：** 兼容最新版 Cocos Creator (2D 框架) 及微信小游戏基础库。

### 3.3 成本需求 (Cost Constraint)
*   **零成本运营：** 架构设计必须保证无需任何外部 API 调用、无需自建服务器或数据库节点。

---

## 4. 接口与依赖规范 (Interfaces & Dependencies)
*   **渲染层解耦：** 原有 `src/css` 样式文件全部作废，所有视觉呈现由 Cocos 引擎的 `Sprite`、`Label`、`Button` 组件接管。UI 层只负责派发事件（Event Emit），禁止包含任何业务逻辑。
*   **配置管理：** `game-config.js` 等常量需转换为 `readonly` 的 TS Interface，统一在内存中加载。

---

## 5. 阶段性验收标准 (Acceptance Criteria)
1.  **里程碑 1 (逻辑脱水)：** 脱离浏览器与 Vite 运行环境，能够在本地 Node.js 终端下跑通完整的 AI 模拟对战（Headless Match）且不抛出任何类型异常。
2.  **里程碑 2 (引擎点亮)：** 逻辑库导入 Cocos 后，能够成功打包出一个可以在微信开发者工具中预览、且可操作的 Demo。

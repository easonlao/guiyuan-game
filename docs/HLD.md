# 归元弈 (Guiyuan) - HLD & 游戏设计概览 (AI-First 架构)

**版本：** V1.0 (MVP 纯单机版)  
**目标平台：** 微信小游戏 (首包预算 < 4MB)  
**开发基准：** Cocos Creator 3.x (如 3.8 LTS) + 纯 TypeScript 核心逻辑库

## 1. 游戏设计概览 (Game Design Overview)
基于《GDD》与《SRS》，本游戏MVP版本定位为**纯单机、零服务器成本**的轻度策略五行博弈小游戏。

*   **核心目标 (Core Goal)**：促使己方五个五行节点的阴、阳两侧均达到“点亮”（数值≥1）状态，即**五行归元**，达成直接胜利。若60回合无归元，则通过总分判定胜负（同分则后手胜）。
*   **基础动作 (Actions)**：
    *   **吸纳 (AUTO)**：自动吸收对应天干能量。
    *   **调息 (CONVERT)**：同节点内的阴阳能量转移。
    *   **化 (TRANS)**：沿相生路径（如木生火）强化己方节点。
    *   **破 (ATK)**：沿相克路径（如木克土）削弱敌方节点。
*   **爆发动作 (Burst Actions)**：消耗已“归一”节点的能量（强化耗阴，强破耗阳）执行**强化 (BURST)** 或 **强破 (BURST_ATK)**，并获取额外回合连动。
*   **节点状态 (Node States)**：道损 (-1) -> 虚空 (0) -> 点亮 (1) -> 加持 (2)。

---

## 2. 高层架构设计 (High-Level Design) 

为了让 AI 成为开发落地的主体（AI-First），系统架构必须遵循**“逻辑与表现严密解耦”**原则（MVC/MVP）。AI 擅长在纯文本/终端环境（Node.js/TS）中编写并验证逻辑，而不擅长直接操作 Cocos UI 编辑器。

### 分层架构 (Layered Architecture)

#### 🔴 Layer 1: 核心逻辑层 (Core Logic Layer) - **AI 主战场**
完全独立的纯 TypeScript 环境，不包含任何 DOM、BOM 或 Cocos 引擎相关的 API。
*   `State`: 维护全局棋盘数据、天干生成逻辑与对局回合。
*   `ActionResolver`: 处理各类动作（吸纳、化、破）的合法性校验及状态变更。
*   `ScoreCalculator`: 基于动作与状态变动进行双轨制计分。
*   `AIController & HeadlessMatch`: 无头对战模拟器，执行基于权重的 AI 决策树，也是性能测试的核心依据。
*   **AI 算力与执行保障**：
    *   单帧逻辑耗时需保持 `< 16ms`，确保游戏帧率 `> 60FPS`。
    *   AI 决策接口建议设计为支持异步返回（`Promise<Action>`）。MVP 阶段默认同步执行；若在微信真机 Profiling 中出现复杂决策卡顿，可平滑迁移至微信原生多线程 `Worker`。
*   **反馈循环**：全量覆盖 Vitest 单元测试。AI 在此层通过 `npm run test` 获取 100% 确定性的执行反馈。

#### 🟡 Layer 2: 存储与基建适配层 (Adapter Layer)
完全剥离 Supabase 云端依赖，采用适配器模式（`IStorageManager` 接口）进行依赖注入，支持多环境无缝切换：
*   `MockStorage`: 用于 AI 的本地 Node.js 单元测试和无头模拟对战。
*   `LocalStorageAdapter`: 用于 Cocos Creator 本地 Web 预览环境。
*   `WechatStorageAdapter`: 用于实际打包微信小游戏时，调用微信原生 `wx.setStorageSync` 实现本地脱机存档。

#### 🟢 Layer 3: 视图与引擎层 (View Layer)
Cocos Creator 3.x 环境。该层设计为极简的“薄层”（Thin View），彻底废弃原 Web 端的 `src/css` 样式。
*   **数据驱动**：由 Cocos 的 `Sprite`、`Label`、`Button` 接管表现层。Cocos 脚本仅负责订阅核心逻辑层抛出的事件总线（EventBus，如 `onNodeStateChanged`, `onActionExecuted`），并播放对应动画或更新 UI。
*   **目录建议**：核心 TS 逻辑代码可沉淀于 Cocos 工程的 `assets/scripts/logic/` 目录下，配置 `tsconfig.json` 保证既能被 Cocos 正常编译，也能在 Node.js 中脱机运行测试。
*   **AI 协同**：AI 负责输出标准的 API 接口定义和事件契约，由人类开发者在 Cocos 编辑器中将 UI 节点与这些事件接口进行绑定。

---

## 3. 反馈循环与实施里程碑 (Feedback Loop & Milestones)

### 3.1 AI 主体开发的闭环反馈
1.  **代码构建**：AI 将 `src/js/logic/` 下的旧 JS 代码重构为带严格类型的 TS（如定义 `NodeState`、`ActionType` 枚举）。
2.  **验证循环 (Vitest)**：AI 同步编写测试用例。执行 `vitest run`，根据控制台的红/绿灯（Error/Pass）自我修正代码。
3.  **性能/AI 模拟循环**：AI 运行 `node scripts/headless-batch-comparison.js`，验证高频策略运算是否超出 16ms 限制，并在必要时优化算法。
4.  **人类验收 (Cocos)**：底层逻辑脱水验证 100% 通过后，人类开发者将其导入 Cocos 进行 UI 挂载验证。

### 3.2 实施里程碑 (Milestones)
*   **阶段一：逻辑脱水与无头推演闭环 (Node.js - Milestone 1.1)**
    *   使用 TypeScript 重写所有纯计算逻辑（计分、AI 权重、连动规则与动作候选生成）。
    *   引入确定性伪随机数生成器 (PRNG) 与紧凑对局日志记录，确保推演 100% 具备复现能力。
    *   状态更新采用轻量增量 Patch 与结构共享，杜绝高频深拷贝，满足微信小游戏低 GC 停顿要求。
    *   实现存储适配器模式并提供 Mock 环境；引入轻量控制台回放器验证 EventBus 增量事件流。
    *   **验收标准**：在 Node.js 环境下跑通 10,000 局无头推演（单步 < 1ms，零报错，内存稳定），并通过 Vitest 单元测试与 Stryker 突变体检（杀死率 > 80%）。
*   **阶段二：引擎接入与 UI 重建 (Cocos Creator 3.x)**
    *   构建 Cocos Creator 3.x 项目工程，导入逻辑代码库。
    *   搭建占位符 (Placeholder) UI 并完成 EventBus 的双向绑定。
*   **阶段三：微信打包与真机验收 (WeChat Mini Game)**
    *   导出微信小游戏首包（确保包体 `< 4MB`）。
    *   真机性能分析 (Profiling)，如遇卡顿则启用 Worker。
    *   发布体验版完成双人/人机对战体验闭环验收。

---

## 4. 工程化与质量保障体系 (Engineering & QA Pipeline)

为了保证项目在 AI 与人类协作下的长效维护，并严格防范重构期间的回归风险，系统引入了以下三大基建工具作为开发基石：

### 4.1 代码标准化与极速静态检查 (oxc)
*   **工具集**：[oxlint / oxc](https://oxc.rs/)
*   **用途**：作为下一代的 Rust-based 前端工具链，承担极速的静态代码分析与标准化格式化。
*   **流程定位**：在代码提交与反馈循环中，AI 使用 `oxlint` 执行毫秒级的静态检查，将无用变量、隐式声明等潜在腐化问题扼杀在摇篮里，确保 TypeScript 逻辑库始终保持工业级整洁。

### 4.2 架构可视化与依赖防腐 (dependency-cruiser)
*   **工具集**：[dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
*   **用途**：扫描工程依赖，绘制可视化的关系网络（如 Mermaid 图表），并可通过规则验证依赖的合法性。
*   **流程定位**：用于架构巡检。严格监控并阻止“UI 视图层反向依赖核心逻辑层”、“网络层未解耦”等破坏 AI-First 架构边界的行为，防止项目随着长期迭代退化为“意大利面条式”的循环依赖。

### 4.3 突变测试与健壮性体检 (Stryker.js)
*   **工具集**：[Stryker.js](https://stryker-mutator.io/)
*   **用途**：在业务逻辑中注入突变（Mutations，如把 `+` 变 `-`，把 `true` 变 `false`），检验现有的 Vitest 单元测试是否能精准捕捉到这些错误（杀死突变体）。
*   **流程定位**：定位于**发布前（Pre-release）**的深度健康体检。它不介入高频的日常开发循环，而是在关键里程碑（如核心重构完成、小游戏打包发版前）作为最后一道防线运行，确保测试用例的真实有效性，严防业务漏洞逃逸。

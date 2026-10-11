# 归元弈 (Guiyuan) - 高层设计文档 (HLD, AI-First 架构)

**目标平台：** 微信小游戏 (首包预算 < 4MB)  
**开发基准：** 纯 TypeScript 核心逻辑库 + 纯代码 Canvas 2D 直出微信小游戏 (对齐 ADR-0004)

## 1. 设计输入 (Design Inputs)

本文档只写**工程方案**。规则机制与取值归 `docs/GDD.md`，需求条目与验收口径归 `docs/SRS.md`，定位与可行性归 `docs/FSR.md`。本节不复制：

*   游戏定位与受众 → `docs/FSR.md` §1、`docs/GDD.md` §1
*   核心目标、胜负判定与回合结构 → `docs/GDD.md` §2.1
*   基础动作、爆发动作与节点状态 → `docs/GDD.md` §2.2 / §2.3
*   交付形态、阶段性验收 → `docs/SRS.md` §1.3、§5
*   类型契约与数据结构 → `docs/LLD.md`（真源 `src/core/types/domain.ts`）

MVP 的工程前提：**纯单机、零服务器成本**；首包预算与降级手段见 §2 Layer 3。

---

## 2. 高层架构设计 (High-Level Design) 

为了让 AI 成为开发落地的主体（AI-First），系统架构必须遵循**“逻辑与表现严密解耦”**原则（MVC/MVP）。AI 擅长在纯文本/终端环境（Node.js/TS）中编写并验证逻辑，而不依赖外部复杂 GUI 编辑器。

### 分层架构 (Layered Architecture)

#### 🔴 Layer 1: 核心逻辑层 (Core Logic Layer) - **AI 主战场**
完全独立的纯 TypeScript 环境，不包含任何 DOM、BOM 或外部引擎相关的 API。
*   `State`: 维护全局棋盘数据、天干生成逻辑与对局回合。
*   `ActionResolver`: 处理各类动作（吸纳、化、破）的合法性校验及状态变更。
*   `ScoreCalculator`: 基于动作与状态变动进行双轨制计分。
*   `TurnManager`: 回合状态机调度器与连动规则保障。
*   `Strategy` & `ActionEvaluator`: 基于 `StrategyWeights` 权重的启发式 AI 决策；`HeadlessMatch`: 无头对战模拟器，也是性能测试的核心依据。
*   **AI 算力与执行保障**：
    *   单局推演与单次决策的性能预算见 `docs/SRS.md` §4.2；本层只保证内存增量平稳。
    *   AI 决策默认纯同步极速返回，满足小游戏零掉帧要求；异步 / Worker 降级路径为**预留项，未实现**。
*   **反馈循环**：全量覆盖 Vitest 单元测试。AI 在此层通过 `npm run test` 获取 100% 确定性的执行反馈。

#### 🟡 Layer 2: 存储与基建适配层 (Adapter Layer)
完全剥离 Supabase 云端依赖，采用适配器模式（`IStorageManager` 接口）进行依赖注入，支持多环境无缝切换：
*   `MockStorage`: 用于 AI 的本地 Node.js 单元测试和无头模拟对战。
*   `LocalStorageAdapter`: 用于 Web 预览环境。
*   `WechatStorageAdapter`: 用于实际打包微信小游戏时，调用微信原生 `wx.setStorageSync` 实现本地脱机存档。

#### 🟢 Layer 3: 视图与小游戏交付层 (View Layer)
纯代码 Canvas 2D 微信小游戏环境（`src/minigame/` -> `minigame/`，对齐 ADR-0004 与 ADR-0005）。

> **实现状态**：当前 `src/minigame/` 是单体命令式实现（`game-manager.ts` + `pixel-art.ts` + 手写触摸命中判定）。下文描述的轻量场景树/组件化架构是**目标架构（未实现）**，依据 ADR 0005 与在办 spec `.scratch/minigame-view-upgrade`（`status: ready-for-agent`）。
*   **轻量场景树与组件化**：基于轻量纯 TS 场景树架构（`Node`、`Container`、`Button`、`Tween`、`InputManager`），摆脱逐像素点阵硬编码，实现自动化触控命中检测、按压微动与声明式补间动画。
*   **模块化业务视图**：拆分为 `BoardView`（五行阵盘与生克连线）、`ActionBarView`（可选动作按钮面板）、`CharacterView`（角色化身与表情）以及 `RuneFlightView`（天干轨迹动效），由 `GameScene` 控制器对齐 `TurnManager` 状态进行纯数据驱动投影。
*   **极速构建管线**：通过 Vite 构建单文件 `minigame/game.js`，Windows 微信开发者工具直连开发与实时仿真调试。
*   **轻量低消耗**：零重型引擎包袱，首包体积 < 1MB（远低于 4MB 上限），启动秒开。

---

## 3. 反馈循环与实施里程碑 (Feedback Loop & Milestones)

### 3.1 AI 主体开发的闭环反馈
1.  **代码构建**：AI 编写带有严格类型的 TS 代码（如 `domain.ts`）。
2.  **验证循环 (Vitest)**：执行 `npm test`，根据控制台的红/绿灯自我修正代码。
3.  **无头推演循环**：运行 `npm run benchmark:headless`，验证高频策略运算与内存低 GC 表现。
4.  **真机视窗验收**：构建小游戏后，在微信开发者工具中即时仿真触控与视觉表现。

### 3.2 实施里程碑 (Milestones)

交付时点、范围与验收标准归 `docs/SRS.md` §5，本节不复制。此处只记录**工程侧完成度**：

*   **阶段一（已完成）**：纯 TS 核心计算逻辑、无头推演闭环、Vitest 全量覆盖。
*   **阶段二（进行中）**：独立 `minigame/` 构建管线与刘海屏安全区适配；表现层重构见 §2 Layer 3 与 `.scratch/minigame-view-upgrade`。
*   **阶段三**：音效与微粒子动画调优、微信开放平台测试号真机扫码与体验版发布。

---

## 4. 工程化与质量保障体系 (Engineering & QA Pipeline)

为了保证项目在 AI 与人类协作下的长效维护，并严格防范重构期间的回归风险，系统引入了以下三大基建工具作为开发基石：

### 4.1 代码标准化与极速静态检查 (oxc)
*   **工具集**：[oxlint](https://oxc.rs/)（静态检查）与 [oxfmt](https://oxc.rs/docs/guide/usage/formatter)（格式化）；格式化配置见根目录 `.oxfmtrc.json`。
*   **用途**：Rust-based 工具链，承担极速的静态代码分析与统一格式化，把风格漂移挡在 diff 之外。
*   **流程定位**：`npm run lint`（oxlint）与 `npm run fmt:check`（oxfmt）是命名门禁脚本，AI 在提交前跑这两条，把无用变量、隐式声明与未格式化的代码挡在门外；`npm run fmt` 就地修复。

### 4.2 架构可视化与依赖防腐 (dependency-cruiser)
*   **工具集**：[dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
*   **用途**：扫描工程依赖，绘制可视化的关系网络（如 Mermaid 图表），并可通过规则验证依赖的合法性。
*   **流程定位**：用于架构巡检。严格监控并阻止“UI 视图层反向依赖核心逻辑层”、“网络层未解耦”等破坏 AI-First 架构边界的行为，防止项目随着长期迭代退化为“意大利面条式”的循环依赖。

### 4.3 突变测试与健壮性体检 (Stryker.js)
*   **工具集**：[Stryker.js](https://stryker-mutator.io/)
*   **用途**：在业务逻辑中注入突变（Mutations，如把 `+` 变 `-`，把 `true` 变 `false`），检验现有的 Vitest 单元测试是否能精准捕捉到这些错误（杀死突变体）。
*   **流程定位**：定位于**发布前（Pre-release）**的深度健康体检。它不介入高频的日常开发循环，而是在关键里程碑（如核心重构完成、小游戏打包发版前）作为最后一道防线运行，确保测试用例的真实有效性，严防业务漏洞逃逸。

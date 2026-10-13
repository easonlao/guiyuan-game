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
*   `Strategy` & `ActionEvaluator`: 基于 `StrategyWeights` 权重的启发式 AI 决策。
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

> **实现状态**：轻量场景树/组件化架构**已落地**（对齐 ADR 0005）：`src/minigame/` 现由 `GameScene` 控制器与 `BoardView` / `ActionBarView` / `CharacterView` / `RuneFlightView` 四个视图组成，触控命中、按压反馈与补间动画分别由 `InputManager` / `Button` / `Tween` 承担；旧的单体命令式实现（`game-manager.ts` 与手写触摸命中判定）已删除，`pixel-art.ts` 只保留仍在用的绘制例程。
*   **轻量场景树与组件化**：基于轻量纯 TS 场景树架构（`Node`、`Container`、`Button`、`Tween`、`InputManager`），摆脱逐像素点阵硬编码，实现自动化触控命中检测、按压微动与声明式补间动画。
*   **模块化业务视图**：拆分为 `BoardView`（法盘）、`ActionBarView`（可选动作按钮面板）、`CharacterView`（角色化身与表情）以及 `RuneFlightView`（天干轨迹动效），由 `GameScene` 控制器对齐 `TurnManager` 状态进行纯数据驱动投影。
*   **法盘双环（已落地，ADR 0015）**：`BoardView` 已由「单一棋盘按行动方投影」升级为**同心双环**——内环恒为己方盘、外环恒为对方盘、外环逆时针偏移 2 格；接口契约（`update` 吃双盘、`getSlot(player,…)`、飞行落点、连线高亮语义）见 `docs/LLD.md` §4.1。
*   **法盘状态编码（已落地票 01–04，ADR 0018）**：等级改走**亮度阶梯**——道损 = 暗化元素色 + 裂纹、虚空 = 空心（元素色淡描边）、点亮 = 元素色实心、加持 = 元素色实心 + 光晕；五行色相只表身份，任何等级都保留元素色描边。盘下图例与上一招变化条文案统一到「道损 / 虚空 / 点亮 / 加持」。节点级状态另占主印外侧：归一 = 一圈金环 + 沿环缓慢流动的金色高光（只要归一就有，与亢极无关）；亢极 = 归一那一层之上再叠元素色柔光与外扩涟漪（满溢 / 泄露 / 不稳）。金色流光与元素外溢都由表现层时钟 `BoardView.tick(dt)` 驱动（`GameScene.update` 每帧注入），盘面投影仍只由状态变更驱动。决策期候选落点半身标记由 `BoardView.setCandidates()` 驱动、与盘面等级和连线高亮都无关：每个候选把「会变的那半身」（阴鱼 / 阳鱼）整片染上**专属强调色**（`THEME.candidate`，紫，不取五行色、不取节点级状态的金）+ 一条薄轮廓，同一半身去重；所有标记共用同一个慢呼吸相位（与归一流光 / 亢极外溢同一个时钟），非抉择阶段不画。按住按钮的预览（票 04）由 `BoardView.setPreview()` 驱动：`isActive` 收窄到这一下的路径并叠加路径箭头、目标侧幽灵态与加快的候选呼吸；幽灵态真跑 `ActionResolver` 取结算后的目标等级（`src/minigame/preview-target.ts`），净零变化不画。对手盘归属靠环带实线 / 虚线与「你 / 天道」标签，不再整体变暗（箭头几何、像素取值与预览契约见 `docs/LLD.md` §4.1 与代码常量）。
*   **极速构建管线**：通过 Vite 构建单文件 `minigame/game.js`，Windows 微信开发者工具直连开发与实时仿真调试。
*   **轻量低消耗**：零重型引擎包袱，首包体积 < 1MB（远低于 4MB 上限），启动秒开。

#### ⚪ 开发工具块 (`tools/`) — 不进 `game.js`
无头推演、批量评测与命令行实验入口**不在** Layer 1 内，独立于 `src/` 之外。切分判据是**独立运行时**：`tools/` 跑在 Node.js 上（使用 `node:url` / `node:path`），而小游戏侧（整个 `src/` 树，含 `src/core` / `src/adapters` / `src/minigame`）都会打进 `minigame/game.js`、运行在没有 Node 内建模块的微信小游戏环境里。两者之间只有单向依赖 `tools/` → `src/`；反向由 §4.2 的 depcruise 规则拦截。判据与理由见 ADR 0013。
*   `HeadlessMatch` / `HeadlessBenchmark`：无头对战与万局自动化基线评测。
*   `ExperimentRunner` / `DynamicSwitching` / `ActionValueCensus` / `CandidateValidation` / `AtkMarginalReturn`：批量实验与平衡诊断。
*   `TerminalBoardViewer`：纯文本控制台 ASCII 棋盘检视器。
*   `cli.ts`：各实验入口共享的直接执行守卫与错误处理。

#### 📦 包边界（声明式）— 没声明就解析不到

`src/` 与 `tools/` 各是一块**独立的包**，由根 `package.json` 的 `workspaces` 连起来：

| 包名 | 目录 | 是什么 |
|---|---|---|
| `@guiyuan/game` | `src/` | 游戏核心，会打进 `minigame/game.js`、跑在微信小游戏环境里（没有 Node 内建模块） |
| `@guiyuan/devtools` | `tools/` | 开发工具，只在你电脑上用 Node.js 跑，不进 `game.js` |

*   唯一允许的跨区边是 `@guiyuan/devtools` → `@guiyuan/game`（写在 `tools/package.json` 的 `dependencies` 里）。`src/` 没有声明 `@guiyuan/devtools`，所以从游戏侧写 `import '@guiyuan/devtools'` 在**类型检查期**就解析不到（`tsc` 退非零）。
*   `tests/` 不属于两块中的任何一块（它在根包里），用相对路径引用两边；包边界只约束两块之间。
*   这是与 §4.2 的 depcruise 规则**互补**的第二道门；机制、安装布局前提与工具链适配见 §4.2。

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
*   **阶段二（进行中）**：独立 `minigame/` 构建管线与刘海屏安全区适配；表现层场景树重构已落地（见 §2 Layer 3）。
*   **阶段三**：音效与微粒子动画调优、微信开放平台测试号真机扫码与体验版发布。

---

## 4. 工程化与质量保障体系 (Engineering & QA Pipeline)

为了保证项目在 AI 与人类协作下的长效维护，并严格防范重构期间的回归风险，系统引入了以下三大基建工具作为开发基石：

### 4.1 代码标准化与极速静态检查 (oxc)
*   **工具集**：[oxlint](https://oxc.rs/)（静态检查）与 [oxfmt](https://oxc.rs/docs/guide/usage/formatter)（格式化）；配置见根目录 `.oxlintrc.json` 与 `.oxfmtrc.json`。
*   **用途**：Rust-based 工具链，承担极速的静态代码分析与统一格式化，把风格漂移挡在 diff 之外。
*   **流程定位**：`npm run lint`（oxlint）与 `npm run fmt:check`（oxfmt）是命名门禁脚本，由 `npm run check:quick` 串进 AI 内循环（见 §4.4），把无用变量、隐式声明与未格式化的代码挡在门外；`npm run fmt` 就地修复。

### 4.2 架构可视化与依赖防腐 (dependency-cruiser)
*   **工具集**：[dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
*   **用途**：扫描工程依赖，绘制可视化的关系网络（如 Mermaid 图表），并可通过规则验证依赖的合法性。
*   **流程定位**：用于架构巡检。当前生效的规则以根目录 `.dependency-cruiser.js` 为真源，其中与分区直接相关的两条是：`game-side-not-to-local-outside-src`（小游戏侧 `src/` 不得依赖 `src/` 之外的任何本地模块，无头推演只是其中最典型的一块）与 `game-side-not-to-node-builtins`（`src/` 不得 import 任何 Node 内建模块）。注意 depcruise 会剥掉 `node:` 前缀（`node:fs` 记为 `fs`），所以第二条按 `dependencyTypes: ['core']` 匹配而非按路径。规则为什么是枚举式的、为什么它不够、以及已知的 npm 依赖覆盖缺口，见 ADR 0013。

**声明式包边界（与上面的规则互补）**：`src/` 与 `tools/` 各自是 npm 包（`@guiyuan/game` / `@guiyuan/devtools`，拓扑见 §2），由根 `package.json#workspaces` 连起来；两块之间的引用只能走包名，且必须在 `dependencies` 里声明。`tsconfig.json` 用 `moduleResolution: "nodenext"`，让 TypeScript 真正读取各包的 `exports` 字段并强制相对导入写扩展名。

这套机制依赖 `.npmrc` 的 `install-strategy=linked`：npm 默认的 hoisted 布局会把所有 workspace 包平铺到根 `node_modules`，于是「没声明也能 import」——声明式边界形同虚设；`linked`（pnpm 式）只在每个包自己的 `node_modules` 里放它声明过的依赖，没声明就解析不到。`npm run check:boundary`（在 `check:quick` 内）就是钉住这条机制的自检：它断言「从 `src/` 解析不到 `@guiyuan/devtools`」，布局一变就判红。`linked` 布局带来的工具链适配（Stryker 插件加载、Stryker 沙箱内的模块身份）见 `docs/MUTATION-TESTING.md` §9。

### 4.3 突变测试与健壮性体检 (Stryker.js)
*   **工具集**：[Stryker.js](https://stryker-mutator.io/)
*   **用途**：在业务逻辑中注入突变（Mutations，如把 `+` 变 `-`，把 `true` 变 `false`），检验现有的 Vitest 单元测试是否能精准捕捉到这些错误（杀死突变体）。
*   **流程定位**：分改动处（`npm run mutation:changed`）与里程碑全量（`npm run mutation:milestone`）两条路径。全量不属 §4.4 任何一档、由 agent 手动触发（§4.5），改动处在 CI 快链里当观察项跑；节奏、门禁口径与理由见 `docs/MUTATION-TESTING.md`（唯一规则来源）。

### 4.4 验收命令分档 (Verification Tiers)

验收分两档，每档一条命名脚本（档内可再串子脚本），按「快到慢」排序，前一档挂了就不跑后一档。**命令清单以 `package.json` 为真源，本文不复制**（复制就会漂）：

*   **`npm run check:quick`（快速检查）**：给 AI 内循环用，秒级返回，只做静态检查；**不含**测试与构建——含测试与构建的命令贴不住每轮编辑循环。
*   **`npm run verify`（验收）**：收尾时跑这一条，就知道算不算做完了；四段 = 快速检查 → 类型检查 → 测试 → **产物对账**。

**产物对账（`npm run check:artifact`）**：`src/minigame/` 的构建产物 `minigame/game.js` 是**入库提交物**（理由见 ADR 0014）。这条门禁用与 `npm run build:minigame` **同一次**构建调用现打一份（写回侧与核查侧共用 `scripts/lib/minigame-build.mjs`），与入库产物**逐字节比对**，不一致即红并报出第一个不同的字节位置；另有一条落点判定，断言产物路径**不落在任何层级的 `dist/` 下**——`.gitignore` 的无锚点 `dist/` 会让落进去的产物静默进不了库。产物保持 `minify: false`，入库的那份在 diff 里可读。为什么入库、为什么不能借参考仓库那个第三方契约的类比、被否决的方案，见 ADR 0014。

变异测试**不在任何一档**：全量耗时较长，是独立的手动里程碑命令（见 §4.3 与 `docs/MUTATION-TESTING.md`）。

### 4.5 持续集成流水线 (GitHub Actions)

仓库是 public，Actions 分钟数不限量。流水线只做两件事，且**只调命名脚本**（CI 的失败信号只有一个来源——那条脚本本身，yaml 里不写裸检查命令）：

*   **快链（自动）**——`.github/workflows/fast.yml`：PR 与推送到主分支时跑 `npm run verify`，失败即红；`npm run mutation:changed` 作为**观察项**并行跑，红了不阻断验收，只把 `reports/` 落盘成可下载的 artifact。观察项不能当门禁：子集报告做不了棘轮对比（`docs/MUTATION-TESTING.md` §3.1）。
*   **里程碑（手动）**——`.github/workflows/mutation-milestone.yml`：`workflow_dispatch` 触发，跑 `npm run mutation:milestone`（全量变异 + 棘轮对比），结果同样落盘可下载。

**不挂 `on: schedule`**：门禁是差分棘轮（`docs/MUTATION-TESTING.md` §3.1），没有 diff 的定时跑在定义上产不出新发现——这是结构性理由，不是成本理由。全量那条的触发者因此只能是 agent，责任写进 `AGENTS.md`。决策与理由见 ADR 0012。

### 4.6 小游戏真机验收 (QA Runbook)

开发时可运行 `npm run preview:minigame` 在浏览器检查表现层布局与真实对局。入口位于 `tools/minigame-preview/`，直接复用 `GameScene` / `InputManager`，以 Pointer Events 转换触摸坐标；支持 `?seed=42` 固定种子、空格加速自动结算、R 重开。该宿主不进入微信构建产物，浏览器检查后仍按下列流程完成微信模拟器与真机验收。

**分工**：浏览器预览是开发自查手段；**需求方（用户）的目验在微信开发者工具里进行**，色号 / 形态与观感由其拍板。因此改过 `src/` 后必须先把产物重建到 `minigame/game.js` 再请其编译——`check:artifact` 只在提交时拦，拦不住「用户手动编译旧包」这个时机。

底层逻辑验证通过后，表现层集成按下面步骤验收（验收口径归 `docs/SRS.md` §5）：

1.  `minigame/game.js` 已入库，通常可直接进第 2 步；改过 `src/minigame/` 或 `src/core/` 后先执行 `npm run build:minigame` 重建（或 `npm run dev:minigame` 启动监听）。忘了重建会被 `npm run check:artifact` 拦下（理由见 ADR 0014）。
2.  打开 Windows 微信开发者工具，导入 `minigame/` 目录（WSL 路径形如 `\\wsl.localhost\<发行版>\<仓库路径>\minigame`）。
3.  **模拟器验收**：切换不同机型验证顶部比分栏避让刘海屏 / 灵动岛；验证底部动作按钮布局与触控命中；验证 P1 操作与 P2（天道）AI 出招的节奏。
4.  **真机 Profiling**：用微信开发者工具「预览」扫码真机试玩，监控触控延迟、帧率与 GC 表现。

构建管线、模块职责与分层架构见 §2 Layer 3；表现层场景树重构已完成，任务留档见 `.scratch/archive/minigame-view-upgrade`。

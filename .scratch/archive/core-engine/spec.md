# 技术规格书 (Spec): 里程碑 1 - 核心逻辑脱水与无头推演闭环

## 1. 背景与目标 (Background & Goals)

本项目为《归元弈 (Guiyuan)》轻量重构项目，采用 **AI-First 三层解耦架构**：
- **Layer 1: 核心领域与计算引擎 (`src/core/`)**：纯 TypeScript，零外部非核心依赖，100% 规则完备，无任何 DOM/BOM/Cocos 运行时 API。
- **Layer 2: 存储与适配层 (`src/adapters/`)**：统一多端存储抽象。
- **Layer 3: 视图表现层 (`src/views/`)**：纯事件消费与渲染（里程碑 2 规划）。

**里程碑 1 的目标**：
在纯 Node.js / TypeScript 环境下达成 Layer 1 核心计算逻辑 100% 规则完备，建立确定性随机 (PRNG) 与零 GC 隐患的增量状态转换，构建回合生命周期驱动引擎 (`TurnManager`)，重构纯 TS 策略 AI 并完成万局无头推演与平衡性/内存性能基线验证，固化表现层事件契约。

---

## 2. 架构契约与设计边界 (Boundaries & Contracts)

### 2.1 依赖与纯度铁律
- `src/core/` 严禁直接或间接引入任何 Cocos/Browser API。
- 遵循确定性：天干抽取与推演过程严禁调用 `Math.random()`，必须依赖 `PRNG`（Mulberry32）控制种子。
- 遵循不可变状态与增量更新（Structural Sharing）：状态转换中仅 Shallow Patch 被改变的五行节点，未改动节点保持引用共享，避免 GC 抖动。

### 2.2 核心模块职责划分
1. **`src/core/utils/prng.ts`**（已就绪）：
   - 确定性伪随机数发生器与天干抽取器。
2. **`src/core/types/record.ts`**（已就绪）：
   - `GameRecord` 与 `ActionRecord` 轻量对局格式 `[seed, actions]`。
3. **`src/core/logic/ActionCandidates.ts`**（已就绪）：
   - 纯函数合法动作候选生成器，对齐《GDD》AUTO/CONVERT/TRANS/ATK/BURST/BURST_ATK 全规则。
4. **`src/core/logic/ActionResolver.ts`**（已就绪）：
   - 纯函数动作解析器，增量结构共享更新状态。
5. **`src/core/logic/TurnManager.ts`**（待构建）：
   - 回合生命周期状态机驱动器：
     - 单回合流转：抽天干 -> 等待输入 -> 校验合法动作 -> 解析动作 -> 连动判定 -> 回合结算。
     - 连动限制：执行 BURST / BURST_ATK 后获得 1 次额外行动，但在该额外行动中禁止再次使用 BURST / BURST_ATK。
     - 60 回合终局规则：若未达成五行归元，比分平局时后手方（P2）获胜。
6. **`src/core/ai/` 纯 TS 策略引擎**（待构建）：
   - 启发式价值评估器与决策策略选择器（支持贪心归元、偏攻击压制等多套权重）。
7. **`src/core/headless/` 与 Terminal 回放检视器**（待构建）：
   - `TerminalBoardViewer.ts`：纯文本/ASCII 棋盘回放器，作为 EventBus 首个真实消费者。
   - `HeadlessBenchmark.ts`：批量万局推演测试，输出平衡性胜率分布与内存耗时基线指标。

---

## 3. 测试与质量验收标准 (Acceptance Criteria)

1. **测试驱动 (TDD)**：所有逻辑均配备独立 Vitest 单测，单测全部通过。
2. **代码规范与类型安全**：`npm run oxlint` 0 警告 0 报错；`npm run check:deps` 架构依赖零违规。
3. **无头推演指标**：在万局快速无头推演下，内存堆增量无泄漏隐患，平均每局耗时低于 1ms。

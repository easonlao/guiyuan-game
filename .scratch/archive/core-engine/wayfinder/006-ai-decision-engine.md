# T3: 迁移重构策略 AI 引擎与轻量 Terminal 回放检视器

**Type:** task

**Blocked by:** 005

**Status:** ready-for-agent

## Question

如何将 `legacy/` 中的启发式打分与策略评估重构为纯 TS 引擎，并构建一个纯文本/ASCII 棋盘回放器作为 Mock 消费者，以此在脱离 Cocos 的前提下验证事件流的完备性与对局观感？

## Acceptance Criteria

1. 在 `src/core/ai/` 实现策略选择器与动作价值计算器，支持偏攻击 vs 偏归元等多套权重注入。
2. 实现极简控制台/ASCII 棋盘检视器（`TerminalBoardViewer.ts`），订阅 EventBus 输出结构化棋盘与动作回放。
3. 确保 EventBus 能够准确提供表现层所需的增量变更（Delta）信息，而非仅仅是最终态。
4. 提供确定性单测验证在典型局面下的最优选招。

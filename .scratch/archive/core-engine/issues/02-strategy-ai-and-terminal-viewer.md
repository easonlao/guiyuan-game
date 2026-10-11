---
title: "02: 纯 TS 策略 AI 引擎与 Terminal 棋盘回放检视器"
parent: "../spec.md"
blocked_by:
  - "01-turn-manager.md"
labels:
  - "completed"
---

## Context & Question

如何将 `legacy/` 中的启发式打分与策略评估重构为纯 TS 引擎，并构建基于 EventBus 的纯文本/ASCII 棋盘回放器（`TerminalBoardViewer.ts`）以在脱水环境中直观验证对局和事件流？

## Acceptance Criteria

1. 在 `src/core/ai/` 实现纯 TS 策略估值器：
   - 支持权重注入（如：偏防御/自保、偏归元冲刺、偏压制克破）。
   - 实现策略函数 `(state: GameState, tianGan: TianGanInfo, availableActions: ActionPayload[]) => ActionPayload`。
2. 实现纯文本/ASCII 棋盘检视器 `src/core/headless/TerminalBoardViewer.ts`：
   - 订阅 `EventBus` 事件，输出可视化的双方棋盘状态（包含五行木火土金水，阴阳点亮等级与道损标记）及操作摘要。
3. 单元测试 `tests/core/ai-strategy.test.ts` 验证不同局面下的权重最优选招。
4. `npm test`、`npm run oxlint` 和 `npm run check:deps` 全部通过。

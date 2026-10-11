# 01: 回合生命周期引擎 (TurnManager) 与连动/平局规则

**Status:** resolved

## Context & Question

如何在纯 TypeScript 层实现驱动完整对局流转的 `TurnManager` 引擎，负责抽取天干、合法性动作校验、爆发连动限制与 60 回合终局平局判定？

## Acceptance Criteria

1. 在 `src/core/logic/TurnManager.ts` 中实现生命周期调度器：
   - 依赖注入 `PRNG` 生成可控随机天干。
   - 推进状态机生命周期：`START_TURN`（抽天干） -> `EXECUTE_ACTION`（执行动作并校验合法性） -> `RESOLVE_BURST`（连动判定） -> `END_TURN` / `GAME_OVER`。
2. 连动限制保证：
   - 玩家发动 `BURST` 或 `BURST_ATK` 获得额外行动时，在该额外行动中生成动作候选时过滤掉 `BURST` / `BURST_ATK`（一次大回合内禁止二次爆发）。
3. 终局规则对齐：
   - 达到最大回合上限（默认 60）时，若双方比分相同，严格判定 P2（后手）获胜（对齐 GDD 后手补偿规则）。
4. 单测 `tests/core/turn-manager.test.ts` 完整覆盖生命周期流转、连动锁、终局平局判定。
5. `npm test`、`npm run oxlint` 和 `npm run check:deps` 全部通过。

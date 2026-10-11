# [CLOSED] [wayfinder:task] 定义基础游戏数据模型

## Question

如何用纯 TypeScript 明确定义“五行节点”的状态（道损、虚空、点亮、加持等）以及玩家的回合可选动作（吸纳、调息、化、破等），并保证严格的类型安全？

## Resolution

- 创建了 `src/js/types/models.ts` 核心数据字典。
- 使用 `enum` 严格约束了：
  - `NodeStateValue`: 映射为 `-1` (道损), `0` (虚空), `1` (点亮), `2` (加持)，契合 `SRS` 中定义的上下界限。
  - `ActionType`: `AUTO`, `CONVERT`, `TRANS`, `ATK`, `BURST`, `BURST_ATK`。
  - `Element` 与 `Polarity`（五行与阴阳）。
- 定义了强类型的 `PlayerAction` 和 `ElementNodeState` 接口。

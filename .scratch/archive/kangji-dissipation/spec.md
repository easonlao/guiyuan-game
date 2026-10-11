---
title: "技术规格书：天道三态之“亢极散气”规则实装与平衡性校验"
labels:
  - "completed"
---

## Problem Statement

在当前《归元弈》核心引擎中，“亢极（阴阳两侧均达到加持 2）”仅作为纯状态与术语存在，缺乏与之匹配的机制闭环。当五行节点达到 `(2, 2)` 状态后：
1. 若再次抽中该元素天干，因对侧已满无法执行【调息 CONVERT】；若此时相生相克目标均达到边界，动作候选集将退化为空，被迫触发冗余的 `AUTO` 空操作（等级受限在 2 且得 0 分），造成规则死角。
2. 缺乏天道哲学中“物极必反、满溢则亏”的制约机制，使得玩家只需无脑将所有节点堆满至加持，缺乏局势平衡的博弈张力。
3. 文档（GDD、SRS、GLOSSARY）已确立“天道三态（低位态强制吸纳、中位态自主抉择、极位态强制散气）”，但代码逻辑层尚未实装“亢极散气 (DISSIPATE)”动作。

## Solution

在核心引擎（Layer 1）中正式实装“天道三态”中的极位态核心流转规则——**【亢极散气】（`DISSIPATE`）**：
1. **合法动作生成**：当且仅当当前抽中的天干对应己方节点已达成“亢极”（`isNodeKangJi` 为 true）时，系统彻底封印所有主动操作，仅生成且强制生成唯一的【亢极散气】动作。
2. **动作解析执行**：执行【亢极散气】时，严格按照抽中的天干阴阳极性，将对应侧的状态扣除 1 级（由 2 降为 1，节点变为 `(2, 1)` 或 `(1, 2)`），分值增加 0 分，不触发额外行动。
3. **表现层与 AI 适配**：AI 策略评估器自动识别该强制动作；小游戏表现层将其纳入与自动吸纳对称的倒计时自动执行闭环。
4. **无头推演与平衡性校验**：执行 10,000 局 HeadlessBenchmark 模拟推演，评估亢极散气对先手胜率、五行归元率及平均回合数的影响，确保各项指标稳定收敛在健康护栏内。

## User Stories

1. As a player whose elemental node has reached KangJi (2, 2), when I draw a Yang stem of that element, I want the system to automatically trigger KangJi Dissipation on the Yang side, so that the Yang level decreases from 2 to 1 (state becoming 2, 1) to reflect the natural ebb of overflowing energy.
2. As a player whose elemental node has reached KangJi (2, 2), when I draw a Yin stem of that element, I want the system to automatically trigger KangJi Dissipation on the Yin side, so that the Yin level decreases from 2 to 1 (state becoming 1, 2) without affecting the Yang side.
3. As a player triggering KangJi Dissipation, I want the action to yield exactly 0 score points, so that state decay is neither rewarded as construction nor penalized with arbitrary point loss.
4. As a player triggering KangJi Dissipation, I want the node to remain in GuiYi state (since both sides remain >= 1), so that my general Guiyuan victory progress is preserved despite dropping out of KangJi.
5. As a player with a node in an intermediate state (e.g., 2, 1 or 2, 0), when I draw the level-2 side, I want to still retain full choice (CONVERT, ATK, TRANS, or BURST if GuiYi) and not be prematurely forced into dissipation.
6. As a strategy AI, when encountering a KangJi node during my turn, I want to seamlessly accept the single dissipation candidate, so that my decision pipeline remains deterministic and free of null action crashes.
7. As a mobile minigame player, when KangJi Dissipation triggers on my turn, I want to see a clear countdown prompt similar to auto-absorption (with an immediate tap-to-execute option), so that my turn flows smoothly without unnecessary interaction friction.
8. As a game designer, I want 10,000 headless benchmark matches with KangJi Dissipation to maintain a healthy Guiyuan victory rate and controlled first-mover advantage, so that match balance remains robust against infinite stagnation.

## Implementation Decisions

1. **领域模型扩展 (`src/core/types/domain.ts`)**：
   - 在 `ActionType` 枚举中新增 `DISSIPATE = 'DISSIPATE'`。
2. **候选动作生成器封印与分流 (`src/core/logic/ActionCandidates.ts`)**：
   - 在检查 `stemLevel <= 0` 之后、常规中位态决策逻辑之前，检查 `isNodeKangJi(stemNode)`。
   - 若命中亢极，立即返回唯一的 `[ { actionType: ActionType.DISSIPATE, player, element, polarity } ]`。
3. **动作解析器纯函数增量执行 (`src/core/logic/ActionResolver.ts`)**：
   - 新增 `case ActionType.DISSIPATE:`：
     - 对应极性等级执行 `clampNodeLevel(prevLevel - 1)`（即 $2 \to 1$）；
     - `scoreDelta = 0`；
     - `extraTurn = false`。
4. **计分器常量补充 (`src/core/logic/ScoreCalculator.ts`)**：
   - `POINTS_CONFIG.ACTION.DISSIPATE = 0`；
   - `NO_RARITY_ACTIONS` 纳入 `ActionType.DISSIPATE`。
5. **小游戏按钮样式与调度器适配 (`src/minigame/`)**：
   - 在 `action-button-formatter.ts` 中配置 `ActionType.DISSIPATE` 的按钮文本与高亮；
   - 在 `game-manager.ts` 中将 `DISSIPATE` 视作单一自动动作，给予自动倒计时缓冲。

## Testing Decisions

- **外部行为测试 (Integration / Black-box)**：
  - 测试输入 `GameState`（节点处于 `(2, 2)`）与天干，验证 `getAvailableActions` 仅返回一个 `DISSIPATE` 动作。
  - 测试通过 `ActionResolver.resolve` 执行 `DISSIPATE`，验证棋盘节点精确变为 `(2, 1)` 或 `(1, 2)`，`scoreDelta === 0`，回合正常递增且换手。
  - 验证中间态 `(2, 1)` 或 `(2, 0)` 不会误触发 `DISSIPATE`。
- **无头推演平衡性基准 (Headless Benchmark)**：
  - 运行 `HeadlessBenchmark.run({ matches: 10000 })`，统计输出胜率分布、五行归元率、达到上限率及平均回合数，与基线对比。

## Out of Scope

- 稀有度加成（Rarity Bonus）的恢复与实装（已明确暂不加入，留待后续平衡）。
- Local PVP 与登塔模式的前端开发。
- 角色语音气泡与受击面部神态的新增动画制作。

## Further Notes

本次实现彻底补齐了从 GDD、SRS、GLOSSARY 到代码执行层的“天道三态”全生命周期规则。

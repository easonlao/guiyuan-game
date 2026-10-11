# T1: 完备规则与合法动作候选生成器 (ActionCandidates) 及增量状态转换

**Type:** task

**Blocked by:** 007

**Status:** resolved

## Question

如何为纯 TypeScript 的核心状态层实现一个纯函数的合法动作候选生成器（`ActionCandidates.ts`），并对 `ActionResolver` 中的状态更新逻辑进行结构共享/增量不可变优化，消除高频推演时的内存 GC 抖动风险？

## Acceptance Criteria

1. 在 `src/core/logic/ActionCandidates.ts` 实现 `getAvailableActions(state: GameState, tianGan: TianGanInfo): ActionPayload[]`。
2. 规则逻辑对齐《GDD》与遗留基线：
   - 虚空 (0) / 道损 (-1) 必须支持自动吸纳 (AUTO)。
   - 目标节点已点亮 (1) 时，支持同节点调息 (CONVERT)；若为阳天干且满足条件支持相克破 (ATK)；若为阴天干且满足条件支持相生化 (TRANS)。
   - 任意节点已归一（阴阳均为 1）时，支持消耗对应极性发起爆发动作（强化 BURST 耗阴、强破 BURST_ATK 耗阳）。
3. 优化 `ActionResolver` 的对象创建，采用浅层增量 Patch，消除递归深拷贝造成的频繁对象分配与 GC 压力。
4. 编写完整的测试用例 `tests/core/action-candidates.test.ts`，覆盖所有五行属性和边界情况。
5. `npm test`、`npm run oxlint` 和 `npm run check:deps` 全部通过。

## Resolution

已实现纯函数合法动作候选生成器 `ActionCandidates.ts`（支持 AUTO/CONVERT/TRANS/ATK/BURST/BURST_ATK 全规则与阴阳优先级选择器）；重构 `ActionResolver` 为结构共享增量浅更新机制（保留未修改节点的内存引用，消除深拷贝 GC 压力）；编写单测验证所有边界状态与结构共享有效性；9 个测试文件共 33 个用例全部通过，代码检查 0 报错。


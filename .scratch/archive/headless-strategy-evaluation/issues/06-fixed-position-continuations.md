# 06: 固定局面枚举首步并完成续局比较

**What to build:** 从冻结局面集合出发，枚举全部合法首步，通过面对不同对手策略的完整续局估计动作胜负价值。

**Blocked by:** 03 — 可复现随机对局与三类公开信息策略。

**Status:** resolved

**Resolution:** Added an immutable fixed-position extraction/diagnostic seam, runner-backed first-action enumeration, and complete paired seeded continuations with explicit scoring snapshots, terminal-value statistics, uncertainty, failure/budget accounting, and replay records. Frozen baseline fixtures cover tied, trailing-needs-disruption, near-limit, and extra-opportunity states. API contract: `docs/fixed-position-continuations.md`; focused tests: `tests/fixed-position-continuations.test.js`.

- [x] 从基线完整对局记录抽取并冻结可达局面，覆盖均势、一方领先另一方需干扰、临近回合上限三类；手工局面单独标为诊断样本。
- [x] 保存局面身份、完整状态、当前玩家与天干、额外行动语义及可达性来源。
- [x] 枚举实际全部合法首步，不限于 AI 已选择的动作；动作分支互不污染。
- [x] 固定首步后使用相同续局策略、配对样本与明确策略身份，运行到正式终局；能显式选择规则配置以供后续新旧比较。
- [x] 独立报告胜平负比例、胜负价值、样本数、配对动作价值差及可复现的不确定性估计；积分与归一变化仅作为解释指标。
- [x] 输出机器可读结果、简明比较和完整重放信息，明确这些是指定续局假设下的价值估计而非全局最优动作。
- [x] 若提供截断续局，代理指标与完整胜负评价分开；失败或预算不足明确报告，不默默丢弃候选首步。
- [x] 确定性用例验证首步覆盖、配对条件、终局价值与分支隔离。

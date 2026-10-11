# 11: 结论与路线决定 (Conclusion and Route Decision)

**What to build:** 依据审计与占优诊断的结论，决定游戏平衡路线，并落地为 ADR。

本轮的核心疑问是「游戏能否成立」：现状下激进压制对全部其它策略严格占优，而压制型策略自对弈同时表现为九成以上的流局率与六成以上的先手胜率——即**个体最优、集体无聊**。项目负责人已确认，这个方向若不处理，后续工作无法推进。

**Blocked by:** 03 判据与文档溯源对表、10 动态策略

**Status:** closed

- [x] 记录审计发现的全部方法缺陷及其修复情况。证据：`docs/adr/0011-balance-route-fix-rules.md`（`60df8ba`，并入 `c1254a4`）证据 1。
- [x] 记录对「是否存在严格占优路线」的最终判定。证据：ADR 0011 证据 2（存在，由计分造成）。
- [x] 给出路线决定：修规则 / 修计分 / 修 AI / 维持现状，并说明理由。证据：ADR 0011 决策 1；`2f80cdf` 将路线由修规则修订为**修计分与终局结算口径**。
- [x] 列出被否决的备选方案及其否决原因。证据：ADR 0011 被否决的备选方案 1–5。
- [x] 落地：同步文档与护栏，补 ADR。证据：`docs/adr/0011-balance-route-fix-rules.md`；`docs/headless/guardrail-provenance.md`；GDD §2.1。
- [x] 测量台与实验命令**不得**因结论落地被回退。证据：`package.json` `benchmark:*` 与 `src/core/headless/*` 均保留。
- [x] 护栏测试全绿；工作区无残留。证据：`npm test` 32 文件 / 626 测试全绿；`git status` 干净。

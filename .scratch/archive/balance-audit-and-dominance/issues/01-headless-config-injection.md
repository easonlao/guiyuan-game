# 01: 无头推演可注入计分配置与规则开关 (Headless Config Injection)

**What to build:** 无头推演能按指定的计分配置与规则开关运行对局，使「换一套数值、重跑一批对局」成为一条命令就能完成的事。不传配置时，行为与当前完全一致——现有对局的结果、计分与终局形态逐字节不变。默认值必须等于生产现状，任何只影响实验的取值都由调用方显式传入。

这是后续所有实验的共同前提：策略权重与双方策略本就可注入，缺的是计分配置与规则开关。上一轮曾加入该注入，但随实验一起被回退；本票要求恢复，并作为永久基础设施保留。

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] 无头推演的单局入口与批量入口都能接受计分配置与规则开关。证据：`0e18bd9`（并入 `db44553`）。
- [x] 默认值等于生产现状；不传时现有全部测试零改动通过。证据：`tests/core/headless-config-injection.test.ts`。
- [x] 用一个刻意不同的配置跑一局，能观察到计分与终局结果差异——证明注入生效，而非被静默忽略。证据：`2f80cdf` 以 `StrategySpec`/`resolveStrategy` 强化单次注入接缝；`tests/core/injection-path-verification.test.ts`。
- [x] 注入点同时覆盖游戏内回合管理与无头推演两个入口。证据：`0e18bd9`（并入 `db44553`）。
- [x] 实验命令写进 npm 脚本，且不随实验结束被移除。证据：`package.json` `benchmark:*` 命令长期保留。

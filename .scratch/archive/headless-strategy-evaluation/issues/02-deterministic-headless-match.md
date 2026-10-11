# 02: 从完整局面运行确定性无界面对局

**What to build:** 输入完整局面、指定天干序列及双方策略，无需浏览器即可运行到终局，返回状态轨迹、完整行动记录和胜负结果。

**Blocked by:** 01 — 固定规则基线，抽离共享回合与结算逻辑。

**Status:** resolved

## Answer

`318aa35` implements the evaluator; `680d468` fixes review findings, merged into `integration/headless-strategy-evaluation`. Public API/contract: `src/js/logic/headless/HeadlessMatch.js`, `docs/headless-match.md`. Full suite: 58 tests passed; production build passed. Standards/spec reviews completed and follow-up verified. Explicit experimental scoring configuration remains ticket 04; this ticket uses the shared host baseline without mutating rule configuration.

- [x] 输入包含双方阴阳节点、积分、当前玩家与天干、回合计数及上限、额外行动及影响后续规则的状态；缺失或非法输入明确失败，不静默补齐影响胜负的值。
- [x] 复用正式候选动作、动作结算、计分及共享回合规则；核心运行不依赖 DOM、动画、网络、存储、学习记录或完整事件总线编排。
- [x] 确定性测试覆盖六类动作、状态上下界、阴阳优先级、源节点消耗、部分效果达到边界、自动吸纳和无合法动作时跳过。
- [x] 策略只能选择实际合法候选动作；自动吸纳不能自由选择；非法选择报错并保留复现信息。
- [x] 覆盖额外行动、禁止无限连动、回合上限、被动计分、归一获胜、比分胜负及平局，终局后不继续执行或消耗天干。
- [x] 指定天干序列按实际行动机会消耗，包含额外行动；序列耗尽明确失败，不转入随机模式。
- [x] 每局、动作分支与规则切换互不污染，可顺序运行但不承诺未经验证的并发；相同输入得到相同完整记录。

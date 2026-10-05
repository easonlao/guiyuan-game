# 04: 显式选择实验计分配置

**What to build:** 在无界面对局中显式选择计分基线、三个独立实验变动或其组合，正式游戏默认规则不变。

**Blocked by:** 02 — 从完整局面运行确定性无界面对局。

**Status:** resolved

**Resolution:** `runHeadlessMatch` accepts optional version-1 `scoringConfig` switches and returns an immutable, full points-table snapshot for every match. The named `formal-baseline` is the default; experimental switches are match-local and scoring-only. Details: `docs/experimental-scoring.md`. Focused tests: 16 experimental-scoring tests and the formal scoring/turn-flow/headless characterization tests passed (55 tests total).

- [x] 明确命名并保存现有计分基线；默认正式游戏不启用实验配置。
- [x] 支持独立开关及组合：自损不按攻击状态变化奖励；强化与强破行为分按整次动作而非成功子步骤重复累计；禁用稀有度加成。
- [x] 配置具有版本身份和完整快照，非法配置明确报错，每局及规则切换互不污染。
- [x] 相同初始局面与合法动作记录在不同计分配置下，棋盘变化及额外行动语义一致，允许终局比分不同。
- [x] 基线特征测试继续通过，并覆盖各单独变动、组合及边界情况下的可人工核算得分。
- [x] 不改天干概率、胜利条件、玩家操作或动作目标，不宣称实验计分已经改善平衡。

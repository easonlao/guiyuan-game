# 03: 可复现随机对局与三类公开信息策略

**What to build:** 使用随机种子和建设优先、攻击优先、局势响应型策略运行完整对局，并能够重放相同结果。

**Blocked by:** 02 — 从完整局面运行确定性无界面对局。

**Status:** resolved

**Resolution:** Added `runSeededMatch`/`replaySeededMatch`, versioned public strategy decisions, and a versioned seeded RNG that samples the formal ten-stem list uniformly with separate stem/P1/P2 tie streams. Results retain consumed stems and replay recorded actions. Strategy callbacks receive frozen public state, completed public action history, the current stem, and legal candidates only. API and policy definitions: `docs/seeded-strategies.md`. Focused seeded/headless/scoring tests: 48 passed after review regressions; integration suite: 84 passed. Spec review fixes capture scoring once per whole match and retain whole-match reproduction context on later strategy failures.

- [x] 种子随机源保留正式天干分布语义；相同输入、策略与种子得到相同记录，实际随机输入可保存和重放。
- [x] 提供建设优先、攻击优先及局势响应型策略，具有明确版本身份、确定的决策定义与合法回退。
- [x] 策略只获得公开局面、已发生历史、当前天干及合法动作，不获得未来天干、对手内部参数或实验标签。
- [x] 随机策略的平局选择使用独立随机流，测试证明它不会改变天干流。
- [x] 不以现有 AI 评分器作为唯一策略或规则正确性裁判，终局胜负是对局结果依据。
- [x] 策略在不同计分配置下维持同一决策定义；如增加配置感知策略，独立命名并单独报告。

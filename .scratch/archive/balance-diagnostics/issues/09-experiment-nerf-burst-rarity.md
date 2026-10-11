# 09: 第一阶段计分实验 - 削弱爆发类稀有度加成

**Blocked by:** 08 诊断报告结论

**Status:** resolved
---

## Agent Brief

**Category:** enhancement
**Summary:** 开发并执行计分调整的第一个实验：通过配置剥夺爆发类动作（BURST / BURST_ATK）的稀有度加成，评估其对计分独立性和护栏指标的影响。

**Current behavior:**
根据 08 号再分析报告，`BURST` 和 `BURST_ATK` 凭借高频触发与高稀有度乘数，垄断了 70.5% 的稀有度加成得分，而稀有度加成又是拉开胜负分差的绝对主力（贡献超 60% 的净胜分差）。这一机制导致计分竞赛异化，完全依附于做五行归元的爆发动作，无法形成独立的博弈路线。

**Desired behavior:**
在不修改正式全局配置的前提下，通过实验注入的方式剥夺这两个动作的稀有度加成。具体需要：
1. **支持配置**：扩展 `ScoringConfig` 系统，使其支持传入 `noRarityActions` 数组（例如 `['BURST', 'BURST_ATK']`）。底层计分器在计算稀有度时，若动作在此数组中，则直接跳过加成。
2. **运行实验**：新建实验脚本 `scripts/experiments/01-nerf-burst-rarity.js`，注入该配置，并运行 200 种子（交换先手、60 回合上限）的完整对局。
3. **输出报告**：在 `reports/balance-diagnostics/experiments/` 下生成 markdown 实验报告。报告需重点评估三个维度：
   - **分数结构修正**：确认爆发动作的稀有度加成已被清零，观察新的胜负分差来源。
   - **重合度指标变化**：中盘（30回合）分数领先方在背离时的胜率是否开始向 50% 靠拢？回合上限局中“分高者 = 点亮多者”的重合比例是否下降？
   - **安全护栏检查**：确认该调整未破坏 ADR 0001 的三项基线护栏（归元率、强方胜率、先手优势）。

**Key interfaces:**
- **配置层**：`src/js/logic/actions/ScoringConfig.js` 需要新增 `noRarityActions` 字段的接收与默认值处理。
- **计分层**：`src/js/logic/actions/ScoreCalculator.js` (`_applyRarityBonus`) 与 `src/js/state/StateScoreRecorder.js` (`rarityAdjustedScore`) 需要拦截并在 `actionType` 属于 `noRarityActions` 时直接返回原 `score`。

**Acceptance criteria:**
- [x] `ScoringConfig` 及其衍生配置能够正确透传 `noRarityActions` 参数。
- [x] 单元测试或实验数据确凿证明，当配置生效时，`BURST` 和 `BURST_ATK` 的稀有度加成为 0，且其他动作不受影响。
- [x] 实验脚本成功执行 2400 场（含交换先手）完整样本收集。
- [x] 成功生成实验报告 `01-nerf-burst-rarity.md`，报告中对指标变化和基线护栏有明确的对照分析结论。

**Out of scope:**
- 本次实验**严禁**修改任何攻击类（如致道损、破点亮）的基础分或状态分（加强攻击将放在第二步单独实验中）。
- 本次实验的配置修改仅通过 `scoringConfig` 注入，**不要**去改动 `GAME_CONFIG.POINTS_CONFIG` 影响正式游戏版本。

# 10: 第二阶段计分实验 - 攻击压制收益参数扫描 (Parameter Sweep)

**Blocked by:** 09 实验报告结论

**Status:** resolved
---

## Agent Brief

**Category:** enhancement
**Summary:** 开展第二阶段计分组合实验：在保持剥夺爆发稀有度的前提下，通过参数扫描寻找最佳的攻击得分倍率，以此修复胜率护栏并确立独立的计分路线。

**Current behavior:**
09 号实验（实验 01）成功通过剥夺爆发类动作稀有度加成打破了计分垄断，但因为没有任何得分补偿，导致擅长压制的技术型浅层 AI 胜率跌穿了基线护栏（降至 61.8% < 65%）。同时，纯攻击类得分占比极低，中盘“分数领先但点亮落后”的胜率仍卡在 45.1%，不足以和无脑冲点亮策略完全分庭抗礼。

**Desired behavior:**
开发实验脚本 `scripts/experiments/02-attack-buff-sweep.js`，该脚本将执行一次严谨的组合实验与参数寻优：
1. **保留基座**：在注入的 `scoringConfig` 中，继续保持 `noRarityActions: ['BURST', 'BURST_ATK']`。
2. **支持动态倍乘**：扩展 `scoringConfig` 接受 `attackScoreMultiplier` 字段。针对纯攻击类状态变化（`CAUSE_DMG`, `BREAK_LIGHT`, `WEAKEN`），得分计算时需乘上该倍率。
3. **参数扫描 (Parameter Sweep)**：在脚本前半段，使用较小样本（例如 50 种子、深1vs规则对局与深1自对弈）分别对倍率 1.5x, 2.0x, 2.5x 进行快速验证。
4. **自动选取**：脚本需自动评估结果，选出能让护栏 2（强弱对阵强方胜率）重回 ≥65%，且让中盘背离胜率尽可能向 50% 靠拢的最优倍率。
5. **全量报告**：使用选出的最优倍率，运行与之前一样的全量 200 种子诊断流程，生成最终的 Markdown 实验报告写入 `reports/balance-diagnostics/experiments/02-attack-buff-sweep.md`。报告中需附上参数扫描的简要决策过程。

**Key interfaces:**
- **配置系统**：`ScoringConfig.js` 需支持接收并透传 `attackScoreMultiplier`。
- **计分引擎**：`ScoreCalculator.js` (`_getStateChangeScore`) 需在计算出 `CAUSE_DMG`, `BREAK_LIGHT`, `WEAKEN` 的分数后，乘以该系数。
- **实验脚本**：逻辑上分为 `sweep()`（小样本多参数比对）和 `runFull()`（最优参数全量诊断）两步。

**Acceptance criteria:**
- [x] 实验脚本成功具备自动化参数扫描（Parameter Sweep）能力。
- [x] 计分引擎正确且仅针对防守/破坏类状态得分进行了倍乘放大。
- [x] `01-nerf-burst` 中的稀有度剥夺在本次实验中确切保持生效。
- [x] 生成的 Markdown 报告开头部分展示了 1.5x, 2.0x, 2.5x 扫描结果，并解释了最优参数的选中理由。
- [x] 报告主体包含了 2400 局全量模拟后完整的胜负分数结构、重合度指标与 ADR 0001 护栏达标情况。

**Out of scope:**
- **严禁**在此次实验中修改任何动作的常规行为分（如 BURST 基础 100 分不动），控制变量。
- **严禁**直接将配置写死进正式游戏文件 `GAME_CONFIG.POINTS_CONFIG`。

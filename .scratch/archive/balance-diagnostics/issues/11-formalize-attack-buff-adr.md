# 11: 落实第二阶段计分实验成果并撰写 ADR 0002

**Blocked by:** 10 实验结论验证通过

**Status:** resolved
---

## Agent Brief

**Category:** enhancement
**Summary:** 将实验验证成功的“剥夺爆发动作稀有度加成”与“放大 2.5 倍攻击压制状态分”合入正式配置，并撰写 ADR 0002 记录决策过程。

**Current behavior:**
在此前我们通过外挂 `scoringConfig` 进行了两次实验（01 和 02），证实了：只有剥夺 `BURST` / `BURST_ATK` 的稀有度加成，并同时将攻击状态得分（致道损、破点亮、削弱加持）放大 2.5 倍，才能同时满足“强弱对阵强方胜率 ≥65%”的护栏以及“计分路线与点亮路线在分歧时五五开”的平衡要求。目前正式的 `POINTS_CONFIG` 尚未修改。

**Desired behavior:**
将上述成果正式合入主干：
1. **硬编码 2.5 倍攻击加成**：在 `src/js/config/game-config.js` 的 `POINTS_CONFIG.STATE_CHANGE` 中，找到 `CAUSE_DMG`、`BREAK_LIGHT`、`WEAKEN`，直接将它们的配置数值乘以 2.5（例如 120 变为 300，80 变为 200 等）。
2. **植入稀有度黑名单**：在 `POINTS_CONFIG` 中新增 `NO_RARITY_ACTIONS: ['BURST', 'BURST_ATK']`。
3. **适配计分引擎**：修改 `src/js/logic/actions/ScoreCalculator.js` (`_applyRarityBonus`) 与 `src/js/state/StateScoreRecorder.js` (`rarityAdjustedScore`)。使得当计算的 `actionType` 包含在 `POINTS_CONFIG.NO_RARITY_ACTIONS`（如果有配置）时，不应用乘数逻辑，直接原样返回分值。
4. **撰写 ADR 0002**：在 `docs/adr/0002-attack-buff-and-rarity-nerf.md` 中记录本次决策。必须包含决策动机（解决计分垄断与剥离点亮附庸）、决策内容（2.5倍强化与稀有度剥夺）以及数据支撑（护栏达标情况与 48.1% 中盘背离胜率）。

**Key interfaces:**
- 配置文件：`src/js/config/game-config.js` 的 `POINTS_CONFIG` 常量。
- 底层计分器：`ScoreCalculator.js` 和 `StateScoreRecorder.js` 负责稀有度过滤逻辑，过滤列表优先取自 `scoringConfig?.pointsConfig?.NO_RARITY_ACTIONS` 或 `POINTS_CONFIG.NO_RARITY_ACTIONS`。
- 文档：`docs/adr/0002-attack-buff-and-rarity-nerf.md`（按 `docs/agents/domain.md` 及 ADR 模板格式编写）。

**Acceptance criteria:**
- [x] `POINTS_CONFIG` 中相应的攻击分数已被静态修改为原值的 2.5 倍，无需在运行时动态相乘。
- [x] 计分代码成功适配 `NO_RARITY_ACTIONS`，阻止 `BURST` 类别计算稀有度。
- [x] 相关修改通过现有的所有核心测试用例验证。
- [x] 成功提交并格式正确的 `ADR 0002` Markdown 文件。

**Out of scope:**
- 任何游戏核心流转逻辑修改。
- 对未提及的其他行为分（如 `AUTO`、`CONVERT` 等）进行改动。

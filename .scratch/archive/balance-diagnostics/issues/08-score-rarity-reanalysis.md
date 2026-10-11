# 08: 计分数据再分析与稀有度溯源

**Blocked by:** 07 — 计分与五行归元进度重合度诊断

**Status:** resolved

---

## Agent Brief

**Category:** enhancement
**Summary:** 基于 07 产出的诊断数据，重新修正计分统计口径，并针对“稀有度加成”进行深入拆解分析。

**Current behavior:**
在 07 任务生成的报告中，存在三个统计口径问题导致结论可能产生偏差：
1. 胜负得分构成是将全部 2400 局纳入计算的，但实际上只有 896 局回合上限对局是靠分数决出胜负的，导致真正的计分胜负信号被稀释。
2. 占得分比重极高的“稀有度加成（Rarity Bonus）”没有细分到具体动作，无法确定是哪类动作在“刷分”。
3. 强化（BURST）动作自耗本命加持产生的“削弱加持”事件，在统计中被错误地归入了“攻击（Attack）”大类，污染了攻击类得分的真实性。

**Desired behavior:**
开发一个轻量级的再分析脚本，直接读取 `reports/balance-diagnostics/score-unity-overlap/data.json` 中的数据并输出一份补充报告。补充分析需要：
1. **限定样本**：仅提取通过“回合上限（Turn Limit）”结算的对局。
2. **重算胜负分差**：在这个限定样本内，重新计算胜方与输方在各项得分（建设、攻击、行为、亢极分红、道损扣分、稀有度）上的均值差。
3. **修正强化（BURST）归属**：将强化（BURST）及强破（BURST_ATK）所导致的自我“削弱加持”从攻击类得分中剔除，归入建设/防守成本。
4. **稀有度溯源**：将稀有度加成分数拆解到触发它的具体动作上（强化、强破、调息、化等），找出真正的加成大头。

结果需以 markdown 形式写入 `reports/balance-diagnostics/score-unity-overlap/08-reanalysis-report.md`。

**Key interfaces:**
- 数据源：读取现有的 `reports/balance-diagnostics/score-unity-overlap/data.json`。无需运行新的对局模拟。
- 脚本路径：可以新建 `scripts/analyze-score-rarity.js` 或类似脚本进行纯数据处理。

**Acceptance criteria:**
- [x] 成功读取现存的 `data.json` 且未运行新的对战模拟。
- [x] 统计逻辑成功过滤出仅因回合上限结束的有效计分局。
- [x] 报告清晰展示回合上限局中，胜方与输方的单项得分差值。
- [x] 报告中，强化的自耗不再被计入“攻击”类别。
- [x] 报告清晰拆解了“稀有度加成”分数在各项动作中的分布比例。
- [x] 在对应目录生成补充报告文件。

**Out of scope:**
- 运行新的对战模拟或修改对战生成器（仅作数据后处理）。
- 修改游戏内的 `POINTS_CONFIG` 或 `StateScoreRecorder.js` 的底层逻辑（本次仅修正报告的数据清洗统计分类）。

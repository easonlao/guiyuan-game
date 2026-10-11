# 01: 回合上限结算输方 500 分诊断

**What to build:** 查明 12 回合批量对局中输方终局得分恒为 500、胜方 600–2353 的原因，判断是初始分/保底分/计分口径问题，还是计分存在滚雪球效应。只诊断，不改正式计分。

**Blocked by:** 无

**Status:** closed

**背景证据：** 子代理复跑 small-run 批量（种子 202603/202604）：输方恒为 500；胜方 baseline 2353/2196/672，no-rarity 1210/1100/600，combined 950/860/600。计分路径：`BatchComparison.js:71 → HeadlessMatch.js:311,329 → ScoreCalculator.js:30,79,136`、`StateScoreRecorder.js:13`。

- [x] 定位 500 的来源（初始值、下限钳制、某项固定加成或记录口径），附代码行号。已证实为 12 回合下输方 5 次强制吸纳（100分/次），见 `docs/balance-diagnostics/loser-score-floor-diagnostic.md`。
- [x] 逐回合记录双方分数轨迹，拆分各计分项（行为分、状态分、稀有度、自损奖励、强化子步骤）的贡献。
- [x] 判断领先方是否因已有状态获得更多后续得分（滚雪球），给出可复现的最小例子。
- [x] 在 60 回合下复查同一现象是否仍存在。已证实 60 回合下 500 分底分现象完全消除。
- [x] 输出简短诊断说明（`docs/` 或报告附录），明确"已证实 / 未证实 / 证据不足"。（详见 `docs/balance-diagnostics/loser-score-floor-diagnostic.md`）
- [x] 不修改正式计分；如发现缺陷，另开票。

# 01: 双轨制行为分与己方建设状态分全链路实装

**What to build:**
让玩家在执行资源调息 (CONVERT)、生生流转 (TRANS)、基础破袭 (ATK) 以及爆发动作 (BURST/BURST_ATK) 时，能即时在对局得分中斩获标准行为基础分 (50/30/40/100/80)；同时当己方棋盘发生节点提升（修复道损 200 分、点亮虚空 100 分、加持 200 分）时，状态分能完整结算并累加至玩家对局总分。

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] 在核心计分配置中声明完整的行为基础分 (ACTION: CONVERT 50, TRANS 30, ATK 40, BURST 100, BURST_ATK 80, AUTO 0)。
- [x] 在核心计分配置中声明己方建设状态分 (REPAIR_DMG 200, LIGHT_UP 100, BLESSING 200)。
- [x] 动作解析器 (ActionResolver) 在处理所有合法动作时，统一将行为基础分与己方状态提升分累加到 scoreDelta 及玩家 score 中。
- [x] 在外部行为切缝测试中全面覆盖 6 大动作的行为分发放与己方 3 类节点等级跃迁得分断言。
- [x] 既有全部单测全部保持通过。

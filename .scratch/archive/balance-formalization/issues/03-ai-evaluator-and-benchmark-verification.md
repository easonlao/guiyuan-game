# 03: 策略 AI 价值评估器对接与万局无头推演平衡性基线验收

**What to build:**
将准确反映攻防双轨博弈价值的真实动作得分 (scoreDelta) 完整注入策略 AI 评估器 (ActionEvaluator)，消除 AI 单向偏袒点亮冲刺的盲区；并通过 10,000 局自动化无头推演 (npm run benchmark:headless) 进行平衡性基线与 GC 内存验收，验证先手胜率与五行归元终局率是否符合 ADR 0001 安全护栏。

**Blocked by:** 02: 2.5倍攻击压制状态分与爆发动作稀有度黑名单豁免实装

**Status:** resolved

- [x] ActionEvaluator 评估动作时无缝消费 ActionResolver.resolve 产出的真实 scoreDelta，使其能够平衡攻防权重。
- [x] 确保各项预设策略（平衡策略、激进策略、自保策略等）在真实计分体系下表现出符合设计的行为倾向。
- [x] 运行万局批量推演脚本 (npm run benchmark:headless)，记录并输出全新平衡性评测数据。
- [x] 检验 ADR 0001 三大安全护栏：同水平对局归元率处于 25%~80%、先手胜率显著收敛回健康区间、且万局内存净增量稳定无泄漏。
- [x] 全套自动化测试 (npm test)、静态分析 (oxlint) 及架构依赖巡检 (dependency-cruiser) 100% 保持绿色。

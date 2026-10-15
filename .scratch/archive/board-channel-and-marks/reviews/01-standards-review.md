# 票 01 Standards 轴复审（Reviewer）

结论：**可合，附一处文档硬伤**。代码实现与票 01 范围一致：亮度阶梯、四档保留元素色描边、图例文案统一为「道损 / 虚空 / 点亮 / 加持」、`LEVEL_LABEL` 正名、`game.js` 逐字节对账通过。`check:quick` 与 `verify` 全绿（52 文件 944 测试）。

## 硬伤（文档标准）

**docs/HLD.md:51** —— 新增的「法盘状态编码（ADR 0018）」条目把**未落地**的票 02–05 内容写成现状：归一 / 亢极金环（票 02）、候选落点弧与慢呼吸（票 03）、按住幽灵态（票 04）、「对手盘主印放大到约内环的 0.92」与环间距重算（票 05）。代码里 `OPPONENT_SEAL_SCALE` 仍是 0.82（board-view.ts:55），金环 / 幽灵态逻辑不存在。冲突点：
- AGENTS.md 所有权表：HLD 不写「规则机制与取值」；spec.md §实施边界明言「像素取值以代码常量为真源，本文不复制」，0.92 却进了 HLD。
- 同列表的 ADR 0015 条目以「已落地」标记；本条无标记，读者会误当现状。

建议：拆成「已落地（票 01）+ 指针到 ADR 0018 / 各票 issue」两段，删去具体取值，或对未落地项标「待票 02–05」。

## 判断题（smell baseline）

1. **Duplicated Code** —— 图例四档文案在 game-scene.ts:856 重复声明一份（`labels` 数组），与 action-result-view.ts:20 的 `LEVEL_LABEL` 各存一份，一致性只靠测试断言（minigame-game-scene.test.ts:1129–1136）。票的验收就是「文案一致」，直接在 `drawDecisionGuide` 里 import `LEVEL_LABEL` 可把一致性变成结构保证。（game.js 的副本是构建产物，不算。）
2. **Repeated Switches（轻微）** —— 等级阶梯散在 drawYinYangFish 三处：fill 分支（board-view.ts:576）、stroke 四元嵌套 ternary（:582–588）、lineWidth 三元（:589）。可收敛为按 `NodeLevel` 的一张样式表；但 fill 的加持档要渐变，现形状沿袭 HEAD，属可选重构。
3. **Mysterious Name（轻微）** —— 测试助手 `bodyStrokes`（minigame-board-view.test.ts:561）返回鱼身「填充 + 描边」两条 path，名字只说了 stroke；doc 注释已缓解，重命名 `bodyPaths` 更诚实。

## 符合项（抽查）

- CONTRIBUTING §2.1 命名、§4.3 TDD（四档分支各有行为测试）；`withAlpha` 命名/位置合理，注释如实标注唯一用途，无投机抽象。
- GLOSSARY 只加 `_Avoid_` 别名，符合其格式边界；LLD §6 与 GLOSSARY 改动与代码一致。
- HEAD 注释「外环更小、更暗」与实际代码（无暗化机制）不符，本次已修正——票内「撤掉暗化」的范围就此闭环。

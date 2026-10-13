# Review：票 01 等级通道重排与图例文案统一（Spec 轴）

基准：HEAD = e1946a8，工作区未提交改动。规格：`.scratch/board-channel-and-marks/issues/01-level-channel-and-legend.md`。

## 结论

票 01 五条范围全部落地；`check:quick`、`verify`（52 文件 944 测试 + `check:artifact` 逐字节对账）全绿。发现 1 个文档超前于代码的问题、1 处空满足的验收项、1 处证据盲区，无阻断。

## (a) 缺失 / 部分

1. 「在 320×568 / 390×844 / 460×900 截图……四态在同一张图里可分」——`reports/ui-design/fishgrid-{320,390,460}.png` 已产出（时间戳为本次会话），但本次审查模型无法查看图片，**四态可分性未经目验**。证据存在，验证未闭环。
2. 「`OPPONENT_SEAL_SCALE` 之外的暗化手段一律删除」——HEAD 全量检索（`globalAlpha`/composite/暗化/覆盖层，board-view.ts、game-scene.ts、game.js）**未找到任何对手盘专属暗化实现**。diff 实际只改了 `board-view.ts:52` 过期注释（删「更暗」），并经亮度阶梯替换了双方共用的暗底填充（旧 `#3e474a`/`#182c34`）。要求被空满足；最终结果符合意图（盘上不再有非元素色暗底），但票面「撤掉」的对象在 HEAD 并不存在。

## (b) 超范围

1. `board-view.ts:589`：虚空描边加粗到 1.4（点亮仅 1）——票只说「只描边不填充」，线宽是未点名的取值。无害，仅记录。
2. GLOSSARY/HLD/LLD 文档同步——符合 AGENTS.md 文档归属约定，非 creep。

## (c) 看似实现但存疑

1. `docs/HLD.md:51` 新增条目把 ADR 0018 全量终态写成架构现状：「对手盘主印放大到约内环的 0.92」（代码仍 0.82，`board-view.ts:55`，归票 05）、「归一 = 主印外一圈金环」（票 02 未落地）、「候选落点弧 / 慢呼吸 / 按住预览」（票 03/04 未落地）。与当前代码矛盾，建议标注「未落地」或只留 ADR 指针。
2. 其余核对无误：亮度阶梯四档（`board-view.ts:558-589`，`minigame/game.js:3106-3130` 一致）；图例四样例木色 + 首格「木示例」（`game-scene.ts:859-868`）；三处文案统一、无「崩坏/发光」残留（`action-result-view.ts:21`，`GLOSSARY.md:39,51`）；行为测试覆盖四档填充 + 描边（`minigame-board-view.test.ts:579-644`）与图例文案（`minigame-game-scene.test.ts:1127-1133`）。

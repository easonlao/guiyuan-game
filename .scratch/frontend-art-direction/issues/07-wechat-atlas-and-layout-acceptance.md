# 确认微信角色图集加载与小屏布局验收（前置 task）

Parent: ../map.md
Type: task
Label: wayfinder:task
Blocked by: none

## 目标

用户在微信开发者工具（模拟器）中拉取最新构建、重新编译后确认两件事：

1. **角色图集加载（缓存优先最终版）**：人物正常显示，且启动不再出现包内图集路径的红色错误。
2. **小屏布局回归**：胶囊避让与 320×568 窄屏盘面可读性在当前构建上仍然成立。此项已有用户验收记录，本票只做回归确认，不重新决策。

## 已验收 / 未验收边界（不得互相推论）

- **未验收（本票第 1 项）**：缓存优先加载本身。用户曾确认 `a2cde20` 的缓存回退路径人物可显示；「启动不再出现红色错误」的缓存优先改动（归档件 [frontend-design 票 07](../../archive/frontend-design/issues/07-wechat-cache-first.md)）尚未经用户重新编译确认。**布局验收不能推论为图集加载验收，反之亦然。**
- **已覆盖（本票第 2 项）**：用户已在微信开发者工具（含 320×568 窄屏机型）完成多回合对局验收，确认遮挡消除、五行标签避让清晰、对局全周期棋盘尺寸稳定。证据：[board-channel-and-marks 票 05](../../archive/board-channel-and-marks/issues/05-opponent-scale-and-layout.md) 与[其 spec 的验收节](../../archive/board-channel-and-marks/spec.md)（归档件：证据，不是定义）。覆盖范围是布局／遮挡，不含图集加载。
- **不在本票**：真机（`docs/HLD.md` §4.6 第 4 步扫码 Profiling）。微信开发者工具不是真机；本票不声称真机结论。

## 来源（同根因事项）

- [frontend-design 票 04](../../archive/frontend-design/issues/04-wechat-character-loading.md)：显式包含素材与诊断日志；用户已取到日志。
- [frontend-design 票 05](../../archive/frontend-design/issues/05-wechat-header-layout.md)：布局，已由上述 board 05 验收覆盖。
- [frontend-design 票 06](../../archive/frontend-design/issues/06-wechat-image-recovery.md)：缓存回退，用户已确认 `a2cde20` 人物可显示。
- [frontend-design 票 07](../../archive/frontend-design/issues/07-wechat-cache-first.md)：缓存优先，待用户重新编译确认（本票第 1 项）。
- [frontend-design 票 08](../../archive/frontend-design/issues/08-board-clarity.md)：盘面可读性，已由后续验收覆盖。

## 验收与产出

- 产物 `minigame/game.js` 已入库；用户拉取 main 后按既有方式编译即可，本票无源码改动，不要求用户额外执行诊断命令。
- 把用户反馈（时间、拉取的提交、微信开发者工具中的现象）记入本票 Comments；确认通过则置 `Status: resolved`。
- 确认失败则另开修复票；本票不改源码。

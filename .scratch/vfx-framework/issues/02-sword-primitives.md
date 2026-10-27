# 02: 剑术原语 + 玩家攻击配方

**Type:** task
**Blocked by:** 01
**Status:** open
**Slice:** S2

**What to build：**

1. `src/minigame/vfx/primitives/`：移植 crescent smear（demo `vfx/pixel_slash.gd:555-605`，四层分层 + 张开/保持/侵蚀消退 + speed lines）、星形 hit spark（`pixel_slash.gd:607-629`）、碎屑喷射（`pixel_slash.gd:516-548`，重力抛落 + 短拖痕）。几何算法照搬原型 `prototype-action-vfx.html` 里 Executor 已移植并自查过的版本；所有移植段带 `[ported from combat-vfx-demo ...]` 注释。
2. `src/minigame/vfx/params/`：玩家剑术配方卡（劈砍一段/三段的事件表 + 参数），数值以原型当前版为准（用户已认可）。
3. 接入点：`GameScene` 在 `action:executed`（玩家攻击类 ActionType）后展开对应时间线。核心逻辑不改；若 payload 字段不够（如目标节点坐标），先在本票评论里记录，回主线定夺，不擅自改核心。

**验收：**
- 小游戏内玩家攻击：进步贴近 → smear 挥砍 → hit-stop + 星形 spark + 碎屑 + 震屏 → 收步回位。
- 机制层测试随 01 的引擎走；本票视觉验收 = 用户在小游戏里走查一次。
- `npm run verify` 全绿；`minigame/game.js` 产物随提交重建。

**已知近似（接受，不修）：** demo 的像素颗粒感（SubViewport 最近邻）无 Canvas 等价物，保持平滑矢量边；ribbon shader 不移植。

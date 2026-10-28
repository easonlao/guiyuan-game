# 02: 剑术原语 + 玩家攻击配方

**Type:** task
**Blocked by:** 01
**Status:** resolved（2026-10-28，用户在真实预览走查通过：「基本上大框架是 ok 的，可以通过」；交付提交 4441184）
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

## Comments

**实现与实测（工作区未提交，待独立 review 与人工视觉验收）**

- `primitives/sword.ts` 移植原型 crescent smear、星形 spark 和重力碎屑，各段附来源与 PolyForm Noncommercial 注释；`params/sword.ts` 独立保存原型的一段/三段事件表、普通/重击参数与运动参数。
- `SwordPlayback` 消费 `advanceTimeline` 返回事件。move 是表现层累计位移并插值；冻结期间位移和特效寿命不推进；引擎 done 后仍等待存活特效结束。大 dt 按事件和冻结边界分步，避免跳过新生特效。
- `GameScene` 从真实玩家 ATK / BURST_ATK 事件分别触发一段/三段剑术。现已按用户批准的顶部原型替换旧中部舞台：双方共享基线，不绘制人物框与播报框，姓名得分放在场地下方；玩家进步贴近，目标击退闪色后回位。人物图集保持尺寸，特效独立缩放。符文仍负责盘面投影，双方播放完成后才进入结果；重开/销毁清理表现态。本轮未改核心规则。
- 当前使用原型火行的完整剑术参数；完整五行形态留票 04，天道法术留票 03。
- 接入测试先在真实 executeAction 后半身未移动的断言上红，再接入后绿。冻结寿命断言另经故意改为真实帧时间老化验证报红，恢复后通过。
- 针对播放器和真实场景接入测试：2 个文件、6 项通过。旧场景中固定符文时长交接和无震屏断言更新为等待实际回位与检验震屏。
- `check:quick` 通过；收尾 `verify` 通过：58 个文件、1022 项测试通过，typecheck 通过，`check:artifact` 确认重建产物逐字节一致。使用 npm 11.13.0 CLI，子脚本通过本进程 PATH 和 Bash 解析同版本 npm，未改全局 npm 或仓库配置。
- `minigame/game.js` 已重建。本轮已用 agent-browser 在真实 Chrome 的预览宿主触发 P1 破与 P2 法术，并读取紧凑屏与常规屏截图确认顶部演出；截图在 `artifacts/`。测试时固定表现时钟，通过真实 TurnManager 合法候选执行动作。未获得微信小游戏人工视觉验收；状态保留 claimed。未提交 Git，未 stash/reset，保留现有门禁修复。
- 范围补充：目标五行在创建播放时取 `resolved.element` 锁定；本轮仍使用火行材质，完整五行形态留票 04。小屏法盘按顶部区域剩余高度适配；高安全区下会缩小法盘，仍需人工评价可读性。

## Comments

- 2026-10-27（主线补记）：接入走查后追加两项布局修复——① 顶部共享对战场地压缩紧凑屏空隙后，操作区改为按「满额两行预留与实测的较大者」预算（`actionBarBudgetHeight`），法盘与图例让到操作区顶沿之上，图例越界实测收口且保 `MIN_GUIDE_SEAL=12` 可读下限；② 揭牌后的终局提示延迟 `GAME_OVER_NOTICE_DELAY=1.2s` 落进常驻结果条（胜负/原因/重开提示），先保「天命抽牌」结果可读。`verify` 58 文件 1042 测试全绿（npm 11.13.0），产物逐字节一致；真实浏览器截图核验紧凑屏三候选无重叠。本票维持 claimed，等用户真实走查验收。

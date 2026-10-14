# 03: 天元化符衔接、打断容错与全量验收交付

**What to build:** 
将中心汇聚气旋与天干符文的弹性显现无缝衔接，完成玩家提前点击时的快速收束与资源回收，并在全场景（普通回合、连动回合、终轮绝杀天命揭牌）中端到端打通，完成微信小游戏构建产物同步与门禁验证。

**Blocked by:** 02: 五行灵气光旋粒子系统与正反向流场实现

**Status:** resolved

## Acceptance Criteria

- [x] 在粒子汇聚后期（约 0.4s ~ 0.7s），天元中心形成对应天干属性色的旋转凝聚核；随后天干符文由小到大（easeOutBack）弹性浮空展开，无突兀跳帧。
- [x] 抢先打断保障：若玩家在入场期间提前触发操作（调用 `flyTo` 或 `finishEntrance`），粒子系统立即平滑淡出归零，天干符文瞬间落位待机态，不丢失玩家动作回调，且无游离粒子残留。
- [x] 终轮绝杀天命揭牌（`game-scene.ts` 中 `playEntrance` 对方 P2 抽牌）正常触发外环逆时针光旋汇聚。
- [x] 补齐完整的行为与渲染回归测试（`tests/core/minigame-rune-flight-view.test.ts`），包括完整播放、中途打断、连动加速与双方切换。
- [x] 运行构建脚本 `npm run build:minigame`，微信小游戏产物 `minigame/game.js` 逐字节对账一致。
- [x] 运行全量收尾门禁 `npm run verify` 全部通过（fmt、lint、boundary、deps、typecheck、test、artifact）。

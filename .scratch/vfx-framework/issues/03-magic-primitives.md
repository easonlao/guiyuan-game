# 03: 法术原语 + 天道动作配方

**Type:** task
**Blocked by:** 01
**Status:** open
**Slice:** S3

**What to build：**

1. `primitives/` 增加：蓄力环、弹道（ease-in 轨迹 + 拖尾）、落点 burst 环（demo `pixel_slash.gd:430-451` 移植，环张开收缩 + 外刺）。天道动作命中瞬间接 02 的星形 spark + 碎屑组合。
2. `params/`：天道法术配方卡（符弹单发/三连的事件表），数值以原型为准。
3. 接入点同 02：天道（P2/AI）的法术类 ActionType 映射到法术时间线。

**验收：**
- 小游戏内天道动作：蓄力 → 弹道飞行 → 落点 burst + spark + hit-stop。
- 用户走查一次；`npm run verify` 全绿；产物重建。

**为什么不能跳：** 阵营区分是设计目标——剑术与法术的节奏差异（劈砍瞬发 vs 蓄力+弹道延迟）是玩家辨认「谁动了」的主信号。

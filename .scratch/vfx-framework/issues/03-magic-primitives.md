# 03: 法术原语 + 天道动作配方

**Type:** task
**Blocked by:** 01
**Status:** resolved（2026-10-28，用户在真实预览走查通过：「基本上大框架是 ok 的，可以通过」；交付提交 4441184）
**Slice:** S3

**What to build：**

1. `primitives/` 增加：蓄力环、弹道（ease-in 轨迹 + 拖尾）、落点 burst 环（demo `pixel_slash.gd:430-451` 移植，环张开收缩 + 外刺）。天道动作命中瞬间接 02 的星形 spark + 碎屑组合。
2. `params/`：天道法术配方卡（符弹单发/三连的事件表），数值以原型为准。
3. 接入点同 02：天道（P2/AI）的法术类 ActionType 映射到法术时间线。

**验收：**
- 小游戏内天道动作：蓄力 → 弹道飞行 → 落点 burst + spark + hit-stop。
- 用户走查一次；`npm run verify` 全绿；产物重建。

**为什么不能跳：** 阵营区分是设计目标——剑术与法术的节奏差异（劈砍瞬发 vs 蓄力+弹道延迟）是玩家辨认「谁动了」的主信号。

## Comments

- 接入范围按已批准顶部原型收敛为 P2 攻击：ATK 单发、BURST_ATK 三连。P2 始终原地 cast，符文落点回调不覆盖顶部播放器姿势；核心规则未改。
- `params/magic.ts` 保存节奏与绘制参数，`primitives/magic.ts` 提供蓄力环、火行符弹及 burst；命中复用星芒与向前扇形碎屑，冻结共用播放时钟。移植 burst 保留 PolyForm 来源注释。
- 真实场景 P2 接入断言经临时禁用 P2 播放确认报红，恢复后回归；覆盖原地施法、目标五行锁定、命中闪色、实际 render 屏内几何、结束屏障与清理。图集绘制路径另断言闪色 filter 生效。
- agent-browser 已在真实 Chrome 预览触发 P2 法术，保存并读取 `artifacts/vfx-p2-bolt-460x588.png`、`artifacts/vfx-p2-hit-460x588.png`、`artifacts/vfx-p2-hit-460x1215.png`。状态保留 claimed，人工微信视觉验收未完成。
- 当前沿用火行结构；完整五行形态属于票 04。未提交 Git，保留所有现有未提交改动。

## Comments

- 2026-10-27（主线补记）：法术接入（P2 ATK=单发符弹、BURST_ATK=三连，原地施法不突进）随共享对战场地一并落地；受击闪色改用 `lighter` 合成（不依赖 `ctx.filter`，禁用 filter 的宿主实测仍有像素变化）；天道图集与过渡姿势按人物自身中心镜像朝向玩家。终局可见信息与操作区预算的修复记录见票 02 Comments。本票维持 claimed，等用户真实走查验收。

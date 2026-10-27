# 01: 时间线引擎 + 事件 schema + 配方校验

**Type:** task
**Blocked by:** None
**Status:** resolved（2026-10-27，由 claimed 推进；提交 21d4b52）
**Slice:** S1

**What to build:** 用 TDD 流程实现框架地基，放 `src/minigame/vfx/engine/`：

1. 事件 schema 类型（`{ t, do, ... }`，V1 事件类型：move/slash/cast/bolt/hit），类型定义归 LLD，先在代码落定。
2. 时间线播放器：事件按 `t` 排序触发；`advance(dt)` 单点推进；hit-stop = 冻结整条时钟（冻结期间只有目标显示层 ±3px 抖动，不污染运动学）；击退弹簧回位；正弦衰减震屏。参考原型 `src/minigame/prototype-action-vfx.html` 的 `ActionTimeline` 与 combat-vfx-demo `vfx/combo_stage.gd:250-261`（移植段带出处注释）。
3. 配方校验函数：事件时间非负且递增、stop ≤ 0.3s、引用的 do 类型存在、材质 ramp 完整。开发期断言。
4. 引擎零魔法数字：所有数值从配方参数传入。

**验收：**
- `tests/` 覆盖：事件按序触发、hit-stop 冻结时 dt 不推进时钟、冻结抖动只动显示层、弹簧回位收敛、校验函数对故意写错的配方报错（先红后绿）。
- `npm run check:quick` 全绿；交付前 `npm run verify`。
- 引擎模块不 import 任何 `params/` 文件（依赖方向单向）。

**为什么不能跳：** 02/03 的原语与配方都挂在这套引擎上；schema 是后续所有配方卡的契约。

## Comments

**2026-10-27 实现摘要（提交 21d4b52，分支 vfx）**

文件清单：
- `src/minigame/vfx/engine/events.ts`：V1 事件 schema（move/slash/cast/bolt/hit）+ `MaterialRecipe`/`ActionRecipe` 契约
- `src/minigame/vfx/engine/timeline.ts`：`createTimeline` / `advanceTimeline(dt)`；hit-stop 冻结整条时钟（冻结期目标仅 ±joltPx 显示抖动，移植段带 `[ported from combat-vfx-demo: vfx/combo_stage.gd — PolyForm Noncommercial, 商用前需重写]` 注释）；击退弹簧回位；震屏指数衰减。零魔法数字，全部数值经 `TimelineTuning` 注入，不 import `params/`
- `src/minigame/vfx/engine/validate.ts`：`validateRecipe(recipe, limits)` 返回错误列表（t 非负递增、stop 上限、do 类型存在、ramp 完整）
- `tests/minigame/vfx-engine.test.ts`：7 例（按序触发 / 冻结停钟且不触发后续事件 / 冻结抖动只动显示层 / 弹簧收敛 / 震屏衰减 / 合法配方 / 故意写错配方逐条报错）
- `vitest.config.ts`：include 增加 `tests/minigame/**/*.test.ts`

取舍与偏差（相对原型）：
1. 冻结耗尽时把剩余 dt 还给时钟——原型的 `stopLeft -= dt` 会留浮点残差导致永久冻结（红测试逼出）。
2. done 判定增加 `settleDistance` 条件——原型只看 `|vx|`，会在弹簧折返点（|vx|≈0、|x|=4.8px）误判结束（红测试逼出）。
3. validate 红绿闭环已当场验证：临时令 `validateRecipe` 返回空错误列表，`故意写错的配方逐条报错` 如预期转红，恢复后转绿。
4. 引擎不持有原型里的 fx/projectiles/flash——那是 02/03 原语层的寿命管理；`advanceTimeline` 改为返回本帧触发的事件列表供原语层消费。

当场跑过的命令与真实输出：
- `npx vitest run tests/minigame/vfx-engine.test.ts` → `Test Files  1 passed (1)` / `Tests  7 passed (7)`
- `npm test`（全量）→ `Test Files  55 passed (55)` / `Tests  1010 passed (1010)`
- `npm run typecheck` → exit 0
- `npm run lint` / `check:boundary` / `check:refs` / `check:prose` / `check:deps` → exit 0

**未达项（存量问题，非本票引入，stash 干净树复现确认）：**
- `npm run check:quick` → exit 1，挂在 `check:slices`（delivery-protocol / doc-dedup 等 8 个历史 effort 的票缺 `Slice:` 行）与 `fmt:check`（干净树上 139 个已入库文件同样判红，疑似行尾/工具版本环境问题）与 `check:facts`（沙箱里 `npm -v` 跑不了，环境问题）。
- `npm run verify` → exit 1（check:quick 前置失败，后续未执行）。
以上失败与本票改动无关（`git stash -u` 后在干净树上同样 exit 1），未越权去改其他 effort 的票或全库重排版。另：本机无外网，`npm install` 走了 `--offline` 缓存。

# VFX 框架：参考 combat-vfx-demo 的动作特效体系

## 背景与目标

归元的表现层（`src/minigame/`，微信小游戏 Canvas 2D）目前只有「状态投影 + 局部动效」（`action-effects.ts`），没有打击感编排。参考 `E:\vendor\combat-vfx-demo`（Godot 4，PolyForm Noncommercial）验证过的架构：事件时间线 + 参数化效果原语 + 材质配方，为本项目建一套**可组合的动作特效框架**。

原型验证已完成：`src/minigame/prototype-action-vfx.html`（本分支 vfx 上，含移植的 crescent smear / 星形 spark / 碎屑喷射 / burst 环 / hit-stop，用户已走查认可整体效果）。

## 决定（已与用户对齐，2026-10-27）

1. **参数与机制物理分离**：`engine/`（时间线播放器、hit-stop、震屏，零魔法数字）/ `primitives/`（原语绘制算法）/ `params/`（纯数据配方卡：事件表 + 五行配方）。微调 = 只改 `params/`。
2. **五行配方是整套表现，不只是颜色**：每种五行 = 配色 ramp + 形状 + 运动方式 + 节奏参数。
3. **配方卡用 TS 常量**写，类型由事件 schema 约束；不做外置 JSON。
4. **卡片加载即校验**（开发期断言：时间非负递增、stop 上限、ramp 完整性、原语名存在）；校验函数进 `engine/`，测试里先红后绿。
5. **游戏核心规则一行不改**：表现层从 `EventBus` 现有事件（`action:executed` 等）派生时间线参数。
6. **V1 原语范围**：时间线播放器（advance(dt) + hit-stop）、crescent smear、星形 spark、碎屑喷射、burst 环、弹道、蓄力环、震屏、击退弹簧、五行 ramp 材质系统。连招图编辑器、ribbon shader、quake/swarm 不进 V1。
7. **双层验收**：机制层单元测试进 `tests/`；视觉层以原型走查为准，不写截图对比。
8. **许可证红线**：移植代码段必须带 `[ported from combat-vfx-demo ...]` 出处注释；项目若商用，这些段落需重写。改 `params/` 走快速通道；改 `engine/`、`primitives/` 走全量 `verify` + 独立 review，提交信息说明「为什么参数表达不了」。

## 票据

| 票 | 内容 | Slice | Blocked by |
|---|---|---|---|
| 01 | [时间线引擎 + 事件 schema + 配方校验](issues/01-engine-and-schema.md) | S1 | — |
| 02 | [剑术原语 + 玩家攻击配方](issues/02-sword-primitives.md) | S2 | 01 |
| 03 | [法术原语 + 天道动作配方](issues/03-magic-primitives.md) | S3 | 01 |
| 04 | [五行配方系统](issues/04-wuxing-materials.md) | S4 | 02, 03 |

## 验收（整个 effort）

- `npm run verify` 全绿；`tests/` 覆盖引擎推进、hit-stop 冻结、事件按序触发、配方校验（故意写错红一次）。
- 小游戏中：玩家攻击动作有 hit-stop + smear + 震屏；天道动作有弹道 + 落点；同一动作在五种五行节点上呈现五种形态。
- 收尾时规则/机制回写：事件 schema 进 LLD（类型契约），框架机制进 HLD；本目录删除。

# 01: 移除符文浮动文字与入场时长参数重构

**What to build:** 
移除中央天元区天干符文上方的归属文字标注，并重构入场动画的时间与行动方参数传递契约，使天元区域在视觉上彻底无文字遮挡，并支持外部灵活配置普通回合与连动回合的不同入场时长。

**Blocked by:** None (can start immediately)

**Status:** resolved

## Acceptance Criteria

- [x] 彻底移除 `RuneNode` / `RuneFlightView` 中 `你的天干 / 天道的天干` 的 Canvas 文本绘制逻辑与对应的旧有字段（`showOwner`）。
- [x] 重构 `RuneFlightView.playEntrance` 方法签名或选项，支持传入自定义时长 `duration`（缺省退回配置的默认值），并保证 `owner` 参数完整传递。
- [x] 在 `GameScene` 中调优入场调用：普通回合使用基准时长（0.8s），连动回合（`isExtraTurnActive()` 为 true）传入加速时长（0.4s）。
- [x] 单元测试更新：`tests/core/minigame-rune-flight-view.test.ts` 移除针对浮动文字的旧断言，并验证自定义入场时长下的生命周期与回调时序完全正常。
- [x] 运行 `npm run check:quick` 无语法错误、无格式报错与无依赖违规。

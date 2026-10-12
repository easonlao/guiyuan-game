# Spec 轴复审 — 工单 05 工作区改动（对 `HEAD` = 458da3c）

轴：Spec（是否忠实实现 `.scratch/burst-plus-two/issues/05-balance-retune-after-burst-plus-two.md`）。
Diff：`git diff HEAD`（11 文件，+178/−60）。Spec 轴与 Standards 轴分开报告，不合并、不重排。

## (a) 缺失 / 部分

1. **Checklist「先手胜率回到 `[0.47, 0.51]`」被无条件勾选，属过度声称。**
   独立复测（`createScoreBoundStrategy` 绑定 TRANS=30/160，500 局/种子）：种子 10000..10007
   重调后均值 0.490（8/8 带内），种子 1..8 均值 0.526（**0/8** 带内）；重调前同两组为 0.546 / 0.535。
   即重调只把均值压低约 1–5pp，仍随种子跨带。报告 §7.4 明写「不是对全部种子的断言」，
   方向属实、不算隐瞒；但勾选框与工单正文是无条件表述。该项应写成「在带定义口径下成立」，
   或开后续票。

## (b) 未要求的行为

无实质越界。TRANS 30→160 是工单明列的调参手段；测试钉值重录、`minigame/game.js` 重建、
报告 §7 均为验收所需。

## (c) 实现有误（记录层）

- `tests/core/candidate-validation.test.ts:65`、`tests/core/minigame-game-scene.test.ts:872`
  写「30 抬到 150 / 化 30→150」，实际是 **160**（`src/core/logic/ScoreCalculator.ts:65`、§7.2）。
- `tests/core/candidate-validation.test.ts:155`「工单 05 重调前，即【化】= 30 时的形态」标签错误：
  该候选是 **TRANS=0**（实测 `strictDominators=["激进压制"]`、p1=0.540、仅 `p1WinRate` 越界），
  不等于 30。
- 同文件 `:34`「上界只比锚点高 0.6pp」已过期，重调后为 1.8pp（49.20→51.0）。
- `tests/core/guardrail-band-single-source.test.ts:29-33` 未同步：仍钉 0.904/0.504 与回退
  0.884/0.512，而 `GuardrailBand.ts` 已改述为 0.920/0.492、0.758/0.586——防漂移守卫现在比
  真实回退更松。

## 结论

护栏带值确认未动，种子 10000 口径的数字可独立复现，`npm run verify` 全绿
（49 文件 / 895 用例，`check:artifact` 逐字节一致）。

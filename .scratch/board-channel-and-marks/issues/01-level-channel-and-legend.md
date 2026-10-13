# 等级通道重排与图例文案统一

Status: resolved

## 用户目标

盘面现在把「绿」读成点亮、虚空与道损分不开。等级必须换一条不与五行身份抢道的通道。

## 范围

- `drawYinYangFish` 的等级分支改为亮度阶梯，且**四个等级都保留元素色描边**：虚空 = 只描边不填充（元素色降透明度）、点亮 = 元素色实心、加持 = 实心 + 径向光晕 + 闪点（保留现有）、道损 = 暗化的元素色填充 + 裂纹（保留现有裂纹）。
- 撤掉对手盘的整体暗化（`OPPONENT_SEAL_SCALE` 之外的暗化手段一律删除；本票不动尺寸，尺寸归 05）。
- 盘下图例（`game-scene.ts` 的 `drawDecisionGuide`）四个样例仍用木色，首格标「木示例」；文案改为「道损 / 虚空 / 点亮 / 加持」。
- `action-result-view.ts` 的 `LEVEL_LABEL` 把 `崩坏` 改为 `道损`。
- 不改核心规则、AI 与任何载荷契约。

## 验收

- 构造 16 种阴阳等级配对，在 320×568 / 390×844 / 460×900 截图；空心 / 实色 / 光晕 / 裂纹四态在同一张图里可分。
- 图例文案与盘面、上一招变化条的文案一致（`道损 / 虚空 / 点亮 / 加持`）。
- 行为测试覆盖四档的填充与描边分支；`check:quick`、`build:minigame`、`verify` 通过。

## 实施结果

- `drawYinYangFish` 等级分支改为亮度阶梯（`src/minigame/views/board-view.ts`）：
  - 道损 `-1` = `palette.dark` 暗化元素色实心 + 裂纹（保留）；
  - 虚空 `0` = **空心**，只描边不填充，描边用 `withAlpha(palette.main, 0.55)`；
  - 点亮 `1` = `palette.main` 元素色实心 + 本色描边；
  - 加持 `2` = 径向光晕 + 亮色描边 + 闪点（保留）。
  - 四档都保留元素色描边；裂纹 / 闪点仍裁进鱼身。
- **对手盘整体暗化**：HEAD（e1946a8）已随阴阳鱼重做撤除，`OPPONENT_SEAL_SCALE` 之外不存在任何暗化实现（已全量检索 `globalAlpha` / composite / 覆盖层）。本票只订正了该常量的过期注释（删「更暗」），尺寸保持 0.82 不动（归票 05）。
- 盘下图例 `drawDecisionGuide`：文案统一为「道损 / 虚空 / 点亮 / 加持」，四档样例仍用木色，首格上方标「木示例」。四档文案直接复用 `LEVEL_LABEL`，与上一招变化条结构上同源。
- `LEVEL_LABEL[-1]`：`崩坏` → `道损`（`src/minigame/views/action-result-view.ts`）。
- 文档回写：`GLOSSARY.md` 把 `崩坏` / `发光` 列入 `_Avoid_`；`docs/LLD.md` §4.1-6 与 `docs/HLD.md` §2 Layer 3 更新为亮度阶梯口径。
- 未改核心规则、AI 与任何载荷契约（`src/core/` 无改动）。

## 自动验证

- 行为测试：四档填充与描边分支（`tests/core/minigame-board-view.test.ts` 亮度阶梯用例）、16 种配对裁剪、虚空无元素实心、图例文案与 `LEVEL_LABEL` 一致（`tests/core/minigame-game-scene.test.ts`）。
- `check:quick`、`build:minigame`、`verify`（52 文件 944 测试 + `minigame/game.js` 逐字节对账）通过。

## 浏览器视觉验收

- 临时 16 配对栅格（Vite 预览页动态 import `drawYinYangFish` 绘制）：`reports/ui-design/fishgrid-{320,390,460}.png`，确认空心 / 实色 / 光晕 / 裂纹四态在同一张图里可分。
- 真实场景截图：`reports/ui-design/scene-{320,460}.png`，确认图例四档文案与上一招变化条一致、对手盘与己方盘亮度一致。
- `reports/` 不入库，截图仅本地证据。微信模拟器与真机未运行，按 `docs/HLD.md` §4.6 由用户本地确认。

> 勘误（票 03 收口时追加）：此处「微信模拟器未运行」是 agent 当时的臆断。用户的实际测试环境一直是**微信开发者工具（模拟器）**，加载入库产物 `minigame/game.js` 目验；浏览器预览只是 agent 的自查手段。

## 代码复审

两轴报告：Standards `.scratch/board-channel-and-marks/reviews/01-standards-review.md`、Spec `.scratch/board-channel-and-marks/reviews/01-spec-review.md`。

- 硬伤（两轴同指）已修：`docs/HLD.md` 曾把票 02–05 未落地内容（金环、候选弧、幽灵态、0.92）写成现状；现改为只述票 01 已落地部分，其余指向 ADR 0018 与后续票，并删去具体像素取值。
- 判断题已修：图例文案改为 import `LEVEL_LABEL`（消除与变化条各存一份的重复）；测试助手 `bodyStrokes` → `bodyPaths`。
- 未采纳：把亮度阶梯收敛为一张样式表（`drawYinYangFish` 的 fill / stroke / lineWidth 三处）——现形状沿袭 HEAD 且加持档需渐变，重构收益有限，留待后续。
- 两轴均无阻断问题。

# 归一金环与亢极双层环

Status: resolved

## 用户目标

归一和亢极现在只能靠盘下的「你 x/5 / 天道 y/5」数出来。要在节点上直接看得见。

## 范围

- 归一 = 主印外一圈金环（`THEME.gold`）；亢极 = 双层金环（多一层表达「更满」）。
- 两个盘都画：内环（己方）与外环（对方）一视同仁。
- 中性表达，不用警示色、不用脉动——亢极同时意味着归一到手与爆发可用，不能读成坏状态。
- 保留盘下的归一读数作为计数，不移除。
- 环半径与 05 的环间距重算共用同一个外扩常量。

## 验收

- 构造 (0,0) / (2,0) / (1,1) / (2,1) / (1,2) / (2,2) 六种节点截图：金环只在两侧均 ≥1 时出现，亢极多一层。
- 环不压到相邻节点主印，也不越出法盘底晕；在 320×568 仍可分。
- 行为测试覆盖「哪些节点该有环 / 该有几层」；`verify` 通过。

## 实施结果

- 归一 / 亢极金环（`src/minigame/views/board-view.ts`）：`_drawGuiYiRings` 在环带之后、主印之前逐主印绘制——归一 1 圈、亢极 2 圈，中性金 `THEME.gold`、无光晕无脉动，内外两盘同一几何。
- 层数判定走核心真源：`guiYiRingLayers` 读投影里的 `isGuiYi` / `isKangJi`（真源仍是 `isNodeGuiYi` / `isNodeKangJi`），不各推一份。
- 几何单点：`guiYiRingGeometry(sealSize, layers)` 交回各圈半径与线宽；`GUIYI_RING_OUTSET_RATIO`（0.26）是唯一外扩常量，注释明示与票 05 的 `resize` 环间距重算共用。环半径按各自主印半径等比缩放，外环金环同步更小。
- 盘下「你 x/5」「天道 y/5」归一读数保留不动。
- 未动 `resize`（票 05 范围）、未动核心规则 / AI / 载荷契约。
- 文档回写：`docs/HLD.md` §2 Layer 3 标「已落地票 01–02」并补金环编码；`docs/LLD.md` §4.1-6 补节点级金环一环的契约。

## 自动验证

- 行为测试（`tests/core/minigame-board-view.test.ts`）：
  - 六种配对 (0,0)/(2,0)/(1,1)/(2,1)/(1,2)/(2,2) 在内外两盘的金环半径与层数（0/0/1/1/1/2），并断言全盘金环描边恒为 `THEME.gold`；
  - 归一单圈与亢极内圈同为主印半径等比、亢极外圈更大；
  - 三尺寸（320×568 / 390×844 / 460×900）全亢极盘：每主印两圈，环外沿（含线宽半）不越底晕、不压相邻主印。
- `check:quick`、`build:minigame`、`verify`（52 文件 947 测试 + `minigame/game.js` 逐字节对账）通过。

## 浏览器视觉验收

- 临时验收页（Vite 预览动态 import `BoardView`，画六种配对的 320×568 窄屏边界盘面）：`reports/ui-design/ringgrid-320.png` / `ringgrid-320b.png`、`ring-2-2.png`、`ring-2-2-pixelated.png`，确认金环只在两侧均 ≥1 时出现、亢极多一层，320 宽真实像素下双层环中间有暗缝可分。`reports/` 不入库，截图仅本地证据。微信模拟器与真机未运行，按 `docs/HLD.md` §4.6 由用户本地确认。

## 代码复审

两轴报告：Standards `.scratch/board-channel-and-marks/reviews/02-standards-review.md`、Spec `.scratch/board-channel-and-marks/reviews/02-spec-review.md`。

- 已修：不越晕 / 不压印断言补上线宽半（改用 `guiYiRingGeometry` 的 `radii` 与 `width`）；测试里误挂的「中性金」注释与冗余断言删除；`PAIRS` 元组改 `NodeLevel` 去掉 `as`；`half` 改名 `outsetPerLayer` 并抽 `guiYiRingGeometry`。
- 未采纳：HLD 与 LLD 对同一编码的双写——沿袭亮度阶梯的既有模式，两文各管「架构现状」与「投影契约」，拆开反而多一处指针。
- 两轴均无阻断问题。

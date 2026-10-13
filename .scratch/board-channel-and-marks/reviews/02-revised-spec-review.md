# 票 02（设计修订版）Spec 轴复审

对照：票 02 范围/验收/设计修订、`spec.md` 实施边界、ADR 0018 勘误、票 05 依赖。基准 `HEAD`（87a27ff）之后的工作区改动。结论：**修订后的三层标记全部落地，有一条验收口径（外溢不越出底晕）在涟漪周期中段被突破，测试只在 t=0 采样导致漏检。**

## (c) 看似实现、实则不符

1. **亢极涟漪中段越出法盘底晕**。范围要求「一圈外扩涟漪」属于外溢，验收要求「外溢不越出法盘底晕」。柔光确被钳在 `NODE_AURA_OUTSET_RATIO`（1.85×主印半径，`board-view.ts:83`）内、与底晕（`board-view.ts:421-425`）边缘吻合；但涟漪带外沿 = `sealSize×(1.05+eased×0.95)+厚度`，progress→1 时达 **2.112×sealSize**（实测探针：t=5.6s 时 r1/seal=2.065，t=7.2s 时 2.112），超出底晕约 0.26×sealSize，且 progress≈0.75 处 alpha≈0.245 仍可见。守底晕的测试（`minigame-board-view.test.ts:482-513`）在 `render` 时 `_clock=0` → progress=0 → 涟漪恰在最内（1.21×sealSize），整周期只采了一个永远合规的瞬间。修复方向二选一：涟漪外沿钳到 1.85×sealSize 内，或测试沿 `_clock` 扫一个周期。

## (a) 缺失 / 部分

2. **金色高光的「金色」未被测试锁定**。验收「金环高光随时间沿环移动」只断言弧随钟移动（`test.ts:385-394`），未断言颜色；测试里 `GOLD.light = '#ffe9b0'`（`test.ts:367`）与源码 `'#ffe4a0'`（`board-view.ts:61`）不一致且从未被引用——疑似早期草稿残骸。风险低（金环底色已锁定 `#d8b876`），但死常量应删或改为断言高光色。

## (b) 超出要求

3. **柔光光心缓慢偏移**（`board-view.ts:645-646`，±0.3 sealSize）：票只给涟漪运动，柔光是静态描述。幅度小、与「不稳」语义相容，倾向容忍。
4. `tick(dt)`/`_clock` 管道与 `GameScene.update` 注入（`game-scene.ts:371`）：票未点名，但是流动/涟漪的最小必要机制，HLD/LLD 已回写——不算蔓延。

## 已确认合规

- 归一环+流光与亢极无关：`drawNodeMark`（`board-view.ts:575-586`）对 1/2 层都画环与流光，亢极只叠加；测试六配对覆盖。
- 一圈涟漪（`count=1`）、更慢（7.5s vs 4.5s）、更淡（峰值 alpha 0.3 vs 0.6）；元素色取 `WUXING_PALETTE[element]`，无警示色、无闪烁。
- 内外两盘一视同仁（`_drawNodeMarks` 遍历全部 `_elements`）。
- `NODE_AURA_OUTSET_RATIO` 单点导出、底晕共用、`resize` 未动（票 05 边界保住）；盘下计数保留。
- 票 05 issue 正文仍写「归一环的外扩」，与修订后的 1.85 口径措辞不一致——归 05 更新，非 02 之过。
- 该文件 28 测试通过；`check:artifact` 逐字节对账通过。

—— Spec 轴 Reviewer，`.scratch/board-channel-and-marks/reviews/02-revised-spec-review.md`

# 归一金环流光与亢极元素外溢

Status: resolved

## 用户目标

归一和亢极现在只能靠盘下的「你 x/5 / 天道 y/5」数出来。要在节点上直接看得见。

## 范围

- 归一 = 主印外一圈金环 + 沿环缓慢流动的金色高光（只要归一就有，与是否亢极无关）。
- 亢极 = 归一那一层之上再叠元素色柔光（取该节点五行色）+ 一圈外扩涟漪，比归一更慢更淡，表达「满溢 / 泄露 / 不稳」。
- 两个盘都画：内环（己方）与外环（对方）一视同仁。
- 不用警示色；运动只表达「流动 / 满溢」，不做闪烁。
- 保留盘下的归一读数作为计数，不移除。
- 柔光相对主印中心的最大外沿（`NODE_AURA_OUTSET_RATIO`）与 05 的 `resize` 避让共用同一个常量。

## 验收

- 构造 (0,0) / (2,0) / (1,1) / (2,1) / (1,2) / (2,2) 六种节点：金环只在两侧均 ≥1 时出现，亢极才叠元素外溢。
- 外溢不越出法盘底晕；在 320×568 仍可分。
- 行为测试覆盖「哪些节点该有金环 / 哪些该有外溢」；`verify` 通过。

## 设计修订

初版范围是「归一 = 一圈金环、亢极 = 双层金环」。用户复查后连续两轮改口：

1. 「多一环比较呆」→ 先试了刻度环、元素色抖环、直线光丝，均被否（直线光丝「好蠢」）。
2. 定案：**归一用「环形流动」**（环上走一段金色高光，不改环的形状），**亢极用元素色自然柔光 + 涟漪**（即 F4b：比 F4a 更慢更淡、只剩一圈）。归一那层与亢极无关——只要归一就有。

ADR 0018 文末「勘误」记录了这次取代（「亢极 = 双层金环」「不用脉动」已作废，放宽为「不用警示色」）。

## 实施结果

- 节点级标记（`src/minigame/views/board-view.ts`）：`drawNodeMark` 在环带与主印之后逐主印绘制。
  - 归一 / 亢极（`layers ≥ 1`）= 金环（`GUIYI_RING_INK.main`）+ 沿环流动的金色高光（`GUIYI_RING_INK.light`，4.5s 一圈、长尾渐隐，多段小弧拼出拖尾而不是 `lineDashOffset`，避开与归属环带虚线的语义混淆）。
  - 亢极（`layers === 2`）额外叠元素色柔光（`drawSoftAura`，加色混合 `lighter`，光心缓慢偏移）+ 一圈外扩涟漪（`drawOverflowRipples`，7.5s、淡入再淡出）。
- 层数判定走核心真源：`nodeMarkLayers` 读投影里的 `isGuiYi` / `isKangJi`（真源仍是 `isNodeGuiYi` / `isNodeKangJi`），不各推一份。
- 表现层时钟：`BoardView.tick(dt)`（秒）只驱动流动 / 外溢，不参与投影；`GameScene.update` 每帧注入。命名避开已被双盘投影占用的 `update`。
- 外沿单点：`NODE_AURA_OUTSET_RATIO`（= 元素外溢尺度 + 渐变淡出）既是法盘底晕（`_drawEngraving`）的半径口径，也是票 05 的 `resize` 避让口径。
- 盘下「你 x/5」「天道 y/5」归一读数保留不动。
- 未动 `resize` 本体（票 05 范围）、未动核心规则 / AI / 载荷契约。
- 文档回写：ADR 0018 追加勘误；`docs/HLD.md` §2 Layer 3 与 `docs/LLD.md` §4.1-6 更新为「环 + 流动 + 元素外溢」。

## 自动验证

- 行为测试（`tests/core/minigame-board-view.test.ts`）：
  - 0 层不画、1 层金环无外溢、2 层金环 + 元素色外溢；
  - 金环高光随时间沿环移动；
  - 盘面渲染：归一节点有金环无外溢、亢极节点有金环有元素外溢、虚空节点不画；
  - 六种配对在内外两盘得到相同标记层数；
  - 三尺寸（320×568 / 390×844 / 460×900）全亢极盘：金环与外溢都不越出底晕。
- `check:quick`、`build:minigame`、`verify`（52 文件 949 测试 + `minigame/game.js` 逐字节对账）通过。

## 浏览器视觉验收

- 真实 `GameScene` 预览注入盘面后截图：`reports/ui-design/game-final.png` / `game-final2.png`（木/水归一 → 金环 + 金色流光；火/土亢极 → 金色流光 + 元素色柔光）。确认流光沿环移动（手动推进 `BoardView.tick` 后像素改变）、亢极外溢更淡。`reports/` 不入库，截图仅本地证据。**用户已在浏览器里目验并确认效果可以**（微信模拟器与真机仍未跑，按 `docs/HLD.md` §4.6 由用户本地确认）。

## 代码复审

修订后的两轴报告：Standards `.scratch/board-channel-and-marks/reviews/02-revised-standards-review.md`、Spec `.scratch/board-channel-and-marks/reviews/02-revised-spec-review.md`（初版「金环 / 双层环」的两份报告已被本设计修订取代）。

- 已修（Spec 报的真 bug）：涟漪带外沿实测能到 ~2.11×主印半径，越出 `NODE_AURA_OUTSET_RATIO`（1.85×）的底晕；现已把涟漪最外半径钉在 `KANGJI_RIPPLE_OUTER = NODE_AURA_OUTSET_RATIO - 涟漪厚度`，并把守底晕的测试改成扫满一个 7.5s 周期（旧测试只采 `_clock = 0` 那个最内圈瞬间，永远合规）。
- 已修（Standards 报的漂移）：测试里手抄的金色常量改为直接 import `GUIYI_RING_INK`（原 `#ffe9b0` 与源值 `#ffe4a0` 不一致且从未引用）；「两圈涟漪」陈旧注释改为「一圈」；`withAlpha` 文档改为流光 / 柔光 / 涟漪共用。
- 未采纳：把 `drawSoftAura` 的 `strength` / 涟漪 `count` 参数内联——虽当前只有单取值，但它们是与「更慢更淡」语义对应的可调旋钮，保留参数比拆散公式好读。
- 两轴均无阻断问题。

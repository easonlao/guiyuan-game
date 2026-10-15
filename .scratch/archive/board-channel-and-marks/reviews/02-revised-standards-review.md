# 票 02（修订版）Standards 复审

基线 `HEAD`（87a27ff）。范围：`git diff HEAD` 全部 9 个文件；`minigame/game.js` 仅作对账目标（`check:artifact` 逐字节一致，已跑）。`tests/core/minigame-board-view.test.ts` 28 测试全绿。

**结论：无硬性违规（架构红线 / 命名规范 / 分层 / _Avoid_ 术语均干净）。3 个应修小项 + 若干判断项。**

## 应修小项（意见性，非门禁）

1. **tests/core/minigame-board-view.test.ts:367** — `GOLD` 手抄 `GUIYI_RING_INK` 的 hex，且 `GOLD.light`（`#ffe9b0`）与源值（`board-view.ts:61` 的 `#ffe4a0`）不一致、从未被断言使用：死数据 + 漂移陷阱（Fowler: Duplicated Code）。建议导出 `GUIYI_RING_INK` 让测试引用。
2. **同文件 :396** — 注释「两圈涟漪」与实现（`board-view.ts:664` `count = 1`）及票面「一圈外扩涟漪」矛盾，测试也不断言涟漪数量 → 陈旧注释，读者会以注释为准。
3. **board-view.ts:717** — `withAlpha` 文档仍写「只给虚空描边用」，现已被流光 / 柔光 / 涟漪共用 → 陈旧注释。

## 判断项（Fowler 标签，均为权衡）

- **Speculative Generality**：`drawOverflowRipples` 的 `count = 1` 循环与 `drawSoftAura` 的 `strength`/`scale` 参数只有单一取值（0.85 / `KANGJI_OVERFLOW_SCALE`）；票面定死一圈涟漪，可直化。留参数换自文档性也说得通。
- **Magic numbers**：`drawRingFlow`（:607 起）的 `steps = 48`、`(1-t)**2*0.6`、`1.6 - t*0.6`，`drawSoftAura` 的 `0.23/0.17/0.3/0.78` 与渐变停靠点 0.4/0.75 都是内联裸值。ADR 0018 勘误称「像素取值以代码常量为真源」，但这些取值不成常量，无从引用。建议升为带意图注释的具名常量（本文件既有惯例）。
- **Mysterious Name（轻）**：同层前缀混用——`NODE_RING_SCALE` / `NODE_RING_WIDTH_*` 与 `GUIYI_RING_INK`；统一为 `NODE_RING_INK` 更顺。
- **docs/HLD.md §2**：「柔光由表现层时钟 `tick(dt)` 驱动」低估了驱动面——金色流光也由 tick 驱动；LLD §4.1-6 的「流动 / 外溢」措辞才准确。一词之差，可顺手改。
- **测试脆弱点**：`rgbOf` 靠子串匹配 `rgba(r, g, b, a)` 格式串；`ringArcs` 的 `radius < SEAL * 1.3` 硬编码上界、`arc.start === 0` 精确浮点等值，均会随实现重构静默失效。可接受，但要知道。
- **覆盖回退**：旧测试断言金环逐圈半径与「不压相邻主印」，新测试只断言「有弧 / 有渐变」；邻印不重叠的回归护栏消失（新环 1.13× 小于旧 1.26×，实际风险低）。

## 达标面

- `tick` 命名避让已被双盘投影占用的 `update`，注释指向 LLD §4.1，`GameScene.update` 注入点在 result 早退之前、每帧必跑（game-scene.ts:372）。
- ADR 0018 文末勘误 + HLD/LLD 回写符合「一个事实一个家」；像素真源指向代码常量。
- `NODE_AURA_OUTSET_RATIO` 单点外沿同时供底晕（:424）与票 05 `resize` 口径，符合单源要求。
- 分层无越界：改动全在表现层，核心 / 载荷契约未动；`recording-context.ts` 扩展渐变记录是测试基建的正向补强。

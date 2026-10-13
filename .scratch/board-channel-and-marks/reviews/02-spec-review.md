# Review：票 02 归一金环与亢极双层环（Spec 轴）

基准：HEAD = a181d2b，工作区未提交。规格：`.scratch/board-channel-and-marks/issues/02-guiyi-kangji-rings.md`。已实跑 `verify`（52 文件 947 测试 + `check:artifact` 逐字节对账）全绿。

## 结论

票 02 范围六条全部落地，与 ADR 0018 第 2 层编码一致，且正确把 05 的活留在 05。1 项验收证据我无法闭环，2 处次要瑕疵，无阻断。

## (a) 缺失 / 部分

1. 「构造六种节点截图……在 320×568 仍可分」——截图证据存在（`reports/ui-design/ringgrid-320.png`、`ringgrid-320b.png`、`ring-2-2.png`，时间戳 21:59–22:00 为本会话），但本审查模型无法查看图片，**双层环在 320 宽下肉眼可分未经目验**。行为侧覆盖完整：六配对层数测试（`minigame-board-view.test.ts:366-392`）逐条对应票面枚举。
   - 复审补记：主线程已目验 `ringgrid-320.png` / `ringgrid-320b.png` / `ring-2-2-pixelated.png`，双层环在 320 宽真实像素下中间有暗缝可分。

## (b) 超范围

1. 无实质 creep。`minigame/game.js` 重建是 spec 验收明文要求；HLD/LLD 同步符合文档归属约定。票 01 审查指出的 HLD 超前表述（0.92、金环「已落地」）已在本 diff 修正为「已落地票 01–02」。
2. 对 05 的边界干净：`resize` 未动，外扩只落一个常量 `GUIYI_RING_OUTSET_RATIO`（`board-view.ts:68`），注释明示「与票 05 resize 环间距重算共用的唯一外扩常量」——正是票面「环半径与 05 的环间距重算共用同一个外扩常量」要的形态。

## (c) 看似实现但存疑

1. **测试略强于其所证**：不压印 / 不越晕断言未计线宽之半（`minigame-board-view.test.ts:415-440`，`ring.radius` vs 实际笔画外沿 `+lineWidth/2`）。实算最紧处是外环亢极外圈对底晕：320 下真实余量约 0.75px（晕允 1.1×sealSize vs 环沿 1.033×sealSize+半线宽 0.029×），当前几何确实不越界（非活 bug），但测试证明的是略强的命题；且 05 放大外印后该余量必然转负——05 票已把重算列为范围，此处理智上只作预警。
   - 复审补记：已修。断言改用 `guiYiRingGeometry` 给出的 `radii` 与 `width`，按 `ring.radius + width/2` 计外沿。
2. **注释与断言不符**：`test.ts:389`「金环是中性金：不用警示色、不脉动」挂在 `toBeGreaterThan(ownSeal)`（半径断言）下；中性色实际由 test 1 的 `path.color === THEME.gold`（`:384`）覆盖，「不脉动」静态渲染本无可断言。纯注释问题。
   - 复审补记：已修。中性色断言留在层数用例，误挂的注释与冗余断言删除。

其余核对无误：层数判定走核心真源 `isNodeGuiYi/isNodeKangJi`（`board-view.ts:311-312`）；两盘一视同仁、中性金 `THEME.gold`、无脉动；盘下读数保留（`board-view.ts:489-512`）；LLD §4.1 第 6 条新增表述与实现逐字对得上，未复制像素值。

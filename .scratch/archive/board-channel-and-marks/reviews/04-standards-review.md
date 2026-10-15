# 票 04 Standards 轴复审

Fixed point: `8b0000a`（票 03 收尾提交）。范围：`git diff 8b0000a...HEAD` / 工作区，加上两个新文件（`src/minigame/preview-target.ts`、`tests/core/minigame-preview-target.test.ts`）。

## 结论

无阻断性硬伤。两处文档 / 注释层面的标准违规已在复审后修复；其余为判断题。

## 硬违规（已修）

1. **`src/minigame/scene/button.ts` 过期注释**：文件头仍写「已知边界：`InputManager` 在手指移出按钮后抬起时不会给按钮任何回调」，而本次 `input-manager.ts` 恰好修掉了这个边界。已改为「抬起回调由 `InputManager` 恒定回给按下时命中的节点」。
2. **箭头几何一处事实多个家**：相生 / 相克的箭头几何在 `docs/HLD.md`、`docs/LLD.md`、ADR 0018、issue 逐字重复。HLD §2 Layer 3 的职责是架构与包拓扑，已改为指针（几何与契约归 LLD §4.1 与代码常量）。

## 复审后的修复

- `InputManager` 的行为变更补了直接单测（`tests/core/minigame-input-manager.test.ts`「按下后移出、在别处抬起仍把抬起送达按下节点」），此前只有 game-scene 的间接覆盖。
- `_drawPreviewArrow` 的 `width` / `head` 是循环不变量，提到循环外。
- 三个内联字面量（asin 上限 `0.85`、缩进比 `0.35`、两撇比 `0.7`）命名为 `PREVIEW_ARROW_*` 常量，与同文件其他像素取值一致。
- `preview` getter 注释「副本指针」名不副实，改为「返回内部引用，调用方只读」。

## 判断题（不阻断，保留）

- **Duplicated Code（轻）**：`_drawGenerationArrow` / `_drawRadialArrow` 各自重复 `strokeStyle` / `lineWidth` / `lineCap` 三连设置。两者几何不同，抽公共设置层收益小，保留。
- **Data Clump（轻）**：`BoardGhost` 内联 `yin / yang` 与 `PreviewGhost.after: NodeData` 同形，`GameScene.previewAction` 手工拍平一次。现行扁平形与 LLD §4.1 第 9 条一致，也不新增一层嵌套类型，保留。

## 符合仓库标准的点

- **只读 + 纯函数**：`preview-target.ts` 只读快照、调纯函数 `ActionResolver.resolve`，不写回状态、不发布事件；作用侧与核心共用同一份选侧真源，没有另抄阴优先规则。
- **分层**：minigame → core 的依赖方向与既有 `game-scene.ts` 一致，`src/core` 未反引表现层。
- **命名 / 常量**：`UPPER_SNAKE_CASE` 常量、`is` / `has` 布尔、类型 `PascalCase` 均合规。
- **测试不手抄像素**：弧箭按「盘心 + 半径区间 + 角度区间」筛选，幽灵态按「压暗层颜色 + 计数」断言，不复制常量数值到测试里硬编码实现。

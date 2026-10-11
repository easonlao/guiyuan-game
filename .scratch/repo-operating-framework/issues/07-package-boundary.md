# 07: 包边界——没声明就不能用

**What to build:** 跨区引用由模块解析器拦住，不靠手写规则。没声明就不能用。

**Blocked by:** 06（得先有物理上分开的两块，才能给它们各发一张身份证）

**Status:** ready-for-agent

- [ ] 两块区各有自己的包声明，用 workspaces 连起来
- [ ] 故意写一句**未声明**的跨区 import → 构建或类型检查失败
- [ ] `src/minigame` 的 import 扩展名统一
- [ ] 构建、测试、变异配置、打包入口全部跟着改完，验收命令全绿

**实现要点：**

- **为什么值得做。** depcruise 是**枚举式**（先想到「A 不许依赖 B」才拦得住，新长出的一类边默认放行）；包边界是**声明式**（没声明就解析不到，新长出的一类边默认拦住）。这是稳定性差异，不是风格差异。
- **`src/minigame` 的扩展名混写是第一个雷。** `action-button-formatter.ts:8` 写 `'../core/types/domain.js'`，`game-manager.ts:1-6` 不写后缀。现在 `moduleResolution: "node"` + 无项目引用能过；一旦走 workspaces 的 exports 解析，这套混写会第一个炸。本票验收里点名这条。
- 现在 `tsconfig.json` 是 `noEmit: true`，无项目引用。走 workspaces + `exports` 字段靠**解析期**拦，不需要 `composite` / `tsc -b`——别顺手把构建形态改成项目引用，那是 spec 的 Out of Scope。
- 包名与目录名要让不懂开发的人看懂；两块分别是「游戏核心（进手机包）」和「开发工具（只在你电脑上跑）」。
- 边界规则与 06 加的那条是两回事，**都要留**：06 那条管路径，本票这条管声明。

**验证记录：**（待填）

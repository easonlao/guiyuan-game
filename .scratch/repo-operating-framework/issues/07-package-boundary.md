# 07: 包边界——没声明就不能用

**What to build:** 跨区引用由模块解析器拦住，不靠手写规则。没声明就不能用。

**Blocked by:** 06（得先有物理上分开的两块，才能给它们各发一张身份证）

**Status:** done

- [x] 两块区各有自己的包声明，用 workspaces 连起来
- [x] 故意写一句**未声明**的跨区 import → 构建或类型检查失败
- [x] `src/minigame` 的 import 扩展名统一
- [x] 构建、测试、变异配置、打包入口全部跟着改完，验收命令全绿

**实现要点：**

- **为什么值得做。** depcruise 是**枚举式**（先想到「A 不许依赖 B」才拦得住，新长出的一类边默认放行）；包边界是**声明式**（没声明就解析不到，新长出的一类边默认拦住）。这是稳定性差异，不是风格差异。
- **`src/minigame` 的扩展名混写是第一个雷。** `action-button-formatter.ts:8` 写 `'../core/types/domain.js'`，`game-manager.ts:1-6` 不写后缀。现在 `moduleResolution: "node"` + 无项目引用能过；一旦走 workspaces 的 exports 解析，这套混写会第一个炸。本票验收里点名这条。
- 现在 `tsconfig.json` 是 `noEmit: true`，无项目引用。走 workspaces + `exports` 字段靠**解析期**拦，不需要 `composite` / `tsc -b`——别顺手把构建形态改成项目引用，那是 spec 的 Out of Scope。
- 包名与目录名要让不懂开发的人看懂；两块分别是「游戏核心（进手机包）」和「开发工具（只在你电脑上跑）」。
- 边界规则与 06 加的那条是两回事，**都要留**：06 那条管路径，本票这条管声明。

**验证记录：**

- **包声明与拓扑**：`src/package.json` = `@guiyuan/game`（`exports: { "./*.js": "./*.ts" }`，把 `.js` 说明符映射到 `.ts` 源文件）；`tools/package.json` = `@guiyuan/devtools`（`dependencies: { "@guiyuan/game": "*" }`）；根 `package.json` 加 `"workspaces": ["src", "tools"]`。两块的定义与 `description` 见 `docs/HLD.md` §2「包边界」。
- **解析形态**：`tsconfig.json` 的 `module` / `moduleResolution` 从 `ESNext` / `node` 改为 `nodenext`。`node16` / `nodenext` 与 `bundler` 都读包的 `exports` 字段；只有 `node16` / `nodenext` 强制相对导入写扩展名——正是「`src/minigame` 混写」会炸的那条，所以选 `nodenext`。
- **扩展名统一**：`src/minigame/*.ts` 的 13 处无后缀相对导入补 `.js`（`action-button-formatter.ts` 本来就是 `.js`）；顺带把 `tests/core/minigame-auto-absorption.test.ts` 的 3 处补齐。全仓相对导入现在都带 `.js`。
- **tools 引用**：46 处 `../src/...` 改为 `@guiyuan/game/...`（12 个 tools 文件），`tools/package.json` 声明依赖。
- **关键发现——安装布局前提**：npm 默认的 **hoisted** 布局把所有 workspace 包平铺到根 `node_modules`，`src/` 里写 `@guiyuan/devtools` 照样解析得到，声明式边界形同虚设。对照实测：手动在根 `node_modules/@guiyuan/` 建 `devtools -> ../../tools` 符号链接后，`src/__probe.ts` 的 `import '@guiyuan/devtools'` 类型检查**通过**（无错误）。改用 `.npmrc` 的 `install-strategy=linked`（pnpm 式，只在每个包自己的 `node_modules` 里放它声明过的依赖）后，同一探针报 `TS2307`。这是 npm 下「没声明就不能用」唯一成立的布局；npm 标注其为 experimental，已在 `.npmrc` 写明理由与代价。
- **红/绿实证（未声明的跨区 import）**：基线 `npm run typecheck` 退 0 → 加 `src/__probe.ts`（`import { HeadlessMatch } from '@guiyuan/devtools'`）报 `TS2307: Cannot find module '@guiyuan/devtools'`、退 2 → 删除后回退 0。
- **红/绿实证（扩展名）**：把 `src/minigame/types.ts:1` 的 `'../core/types/domain.js'` 改回无后缀 → `TS2835: Relative import paths need explicit file extensions ... Did you mean '../core/types/domain.js'?`；还原 → 绿。
- **包边界自检门禁**（超出清单，但守住本票的核心声称）：新增 `npm run check:boundary`（`scripts/check-package-boundary.mjs`），用 TypeScript 解析器断言「从 `src/` 解析不到 `@guiyuan/devtools`」且「从 `tools/` 能解析 `@guiyuan/game/...`」，已串进 `check:quick`。它不是枚举具体边的手写规则，而是钉住「没声明就解析不到」这条机制：`.npmrc` 的 `linked` 一旦失效（npm 默认布局变回 hoisted / 有人手写 `--install-strategy=hoisted`），它会立刻判红，不会静默。实测：当前布局退 0；手动在根 `node_modules/@guiyuan/` 建 `devtools` 链接后退 1。
- **`linked` 布局下的工具链适配**（写进 `docs/MUTATION-TESTING.md` §9）：
  - **Stryker 插件加载**：Stryker 默认按 `@stryker-mutator/*` 从 **core 自己所在目录**（`linked` 下是 `node_modules/.store/…/core/node_modules/@stryker-mutator`）枚举插件，找不到作为根 devDependency 的 vitest-runner → `stryker.config.json` 加 `appendPlugins: ["./scripts/stryker-vitest-plugin.mjs"]`，wrapper 从仓库根解析裸包名再把插件导出原样再导出（不写死内部 `dist` 路径）。
  - **沙箱内的模块身份**：Stryker 沙箱把 `node_modules` 符号链接回真实仓库，导致 `tools/` 的 `@guiyuan/game/…` 解析到**真实仓库的 `src/`**，而测试的相对路径解析到**沙箱自己的 `src/`**——同一份源码两个实例，`toBe` 身份断言假红（`tests/core/candidate-search.test.ts`），且被 mutate 的源码与实际加载的不是同一份、变异信号失真 → `vitest.stryker.config.ts` 加 `resolve.alias` 把 `@guiyuan/game` 钉回运行目录的 `src/`。`npm test` 不加别名，仍走真实 `node_modules` 解析。
- **验收**：`npm run verify` 全绿（39 文件 / 728 用例；`check:deps` 46 modules / 129 dependencies / 0 violation；`check:boundary` 退 0）；`npm run build:minigame` 成功；`npm ci` 在 `linked` 布局下成功（含 patch-package）；`npx stryker run --dryRunOnly` 退 0（672 用例，51s）；CLI 烟测 `npx tsx tools/CandidateValidationCli.ts --help` 与 `ActionValueCensusCli.ts` 正常。
- **未改**：`minigame/game.js` 未重建入库——它当前是旧源码的产物，构建可重建，对账归 08。`stryker.config.json` 的 `mutate` 范围（`src/core/logic/**`）与 `vitest.config.ts` 无需改：本票没动被 mutate 的目录，测试仍走真实解析。06 的两条 depcruise 规则原样保留（路径与声明是两回事）。
- **目录名**：保留 `src/` 与 `tools/` 目录名（本票验收清单与实现要点都按这两个路径写，`src/minigame`、`tsconfig.json` 均按现状描述）；「让不懂开发的人看懂」落在**包名与 `description`** 上（`@guiyuan/game`「游戏核心（进手机包）」/ `@guiyuan/devtools`「开发工具（只在你电脑上跑）」）。

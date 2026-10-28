---
status: accepted
---

# 分区：小游戏侧（`src/`）与开发工具（`tools/`）按独立运行时切成两块

无头推演与命令行实验入口从 `src/core/headless/` 搬出，成为独立的一块 `tools/`；`src/core` 的公开出口不再导出无头推演；并加依赖边界规则拦住「小游戏侧到达开发工具或 Node 内建模块」。切分判据是**独立消费者 / 独立运行时**，全仓只有这一条这样的边界，所以切两块、不切六块。

## 背景与问题

`src/core/index.ts` 曾经有 `export * from './headless/index.js'`，而 `src/core/headless/` 是全 `src/` 唯一 import `node:url` / `node:path` 的地方（`HeadlessBenchmark.ts`、`cli.ts`）。`src/` 的全部代码最终都会打进 `minigame/game.js`，运行在微信小游戏环境里——那里没有 Node 内建模块。

这个洞当时没炸，只因为 `src/minigame/*` 全部写深路径引用、绕过了 core 的 barrel。没有任何规则挡着任何人改回去：`core/index.ts` 的 barrel 一旦被小游戏侧引用，`node:url` 就进了包。这不是审美问题，是一个活的、随时可以被踩回去的边界缺口。

## 决定

1. **按「独立消费者 / 独立运行时」切两块。** 判据是「有没有独立的消费者或独立的运行时环境」：
   - **小游戏侧（`src/`，即进 `game.js` 的那一块，含 `src/core` / `src/adapters` / `src/minigame`）**——跑在微信小游戏环境里，没有 Node 内建模块。
   - **开发工具（`tools/`）**——无头推演、批量评测与 CLI，只在你电脑上用 Node.js 跑。

   `logic` / `ai` / `types` / `utils` / `adapters` 最后都打成一个产物、共享同一个运行时，它们之间加边界只买到命名空间，买不到稳定性。`src/minigame` 只有 5 个文件、同一个交付物，也不单独切第三块。所以是 2 块，不是 6 块。

2. **只搬物理位置，规则同步落下。** 只搬运不加规则，等于搬完还能被踩。搬运与边界规则在本决定里同等重要。

3. **加两条 depcruise 边界规则**：小游戏侧不得依赖 `src/` 之外的任何本地模块（无头推演只是其中最典型的一块），也不得到达任何 Node 内建模块。规则是**枚举式**的：先想到「A 不许依赖 B」才拦得住，新长出的一类边默认放行。它只能算第一道门，声明式的包边界是后续工作。

   **已知覆盖缺口（写下来以免误以为它封死了）**：规则只看仓库内的边，npm 依赖内部是否用 Node 内建模块，depcruise 因 `doNotFollow` 看不见。真正封死「小游戏侧到达 Node 内建模块」要靠声明式的包边界，不是这两条规则。

4. **往声明式走是有依据的，不是偏好。** 参考仓库 model-war 自己撞过「手写规则巡航不到」的坑：它的 `packages/tools` 以源码形态执行（`emitDeclarationOnly`，`dist` 里没有 `.js`），于是不在 dependency-cruiser 的巡航范围内，直到补了第二道门禁（`declared-deps`）才兜住第三方依赖面。depcruise 的覆盖面取决于「它能不能看见那份产物」，这正是它不如「没声明就解析不到」稳定的原因。

## 被否决的方案

- **只加 depcruise 规则、不搬目录**：barrel 仍然把带 `node:url` 的模块导出去，规则是枚举式、新长出的边默认放行；洞还在，只是多贴了一张纸。
- **切成六个包（logic / ai / types / utils / adapters / tools）**：前五块共用一个运行时、一个产物，包边界只买到命名空间，换来的是六份包声明与项目引用。
- **把 `src/minigame` 切第三块**：5 个文件、一个交付物，不值。
- **顺手把 monorepo 完整形态（项目引用 / `tsc -b`）一起做了**：与「搬运 + 边界规则」混在一起，出错分不清是哪一步弄坏的；声明式包边界是独立的一步。

## 后果

- 边界从「没人踩」变成「踩了报红」：`src/` 里 import `src/` 之外的本地模块或任何 `node:*`，`npm run check:deps` 非零退出。
- `tools/` 单向依赖 `src/`（`tools/` → `src/` 允许，反向禁止）。Node 内建模块只允许出现在 `src/` 之外（`tools/`、`scripts/`、`tests/` 都可以），`src/` 内一律禁止。
- 本次只搬了 `headless`，`src/` 仍是小游戏侧那一块；把两块各自声明成包、由模块解析器在解析期拦未声明的跨区引用，是后续工作。

## 现状勘误

- **2026-10-11（07 落地）**：文末「把两块各自声明成包、由模块解析器在解析期拦未声明的跨区引用，是后续工作」已完成。`src/` = 包 `@guiyuan/game`，`tools/` = 包 `@guiyuan/devtools`，由根 `package.json#workspaces` 连起来；`tsconfig.json` 改用 `nodenext` 以真正读取 `exports` 并强制相对导入带扩展名。补充一条当时未写下的前提：npm 默认的 hoisted 布局下未声明的跨区 import 仍能解析，声明式边界要靠 `.npmrc` 的 `install-strategy=linked` 才成立。工程方案回写 `docs/HLD.md` §2/§4.2，安装布局的工具链适配见 `docs/MUTATION-TESTING.md` §9。原决定与理由不改。

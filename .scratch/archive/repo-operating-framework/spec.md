# Spec: 仓库治理骨架 (repo-operating-framework)

## Problem Statement

需求方不是开发者。原话：

> 我对项目代码开发规范是不清楚的。我的需求是环境必须规范有序，AI 可以在这个工作区内进行开发。

所以本 spec 的验收对象不是「代码写得好不好」，而是**「一个新来的 agent 能不能不问人就自己开工、自己收尾、自己判断做没做完」**。

参考仓库：`https://github.com/orionpax1997/model-war`（已克隆在 `/tmp/model-war-1791694334`，clone 会丢，只作论证依据）。参照的是它的**框架**，不是它的内容——它的包拓扑由「独立消费者 / 独立运行时」决定，本仓库的判据不同，不照搬。

### 现状诊断（2026-10-11）

按「仓库要回答的六个问题」分层看：

| 层 | 回答什么 | 现状 |
|---|---|---|
| 词汇层 | 这里的东西叫什么 | **实**。`GLOSSARY.md` 有术语、定义、禁用别名 |
| 任务层 | 现在在做什么、做到哪了 | **断**。`.scratch/` 被 `.gitignore:18` 忽略，却是指定的 issue tracker |
| 环境层 | 新机器怎么装成一样的 | **缺整层**。无 `engines`、无 `packageManager`、无 formatter |
| 边界层 | 什么不能碰 | **薄且说谎**。领域规则只有 1 条；`CONTRIBUTING.md` §1 与 `docs/HLD.md` §4.2 承诺了它做不到的事 |
| 验收层 | 怎么算做完了 | **无收口**。4 个分散入口，无单一命令；且没有快档 |
| 归置层 | 东西放哪 | **半成品**。文档归属有表，目录约定没有；死配置与产物边界未判定 |

### 为什么任务层是断的，比「不方便」更严重

tracker 协议里 `Resolve` 一步要往 `map.md` 追加决定（`.pi/skills/setup-matt-pocock-skills/issue-tracker-local.md`）。这一步产出的是**要持久存在的文件**。`.scratch/` 不入库，整个任务层协议就是空转：写进去的答案下一个 clone 看不到，换台机器也看不到。

反过来 `.pi/skills/` **不能**入库：`AGENTS.md` 明写它「会被更新覆盖」，且根目录已有 `skills-lock.json` 记录来源与 hash。该入库的是 `.pi/subagents.json`（子代理行为配置）。注意本仓库**没有** `.pi/agents/` 目录——子代理是内建的，别照抄参考仓库。

### 为什么边界层是「说谎」

三条都验过：

- `CONTRIBUTING.md` §1 说 depcruise 拦「core 引入 `cc`/`window`/`document`」。**做不到**：`window`/`document` 是全局量不是 import，depcruise 看不见；`cc` 是 npm 包，被 `doNotFollow` 排掉。
- `docs/HLD.md` §4.2 说拦「UI 视图层反向依赖核心逻辑层」。真正的风险是**反方向**（core → minigame），现有规则不拦。
- `docs/HLD.md` §4.1 说 oxc「承担…标准化格式化」。**没有 formatter**，`package.json` 里没有 `fmt`，也没装 oxfmt/prettier。

### 为什么验收层缺快档

`npm test` 之外没有第二条入口。AI 内循环每次改完都要跑全套（含测试与构建），太慢。参考仓库的答案是分档：`check:quick`（秒级，不含测试）与 `verify:fast`（quick + 测试）。**验收档和内循环档是两个入口，不是一个命令加参数。**

### 一个活着的洞（边界层为什么不能只靠手写规则）

`src/core/index.ts:3` 有 `export * from './headless/index.js'`，而 `src/core/headless/` 是**全 `src/` 唯一** import `node:url` / `node:path` 的地方（`HeadlessBenchmark.ts:9-10`、`cli.ts:12-13`）。

今天没炸，只因为 `src/minigame/*` 全部写深路径引用、绕过 barrel。没有任何规则挡着任何人改回去。手机包里没有 Node 内建模块。

这条也解释了为什么物理分区比手写规则稳：**depcruise 是枚举式（先想到才拦得住），包边界是声明式（没声明就解析不到）。** 参考仓库自己撞过这个坑——它的 `packages/tools` 就是 depcruise 巡航不到的那块（`packages/tools/src/rules/declared-deps.ts` 头注），后来补了第二道门禁。

## 决定

1. **物理分区按「独立消费者 / 独立运行时」判据切，切 2 块不切 6 块。** 本仓库只有一条这样的边界：进 `game.js` 的 vs 不进的。`logic`/`ai`/`types`/`utils`/`adapters` 最后都打成一个产物，它们之间加包边界只买到命名空间。`src/minigame` 暂不切第三块（5 个文件、一个交付物，不值），但**边界规则不能省**。
2. **分区拆两步落**（06 搬运、07 声明）。一条是纯机械改动（23 个测试文件改引用），一条改模块解析形状。合并了出错分不清是哪一步弄坏的。
3. **06 的阻断边挂验收命令（04），不挂 CI（05）。** 需要的是「一份绿的验收」，不是「CI 存在」。CI 一卡，分区就无故冻结。
4. **`minigame/game.js` 进库 + 加对账门禁。** 真实理由只有一条：`docs/DEVELOPMENT.md` 让人导入 `minigame/` 目录，文件在库里就不用每次先构建。**不借**参考仓库那个第三方契约的类比——它的 `runtime.iife.js` 是 sha256 写进回放 meta 的对外契约（ADR-0007），`game.js` 是 UI 包，没有第三方依赖它的确切字节。
5. **不挂定时任务。** 不是成本问题（仓库是 public，Actions 分钟数不限量），是**结构性冗余**：门禁是差分棘轮（`docs/MUTATION-TESTING.md` §3.1），没有 diff 的跑法在定义上产不出新发现。全量变异改成手动触发。
6. **删掉定时后，最强的那道门禁必须有人触发。** 需求方不是开发者、不会去按按钮，所以实际触发者只能是 agent：把「spec 收尾时由 agent 跑全量 + 棘轮」写进 `AGENTS.md` 并给一条命名脚本，同时把改动文件的变异放进快链作观察项。
7. **`01` 不写 ADR，`05`/`06`/`08` 各写一条。** 按本仓库自己的门槛（难以撤销 + 无上下文会困惑 + 真实权衡，三条全中才写）：把 `.scratch/` 放进库可以撤销，不达标；而「CI 为什么不挂定时」「分区为什么切两块」「构建产物为什么入库」三条全中。
8. **`01` 的 issue-tracker 规格不是设计题，是复制题。** `.pi/skills/setup-matt-pocock-skills/issue-tracker-local.md` 与参考仓库的 `docs/agents/issue-tracker.md` 逐字节相同；本仓库那份是手写的 4 行 stub。

## 依据

- **模型**：六层（词汇 / 任务 / 环境 / 边界 / 验收 / 归置）各自回答一个互不重叠的问题，删任何一层留下具体失效模式。原始五层版本漏了「环境层」，由 ExpertAdvisor 评审补上；需求方的原话本身就是「环境必须规范有序」。
- **分档**：参考仓库 `package.json` 的 `check:quick` / `verify:fast` / `check` 三级，以及 ADR-0010「CI 失败 ≡ 命名脚本失败，yaml 里不写裸命令」。
- **差分棘轮**：`docs/MUTATION-TESTING.md` §3.1 已定「只报告基线之外的新增存活/无覆盖」。这条决定了定时任务无意义。
- **污染证据**：`git log --grep='Co-Authored'` = 70 条 / 全部 245 条，最新一条 2026-02-06（HEAD 2026-10-11）。习惯已停 8 个月，历史污染还在。

## Out of Scope

- **改写历史**剥掉 70 条 `Co-Authored-By`（`git filter-repo`，破坏性操作，单独决定）。
- 切 `src/minigame` 第三块。
- 上 monorepo 的完整形态（项目引用 / `tsc -b` / 六包拓扑）。
- 游戏规则、数值、`docs/GDD.md` 任何内容。

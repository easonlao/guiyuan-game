# 02: 清过程档案 `.scratch/archive/`

**Type:** task
**Blocked by:** None（S1 已 resolved 且已 ff 合入 main）
**Status:** resolved

**What to build:** 删掉 `.scratch/archive/`（160 文件 1.2M，25 个已完成的 effort），并把采信链与代码里指向它的引用一并清掉。同时把新规矩写下来：**完成的 effort 直接删除，不进 archive。**

**为什么值得：** 这是三步里体量最大的一块（1.2M，占文档冗余的主体）。20 处死链也全在这里面，删掉一次性消失。

## 前置：9 处引用

**A. 采信链上 5 处反向引用（删句子，不改写）**

| 位置 | 实际处理 |
|---|---|
| `docs/HLD.md:138` | 删掉「历史上真发生过，见 `.scratch/archive/burst-plus-two/`」这个指针，保留陈述 |
| `docs/HLD.md:169` | 删掉「任务留档见 `.scratch/archive/minigame-view-upgrade`」整句 |
| `docs/SRS.md:103` | 删掉「（留档 `.scratch/archive/minigame-view-upgrade`）」 |
| `docs/adr/0002-attack-buff-and-rarity-nerf.md:76` | 删掉从句，**换成了 `tests/core/dead-knob-census.test.ts`**——工单已落地，残留清单的现行家是那个测试，比删除更有用 |
| `docs/adr/0016-burst-two-level-and-overflow-penalty.md:39` | 只删 `.scratch` 那半，保留并收窄到 `docs/headless/burst-plus-two-balance.md`（证据，不是定义） |

**B. 代码与测试里 4 处（换权威，不是删注释）**

```
scripts/check-worktrees.mjs:5
tests/core/burst-attack-truth-table.test.ts:4
tests/core/burst-strengthen-truth-table.test.ts:4
tests/core/burst-evaluator-reconciliation.test.ts:4
```

三个测试文件原写 `权威：.scratch/burst-plus-two/spec.md「…」`，**这四处本来就已经是死链**（该 spec 早已移进 `archive/`）。全部换成「规则见 `docs/GDD.md` §2.3，取值真源 `src/core/logic/ScoreCalculator.ts`，决策见 ADR 0016」。落地前先读 GDD §2.3 确认它确实写了那几张真值表的规则——**已确认写了**（强化 / 强破的双级作用、阴侧优先、满溢则亏、见底即止都在）。

## 验收清单

- [x] A 表 5 处清完，C7 对账点为 0 行
- [x] B 表 4 处换权威到 GDD §2.3 / `ScoreCalculator.ts` / ADR 0016
- [x] `docs/agents/issue-tracker.md` 写明「完成的 effort 直接删除，不进 archive」与「引用单向」
- [x] `.scratch/archive/` 已删，160 文件
- [x] `npm run verify` 全绿
- [x] 断链检查：`docs/`、`scripts/`、`src/`、`tests/` 零死链
- [x] 剩余 `.scratch/` 提及只有结构说明（见下）

## 实现要点

- 用 `git rm -r`。
- 三个测试文件的 `权威：` 头注没有整段删——它记录了真值表的来源。
- 删前按关键词扫过 `.scratch/archive/` 里 3 个 `map.md`，结论见 Answer。

## Answer

已执行（2026-10-25）。走 §6 流程：`spec/doc-dedup` → `ticket/doc-dedup/02` → squash 回 spec → 切片验证 → 整理到 main。

### `.scratch/archive/` 的 3 个 map.md 扫过了，没有需要回写的决定

这是本票要求「先核对再删」的那一步的实际结果：**不用回写，内容要么已在代码里，要么已经过期。**

| map.md 里的条目 | 现行家 |
|---|---|
| `Tween` 纯 `update(dt)` 驱动、不自持 `requestAnimationFrame` | 已在 `src/minigame/scene/tween.ts:4` 的模块头注写明 |
| 法盘取「木居正上方、顺时针相生」，可经 `startAngle` 覆盖 | 已在 `src/minigame/views/board-view.ts:43-44`（注释「首个方位（木）的角度，默认正上方」）与 `:232`（`startAngle: -Math.PI / 2`） |
| 触摸派发单目标、命中即停 | `src/minigame/scene/input-manager.ts` 的 `stage.hitTest` 行为 |
| 生克连线 `active` = 源主印任一侧 ≥ 1 | **已过期**。现行语义是阶段驱动：`board-view.ts:351` 写明「由 `setActivePaths` 驱动，与盘面等级无关」 |
| 场景树与视图分层、ADR 0006/0008 契约 | 已在 `docs/HLD.md` §2 Layer 3 与 LLD §4.1 |

`phase1/map-phase1.md` 的「决定」只是指向几个早已不存在的 `.scratch/ticket-*.md` 链接，技术选型（TS + Vitest + oxlint + dependency-cruiser）已在 `CONTRIBUTING.md` §2.2。`repo-operating-framework/map.md` 的结论由 ADR 0012 / 0013 / 0014 与 `docs/agents/issue-tracker.md` 承载。

### 剩余 `.scratch/` 提及（12 个文件，全部是结构说明）

`.agents/skills/` 里 9 处是上游技能的正文（本仓库规矩：不往里写规则，也不改），`.gitignore` / `AGENTS.md` / `CONTRIBUTING.md` 各若干处都是「`.scratch/` 是干什么的」。

**一处待办（本票不改，记录在案）：** `CONTRIBUTING.md:172` 有「尚未落地（见 `.scratch/delivery-protocol/` 票 04）」——这是反向引用，且会在 `delivery-protocol` effort 关闭、目录被删时变成死链。删它的时机是那张票落地时，不是现在（现在删会丢掉定位）。判据与处理已写进本条。

### 验证记录

| 检查 | 结果 |
|---|---|
| C7 对账点 `git grep -n -E '\.scratch/' -- docs/adr docs/HLD.md docs/SRS.md docs/GDD.md docs/FSR.md GLOSSARY.md README.md` | **0 行**（删前 5 行） |
| 全仓 `.scratch/` 提及（排除 `.scratch`、`.worktrees` 自身） | 12 个文件，全为结构说明 |
| `npm run verify` | 全绿（含 lint、fmt、typecheck、1003 用例、产物逐字节对账） |
| `.scratch/archive/` | `git ls-files .scratch/archive` 为空 |
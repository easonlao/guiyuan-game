# 02: 清过程档案 `.scratch/archive/`

**Type:** task
**Blocked by:** None（S1 已 resolved 且已 ff 合入 main）
**Status:** ready-for-agent

**What to build:** 删掉 `.scratch/archive/`（**160 文件 1.2M**，25 个已完成的 effort），并把采信链与代码里指向它的引用一并清掉。同时把新规矩写下来：**完成的 effort 直接删除，不进 archive。**

**为什么值得：** 这是三步里体量最大的一块（1.2M，占文档冗余的主体）。20 处死链也全在这里面，删掉一次性消失。

## 前置：9 处引用要先清

**A. 采信链上 5 处反向引用（删句子，不改写）**

按「引用单向」规则（`doc-dedup` spec 决定 4）：`.scratch/` 可以引用 `docs/` 与代码，反过来不行。

| 位置 | 处理 |
|---|---|
| `docs/HLD.md:138` | 删掉「历史上真发生过，见 `.scratch/archive/burst-plus-two/`」这个指针，保留陈述本身 |
| `docs/HLD.md:169` | 删掉「任务留档见 `.scratch/archive/minigame-view-upgrade`」整句 |
| `docs/SRS.md:103` | 删掉「（留档 `.scratch/archive/minigame-view-upgrade`）」这个括号 |
| `docs/adr/0002-attack-buff-and-rarity-nerf.md:76` | 删掉「删除工单见本地 issue tracker `.scratch/archive/dead-scoring-code-removal/`」这个从句；该句后半的 `docs/headless/knob-census.md` 指针保留 |
| `docs/adr/0016-burst-two-level-and-overflow-penalty.md:39` | **只删 `.scratch` 那半**。该句已另有 `docs/headless/` 的替代指针（tier 3 留存），删完仍然成立 |

**不要改写**指向被删材料的论述——那等于在 ADR/HLD 里造新论述，属于另一张票。

**B. 代码与测试里 4 处（要换权威，不是删注释）**

```
scripts/check-worktrees.mjs:5
tests/core/burst-attack-truth-table.test.ts:4
tests/core/burst-strengthen-truth-table.test.ts:4
tests/core/burst-evaluator-reconciliation.test.ts:4
```

三个测试文件的头注写的是 `权威：.scratch/burst-plus-two/spec.md「…」`——**这四处已经是死链**（该 spec 早已移进 `archive/`，路径没跟着改）。

处理：把「权威」换成规则的家——`docs/GDD.md` §2.3（规则机制）与该片 ADR（`0016-burst-two-level-and-overflow-penalty.md`、`0002-attack-buff-and-rarity-nerf.md`）。落地时先读 GDD §2.3，确认它确实写了那几张真值表的规则；写不到就说明规则正文有缺，那是另一张票，不要在本票里补。

`scripts/check-worktrees.mjs:5` 的引用只是举例说明历史事故，改写为「历史上真发生过」不带路径即可。

## 主体

- `git rm -r .scratch/archive`（160 文件）。
- 在 `docs/agents/issue-tracker.md` 写明新规矩：**effort 完成后直接删除，不进 archive。** 该文件现在**没有**提到 `archive/` 一个字，所以这是新增约定，不是修改既有约定。
- 删完 `.scratch/` 只剩活着的 effort 目录（当前：`delivery-protocol`、`doc-dedup`，以及若干未归档的活跃目录）。

## 验收清单

- [ ] A 表 5 处引用清完，`git grep -n -E '\.scratch/' -- docs/adr docs/HLD.md docs/SRS.md docs/GDD.md docs/FSR.md GLOSSARY.md README.md` → 0 行
- [ ] B 表 4 处代码/测试引用不再指向 `.scratch`，且换成了 GDD 与 ADR 的合法路径
- [ ] `docs/agents/issue-tracker.md` 写明「完成的 effort 直接删除，不进 archive」
- [ ] `.scratch/archive/` 已删，`git ls-files .scratch/archive` 为空
- [ ] `npm run verify` 全绿
- [ ] 断链检查：`docs/`、`scripts/`、`src/`、`tests/` 里零死链
- [ ] 存活文档里剩余的 `.scratch/` 提及只剩「说明 `.scratch` 是干什么的」这类结构说明（`AGENTS.md`、`CONTRIBUTING.md`、`docs/agents/issue-tracker.md`）

## 实现要点

- 用 `git rm -r`，不要 `rm -rf` 之后忘记 `git add`。
- 三个测试文件的 `权威：` 头注删掉后，注释要读得通；不要把整段注释删光——它记录了该真值表的来源。
- 本票会用 `scripts/check-delivery.mjs` 与 `npm run verify`，但那些脚本**不检查**「反向引用」这一类。C7 的对账点要靠 `git grep` 手动跑，且在票面的 `## Answer` 里贴出实际输出。
- `.scratch/archive/` 里有 3 个 `map.md`，删前扫一眼有没有只存在于那里的决定（本仓库的规矩是决定回写 ADR/GDD/HLD，证据才留在过程区）。若确实发现只在那里的决定，先回写再删，并在 Answer 里记明是哪一条。<br>**注意**：这一条是「先核对再删」，不是「先把 160 个文件通读一遍」——按关键词扫即可。

## Answer

（落地时填写：A/B 两表逐条处理结果、`git grep` 实际输出、`verify` 结果。）
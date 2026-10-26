# 01: check:refs + check:facts + AGENTS.md 瘦身

**Type:** task
**Blocked by:** None
**Status:** resolved
**Slice:** S1

**What to build:** 两个新门禁脚本，加上 `AGENTS.md` 的瘦身与三条提问。

**为什么分工成这样：**

- **采样当全量**（我犯过 3 次）的根是「靠人数」，所以换成枚举——`check:refs` 把引用全列出来，`check:facts` 把会脱节的量跑一遍。
- **判据选错**（我犯过 4 次）发生在写代码之前，脚本拦不住。只能写成提问，放在报告之前。
- **机械替换不复核**连提问都救不了，只能靠「改完逐行过 diff」。这条不进任何机制。

## 验收清单

**`check:refs`（进 `check:quick`）**

- [x] 扫 `git ls-files '*.md'`，只查长期文档：`.scratch/`（过程区）与 `.agents/`（上游技能副本）不在范围内
- [x] 只收「带斜杠 + 已知扩展名」的形式；裸文件名（`ActionResolver.ts` 这种「提到符号」）不查
- [x] 长扩展名排在短扩展名前，否则 `package.json` 被 `js` 截断
- [x] 围栏代码块内不查
- [x] 同一行写明「已删 / 已更名」的历史记录不算死链
- [x] 探针：造一处 `docs/NOT-THERE.md` → 判红；删掉 → 恢复绿

**`check:facts`（进 `check:quick`）**

- [x] 12 条不变式，**一条固定数字都不锁**（锁数字会造跑步机）
- [x] 覆盖：`.nvmrc` ↔ `engines`、`npm -v` ↔ `packageManager`、`.npmrc` 两个开关、`.oxlintrc.json` 两个规则键、CI 2 个 run 步、CI 非注释行不含 mutation、ADR 命名格式、术语表词条数 == `_Avoid_` 行数、技能锁差集、突变基线结构、快链里两个门禁还在
- [x] 探针 1：把 `.npmrc` 的 `engine-strict` 改成 false → 判红；探针 2：给术语表加词条不加 `_Avoid_` → 判红；两者恢复后绿

**`AGENTS.md`**

- [x] 6 个 `###` 指针小节合并成一张表（一个触发条件一行）
- [x] 删掉已被别处承载的复述（目录约定里重复「实验报告已删」那句）
- [x] 新增「报告之前」三条提问，每条一个领头词（全量 / 比内容 / 红）
- [x] 行数从 102 降到 93（净增三条提问的同时减了散文）

**接线**

- [x] `package.json` 只加两条脚本，`check:quick` 变成 8 段
- [x] `CONTRIBUTING.md` §6.6 的脚本清单从三项改五项
- [x] `npm run verify` 全绿

## 实现要点

- **不新增 `pre-commit` hook。** `CONTRIBUTING.md` §1 明写仓库没有 `pre-commit`，拦截靠交付前的本地验收。新检查进 `check:quick` 就够——效果相同，且不新增一类失败面（慢 hook 会被 `--no-verify` 绕过，等于没有）。
- **`check:refs` 的 `ALLOWED_MISSING` 只留 `artifacts/`**（工具产物落点，跑过工具才有）。其它「允许不存在」的场合一律用「同一行写明已删」表达，不往白名单里塞路径——白名单会随条目变长而失去意义。
- **`check:facts` 的 ⑫ 条是有意为之**：断言 `check:refs` 与 `check:slices` 仍在 `check:quick` 里。门禁最大的敌人不是漏检，而是被人悄悄摘掉。

## Answer

已落地（2026-10-25）。走 §6 流程：`spec/repo-guardrails` → `ticket/repo-guardrails/01` → squash 回 spec → 切片验证 → 整理到 main。

**`check:refs` 首跑抓到的真问题**：14 处报警里 11 处是正则误判（`package.json` 被 `js` 截断、上游技能里的示例路径），**3 处是真的**：

- `docs/adr/0014` 两处指向已删的 `docs/DEVELOPMENT.md`，其中一处是决策理由、没写「已删」→ 改指现家 `docs/HLD.md` §4.6。
- `docs/adr/0002` 一处指向已删的 `tests/core/scoring-attack-buff-rarity.test.ts`，但那句自己写了「已更名」→ 按「历史记录不算死链」放过。

最终：**32 份文档、137 处路径引用全部存在，2 处是写明已删的历史记录。**

**`check:facts` 的探针结果**：改坏 `.npmrc` 的 `engine-strict` → ③ 判红；给术语表加词条不加 `_Avoid_` → ⑨ 判红；两者恢复后 12 条全过。

**`AGENTS.md` 102 → 93 行**，结构从 9 个 `##`/`###` 变成同样 9 个，但「Agent skills」下 6 个小节合并成 1 张表 + 1 个「派子代理」小节，另新增「报告之前」。

**我没解决的那一类**：机械替换不复核。它在三个门禁里都没有对应物，只能靠「改完逐行过 diff」。这一条留在 `AGENTS.md` 的提问之外——写进去也执行不了，不如不写。
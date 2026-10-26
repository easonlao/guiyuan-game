# 03: 删第三档证据层（8 份被引用的报告）

**Type:** task
**Blocked by:** None（S1、S2 已 resolved 并合入）
**Status:** resolved
**Slice:** S3

**What to build:** 删掉 `docs/headless/` 全部 9 个文件（8 份被引用的报告 + `docs/archive/` 最后一份），并把采信链、源码、测试里指向它们的 22 处引用一并处理。

**决定依据**：需求方 2026-10-25 定「直接删掉，这个我以后再来处理」。删掉的内容**仍可取回**——删除提交的前一个提交里就有，`git log --diff-filter=D -- docs/headless` 再 `git show <commit>:<path>`。

## 处理口径

**文档侧（AGENTS.md / GDD / SRS / 4 条 ADR）**：保留决定与结论句，把证据指针换成「原报告已删，见 git 历史」。**不改写论述**——改写等于在 ADR 里造新论述。

其中三处不是简单换措辞：

| 位置 | 处理 |
|---|---|
| ADR 0002:76 | 逐参数证据句只剩指针 → 该句整体替换为括注 |
| ADR 0011:45 | 「先查活/死参数清单（报告 §5）」→ **改指 `tests/core/dead-knob-census.test.ts`**：那份清单已被测试守住，测试才是现行家 |
| ADR 0011 表格 7 行 | 「归宿」列的路径换成「已删（见 git 历史）」，保留缺陷描述与另两行的 ADR 指向 |

**代码与测试侧（1 处源码 + 4 处测试）**：**不写「已删」**，换成规则与决策的家——`docs/GDD.md` §2.3、ADR 0016 / ADR 0017、ADR 0011。源码与测试不该指向已删的过程产物。

## 验收清单

- [x] `docs/headless/` 与 `docs/archive/` 两个目录删除，共 9 个文件
- [x] 22 处引用处理完：`git grep -c -E 'docs/headless|docs/archive' -- docs src tests AGENTS.md CONTRIBUTING.md` → 只剩结构性说明
- [x] `AGENTS.md` 的报告类一条如实改写（目录已删 + 取回方式），目录约定一句同步
- [x] `npm run verify` 全绿
- [x] `npm run check:slices` 通过

## 实现要点与踩到的坑

**坑一：注释进产物。** `src/core/logic/ScoreCalculator.ts` 只改了一行注释，`npm run check:artifact` 立刻判红——`minigame/game.js` 的 `minify: false`，注释一起打包。所以本票必须重跑 `npm run build:minigame` 并把新产物一并提交。这正是 §6.5 那条规则的实际场景（本票不是切片重排，但触发机制相同）。

**坑二：机械替换会产出怪句子。** 先按路径正则批量替换，产出「原 报告层（已删）」「归 burst-plus-two 平衡报告（已删，见 git 历史）（本文只引关键数字）」这类嵌套括注，还吃掉了 §4.1 只剩 `/§4.5`，以及「活/死参数清单（活/死参数普查报告（已删…））」的括号套括号。**批量替换之后必须逐行过一遍 diff**，尤其看括号与章节号残留。

**坑三：引用点的量比预估大。** 开票时按 grep 数到 18 处，实际 22 处——多出来的是 ADR 0010:64、ADR 0011:28/49/55 这些夹在长段落里的。**这类工作按「文件 × 行」列清单，不要只按「文件名出现次数」估。**

## Answer

已执行（2026-10-25）。走 §6 流程：`spec/doc-dedup` → `ticket/doc-dedup/03` → squash 回 spec → 切片验证 → 整理到 main。

**删除**：9 个文件、约 200K。`docs/` 现在只剩 `FSR.md`、`SRS.md`、`GDD.md`、`HLD.md`、`LLD.md`、`MUTATION-TESTING.md`、`adr/`、`agents/`。

**引用处理**（22 处）：

| 侧 | 处数 | 处理 |
|---|---|---|
| `AGENTS.md` | 3 | 报告类一条改写（目录已删 + `git log --diff-filter=D` 取回法）；ADR 边界一条去掉「证据留在 docs/headless」；目录约定一句同步 |
| `docs/GDD.md` | 1 | 去掉推导报告指针，保留「取值真源是 `ScoreCalculator.ts`」 |
| `docs/SRS.md` | 2 | 去掉报告指针，保留 ADR / HLD 指向 |
| ADR（0002 / 0010 ×2 / 0011 ×9 / 0016 ×2 / 0017 ×1） | 15 | 「原报告已删，见 git 历史」；两处改指现行家（`dead-knob-census.test.ts`、ADR） |
| `src/core/logic/ScoreCalculator.ts` | 1 | → 「理由见 ADR 0016 / ADR 0017」 |
| `tests/core/*`（4 个文件） | 4 | → ADR 0011 / ADR 0017（**不写「已删」**） |

**产物**：`ScoreCalculator.ts` 的注释改动改变了 `minigame/game.js`（219941 → 219912 字节），已重跑 `npm run build:minigame` 并一并提交。

**验证记录**：

| 检查 | 结果 |
|---|---|
| `npm run check:artifact` | 重构建前判红（首个差异在第 10100 字节）→ 重建后逐字节一致 |
| `npm run verify` | 全绿 |
| `npm run check:slices` | 7 张票、6 个切片，无环 |
| `git grep -E 'docs/headless\|docs/archive'` 在 docs/src/tests/AGENTS 内 | 只剩 AGENTS.md 的三处结构性说明 |

**遗留**：`AGENTS.md` 的「报告类」现在指向一个空类别。保留它是有意的——那条「引用报告必须写明『这是证据，不是定义』」的规矩仍有效，且写明了如何取回被删报告。等哪天有了新的报告目录，这一条可以直接复用。
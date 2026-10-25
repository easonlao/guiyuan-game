# Spec: 文档去重与证据层清理 (doc-dedup)

## Problem Statement

需求方的三步里第三步：**清理文档。完成的 feature 直接删除，不要继续优化完善。**

现状的问题是**同一事实有多个家，而它们在漂移**。实测两例：

- 「CI 不跑突变测试」出现在 4 个文件（`AGENTS.md`、`docs/HLD.md`、`.github/workflows/fast.yml`、`scripts/mutation-check.mjs`），且刚为它做过一次三处订正的提交。
- 「取值以代码常量为准」在 8 个文件里重复表述。

另一类问题是**证据层堆积**：`docs/headless/`（12 份 248K）、`docs/archive/`（12 份 104K）、`.scratch/archive/`（160 文件 1.2M），其中大量文件的结论已被 ADR 吸收，正文只剩过程数据。

### 现状（2026-10-25 实测）

- 全部 md：273 文件 16391 行。五层文档链只有 559 行 / 76K——**不是冗余的主要来源**。
- 真冗余在 `docs/headless/` + `docs/archive/` + `.scratch/`，合计约 1.5M。
- 死链 20 处，**全部**在 `.scratch/archive/` 内部；存活文档零死链。
- 采信链上有 5 处**反向引用**指向 `.scratch/`（HLD 2 / SRS 1 / ADR 2），删 `.scratch` 当天会一起断链。
- `docs/headless/` **不是「完成的文档」**：存活文档引用它的有 8 个文件，`docs/adr/0011` 一份里就有 11 处；其中 `burst-plus-two-balance.md` 还被 `src/core/logic/ScoreCalculator.ts` 与 3 个测试文件引用。

## 决定

1. **判据**：删掉这份文档，agent 会不会写错代码？需求方会不会验收错？两个都不会才删。
2. **保留「代码推不出来的」**：规则机制与意图（GDD）、需求范围与验收条款（SRS）、定位与成本（FSR）、架构理由（HLD）、术语（GLOSSARY）、决策（ADR）。
3. **删「代码或 ADR 已表达」的**：五层链里纯复述的部分（LLD 的类型定义）、证据层的正文。
4. **引用单向**：`.scratch/` 可以引用 `docs/` 与代码；反过来不行。采信链上的文档不得把 `.scratch/` 当作事实或证据的出处。
5. **按证据分档删，不按目录整块删。** 每个文件删前复核引用数。
6. **消重优先于删除**：同一事实多个家时，收敛成「1 个家 + N−1 个指针」，而不是删光。

施工依据（事实 → 唯一家 → 对账命令）见 `.scratch/doc-dedup/ownership-map.md`。

## 票据

| 票 | 内容 | 切片 | 状态 |
|---|---|---|---|
| 01 | 删证据层第一档：零引用文件 | S1 | resolved（2026-10-25） |
| 02 | 清过程档案 `.scratch/archive/`（160 文件 1.2M）+ 清 9 处引用 | S2 | resolved（2026-10-25） |

切片依赖：S1 → S2（已交付）。无环。

首次实跑的时间线与四处摩擦见 `.scratch/delivery-protocol/spec.md` 的「首次实跑（2026-10-25）」一节，不在本 spec 重复。

后续票（未开）：第二档清 `.scratch/archive/`（前置：清 5 处反向引用）；第三档 8 份被 ADR 与代码引用的 headless 报告（前置：先搬数字，**建议暂不删**）。
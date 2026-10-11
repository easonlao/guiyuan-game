# 04: 清掉基线里属于活代码的存活突变体

**What to build:** 针对基线中**活代码**上的存活突变体补断言，把基线收紧到"只剩等价突变体与管道噪音"。基线棘轮会把现存存活冻结——不主动清就永远不会清。

**Blocked by:** 02

**Status:** done

- [x] 活代码上的存活突变体清零或降到个位数（主要集中在中位态/攻击态的等级跃迁计分：`calculateTransitionPoints` 一带）
- [x] 补的断言是"断言真实行为"，不是"为杀而杀"——若某个存活只能靠扭曲的断言杀死，说明它模拟的 bug 不值得抓，就地 disable 并写理由
- [x] 每处 disable 都写清理由
- [x] 基线相应更新，diff 能看清消除了哪些存活
- [x] `npm test` 全绿

**备注：** 这是质量提升票，不是门禁的前置——门禁（02）建立后本票可以随时做，也可以推迟。判断"是否等价"时可以先用 `codegraph_explore` 看该行的调用路径，避免把活代码误判成死代码。

---

## 结果（2026-10-10，阶段 1–3c 收尾）

- **实际做到 0 条**，优于票面假设的"清零或降到个位数"：`mutation-baseline.jsonl` 现为 **0 条**（Survived 0 + NoCoverage 0）。
- 全量变异分 **100.00%**：923 个计分突变体（Killed 922 / Timeout 1 / Survived 0 / NoCoverage 0），另有 **150 个**确认等价 / 不可观测的突变体**就地 disable**（`// Stryker disable next-line ...`，各附理由），Stryker 记为 `Ignored`。100% 是"等价项被显式 disable 后的结果"，不是追求目标。
- 分阶段：阶段 1（`0bb4175`）清 `calculateTransitionPoints` 一带的存活；阶段 2（`c12535a`）清 TurnManager；阶段 3a（`515140a`）删死代码 + 对确认等价的存活就地 disable；阶段 3b（`eaee33a`）补活行为断言清零剩余存活并稳定超时抖动。
- 阶段 3c（本次）额外做了两件收尾：
  1. **`mutation:check` 的子集报告防护**：Stryker 的 perTest 覆盖按被变异文件集选测试，`mutation:changed`（`--mutate` 子集）的存活集与全量不同，喂给棘轮会报假新增。现在 `mutation:check` 比对报告 `config.mutate` 与 `stryker.config.json` 的 `mutate`，不一致或缺 `config.mutate` 即退出 `2` 并提示"先跑 `npm run mutation`"。
  2. **文档订正**：`docs/MUTATION-TESTING.md` 的现状快照（223 → 0 条、79.45% → 100.00%）、disable 政策、Timeout 与门禁关系、子集报告警告均已同步。
- 环境：`npm test` 728 全绿，`npm run typecheck`、`npm run lint` 全绿。

---

## 结果订正（阶段 4a–4b，2026-10-11）

上面「阶段 1–3c」的「0 条 / 100.00%」是**过度 disable 造成的假象**，已纠正：

- **阶段 4a（`57e8029`）**：Stryker 的 disable 是「行 + mutator」粒度，阶段 3a 的 71 行 disable 把该行该 mutator 的**全部取值**一起禁掉，掩盖了其中 **35 个本可被现有测试杀死**的突变体。机械重做后：只保留「该行该 mutator 全部取值都未被测试抓住」的 **54 行** disable（对应 **80 个 Ignored**）；其余等价项落回基线。
- **新基线 = 34 条**（Survived 34 + NoCoverage 0），全部是「同一行同一 mutator 上还有可杀兄弟、无法单独 disable」的等价 / 不可观测突变体（不是活代码 bug）。
- **全量分 96.58%**（1073 个突变体，993 计分：Killed 957 / Timeout 2 / Survived 34 / NoCoverage 0）。票面假设的「清零或降到个位数」指的是**活代码上的存活**——这一点成立（34 条均为等价/不可观测）；但若按「基线条数」读，则不是 0、也不是个位数，而是 34。
- **阶段 4b（`b4d9012`）**：`docs/MUTATION-TESTING.md` 现状快照订正为 34 条 / 96.58%，§4 写明 disable 政策；`stryker.config.json` 的 `_comment` 如实描述 `coverageAnalysis: "off"` 字段不生效（runner 实际总是 per-test 覆盖）；`scripts/mutation-baseline.mjs` 与 `mutation:check` 一样校验全量跑、拒绝子集报告（退出 `2`）。
- 环境：`npm test` 728 全绿，`npm run typecheck`、`npm run lint` 全绿，`mutation:check` 退出 0。

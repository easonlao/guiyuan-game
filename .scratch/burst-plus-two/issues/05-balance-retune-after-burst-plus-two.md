# 05: burst-plus-two 后的平衡重调（先手胜率带外 + 占优重排）

**What to build:** 双级爆发（工单 01/02）落地后，护栏与占优格局都位移了。本票是**平衡阶段的单一入口**：
先复核实测，再决定调参方向（`POINTS_CONFIG`、满溢则亏那级要不要计分、AI 估值权重、或其它手段），
最后把带与占优基线更新到新的真实值。**规则正确性不属于本票**——真值表与门槛已经落在
`burst-plus-two` 的工单 01/02，不要再改规则语义。

实测证据（口径与复跑命令见 `docs/headless/burst-plus-two-balance.md`，集成分支尖 `eca971d`）：

| 指标 | 实测 | 基线（`1b58360`） | 差值 | 带 / 期望 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 归元率 | 0.902 | 0.904 | −0.002 | `[0.89, 0.95]` | 带内 |
| 先手胜率 | **0.544** | 0.504 | **+0.040** | `[0.47, 0.51]` | **带外**（高于上界 0.51） |
| 500 局堆增量 | 3.08 MB（中位数） | 3.50 MB | −0.42 MB | `< 15 MB` | 带内 |

## 当前红灯（本票的验收对象）

| 测试文件 | 用例 | 失败断言 |
| --- | --- | --- |
| `tests/core/ai-evaluator-benchmark-guardrails.test.ts` | `3. live 启发式预设护栏基线推演验收 > satisfies the live heuristic-preset guardrails…` | 先手胜率 0.544 > 上界 0.51 |
| `tests/core/candidate-validation.test.ts` | `生产配置（工单 06 采纳后）标准 1 无严格占优，但小样本矩阵为「无法判定」而非通过` | `production.guardrails.passed === false`（同一条先手胜率） |
| `tests/core/candidate-validation.test.ts` | `标准 1 独立失败（关闭进度定价重新造出占优），不影响标准 2/3/4 的输出` | 关闭进度定价后**不再**出现严格占优者「激进压制」（`strictDominators` 为空） |
| `tests/core/dominance-regression-guard.test.ts` | `不存在对全部其它策略严格占优的策略（显著性证据，不是裸 >50%）` | 「激进压制」重新对全部 6 个对手严格占优 |
| `tests/core/dominance-regression-guard.test.ts` | `钉住关键翻转格（容差 3.16% ≈ 2×SE）` | 「平衡 对 激进压制」期望 52.80%、实测 40.20%（偏差 12.60% > 3.16%） |

**已在本票之外处理的一项**：`tests/core/experiment-runner.test.ts` 的「基线复现 (self-distortion alarm)」
钉值已按实测重录（归元率 91.40% → 91.05%、平均大回合 19.27 → 17.78、先手胜率 52.20% → 54.55%）。
它是表征钉，不是护栏；重录理由与差值写在用例注释里。

## 背景（为什么必须重跑，而不是沿用旧结论）

- spec「受影响的既有结论」：ADR 0002 曾因「爆发刷分垄断」砍掉爆发的稀有度加成；双级作用会重新抬高
  爆发的收益，因此旧结论不能沿用。
- 门槛放开后爆发在源节点已归一时**总是可选**：真值表里强化 `(2,1)` / `(1,2)` / `(2,2)` 三格合计
  都是 300（全场最低档），强破 `(-1,-1)` 只有 80（全场最低且只有动作分）——它们现在是纯节奏/刷分动作。
- 源节点是 `(1,1)` / `(1,2)`（强化）或 `(1,1)` / `(2,1)`（强破）时，消耗会让源节点**失去归一**
  （不扣分，但拖慢五行归元）。

**Blocked by:**

**Status:** ready-for-agent

- [ ] 复核 `docs/headless/burst-plus-two-balance.md` 的三条数与带的关系，确认先手胜率带外的成因（爆发收益抬高？连动频率上升？）
- [ ] 给出调参方向与候选方案（`POINTS_CONFIG` / 满溢则亏那级计分 / 估值权重 / 其它），说明被否决的方案与理由
- [ ] 先手胜率回到 `[0.47, 0.51]`，归元率仍在 `[0.89, 0.95]`，堆增量仍 `< 15MB`
- [ ] 占优格局重新落定：`tests/core/dominance-regression-guard.test.ts` 的严格占优断言与关键翻转格钉值更新到实测
- [ ] `tests/core/candidate-validation.test.ts` 的两条红灯按新格局校正（生产标准 3 转绿；标准 1 用例按实测重写）
- [ ] `tests/core/ai-evaluator-benchmark-guardrails.test.ts` 全绿
- [ ] 若带值本身需要移动，改动落在 `tools/GuardrailBand.ts` 并在本票记录理由与新旧锚点
- [ ] `npm run verify` 全绿

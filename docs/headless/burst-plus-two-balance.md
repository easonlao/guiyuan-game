# burst-plus-two：AI 估值器对账与平衡基准

> 工单 `.scratch/burst-plus-two/issues/03-evaluator-reconciliation-and-balance-guardrails.md`。
> 本文是**报告类**：只做证据与导航，不定义规则。规则正文（真值表、门槛、满溢则亏）归
> `.scratch/burst-plus-two/spec.md` 与 `docs/GDD.md` §2.3；护栏带的唯一定义在
> `tools/GuardrailBand.ts`。本文的数字是**某次测量的快照**，不是契约。
>
> 测量对象：集成分支 `burst-plus-two` 的合并尖 `eca971d`（工单 01 强化双级 + 工单 02 强破双级
> 均已并入），工作树 `/home/easonlao/projects/guiyuan-game-worktrees/ticket-03`。
> 改动前基线：`1b58360`（同一工作树的 `baseline` 检出）。

## 1. 复跑命令

```sh
# A. 估值器对账（真实行为断言，不是读代码）
npx vitest run tests/core/burst-evaluator-reconciliation.test.ts

# B. 平衡基准：与 GuardrailBand 完全同口径（500 局、baseSeed 默认 10000、maxRounds 默认 30）
npx tsx -e "
import {HeadlessBenchmark} from './tools/HeadlessBenchmark.js';
import {balancedStrategy} from './src/core/ai/Strategy.js';
const m = new HeadlessBenchmark().run({ matches: 500, strategyP1: balancedStrategy, strategyP2: balancedStrategy });
console.log(m.guiYuanRate, m.p1WinRate, m.heapUsedDeltaMB);
"

# 与上面同口径的 live 测试（当前红，见 §6）
npx vitest run tests/core/ai-evaluator-benchmark-guardrails.test.ts
```

`npm run benchmark:headless` 走的是 10000 局 + 默认策略的另一条路径，与护栏带口径**不同**，
本文所有平衡数字都取自上面这条 500 局命令。

## 2. 估值器对账：信号 × 双级跳跃

`ActionEvaluator.evaluate(...)` 用**动作前后的盘面差分**计价，看不到解析器内部的两次 `±1`。
下表逐条列出每个信号对「一次跳跃两级」的处理，**依据是 `tests/core/burst-evaluator-reconciliation.test.ts`
里的真实 `evaluate` 调用**（断言手法：只打开被测信号、其余权重清零，于是字段值 = 命中次数）。

| 信号 | 位置 | 判定类型 | 双级跳跃下的行为 | 取证（目标 → 结果） |
| --- | --- | --- | --- | --- |
| `repairScore` | `src/core/ai/ActionEvaluator.ts:78,81` | 形状（逐侧） | 记 **1** 次 | 强化 `(-1,-1) → (1,-1)`：阴侧一跳到 1，仍记一次 |
| 达成归一 | `:102` | 形状（逐节点） | 记 **1** 次 | 强化 `(0,1) → (2,1)` |
| 失去归一（源消耗） | `:105` | 形状（逐节点） | 记 **1** 次 | 强化 `(0,0) → (2,0)` 的源节点木 `(1,1) → (0,1)` |
| 点亮虚空 | `:110,113` | 形状（逐侧） | 记 **1** 次（`0 → 2` 不是两次） | 强化 `(0,0) → (2,0)` |
| 达成加持 | `:118,121` | 形状（逐侧） | 记 **1** 次（`0 → 2` 跨过 `1→2` 只算半档一次） | 强化 `(0,0) → (2,0)` |
| 达成亢极 | `:124` | 形状（逐节点） | 记 **1** 次 | 强化 `(1,1) → (2,2)`：两侧加持 + 亢极 = 3 次命中 |
| 破坏对方归一 | `:148` | 形状（逐节点） | 记 **1** 次 | 强破 `(1,1) → (-1,1)` |
| 致道损 | `:153,156` | 形状（逐侧） | 记 **1** 次（`1 → -1` 也只记一次） | 强破 `(1,1) → (-1,1)` |
| 普通降级压制 `suppressNode` | `:162,166` | **差分（按级缩放）** | 记 **2×** | 强破 `(2,1) → (0,1)`；`(2,2) → (0,2)` 同样 2× |
| `burstExtraTurn` | `:173` | 每动作 | 爆发 / 强破各 **1** 次；非爆发动作 0 | 强化、强破、AUTO 三例对照 |
| `scoreDeltaPoints` | `:179` | 每动作 | 读计分器**两次转移之和**，不缩放不截断 | 强化 `(0,1) → (2,1)` = 460；强破 `(2,1) → (0,1)` = 248 |

加权口径（`DEFAULT_STRATEGY_WEIGHTS`，AI 真正用的那组）在测试里按信号逐项列成公式，
公式中每个信号只出现一次；估值器若重复计数，等式即不成立。

## 3. 已知差异：净零爆发在差分模型下不可见（记录，不修）

目标已是 `(2,2)`（强化）或 `(-1,-1)`（强破）时，两次作用在盘面上净零，**目标侧的前后差分完全为空**，
因此所有逐侧信号恒为 0；而计分器因两次转移仍给出分数。这是估值口径与计分口径的既有差异，
修它属于估值口径重做（spec 明确划到平衡阶段），本票只把它钉住。

实测 breakdown（源节点也取「消耗后仍归一」的形状，排除源节点干扰）：

| 用例 | `repairScore` | `unityScore` | `suppressionScore` | `burstScore` | `scoreDeltaPoints` | `totalScore` |
| --- | --- | --- | --- | --- | --- | --- |
| 强化目标 `(2,2)` | 0 | 14 | 0 | 70 | 300 | 384 |
| 强破目标 `(-1,-1)` | 0 | 7 | 0 | 70 | 80 | 157 † |

† 强破一例的 `totalScore` 随源节点取法而变：源 `(1,2)`（消耗阳侧后仍归一，测试采用的形状）实测 157；
源 `(2,1)`（消耗后失去归一）实测 105。`unityScore` 的 7 / 14 只是稳态项
`nextGuiYiCount × guiyuanProgress × 0.2`，不是任何转移信号。

测试对两例都逐个断言 7 个逐侧信号（`repairDamage` / `reachGuiYi` / `lightVoid` / `reachKangJi` /
`breakOpponentGuiYi` / `causeDamage` / `suppressNode`）的命中数全为 0，并把上表整行 `toEqual` 钉住。

## 4. 对账结论：无错位

形状类信号对双级跳跃逐侧/逐节点各记一次，差分类按级数缩放，每动作类每动作一次——
**与计分器「两次单级转移之和」的口径一致**，未发现会静默改变 AI 取舍的少记或多记。
两个佐证：

- 满溢则亏格 `(2,1) → (1,2)`：差分只剩阳侧 `1 → 2` 的加持一次，计分器那边溢出那级同样返回 0 分
  （`POINTS_CONFIG.STATE_CHANGE` 对非攻击 `2 → 1` 无分支），两侧看到的是同一个「只有一次加持」。
- 唯一真实差异是 §3 的净零爆发，且它的成因是「盘面真的没变」，不是信号实现错。

因此本票**未修改任何估值器代码或权重**。

## 5. 平衡基准（`GuardrailBand` 同口径）

口径：`new HeadlessBenchmark().run({ matches: 500, strategyP1: balancedStrategy, strategyP2: balancedStrategy })`，
默认 `baseSeed` 10000、`maxRounds` 30。基线与改动后在同一台机器上各跑一遍，种子与样本量相同。

| 指标 | 改动后（`eca971d`） | 改动前基线（`1b58360`） | 差值 | 护栏带 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 归元率 `guiYuanRate` | **0.902** | 0.904 | **−0.002** | `[0.89, 0.95]` | **带内** |
| 先手胜率 `p1WinRate` | **0.544** | 0.504 | **+0.040** | `[0.47, 0.51]` | **带外**（高于上界 0.51） |
| 500 局堆增量 `heapUsedDeltaMB` | **3.08**（7 次中位数，区间 2.92–3.30） | 3.50（7 次中位数，区间 2.99–3.64） | **−0.42** | `< 15` | **带内**（差值落在 GC 噪声内） |

同口径的其余派生量（仅供对照，不是护栏）：

| 指标 | 改动后 | 基线 | 差值 |
| --- | --- | --- | --- |
| 后手胜率 `p2WinRate` | 0.456 | 0.496 | −0.040 |
| 流局率 `drawRate` | 0.098 | 0.096 | +0.002 |
| 平均大回合 `avgRounds` | 18.06 | 19.47 | −1.41 |
| `avgP1Score` / `avgP2Score` | 5692.85 / 5484.72 | 4901.51 / 4672.29 | +791 / +812 |

堆增量是运行期 `process.memoryUsage().heapUsed` 的端点差，随 GC 时点漂移：本机冷启动首测读到
1.07 MB，稳定后单次读数落在 2.92–3.64 MB，故取 7 次中位数；它与 15 MB 上界相距一个数量级，
带内结论不依赖取哪一次读数。

**逐条结论**：归元率带内（0.902 ∈ [0.89, 0.95]）；先手胜率**带外**（0.544 > 0.51，且 2000 局口径下
0.5455 同向）；堆增量带内。三条里只有先手胜率破了带。

与工单 02 自报快照（`NOTES/burst-plus-two-recon.md` §5c：归元率 0.902、先手 0.544、堆 1.52MB）比较：
归元率与先手胜率**一致**，堆增量不同（本文 3.08MB）——该差异是 GC 噪声，不影响任何结论。

## 6. 遗留红灯与后续入口

本票把 `tests/core/experiment-runner.test.ts` 的「基线复现」钉值按实测重录（归元率 91.40% → 91.05%、
平均大回合 19.27 → 17.78、先手胜率 52.20% → 54.55%），它是表征钉，不是护栏。
其余平衡红灯**按 spec 范围留红**，统一由后续票
`.scratch/burst-plus-two/issues/05-balance-retune-after-burst-plus-two.md` 收口：

| 红灯 | 实测 vs 带 / 期望 |
| --- | --- |
| `tests/core/ai-evaluator-benchmark-guardrails.test.ts`（护栏推演） | 先手胜率 0.544 > 上界 0.51 |
| `tests/core/candidate-validation.test.ts`（生产配置标准 3） | 同上，`guardrails.passed === false` |
| `tests/core/candidate-validation.test.ts`（标准 1 独立失败用例） | 关闭进度定价后不再出现严格占优者「激进压制」（`strictDominators` 为空） |
| `tests/core/dominance-regression-guard.test.ts`（不存在严格占优） | 「激进压制」重新对全部对手严格占优 |
| `tests/core/dominance-regression-guard.test.ts`（关键翻转格） | 「平衡 对 激进压制」期望 52.80%、实测 40.20%（容差 3.16%） |

这些是规则改动的真实平衡后果（爆发收益被双级作用抬高，见 spec「受影响的既有结论」对 ADR 0002
的提示），不是管道失真；处理方式属于平衡阶段，不在本 spec 内。

# 护栏与关键规格溯源表 (Guardrail & Spec Provenance)

本文件由工单 03「判据与文档溯源对表」产出。它逐条给出每条护栏与每项关键规格的**出处**、**量测口径**（回合单位 / AI 类型 / 种子数 / 样本量）与**是否仍然有效**，并显式标出互相冲突或**无法比较**的条目。本文件只做溯源与记录，不改游戏规则、不改代码行为。

> **术语约定**
>
> - **回合单位**：一律使用 `GLOSSARY.md` 的**大回合 (`Round`)** = 先手半回合 + 后手半回合 = **2 次行动机会**。标准对局上限为 **30 大回合 = 60 次行动机会**。
> - **无法比较**：两条数字即使量纲相同（如都是归元率），若量测所用的 AI、回合单位或样本口径不同，也不能互相代入判断。凡出现「无法比较」，即表示**禁止**把两条数字直接比大小或互相代换。
> - 历史文档（ADR 0001 / ADR 0002）成文时 `round` 按「每名玩家行动一次 +1」计数；其「60 回合」= 今日 30 大回合。该换算见两份 ADR 的「术语说明」节（提交 `a6a0b17`）。

---

## 1. 护栏与关键规格

### 1.1 平衡护栏

| # | 条目 | 出处 | 量测口径（回合 / AI / 种子 / 样本） | 现状 | 是否仍有效 |
| --- | --- | --- | --- | --- | --- |
| G1a | 同水平归元率带 **25%–80%** | `docs/adr/0001-unity-rate-guardrails.md:16-17` | 60 次行动机会（=30 大回合）；**搜索深度 1/2 自对弈**（偏分 / 偏点亮三组权重）；200 种子；交换先手 | 只对其量测 AI 有效；**与 G1b 无法比较** | 有效（口径限定为搜索深度 1/2） |
| G1b | 同水平归元率带 **75%–95%** | `tests/core/ai-evaluator-benchmark-guardrails.test.ts:207-208` | 30 大回合（`maxRounds` 默认 30）；**`balancedStrategy` 自对弈（启发式预设，非搜索）**；默认 `baseSeed=10000`；500 局 | live（`npm test` 每次执行）；**无 ADR 记录**；**与 G1a 无法比较** | live 有效；**无 ADR 背书** |
| G2 | 强弱对阵强方胜率 **≥65%** | `docs/adr/0001-unity-rate-guardrails.md:18`；`docs/adr/0002-attack-buff-and-rarity-nerf.md:36` | 60 次行动机会（=30 大回合）；**搜索深度 1/2 自对弈**；200 种子；2400 局（含交换先手） | 无 live 断言 | 有效（口径限定为搜索深度 1/2） |
| G3a | 先手胜率 95% 置信区间不更偏离 50% | `docs/adr/0001-unity-rate-guardrails.md:19`；`docs/adr/0002-attack-buff-and-rarity-nerf.md:37` | 同上（搜索深度 1/2，200 种子） | 无 live 断言 | 有效（口径限定为搜索深度 1/2） |
| G3b | 先手胜率带 **p1 ∈ [0.45, 0.55]** | `tests/core/ai-evaluator-benchmark-guardrails.test.ts:211-212` | 30 大回合；`balancedStrategy` 启发式自对弈；`baseSeed=10000`；500 局 | live | live 有效；**无 ADR**；与 G3a 口径不同，**无法比较** |
| G4 | 500 局堆内存增量 **< 15MB** | `tests/core/ai-evaluator-benchmark-guardrails.test.ts:215` | 30 大回合；500 局 | live | 有效（工程护栏，非平衡护栏） |

> **注（工单 03 / ppf）：** 上表 G1b / G3b 记录的是本表成文时的 live 带（**当时的带**）。
> 该带已由后续工单 02 / 03 收紧为 归元率 `[0.89, 0.95]`、先手胜率 `[0.47, 0.51]`
> （锚点 90.40% / 50.40%），并成为 CLI 判据与 live 测试共用的**唯一定义**
> （`src/core/headless/GuardrailBand.ts`）。此处保留原值不改写。

### 1.2 测量、基线与决策记录

| # | 条目 | 出处 | 量测口径（回合 / AI / 种子 / 样本） | 现状 | 是否仍有效 |
| --- | --- | --- | --- | --- | --- |
| M1 | 基线复现：归元率 **≈88.64%** / 平均大回合 **≈20.20** / 先手胜率 **≈52.02%**（容差 ≤1.5pp） | Spec Testing Decisions；`docs/headless/low-state-redirect-experiment.md:40,53,140,146`；`docs/adr/0010:15` | 30 大回合；`balancedStrategy` 自对弈；`baseSeed=10000`；每格 5000 局 | 数值有效；**live 断言已恢复**（工单 06，`tests/core/experiment-runner.test.ts:212`） | 有效 |
| M2 | 天命揭牌频率（揭牌合计 33.32%；先手先归元时秒结 38.6% / 揭牌 61.4%；先手胜 52.44%） | `docs/adr/0009:20-40` | 30 大回合；`balancedStrategy` 自对弈；`baseSeed=10000`；10,000 局（复核 3 种子 × 3,000 局） | 测量记录（非护栏） | 有效 |
| M3 | 变体 B 否决（`full` 平衡归元率 21.18%；`off` 基线 88.64%） | `docs/adr/0010:13-47` | 30 大回合；启发式预设自对弈；`baseSeed=10000`；每格 5000 局；对拼 6×5 有序对 × 2000 局、座次平衡 | 决策记录（证伪记录保留于 `low-state-redirect-experiment.md`） | 有效 |
| M4 | 攻击强化 2.5× 硬编码 + 爆发稀有度剥夺 | `docs/adr/0002:11-28`；`src/core/logic/ScoreCalculator.ts:47-84` | 60 次行动机会（=30 大回合）；搜索深度 1/2 自对弈；200 种子；2400 局 | 生产默认 `POINTS_CONFIG` | 配置有效；稀有度加成在 TS 核心已定义但**生产路径未调用**（见 §3，记录给计分死代码工单） |
| M5 | 计分表：GDD §2.1 与实现 | `docs/GDD.md` §2.1；`src/core/logic/ScoreCalculator.ts:47-84` | — | 本票已把 GDD 表改齐实现（见 §3） | 已修 |

### 1.3 测试基础设施断言（口径陷阱与不变量）

| # | 条目 | 出处 | 量测口径 | 现状 | 是否仍有效 |
| --- | --- | --- | --- | --- | --- |
| T1 | 压制口径陷阱：加持 2 → 点亮 1 必须记为 **1 次削弱**，不得按「未点亮侧数」记 0 | Spec Testing Decisions；工单 02 | 等级下降量口径（`measureBoardDiff`） | **live**（工单 02，`tests/core/metric-definitions.test.ts:24`） | 有效 |
| T2 | 任何「占优」结论必须同时给出跨策略对拼矩阵（含座次平衡） | Spec Testing Decisions / User Story 7 | 守卫 `assertDominanceVerdictHasMatrix` | **live**（工单 02，`tests/core/metric-definitions.test.ts:61`） | 有效 |
| T3 | 单独输出流局率时必须附带先后手胜率 | Spec User Story 8 | 守卫 `assertDrawRatePaired` / `formatDrawRateWithWinRates` | **live**（工单 02，`tests/core/metric-definitions.test.ts:104`） | 有效 |
| T4 | 注入链路验证：改旋钮必须能观察到至少一项输出变化 | Spec Implementation Decision 5；工单 04 | 逐注入点「改值 → 输出变化」+「静默忽略证明」 | **live**（工单 04，`tests/core/injection-path-verification.test.ts`、`tests/core/headless-config-injection.test.ts`） | 有效 |
| T5 | 座次平衡对称性：A 对 B 与 B 对 A 的座次平衡胜率互补 | Spec Implementation Decision 8 | 对拼矩阵座次平衡 | **live**（工单 06，`tests/core/experiment-runner.test.ts:282`） | 有效 |
| T6 | 种子确定性：同种子同决策序列产出同结果 | `tests/core/headless-benchmark.test.ts:112-132`；`tests/core/headless.test.ts:17-27` | 50 局 / `baseSeed=99999`；单局 / seed 8888 | live | 有效 |
| T7 | 指标守恒：`p1+p2+draws=局数`；`guiYuan+maxRounds=局数` | `tests/core/headless-benchmark.test.ts:22,27` | 100 局 / `baseSeed=10000` / `maxRounds=60`（测试用非标准上限，标准为 30 大回合） | live | 有效 |

---

## 2. 冲突与「无法比较」条目（含处置建议）

> 处置选项：**修文档** / **修测试** / **补 ADR** / **保留并注明不可比较**。凡需先决定游戏方向者，工单 03 只记录、不决定，交工单 11；工单 11 的处置结果见 `docs/adr/0011-balance-route-fix-rules.md`，逐条落在 C1–C3、C7。

### C1. 归元率两条带：25%–80% vs 75%–95% — **无法比较**

- **冲突**：`ADR 0001` 的 25%–80% 与 live 测试的 75%–95% 区间几乎不重叠，且上界从 80% 被抬到 95%。
- **为何无法比较**：
  - AI 类型不同：ADR 0001 用**搜索深度 1/2 自对弈**；测试用**启发式预设 `balancedStrategy`**。
  - 记录状态不同：测试带**没有任何 ADR** 记录其来源与变更理由。
  - 数字本身不可互推：启发式预设的归元率显著高于搜索型 AI，因此 88.64% 落在测试带内、却超出 ADR 0001 的 80% 上界。
- **处置（已由 ADR 0011 结清）**：**两条带都保留、互不代换**。ADR 0001 的 25%–80% 只在搜索深度 1/2 口径下有效、当前无 live 断言，作为历史护栏保留；live 的 75%–95% 是启发式预设口径、当前 `npm test` 实际执行的红线，其出处与口径由 ADR 0011「决策 2」正式记录，不再「无 ADR」。两条带 AI 口径不同，**禁止互相代入比较**。这些带描述的是规则改动前的现状，后续规则改动后须复跑重设。

### C2. 强弱对阵 ≥65% — **无法比较（口径限定）**

- **出处**：`ADR 0001:18`、`ADR 0002:36`。
- **为何无法比较**：该阈值只在**搜索深度 1/2 自对弈、200 种子、2400 局**口径下量测（`ADR 0002` PASS 证据）。live 测试用启发式预设，**未断言**强弱对阵胜率，两者不可互证。
- **处置（已由 ADR 0011 结清）**：**保留并注明不可比较**；该阈值只在搜索深度 1/2 口径下有效。本轮不重建启发式等价护栏，理由与后续重设要求见 ADR 0011「决策 2」与「后果 1」。

### C3. 先手胜率：95% CI（搜索）vs [0.45, 0.55]（启发式）— **无法比较**

- **出处**：`ADR 0001:19`、`ADR 0002:37`（95% CI）；`tests/core/ai-evaluator-benchmark-guardrails.test.ts:211-212`（区间带）。
- **为何无法比较**：CI 来自搜索深度 1/2 自对弈；区间带来自启发式预设自对弈。二者 AI 口径不同。测试带本身**无 ADR**。
- **处置（已由 ADR 0011 结清）**：**保留并注明不可比较**。测试带作为启发式口径的 live 红线，其口径由 ADR 0011「决策 2」记录；不得用它验证或否决 ADR 0001 护栏 3。

### C4. GDD 计分表 vs 实现 `POINTS_CONFIG` — **已修文档**

- **冲突**：`docs/GDD.md` §2.1 旧表与 `src/core/logic/ScoreCalculator.ts:47-84` 相差 1.5×–10×，且遗漏稀有度加成与 ADR 0002 的 2.5× 攻击强化。
- **处置**：**修文档**。GDD §2.1 已改为与 `POINTS_CONFIG` 一致，并补上稀有度加成（`RARITY_MULTIPLIER = 1.5`、`NO_RARITY_ACTIONS` 黑名单）与敌方状态破坏（`CAUSE_DMG` / `BREAK_LIGHT` / `WEAKEN`，ADR 0002）两套机制。详见 §3。
- **残留（已由 ADR 0011 处置）**：`ScoreCalculator.ts` 仍存在第三份真相 `DEFAULT_SCORE_CONFIG`（旧简化接口，生产路径未用），且 `applyRarityBonus` 在 TS 核心定义了但**生产路径未调用**；另有 legacy JS 计分路径（`legacy/src/state/StateScoreRecorder.js`，含稀有度取整，见 `docs/headless/headless-rule-baseline.md`）。工单 05 的旋钮普查把稀有度整条链标为死参数；ADR 0011「决策 3」维持「接线或删除另立工单」，并已同步 `docs/GDD.md` §2.1 注明该机制未接线。

### C5. 测试注释/标题与断言不符 — **已修测试（注释层）**

- **冲突**：`ai-evaluator-benchmark-guardrails.test.ts:197,206` 写「80%~95%」，断言（`:207-208`）却是 0.75–0.95。
- **处置**：**修测试注释与标题**（不改变任何断言或行为），改为 75%~95%，并注明与 ADR 0001 的 25%–80% 无法比较。

### C6. ADR 0002「第 30 回合」的单位残留歧义 — **已修 ADR（追加勘误）**

- **冲突**：`ADR 0002:42` 的「在第 30 回合分数与点亮进展发生背离」在 `a6a0b17` 的术语说明中未被覆盖：其「回合」仍是旧单位，与 ADR 0009 / 0010 使用新单位（30 大回合）的「回合」同形异义。
- **处置**：**修 ADR**（按追加勘误惯例，不改历史决策）。已在 ADR 0002「术语说明」节追加一条：该「第 30 回合」= 第 30 次行动机会 = 今日**第 15 大回合**（中盘），与原文「中盘背离」定位一致。

### C7. 测量台基线与口径陷阱断言已恢复为 live — **已结清**

- **冲突**：Spec Testing Decisions 要求的基线复现、压制口径陷阱、注入验证、占优附对拼矩阵等断言，随 `3232601` 回退测量台一并删除；HEAD 上只有 G1b/G3b/G4/T6/T7 是 live。
- **处置（已结清）**：测量台为永久基础设施（Spec 政策 22/23），这些断言已由工单 01–10 恢复为 live（见本表 §1.2 M1、§1.3 T1–T5 的现状列）。`npm test` 全绿、工作区无残留，已由工单 11 复核。

---

## 3. 本票直接修复的内容

| 修复 | 文件 | 类型 |
| --- | --- | --- |
| GDD §2.1 计分表对齐 `POINTS_CONFIG`：ACTION（CONVERT 50 / TRANS 30 / ATK 40 / BURST 100 / BURST_ATK 80 / AUTO 0 / DISSIPATE 0 / PASS 0）；STATE_CHANGE（REPAIR_DMG 200 / LIGHT_UP 100 / BLESSING 200 / CAUSE_DMG 阳300阴250 / BREAK_LIGHT 阳200阴150 / WEAKEN 200）；补稀有度加成 `RARITY_MULTIPLIER = 1.5` 与 ADR 0002 的 2.5× 攻击强化说明 | `docs/GDD.md` | 修文档 |
| ADR 0002 术语说明追加「第 30 回合 = 第 15 大回合」的残留单位歧义澄清 | `docs/adr/0002-attack-buff-and-rarity-nerf.md` | 修 ADR（追加勘误） |
| 护栏测试标题/注释从「80%~95%」改为「75%~95%」，并注明无 ADR、与 ADR 0001 无法比较 | `tests/core/ai-evaluator-benchmark-guardrails.test.ts` | 修测试（注释层，不改断言） |
| 本溯源表 | `docs/headless/guardrail-provenance.md` | 新增文档 |

## 4. 交工单 11 的四项：处置结果（已由 ADR 0011 结清）

1. **归元率权威带**：两条带**都保留、互不代换**。启发式带（**当时的带** 75%–95%）是本表成文时唯一的 live 红线，其出处与口径由 `docs/adr/0011-balance-route-fix-rules.md`「决策 2」正式记录；ADR 0001 的 25%–80% 作为搜索深度 1/2 口径的历史护栏保留，无 live 断言。
2. **强弱对阵 ≥65%**：维持搜索深度 1/2 口径，本轮不重建启发式等价护栏。
3. **先手胜率 [0.45, 0.55]（当时的带）**：作为启发式口径的 live 红线保留，口径由 ADR 0011「决策 2」记录。
4. **测量台断言恢复**：基线复现、三条口径陷阱、注入链路验证、座次平衡对拼矩阵断言均已恢复为 live 且全绿（见 §1.2 M1、§1.3 T1–T5）。

> 上述护栏带描述的是**规则改动前的现状**，不是新游戏的目标值。ADR 0011 决定路线为「修规则」；规则改动落地后必须用测量台复跑并重设全部护栏带。

> 计分模块死代码 / 第三份计分真相（`DEFAULT_SCORE_CONFIG`、未调用的 `applyRarityBonus`、legacy JS 路径）不在本溯源表处置范围；工单 05 旋钮普查已将其列为死参数，ADR 0011「决策 3」维持「接线或删除另立工单」。

# 动作价值普查 (Action Value Census)

> Ticket 03 / spec `dominance-guard-and-route-fix`。本文是「每一个行为都有价值」的可复跑证伪记录。
> 判定「被支配」用**动作价值**（`ActionEvaluator.evaluate`），不是胜率；压制度量沿用等级下降量口径。
>
> **工单 06 采纳进度定价后重新生成**（生产 `POINTS_CONFIG.ATTACK_PROGRESS_SCALE = { floor: 0.3, span: 0.9 }`）；
> 改动前的 Ticket 03 版本留在 git 历史中（本次采纳只重跑同一工具，不改判定口径）。
> 结论：`globallyDominated` 仍为空——采纳后每个动作仍在某个被测盘面下成为（并列）最优。
>
> **口径（先读，两条）。** ①**白送的最优**：AUTO / DISSIPATE / PASS 的「最优」全部来自该盘面上它们是唯一可用动作（`ActionCandidates.ts:98,110,197`；`Strategy.ts:172-173` 对单候选短路、不调用估值器），真正有竞争的最优判定只来自 ATK / BURST / BURST_ATK / TRANS / CONVERT 五个动作。②**度量的性质**：本价值函数是 **AI 自身的估值函数**（`ActionEvaluator.evaluate`），不是游戏的真实价值；它回答「AI 怎么看」，不回答「客观上哪个动作最好」。
>
> 复跑命令：`npm run benchmark:action-value-census`

## 动作价值普查

### 价值函数（口径）

- 名称：`ActionEvaluator.evaluate（动作价值 = 盘面启发式 + 规则得分）`
- 定义：动作价值 = repairScore + unityScore + suppressionScore + burstScore + scoreDeltaPoints + biasScore；其中 scoreDeltaPoints 是规则计分分量，其余为盘面分量。价值是动作层度量，与胜率无关。
- 输入：GameState / TianGanInfo / ActionPayload（由 getAvailableActions 枚举） / StrategyWeights / PointsConfig / RuleSwitches
- 计分配置：POINTS_CONFIG（生产默认）
- board-only：关闭
- 并列容差 epsilon：1e-9
- **度量的性质**：本价值是 **AI 自身的估值函数**（`ActionEvaluator.evaluate`），不是游戏的真实价值；可辩护的口径是「AI 怎么看就怎么打」，但读数时须记住它不是博弈论意义上的真实价值。

> 判定「被支配」用的是**动作价值**，不是胜率：同一盘面上某动作价值严格低于另一个可用动作即为该盘面下被支配；
> 若它在所有可用观测上都被支配，则为全局被支配。并列（价值差 <= epsilon）不算支配。

### 全局被支配动作

**无**——每个可用动作都在某个被测盘面状态下成为（并列）最优选择。

### 逐动作类型结论

| 动作类型 | 可用 | 观测数 | 最优盘面数 | 被支配盘面数 | 全局被支配 |
| --- | --- | ---: | ---: | ---: | --- |
| AUTO | 是 | 48 | 9 | 0 | 否 |
| CONVERT | 是 | 6 | 6 | 0 | 否 |
| TRANS | 是 | 33 | 3 | 6 | 否 |
| ATK | 是 | 20 | 2 | 4 | 否 |
| BURST | 是 | 54 | 6 | 6 | 否 |
| BURST_ATK | 是 | 40 | 5 | 5 | 否 |
| DISSIPATE | 是 | 6 | 3 | 0 | 否 |
| PASS | 是 | 2 | 1 | 0 | 否 |

### 每个动作成为（并列）最优的盘面条件

#### AUTO

- 最优盘面：low-state/plain、low-state/target-blessed、low-state/opponent-all-damaged、midgame/plain、midgame/target-blessed、midgame/opponent-all-damaged、endgame/plain、endgame/target-blessed、endgame/opponent-all-damaged
- 观测：low-state/plain@甲、low-state/plain@乙、low-state/plain@丙、low-state/plain@丁、low-state/plain@戊、low-state/plain@己、low-state/plain@庚、low-state/plain@辛、low-state/plain@壬、low-state/plain@癸、low-state/target-blessed@甲、low-state/target-blessed@乙 …（共 48 条）

#### CONVERT

- 最优盘面：midgame/plain、midgame/target-blessed、midgame/opponent-all-damaged、endgame/plain、endgame/target-blessed、endgame/opponent-all-damaged
- 观测：midgame/plain@己、midgame/target-blessed@己、midgame/opponent-all-damaged@己、endgame/plain@癸、endgame/target-blessed@癸、endgame/opponent-all-damaged@癸

#### TRANS

- 最优盘面：kangji/plain、kangji/target-blessed、kangji/opponent-all-damaged
- 观测：kangji/plain@丁、kangji/plain@己、kangji/plain@辛、kangji/target-blessed@丁、kangji/target-blessed@己、kangji/target-blessed@辛、kangji/opponent-all-damaged@丁、kangji/opponent-all-damaged@己、kangji/opponent-all-damaged@辛
- 被支配盘面：midgame/plain、midgame/target-blessed、midgame/opponent-all-damaged、endgame/plain、endgame/target-blessed、endgame/opponent-all-damaged

#### ATK

- 最优盘面：kangji/plain、kangji/target-blessed
- 观测：kangji/plain@丙、kangji/plain@戊、kangji/plain@庚、kangji/plain@壬、kangji/target-blessed@丙、kangji/target-blessed@戊、kangji/target-blessed@庚、kangji/target-blessed@壬
- 被支配盘面：midgame/plain、midgame/target-blessed、endgame/plain、endgame/target-blessed

#### BURST

- 最优盘面：midgame/plain、midgame/target-blessed、midgame/opponent-all-damaged、endgame/plain、endgame/opponent-all-damaged、kangji/opponent-all-damaged
- 观测：midgame/plain@甲、midgame/plain@乙、midgame/plain@丙、midgame/plain@丁、midgame/target-blessed@丙、midgame/target-blessed@丁、midgame/opponent-all-damaged@甲、midgame/opponent-all-damaged@乙、midgame/opponent-all-damaged@丙、midgame/opponent-all-damaged@丁、endgame/plain@戊、endgame/plain@己 …（共 23 条）
- 被支配盘面：midgame/target-blessed、endgame/plain、endgame/target-blessed、kangji/plain、kangji/target-blessed、kangji/opponent-all-damaged

#### BURST_ATK

- 最优盘面：midgame/target-blessed、endgame/plain、endgame/target-blessed、kangji/plain、kangji/target-blessed
- 观测：midgame/target-blessed@甲、midgame/target-blessed@乙、endgame/plain@甲、endgame/plain@乙、endgame/plain@丙、endgame/plain@丁、endgame/plain@庚、endgame/plain@辛、endgame/target-blessed@甲、endgame/target-blessed@乙、endgame/target-blessed@丙、endgame/target-blessed@丁 …（共 18 条）
- 被支配盘面：midgame/plain、midgame/target-blessed、endgame/plain、kangji/plain、kangji/target-blessed

#### DISSIPATE

- 最优盘面：kangji/plain、kangji/target-blessed、kangji/opponent-all-damaged
- 观测：kangji/plain@甲、kangji/plain@乙、kangji/target-blessed@甲、kangji/target-blessed@乙、kangji/opponent-all-damaged@甲、kangji/opponent-all-damaged@乙

#### PASS

- 最优盘面：kangji/opponent-all-damaged
- 观测：kangji/opponent-all-damaged@壬、kangji/opponent-all-damaged@癸

### 被测盘面覆盖

阶段：low-state / midgame / endgame / kangji

阶跃条件：plain / target-blessed / opponent-all-damaged

| 盘面 | 阶段 | 阶跃条件 | 行动方盘面 | 对手盘面 |
| --- | --- | --- | --- | --- |
| low-state/plain | 低位态期 | 无附加条件 | `WOOD(0,0) FIRE(0,0) EARTH(0,0) METAL(0,0) WATER(0,0)` | `WOOD(0,0) FIRE(0,0) EARTH(0,0) METAL(0,0) WATER(0,0)` |
| low-state/target-blessed | 低位态期 | 目标侧为加持 | `WOOD(0,0) FIRE(0,0) EARTH(0,0) METAL(0,0) WATER(0,0)` | `WOOD(2,2) FIRE(2,2) EARTH(2,2) METAL(2,2) WATER(2,2)` |
| low-state/opponent-all-damaged | 低位态期 | 对手全道损 | `WOOD(0,0) FIRE(0,0) EARTH(0,0) METAL(0,0) WATER(0,0)` | `WOOD(-1,-1) FIRE(-1,-1) EARTH(-1,-1) METAL(-1,-1) WATER(-1,-1)` |
| midgame/plain | 中盘 | 无附加条件 | `WOOD(1,1) FIRE(1,1) EARTH(2,0) METAL(0,0) WATER(0,0)` | `WOOD(1,1) FIRE(1,1) EARTH(2,0) METAL(0,0) WATER(0,0)` |
| midgame/target-blessed | 中盘 | 目标侧为加持 | `WOOD(1,1) FIRE(1,1) EARTH(2,0) METAL(0,0) WATER(0,0)` | `WOOD(2,2) FIRE(2,2) EARTH(2,2) METAL(2,2) WATER(2,2)` |
| midgame/opponent-all-damaged | 中盘 | 对手全道损 | `WOOD(1,1) FIRE(1,1) EARTH(2,0) METAL(0,0) WATER(0,0)` | `WOOD(-1,-1) FIRE(-1,-1) EARTH(-1,-1) METAL(-1,-1) WATER(-1,-1)` |
| endgame/plain | 残局 | 无附加条件 | `WOOD(1,1) FIRE(1,1) EARTH(1,1) METAL(1,1) WATER(1,-1)` | `WOOD(1,1) FIRE(1,1) EARTH(1,1) METAL(1,1) WATER(1,-1)` |
| endgame/target-blessed | 残局 | 目标侧为加持 | `WOOD(1,1) FIRE(1,1) EARTH(1,1) METAL(1,1) WATER(1,-1)` | `WOOD(2,2) FIRE(2,2) EARTH(2,2) METAL(2,2) WATER(2,2)` |
| endgame/opponent-all-damaged | 残局 | 对手全道损 | `WOOD(1,1) FIRE(1,1) EARTH(1,1) METAL(1,1) WATER(1,-1)` | `WOOD(-1,-1) FIRE(-1,-1) EARTH(-1,-1) METAL(-1,-1) WATER(-1,-1)` |
| kangji/plain | 亢极态 | 无附加条件 | `WOOD(2,2) FIRE(1,1) EARTH(1,1) METAL(1,1) WATER(1,1)` | `WOOD(2,2) FIRE(1,1) EARTH(1,1) METAL(1,1) WATER(1,1)` |
| kangji/target-blessed | 亢极态 | 目标侧为加持 | `WOOD(2,2) FIRE(1,1) EARTH(1,1) METAL(1,1) WATER(1,1)` | `WOOD(2,2) FIRE(2,2) EARTH(2,2) METAL(2,2) WATER(2,2)` |
| kangji/opponent-all-damaged | 亢极态 | 对手全道损 | `WOOD(2,2) FIRE(1,1) EARTH(1,1) METAL(1,1) WATER(1,1)` | `WOOD(-1,-1) FIRE(-1,-1) EARTH(-1,-1) METAL(-1,-1) WATER(-1,-1)` |

### 逐盘面价值排序（按天干）

#### low-state/plain（低位态期 × 无附加条件）

| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 甲 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 乙 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 丙 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 丁 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 戊 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 己 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 庚 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 辛 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 壬 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 癸 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |

#### low-state/target-blessed（低位态期 × 目标侧为加持）

| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 甲 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 乙 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 丙 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 丁 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 戊 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 己 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 庚 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 辛 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 壬 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 癸 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |

#### low-state/opponent-all-damaged（低位态期 × 对手全道损）

| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 甲 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 乙 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 丙 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 丁 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 戊 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 己 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 庚 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 辛 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 壬 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |
| 癸 | AUTO | 140 | 40 | 100 | 虚空 0 | 点亮 1 | 是 |

#### midgame/plain（中盘 × 无附加条件）

| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 甲 | BURST | 347 | 47 | 300 | 虚空 0 | 点亮 1 | 是 |
| 甲 | BURST_ATK | 274 | 62 | 212 | 点亮 1 | 虚空 0 |  |
| 甲 | ATK | 216 | 44 | 172 | 点亮 1 | 虚空 0 |  |
| 乙 | BURST | 347 | 47 | 300 | 虚空 0 | 点亮 1 | 是 |
| 乙 | BURST_ATK | 274 | 62 | 212 | 点亮 1 | 虚空 0 |  |
| 乙 | TRANS | 259 | 29 | 230 | 虚空 0 | 点亮 1 |  |
| 丙 | BURST | 429 | 169 | 260 | 虚空 0 | 点亮 1 | 是 |
| 丙 | BURST_ATK | 367 | 122 | 245 | 点亮 1 | 虚空 0 |  |
| 丙 | ATK | 309 | 104 | 205 | 点亮 1 | 虚空 0 |  |
| 丁 | BURST | 429 | 169 | 260 | 虚空 0 | 点亮 1 | 是 |
| 丁 | TRANS | 376 | 186 | 190 | 虚空 0 | 点亮 1 |  |
| 丁 | BURST_ATK | 367 | 122 | 245 | 点亮 1 | 虚空 0 |  |
| 戊 | AUTO | 346 | 186 | 160 | 虚空 0 | 点亮 1 | 是 |
| 己 | CONVERT | 396 | 186 | 210 | 虚空 0 | 点亮 1 | 是 |
| 己 | TRANS | 184 | 54 | 130 | 虚空 0 | 点亮 1 |  |
| 庚 | AUTO | 154 | 54 | 100 | 虚空 0 | 点亮 1 | 是 |
| 辛 | AUTO | 154 | 54 | 100 | 虚空 0 | 点亮 1 | 是 |
| 壬 | AUTO | 154 | 54 | 100 | 虚空 0 | 点亮 1 | 是 |
| 癸 | AUTO | 154 | 54 | 100 | 虚空 0 | 点亮 1 | 是 |

#### midgame/target-blessed（中盘 × 目标侧为加持）

| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 甲 | BURST_ATK | 382 | 62 | 320 | 点亮 1 | 虚空 0 | 是 |
| 甲 | BURST | 347 | 47 | 300 | 虚空 0 | 点亮 1 |  |
| 甲 | ATK | 324 | 44 | 280 | 点亮 1 | 虚空 0 |  |
| 乙 | BURST_ATK | 382 | 62 | 320 | 点亮 1 | 虚空 0 | 是 |
| 乙 | BURST | 347 | 47 | 300 | 虚空 0 | 点亮 1 |  |
| 乙 | TRANS | 259 | 29 | 230 | 虚空 0 | 点亮 1 |  |
| 丙 | BURST | 429 | 169 | 260 | 虚空 0 | 点亮 1 | 是 |
| 丙 | BURST_ATK | 382 | 62 | 320 | 点亮 1 | 虚空 0 |  |
| 丙 | ATK | 324 | 44 | 280 | 点亮 1 | 虚空 0 |  |
| 丁 | BURST | 429 | 169 | 260 | 虚空 0 | 点亮 1 | 是 |
| 丁 | BURST_ATK | 382 | 62 | 320 | 点亮 1 | 虚空 0 |  |
| 丁 | TRANS | 376 | 186 | 190 | 虚空 0 | 点亮 1 |  |
| 戊 | AUTO | 346 | 186 | 160 | 虚空 0 | 点亮 1 | 是 |
| 己 | CONVERT | 396 | 186 | 210 | 虚空 0 | 点亮 1 | 是 |
| 己 | TRANS | 184 | 54 | 130 | 虚空 0 | 点亮 1 |  |
| 庚 | AUTO | 154 | 54 | 100 | 虚空 0 | 点亮 1 | 是 |
| 辛 | AUTO | 154 | 54 | 100 | 虚空 0 | 点亮 1 | 是 |
| 壬 | AUTO | 154 | 54 | 100 | 虚空 0 | 点亮 1 | 是 |
| 癸 | AUTO | 154 | 54 | 100 | 虚空 0 | 点亮 1 | 是 |

#### midgame/opponent-all-damaged（中盘 × 对手全道损）

| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 甲 | BURST | 347 | 47 | 300 | 虚空 0 | 点亮 1 | 是 |
| 乙 | BURST | 347 | 47 | 300 | 虚空 0 | 点亮 1 | 是 |
| 乙 | TRANS | 259 | 29 | 230 | 虚空 0 | 点亮 1 |  |
| 丙 | BURST | 429 | 169 | 260 | 虚空 0 | 点亮 1 | 是 |
| 丁 | BURST | 429 | 169 | 260 | 虚空 0 | 点亮 1 | 是 |
| 丁 | TRANS | 376 | 186 | 190 | 虚空 0 | 点亮 1 |  |
| 戊 | AUTO | 346 | 186 | 160 | 虚空 0 | 点亮 1 | 是 |
| 己 | CONVERT | 396 | 186 | 210 | 虚空 0 | 点亮 1 | 是 |
| 己 | TRANS | 184 | 54 | 130 | 虚空 0 | 点亮 1 |  |
| 庚 | AUTO | 154 | 54 | 100 | 虚空 0 | 点亮 1 | 是 |
| 辛 | AUTO | 154 | 54 | 100 | 虚空 0 | 点亮 1 | 是 |
| 壬 | AUTO | 154 | 54 | 100 | 虚空 0 | 点亮 1 | 是 |
| 癸 | AUTO | 154 | 54 | 100 | 虚空 0 | 点亮 1 | 是 |

#### endgame/plain（残局 × 无附加条件）

| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 甲 | BURST_ATK | 389 | 156 | 233 | 点亮 1 | 虚空 0 | 是 |
| 甲 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 甲 | ATK | 331 | 138 | 193 | 点亮 1 | 虚空 0 |  |
| 乙 | BURST_ATK | 389 | 156 | 233 | 点亮 1 | 虚空 0 | 是 |
| 乙 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 乙 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |
| 丙 | BURST_ATK | 389 | 156 | 233 | 点亮 1 | 虚空 0 | 是 |
| 丙 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 丙 | ATK | 331 | 138 | 193 | 点亮 1 | 虚空 0 |  |
| 丁 | BURST_ATK | 389 | 156 | 233 | 点亮 1 | 虚空 0 | 是 |
| 丁 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 丁 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |
| 戊 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 | 是 |
| 戊 | BURST_ATK | 309 | 76 | 233 | 点亮 1 | 虚空 0 |  |
| 戊 | ATK | 251 | 58 | 193 | 点亮 1 | 虚空 0 |  |
| 己 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 | 是 |
| 己 | BURST_ATK | 309 | 76 | 233 | 点亮 1 | 虚空 0 |  |
| 己 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |
| 庚 | BURST_ATK | 389 | 156 | 233 | 点亮 1 | 虚空 0 | 是 |
| 庚 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 庚 | ATK | 331 | 138 | 193 | 点亮 1 | 虚空 0 |  |
| 辛 | BURST_ATK | 389 | 156 | 233 | 点亮 1 | 虚空 0 | 是 |
| 辛 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 辛 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |
| 壬 | AUTO | 348 | 148 | 200 | 虚空 0 | 点亮 1 | 是 |
| 癸 | CONVERT | 398 | 148 | 250 | 虚空 0 | 点亮 1 | 是 |
| 癸 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |

#### endgame/target-blessed（残局 × 目标侧为加持）

| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 甲 | BURST_ATK | 396 | 76 | 320 | 点亮 1 | 虚空 0 | 是 |
| 甲 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 甲 | ATK | 338 | 58 | 280 | 点亮 1 | 虚空 0 |  |
| 乙 | BURST_ATK | 396 | 76 | 320 | 点亮 1 | 虚空 0 | 是 |
| 乙 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 乙 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |
| 丙 | BURST_ATK | 396 | 76 | 320 | 点亮 1 | 虚空 0 | 是 |
| 丙 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 丙 | ATK | 338 | 58 | 280 | 点亮 1 | 虚空 0 |  |
| 丁 | BURST_ATK | 396 | 76 | 320 | 点亮 1 | 虚空 0 | 是 |
| 丁 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 丁 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |
| 戊 | BURST_ATK | 396 | 76 | 320 | 点亮 1 | 虚空 0 | 是 |
| 戊 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 戊 | ATK | 338 | 58 | 280 | 点亮 1 | 虚空 0 |  |
| 己 | BURST_ATK | 396 | 76 | 320 | 点亮 1 | 虚空 0 | 是 |
| 己 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 己 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |
| 庚 | BURST_ATK | 396 | 76 | 320 | 点亮 1 | 虚空 0 | 是 |
| 庚 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 庚 | ATK | 338 | 58 | 280 | 点亮 1 | 虚空 0 |  |
| 辛 | BURST_ATK | 396 | 76 | 320 | 点亮 1 | 虚空 0 | 是 |
| 辛 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 |  |
| 辛 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |
| 壬 | AUTO | 348 | 148 | 200 | 虚空 0 | 点亮 1 | 是 |
| 癸 | CONVERT | 398 | 148 | 250 | 虚空 0 | 点亮 1 | 是 |
| 癸 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |

#### endgame/opponent-all-damaged（残局 × 对手全道损）

| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 甲 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 | 是 |
| 乙 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 | 是 |
| 乙 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |
| 丙 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 | 是 |
| 丁 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 | 是 |
| 丁 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |
| 戊 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 | 是 |
| 己 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 | 是 |
| 己 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |
| 庚 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 | 是 |
| 辛 | BURST | 361 | 61 | 300 | 虚空 0 | 点亮 1 | 是 |
| 辛 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |
| 壬 | AUTO | 348 | 148 | 200 | 虚空 0 | 点亮 1 | 是 |
| 癸 | CONVERT | 398 | 148 | 250 | 虚空 0 | 点亮 1 | 是 |
| 癸 | TRANS | 273 | 43 | 230 | 虚空 0 | 点亮 1 |  |

#### kangji/plain（亢极态 × 无附加条件）

| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 甲 | DISSIPATE | 10035 | 10035 | 0 | 虚空 0 | 虚空 0 | 是 |
| 乙 | DISSIPATE | 10035 | 10035 | 0 | 虚空 0 | 虚空 0 | 是 |
| 丙 | ATK | 10365 | 10145 | 220 | 点亮 1 | 虚空 0 | 是 |
| 丙 | BURST_ATK | 423 | 163 | 260 | 点亮 1 | 虚空 0 |  |
| 丙 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 丁 | TRANS | 10280 | 10050 | 230 | 虚空 0 | 点亮 1 | 是 |
| 丁 | BURST_ATK | 423 | 163 | 260 | 点亮 1 | 虚空 0 |  |
| 丁 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 戊 | ATK | 10365 | 10145 | 220 | 点亮 1 | 虚空 0 | 是 |
| 戊 | BURST_ATK | 423 | 163 | 260 | 点亮 1 | 虚空 0 |  |
| 戊 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 己 | TRANS | 10280 | 10050 | 230 | 虚空 0 | 点亮 1 | 是 |
| 己 | BURST_ATK | 423 | 163 | 260 | 点亮 1 | 虚空 0 |  |
| 己 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 庚 | ATK | 10345 | 10065 | 280 | 点亮 1 | 虚空 0 | 是 |
| 庚 | BURST_ATK | 403 | 83 | 320 | 点亮 1 | 虚空 0 |  |
| 庚 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 辛 | TRANS | 10280 | 10050 | 230 | 虚空 0 | 点亮 1 | 是 |
| 辛 | BURST_ATK | 403 | 83 | 320 | 点亮 1 | 虚空 0 |  |
| 辛 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 壬 | ATK | 10365 | 10145 | 220 | 点亮 1 | 虚空 0 | 是 |
| 壬 | BURST_ATK | 423 | 163 | 260 | 点亮 1 | 虚空 0 |  |
| 癸 | BURST_ATK | 423 | 163 | 260 | 点亮 1 | 虚空 0 | 是 |

#### kangji/target-blessed（亢极态 × 目标侧为加持）

| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 甲 | DISSIPATE | 10035 | 10035 | 0 | 虚空 0 | 虚空 0 | 是 |
| 乙 | DISSIPATE | 10035 | 10035 | 0 | 虚空 0 | 虚空 0 | 是 |
| 丙 | ATK | 10345 | 10065 | 280 | 点亮 1 | 虚空 0 | 是 |
| 丙 | BURST_ATK | 403 | 83 | 320 | 点亮 1 | 虚空 0 |  |
| 丙 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 丁 | TRANS | 10280 | 10050 | 230 | 虚空 0 | 点亮 1 | 是 |
| 丁 | BURST_ATK | 403 | 83 | 320 | 点亮 1 | 虚空 0 |  |
| 丁 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 戊 | ATK | 10345 | 10065 | 280 | 点亮 1 | 虚空 0 | 是 |
| 戊 | BURST_ATK | 403 | 83 | 320 | 点亮 1 | 虚空 0 |  |
| 戊 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 己 | TRANS | 10280 | 10050 | 230 | 虚空 0 | 点亮 1 | 是 |
| 己 | BURST_ATK | 403 | 83 | 320 | 点亮 1 | 虚空 0 |  |
| 己 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 庚 | ATK | 10345 | 10065 | 280 | 点亮 1 | 虚空 0 | 是 |
| 庚 | BURST_ATK | 403 | 83 | 320 | 点亮 1 | 虚空 0 |  |
| 庚 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 辛 | TRANS | 10280 | 10050 | 230 | 虚空 0 | 点亮 1 | 是 |
| 辛 | BURST_ATK | 403 | 83 | 320 | 点亮 1 | 虚空 0 |  |
| 辛 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 壬 | ATK | 10345 | 10065 | 280 | 点亮 1 | 虚空 0 | 是 |
| 壬 | BURST_ATK | 403 | 83 | 320 | 点亮 1 | 虚空 0 |  |
| 癸 | BURST_ATK | 403 | 83 | 320 | 点亮 1 | 虚空 0 | 是 |

#### kangji/opponent-all-damaged（亢极态 × 对手全道损）

| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 甲 | DISSIPATE | 10035 | 10035 | 0 | 虚空 0 | 虚空 0 | 是 |
| 乙 | DISSIPATE | 10035 | 10035 | 0 | 虚空 0 | 虚空 0 | 是 |
| 丙 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 | 是 |
| 丁 | TRANS | 10280 | 10050 | 230 | 虚空 0 | 点亮 1 | 是 |
| 丁 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 戊 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 | 是 |
| 己 | TRANS | 10280 | 10050 | 230 | 虚空 0 | 点亮 1 | 是 |
| 己 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 庚 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 | 是 |
| 辛 | TRANS | 10280 | 10050 | 230 | 虚空 0 | 点亮 1 | 是 |
| 辛 | BURST | 368 | 68 | 300 | 虚空 0 | 点亮 1 |  |
| 壬 | PASS | 10035 | 10035 | 0 | 虚空 0 | 虚空 0 | 是 |
| 癸 | PASS | 10035 | 10035 | 0 | 虚空 0 | 虚空 0 | 是 |


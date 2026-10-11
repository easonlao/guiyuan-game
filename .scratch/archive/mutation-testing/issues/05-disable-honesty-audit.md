# 05: 审计变异测试「100%」的诚实性（阶段 3a 过度 disable）

**Type:** task

**Blocked by:** 02

**Status:** resolved

**What to build:** 审计对象：`src/core/logic/**` 的 `// Stryker disable`（阶段 3a，commit `515140a`）、门禁脚本、以及阶段 3b（`eaee33a`）的「真 bug」断言。 方法：静态逐条判定 + **实验**——把仓库拷贝到 `/tmp/audit` 并**删掉全部 71 条 disable 注释**，重跑一次全量 Stryker（1072 突变体 / 42 分钟），把结果与仓库内报告 `reports/mutation/mutation.json` 的 150 条 `Ignored` 按（文件+行+列+mutator+replacement）精确对齐。

## Answer

### 关键量化结论

| 指标 | 数值 | 来源 |
|---|---|---|
| 仓库内报告突变体总数 | 1073（Killed 922 / Timeout 1 / Ignored 150 / Survived 0 / NoCoverage 0） | `reports/mutation/mutation.json` |
| `// Stryker disable` 指令数 | 71 | `grep -rn "Stryker disable" src/core/logic/` |
| 被 disable 的突变体 | 150 | 同上报告 `Ignored` |
| **去掉 disable 后重跑：150 条 Ignored 的真实状态** | **Survived 58 / NoCoverage 55 / Killed 35 / Timeout 1** | `/tmp/audit/reports/mutation/mutation.json` |
| 其中「若进入生产会改变可观测行为」却被 disable 的（over-broad） | **35 条，分布在 27 处** | 见审计 1 |

即：**150 条 disable 里有 35 条其实杀得掉**（测试能抓住），disable 只是把它们从计分里拿掉；真正的 100% = 922/923 是在**扣掉这 150 条**（其中 113 条确实测不到）之后算出来的。这 113 条里，经逐条判定**没有一条是非等价**（详见审计 1），所以没有「把真 bug 静默掉」的实例；但 35 条 disable 的理由不成立，属过度 disable。

---

### 审计 1：逐条检查 `src/core/logic/**` 的 `// Stryker disable`

#### 1.1 机制核查（先排掉两个可能的「过度」来源）

- **不是块级 disable。** `// Stryker disable next-line X` 由 `directive-bookkeeper.ts` 的 `IgnoreRule(line=node.loc.start.line)` 实现，只命中紧随其后那个节点起始行。我把 71 条指令与报告里 `Ignored` 的位置做了 1:1 核对：**每条指令请求的 mutator 都在下一行产出了对应 `Ignored`，且没有一条指令漏配/错名/无 mutant**。所以「StringLiteral 成片 disable 连带禁掉别的字符串逻辑」**不成立**（每条只影响一行一个 mutator）。
- **mutator 语义**（`conditional-expression-mutator.ts`）：`if (cond)` 的**整条条件**会同时产出 `→true` 与 `→false`；而 `&&`/`||` 的**单个操作数**只产出对侧一个（`&&` 的操作数只产 `→true`）。这决定了下面「一个 disable 同时覆盖等价方向与非等价方向」的系统性问题。

#### 1.2 重点：disable 了「若进生产会改变可观测行为」的突变体（35 条 / 27 处）

这些位置**同时**禁掉了等价方向与**非等价方向**。注释只论证了等价方向，非等价方向被顺手禁掉。实验证明这 35 条在去 disable 后**都被现有测试杀掉**（所以不是当前测试缺口），但：

- 注释理由**不成立**（把「半边等价」写成「不可达/等价」）；
- disable 会**永久移除门禁对这段行为的敏感度**——日后若对应测试被改动/删除，门禁不会再报。

| file:line:col | mutator → replacement | 注释理由（节选） | 判定 |
|---|---|---|---|
| `ActionCandidates.ts:120:7` | ConditionalExpression → `false` | 「前面已对 stemLevel<=0 提前返回，此处置信恒真（等价）」 | **存疑**：只证了 `→true`；`→false` 会跳过整个中位态动作块（候选列表从 CONVERT/ATK/TRANS 变成 PASS），非等价 |
| `ActionResolver.ts:121:13` | ConditionalExpression → `true` | 「入参校验失败返回经候选补齐后不可达」 | **存疑**：只证了 `→false`（守卫体不可达）；`→true` 会让 AUTO 恒返回错误，非等价 |
| `ActionResolver.ts:130:13` | ConditionalExpression → `true`；EqualityOperator → `prevLevel < 2` | 「prevLevel===2 时两分支状态与分数等价」 | **存疑**：`→true` 会让 AUTO 在 prevLevel<2 时不再提升等级，非等价 |
| `ActionResolver.ts:147:13` | ConditionalExpression → `true` | 同上（CONVERT 守卫） | **存疑** |
| `ActionResolver.ts:171:13` | ConditionalExpression → `true` | 同上（TRANS 守卫） | **存疑** |
| `ActionResolver.ts:181:13` | EqualityOperator → `prevLevel >= 2`；ConditionalExpression → `false` | 「prevLevel===2 时 clamp 与计分同样为 2/0，真值分支与 < 等价」 | **存疑**：`→false`（`if(false)`）会让 TRANS 在 prevLevel<2 时完全不提升目标节点，非等价 |
| `ActionResolver.ts:194:13` | ConditionalExpression → `true` | 同上（ATK 守卫） | **存疑** |
| `ActionResolver.ts:219:13` | ConditionalExpression → `true` | 「候选列表为 BURST 必带 sourceElement，此守卫不可达」 | **存疑** |
| `ActionResolver.ts:252:13` | ConditionalExpression → `true` | 同上（BURST_ATK 守卫） | **存疑** |
| `ActionResolver.ts:292:13` | ConditionalExpression → `true` | 同上（DISSIPATE 守卫） | **存疑** |
| `ActionResolver.ts:335:9` | ConditionalExpression → `false`；EqualityOperator → `guiYiDelta <= 0` | 「guiYiDelta===0 时累加 0，> 与 >= 等价」 | **存疑**：只证了 `→true`/`>=`；`→false` 会丢掉归一里程碑分，非等价 |
| `ActionResolver.ts:409:15` | ConditionalExpression → `true`；EqualityOperator → `finalActiveScore <= finalOpponentScore` | 「此分支 activePlayerId 恒为 P2，与平局兜底 winner='P2' 等价」 | **存疑**：只证了 `→false`/`<=`；`→true` 会把「对手分更高」误判成 P2 胜，非等价 |
| `EventBus.ts:71:9` | ConditionalExpression → `false` | 「off 仅经注册时返回的闭包调用，handlers 恒存在，此守卫为防御（生产不可达）」 | **存疑**：`off` 是 public 方法；`→false`（永不 delete）会让退订失效，非等价 |
| `ScoreCalculator.ts:162:9` | ConditionalExpression → `true` | 「prevLevel===newLevel 时后续各分支均不命中、末尾同样返回 0，提前返回被完全吸收（等价）」 | **存疑**：只证了 `→false`；`→true` 会让所有非等价等级跃迁都返回 0 分，非等价 |
| `State.ts:179:9` | ConditionalExpression → `true` / `false` | 「上一分支已对 YIN 返回，能走到这里 targetPolarity 必为 YANG（等价）」 | **存疑**：这句只证了**同列的操作数** `targetPolarity===YANG`→true；整条 `if` 的 `→true`（对 yin≠2 也返回 true）与 `→false`（yin==2 也返回 false）都非等价 |
| `State.ts:179:45` | ConditionalExpression → `true` | 同上 | **存疑**：`board[...].yin===2`→true 使条件退化为 `targetPolarity===YANG`（此处恒真），非等价 |
| `State.ts:193:7` | EqualityOperator → `level > -1` | 「level === -1 时 < 与 <= 同样返回 -1（等价）」 | **存疑**：只证了 `<`；`> -1` 对 `level<-1` 会原样返回 -2，非等价（`clampNodeLevel(-2)` 生产可达） |
| `State.ts:195:7` | EqualityOperator → `level < 2` | 「level === 2 时 > 与 >= 同样返回 2（等价）」 | **存疑**：只证了 `>`；`< 2` 对 `level>2` 会返回 3，非等价（`clampNodeLevel(3)` 生产可达） |
| `State.ts:225:9` | EqualityOperator → `yinDelta <= 0` | 「yinDelta === 0 时累加 0，> 与 >= 等价」 | **存疑**：只证了 `>=`；`<= 0` 对 yinDelta>0/<0 都错，非等价 |
| `State.ts:228:9` | EqualityOperator → `yinDelta >= 0`；ConditionalExpression → `false` | 「仅在 yinDelta === 0 发散且累加 -0，等价」 | **存疑**：`>= 0`/`false` 会让压制量丢失，非等价 |
| `State.ts:232:9` | EqualityOperator → `yangDelta <= 0` | 同 225 | **存疑** |
| `State.ts:235:9` | EqualityOperator → `yangDelta >= 0`；ConditionalExpression → `false` | 同 228 | **存疑** |
| `TurnManager.ts:177:13` | ConditionalExpression → `false` | 「success 蕴含 getUnlightedSide 非 null，此守卫恒真（等价）」 | **存疑**：只证了 `→true`；`→false` 会跳过「点亮最后一侧」的盘面更新，非等价 |
| `TurnManager.ts:298:8` | ConditionalExpression → `true` / `false` | 「连动时候选列表已过滤爆发动作，BURST_ATK 分支与候选校验冗余（等价）」 | **存疑**：`→true` 会在非连动时也拒绝爆发，非等价 |
| `TurnManager.ts:333:9` | ConditionalExpression → `true` | 「候选列表已校验合法性，匹配上的动作 resolve 恒成功，此防线不可达（等价）」 | **存疑**：只证了 `→false`；`→true` 会让所有成功动作提前 return，非等价 |
| `TurnManager.ts:347:11` | ConditionalExpression → `false` | 「wasExtraTurn 为 false 时置 false 无差异，为 true 时与原分支一致（等价）」 | **存疑**：只证了 `→true`；`→false` 会让连动锁不复位，非等价 |
| `TurnManager.ts:422:9` | ConditionalExpression → `true` | 「startTurn 恒产出至少一个候选（含 PASS 兜底），此无动作分支不可达」 | **存疑**：只证了 `→false`；`→true` 会恒走「无可用动作」兜底，非等价 |

> 说明：上表 35 条**全部被现有测试杀掉**（去 disable 后状态为 `Killed`），因此**不是当前测试缺口、不是现网 bug**；问题是「注释理由不成立 + 过度 disable 削弱了门禁敏感度」。

#### 1.3 判定为「成立」的 disable（其余 115 条）

- **恒真操作数**（`State.ts:151/160/162` 的 `tianGan.polarity ===/!== targetPolarity`、`board[...] >= 1`，`State.ts:179:9` 的第一个操作数）：去 disable 后 `→true` 存活，验证确为恒真、等价。✓
- **生产不可达的防御守卫体**（`ActionResolver` 各 case 的 `if (!element/!sourceElement)` 返回体、`state.lockedGuiYuan ?? {...}` 兜底、`if (!success)` 兜底、`TurnManager` 的 `if (!result.success)`、`if (!actionToExecute)` 兜底）：去 disable 后多为 **NoCoverage（55 条）**，即任何测试都没执行到——确属死/防御分支。✓
- **不可观测文案**（`message` 的 StringLiteral）：全部无测试断言、无生产消费者读取 `ActionResult.message`（唯一读 `.message` 的是 `cli.ts` 读 `Error.message`）。特别核对：**真正被断言的文案没有被 disable**——`TurnManager.ts:269`（`'对局已结束'`，被 `turn-manager.test.ts:141` 断言）与 `TurnManager.ts:416`（`'终轮天命揭牌决胜已完成'`，被 `smart-sudden-death:509` 断言）在报告中都是 **Killed**，未 disable。✓
- **被吸收的分支体**（`ActionResolver.ts:425/430` 的 `BlockStatement {}`、`TurnManager.ts:188`、`ScoreCalculator.ts:162:33`）：分支体赋的值与初值相同，等价。✓
- **常量吸收**（`ActionResolver.ts:126` 的 `+=`→`-=`，因 `ACTION.AUTO=0`；`TurnManager.ts:166` 的 `winner` 初值必被覆盖）：等价。✓
- **OptionalChaining**（`state.currentTianGan?.x` 等）：`payload.x || ...` 左侧恒有值，短路使右侧永不求值，等价。✓

#### 1.4 去掉 disable 后仍存活的 58 条——逐条判定：**全部等价/不可观测**（无「非等价存活」）

核对要点（其余同 1.3）：

- `State.ts:175:9` 有两个同键 `ConditionalExpression → true`：整条 `if` 的 `→true` 被 **Killed**，第一个操作数 `targetPolarity === YANG` 的 `→true` **Survived**（恒真，等价）。二者同列不同节点，报告里各一条，已区分。
- `ActionResolver.ts:115/135/156/175/198/228/263:13` 的 `→false`：守卫体不可达，`→false` 等价。
- `TurnManager.ts:293:50`（BURST_ATK 操作数→false）：仅对「连动中强行 BURST_ATK」改变拒绝文案，状态不变，等价。
- `EventBus.ts:70:9`（`off` 守卫→true）：仅当对未注册事件调 `off` 时才发散，内部路径等价。
- 其余为文案 / 恒真操作数 / 被吸收分支。

**审计 1 结论**：没有发现「非等价突变体存活」被 disable 掩盖的实例；但发现 **35 条理由不成立、过度 disable**（1.2 表）。

---

### 审计 2：门禁是否诚实

1. **`mutation-baseline.jsonl` = 0 条：是真的没有存活/无覆盖。**
   - 文件只有 5 行注释头，无记录；`git log` 显示由 `eaee33a` 从 `reports/mutation/mutation.json` 重建（223→0）。
   - 该报告（`reports/mutation/mutation.json`，18:48，晚于 `eaee33a`）本身为全量：`config.mutate = ["src/core/logic/**/*.ts","!src/core/logic/index.ts"]`，状态 Killed 922 / Timeout 1 / Ignored 150 / **Survived 0 / NoCoverage 0**。
   - **交叉验证**：去 disable 重跑，113 条存活/无覆盖**全部命中**原报告的 `Ignored` 集合（0 条落在集合外）→ 报告与 disable 集合自洽，不是「刷空」。
   - 但要注意：0 条**不等于**「测试全覆盖」。它是「扣掉 113 条显式忽略后的 0」。文档 §3.3 已如实披露。**风险点**：报告 `reports/` 被 gitignore、不入库，0 存活无法从仓库本身复现（须重跑约 42 分钟）。

2. **`scripts/mutation-check.mjs` + `scripts/lib/mutation-baseline-core.mjs` 实测退出码**（用临时报告）：

   | 输入 | 期望 | 实测 |
   |---|---|---|
   | 全量报告、0 存活 | 0 | **0** ✓ |
   | 子集报告（`config.mutate` 只有 `State.ts`） | 2 | **2** ✓（提示「棘轮只对全量跑有效」） |
   | `{}` | 2 | **2** ✓ |
   | `files:{}`（0 mutant） | 2 | **2** ✓ |
   | `files:{"a":{mutants:42}}` | 2 | **2** ✓ |
   | 顶层数组 `[]` | 2 | **2** ✓ |
   | 注入一条新 `Survived` | 1 | **1** ✓ |
   | 缺报告 / 缺基线 | 2 | **2** ✓ |

   防护确实会拒绝，方向也都安全。**两处小缺口**（非阻塞）：
   - `scripts/mutation-baseline.mjs` 用的是**宽松**读报告 `readReportEntries`，不是 `readReportEntriesStrict`，也不调用 `assertReportIsFullRun`；文档（§4/快速上手）甚至明说可以「先 `mutation:changed` 再 `mutation:baseline`」。即**基线可以用子集/坏报告重刷**。所幸后果是「基线变小 → check 把更多条目当新增 → 退出 1」，方向安全；但与 `check` 拒绝子集报告的严格性不一致。
   - 空/坏报告会把基线写成空（同样失败安全）。

3. **`stryker.config.json`**：`mutate = ["src/core/logic/**/*.ts","!src/core/logic/index.ts"]` ✓；`coverageAnalysis:"off"` 字段**保留** ✓。**但实测该字段并未真正生效**：`@stryker-mutator/vitest-runner@10` 的 `dryRun()` 无条件 `readMutantCoverage()`，Stryker 的 `TestCoverage.hasCoverage`（=`!!mutantCoverage.static`）因此为真，报告里每个 mutant 都带 `coveredBy`（Killed 样本长度为 1），且出现了 55 条 `NoCoverage`。即**实际跑的是 per-test 覆盖**。这有两个含义：(a) `_comment` 里「coverageAnalysis 必须为 off，否则 perTest 退化」的说法与实测不符；(b) 门禁把 `NoCoverage` 纳入棘轮**是有意义的**（不是结构性恒 0）。

4. **`patches/@stryker-mutator+vitest-runner+10.0.0.patch` 仍生效**：`node_modules/.../stryker-setup.js` 与 `test-helpers.js` 均为 `nameParts.join(' > ')`；`npx patch-package --error-on-fail` **退出 0**。✓

---

### 审计 3：4 条「真 bug」断言

**实验验证**（在 `/tmp/audit2` 施加突变后跑对应测试文件）：

1. **`State.getUnlightedSide` count≥2 返回非 null**：把 `return count === 1 ? unlighted : null` 改成 `return true ? unlighted : null` → `state.test.ts` **失败**（`expected {element:'WATER',polarity:'yang'} to be null`）。断言**钉住**了行为 ✓。
   - 生产可达性 ✓：`createEmptyBoard()`（初始盘，10 侧全未点亮）与对局中的 2 侧未点亮盘都可构造；`getUnlightedSide` 的调用方 `canTianGanLightUnlightedSide`（`State.ts:135`）、`TurnManager.startTurn` 天命揭牌（`TurnManager.ts:175`）、`HeadlessMatch.run`（`src/core/headless/HeadlessMatch.ts:258`）都是生产路径。该 bug 会改变天命揭牌胜负，确为真 bug。
2. **`EventBus.on` 双注册丢监听**：把 `if (!this.listeners.has(event))` 改成 `if (true)` → `event-bus.test.ts` **失败**（第一个 handler 未被调用）。断言**钉住**了行为 ✓。
   - 可达性**有限** ⚠：全仓 `src/` 内同一 `EventBus` 实例上**没有**对同一事件注册两个 handler 的调用点（`TerminalBoardViewer` 注册 5 个**不同**事件；`game-manager.ts:103` 注册 1 个）。所以这是**公开 API 契约层面的真 bug**（`on` 的返回值约定「可退订、多监听共存」），当前生产路径**未实际触发**。断言仍应保留（防回归）。
3. `State.ts:50` 初始 `lockedGuiYuan` 形状、4. `ActionResolver.ts:389` P2 归元胜 `extraTurn===false`：对应突变体在报告中均为 **Killed**（`State.ts:47/50/51/52`、`ActionResolver.ts:389/390/392`），断言有效 ✓。

---

### 三类清单

#### 必须处理
- **无「非等价存活被掩盖」的实例。** 去 disable 重跑，113 条存活/无覆盖逐条判定全部等价/不可观测/死分支，无真 bug 被静默。

#### 存疑（建议处理，非阻塞）
1. **35 条过度 disable（1.2 表，27 处）**：注释只论证了等价方向，却把 `ConditionalExpression`/`EqualityOperator` 的另一（非等价）方向一并禁掉。建议二选一：把 disable 收窄到仅等价方向（去掉 `ConditionalExpression`、只留 `EqualityOperator` 或反之），或改写注释明确「另一方向由测试 `X` 覆盖」。现状虽不掩盖 bug，但**永久降低了门禁对这段行为的敏感度**，且让「150 条等价」的说法失真（实际仅 ~113 条测不到）。
2. **`stryker.config.json` 的 `coverageAnalysis:"off"` 名不副实**：实测 vitest-runner 仍提供 per-test 覆盖（`coveredBy` 非空、出现 55 条 `NoCoverage`）。`_comment` 与 `docs/MUTATION-TESTING.md` §2.1/§3 的相关解释需要订正（否则读者会以为跑的是「全测试打每个突变体」）。
3. **`mutation-baseline.mjs` 用宽松读报告且不校验全量**：与 `mutation:check` 拒绝子集报告的严格性不一致；文档还默许 `mutation:changed → mutation:baseline`。建议 `baseline` 也走 `readReportEntriesStrict` + `assertReportIsFullRun`（或明确记录「子集重刷会导致基线变小、check 噪声变大」）。
4. **`EventBus.on` 双注册**是公开 API 契约 bug，但当前无生产调用点触发；文档/注释若称其为「生产 bug」宜改为「契约 bug」。

#### 可接受
- **`mutation-baseline.jsonl` = 0 条**：与报告、disable 集合自洽，非错误刷空；文档 §3.3 已如实披露 100% 的来源。
- **门禁退出码防护**：全量/子集/空/坏报告/新增存活/缺文件 6 类场景实测退出码 0/2/2/2/2/1 全部符合文档。
- **`mutate` 范围与 patch**：`src/core/logic/**`（排除 `index.ts`）保持不变；patch 生效且 `patch-package --error-on-fail` 退出 0。
- **`next-line` disable 的粒度**：71 条指令与 `Ignored` 一一对应，无块级/跨行误伤；被测试真正断言的文案（`TurnManager.ts:269/416`）未被 disable。
- **4 条「真 bug」断言**：均钉住行为（1、2 已实验复现，3、4 在报告中为 Killed）。

### 复现命令
```bash
# 1) 去 disable 重跑全量（约 42 分钟）
mkdir -p /tmp/audit && tar -cf - --exclude=./node_modules --exclude=./.git \
  --exclude=./.codegraph --exclude=./legacy --exclude=./minigame --exclude=./reports . \
  | (cd /tmp/audit && tar -xf -)
ln -s "$PWD/node_modules" /tmp/audit/node_modules
find /tmp/audit/src/core/logic -name '*.ts' | xargs sed -i '/Stryker disable/d'
(cd /tmp/audit && npx stryker run)   # 报告：/tmp/audit/reports/mutation/mutation.json
# 2) 门禁退出码
node scripts/mutation-check.mjs <report.json> <baseline.jsonl>
# 3) 单条突变体验证（例）
#   将 State.ts 的 `return count === 1 ? unlighted : null` 改为 `return true ? unlighted : null`
npx vitest run tests/core/state.test.ts
```

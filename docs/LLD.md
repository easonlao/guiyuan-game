# 归元弈 (Guiyuan) - LLD (详细设计文档)

> **归属**：本文档唯一拥有**数据格式与类型契约**（状态结构、动作载荷、模块间接口签名、不可变性约定）。规则机制与取值见 `docs/GDD.md`，需求与验收见 `docs/SRS.md`，架构与包拓扑见 `docs/HLD.md`。
>
> **类型定义真源是 `src/core/types/domain.ts`**。本文档只写字段语义与契约约定，不复制代码——手抄的代码块一定会与真源漂移。

## 1. 架构范式: 纯数据驱动 (Data-Driven / Immutable)

基于 `HLD.md` 中 AI-First 的原则以及对无头推演的强需求，核心逻辑层（Layer 1）采用**纯数据驱动（Immutable State）**。
* **数据与逻辑分离**：状态（State）仅为只读的普通数据对象（Plain Data Objects），不包含任何业务方法。
* **状态不可变性（Immutability）**：所有动作指令都会通过纯函数生成全新的状态树，不直接在原状态上做修改。极大地方便了 AI 推演树的克隆、分支模拟与状态回滚。

## 2. 核心状态数据结构 (State Data Models)

类型定义真源：`src/core/types/domain.ts`。本节只说明各结构的语义与不变式，字段与类型以该文件为准。

**通用约定**：所有结构必须可 JSON 序列化（无函数、无类实例、无循环引用）——这是确定性回放与无头推演分支模拟的前提。

### 2.1 游戏总状态 (`GameState`)

| 字段 | 语义 | 约定 |
| --- | --- | --- |
| `round` / `maxRounds` | 当前大回合与上限 | 上限取值归规则侧（GDD §2.1） |
| `currentPlayer` | 当前行动方 | 半回合切换；爆发连动时不变 |
| `players` | 双方 `PlayerState` 只读映射 | 双方各自持有独立棋盘，互不引用 |
| `currentTianGan` | 本半回合抽取的天干 | 天干池与极性映射见 `TIAN_GAN_LIST` |
| `isGameOver` / `winner` / `endReason` | 终局标志、胜方、终局原因 | 三者必须同时写入；`endReason` 只取 `GUI_YUAN` / `MAX_ROUNDS` |
| `lockedGuiYuan` | 归元锁定标记 | 供终轮天命揭牌判定使用（ADR 0007 / ADR 0009） |

### 2.2 棋盘与节点 (`BoardState` / `NodeData`)

- `BoardState` 是 `WuXing` → `NodeData` 的只读映射，固定五个元素；
- `NodeData` 的阴、阳两侧取 `NodeLevel`；
- **`NodeLevel` 是 `-1 | 0 | 1 | 2` 的联合类型，不是 `number`**——越界在类型层就被挡住，取值语义与边界规则见 GDD §2.2。

### 2.3 五行关系常量

`GENERATION_CYCLE`（相生）与 `OVERCOMING_CYCLE`（相克）是**唯一**的生克真源，规则引擎与 AI 都必须从这里取，不得各自硬编码。相生相克序列的设计意图见 GDD §2。

## 3. 核心接口与业务契约

### 3.1 动作类型 (`ActionType` & `ActionPayload`)

- **`ActionType`** 的八个成员与 GDD §2.2 / §2.3 的动作一一对应（吸纳 / 调息 / 化 / 破 / 强化 / 强破 / 亢极散气 / 消散过牌）；枚举名与中文名的对照见 `src/core/types/domain.ts`。
- **`ActionPayload`** 是表现层向核心层提交动作的**唯一载荷格式**：`actionType` + `player` 必填，其余字段（`element` / `targetElement` / `polarity` / `sourceElement` / `consumePolarity`）按动作类型可选。各动作需要哪些字段由 `ActionCandidates` 生成的候选对象决定，表现层不得自行拼装未定义的组合。
- **`ActionResult`** 是解析器回传的唯一结果格式（`nextState` / `success` / `scoreDelta` / `extraTurn` / `message?`）；`scoreDelta` 的取值真源见 GDD §2.1。

### 3.2 动作解析器 (`ActionResolver`) 与回合调度器 (`TurnManager`)
- **`ActionResolver`**：纯函数动作处理器，接收 `GameState` 与 `ActionPayload`，基于轻量增量 Patch 与结构共享返回包含 `nextState`、`scoreDelta` 与 `extraTurn` 的 `ActionResult`。
- **`TurnManager`**：生命周期状态机驱动器，调度抽天干 -> 生成合法候选动作（`ActionCandidates`）-> 校验执行 -> 连动判定 -> 终局检测。

## 4. 与表现层的解耦与交互机制 (EventBus & Scene Graph)

场景树、`InputManager`、`Button` / `Tween` 等表现层架构与包拓扑归 `docs/HLD.md` §2 Layer 3，唯一候选动作的自动流转规则归 `docs/GDD.md` §2.4，本节不复制。

本节只固定**核心层对表现层暴露的契约**（对齐 ADR-0004、ADR-0005 与 ADR-0008）：

1. **只读状态快照**：表现层只能通过 `turnManager.getState()` 获取只读快照，不得直接改写状态对象。
2. **候选动作查询**：表现层通过 `turnManager.getAvailableActions()` 取候选集合；`length === 1` 时的表现行为见 GDD §2.4。
3. **动作提交**：表现层把用户意图包装成 `ActionPayload`，经 `turnManager.executeAction(action)` 提交，核心层返回 `ActionResult`（见 §3.1）。
4. **单向数据流**：状态变更只能由核心层发起并回传新状态，表现层按新快照重新投影，禁止反向写入。
5. **事件通知**：核心层的非状态通知（如 `showdown:draw`）经 `turnManager.getEventBus()` 订阅，表现层只消费、不发布。

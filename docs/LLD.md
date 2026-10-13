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
- **`ActionPayload`** 是表现层向核心层提交动作的**唯一载荷格式**：`actionType` + `player` 必填，其余字段（`element` / `targetElement` / `polarity` / `sourceElement` / `consumePolarity`）按动作类型可选。各动作需要哪些字段由 `ActionCandidates` 生成的候选对象决定，表现层不得自行拼装未定义的组合。**爆发候选（强化 / 强破）不携带 `polarity`（目标侧）**——作用侧由解析器在每次 `±1` 前按阴优先决定（规则见 GDD §2.3），预先钉死没有意义；`polarity` 对吸纳 / 调息 / 化 / 破等其余动作仍然保留，不是字段删除。
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

### 4.1 表现层内部接口契约（法盘双环，ADR 0015）

以下签名是表现层**内部**模块间的契约，与核心层无关；类型真源仍是 `src/minigame/` 下对应文件，此处只固定签名语义。

1. **双盘投影**：`BoardView.update(p1Board: BoardState, p2Board: BoardState)`——同时接收己方盘与对方盘两块快照，一次投影；表现层**不再**按当前行动方切换单一棋盘（ADR 0015 的动机）。
2. **槽位定位**：`BoardView.getSlot(player: PlayerId, element: WuXing, polarity: Polarity): BoardSlotView`——返回指定**某一方**、某元素、某极性槽位的投影视图（含父坐标系下的 `x/y` 与角度），供 `RuneFlightView` 取飞行落点。`player` 决定取内环（己方）还是外环（对方）。
3. **飞行落点**：`RuneFlightView` 的目标坐标来自 `BoardView.getSlot(player, …)`；`ATK`/`BURST_ATK` 作用于对方，其余作用于己方。`GameScene` 比较动作前后只读快照，使用真实发生变化的目标阴阳侧定位；没有目标净变化时不播放目标冲击，`PASS` 原地消散。天命揭牌恒以 P2 与揭牌天干定位，与揭牌前行动方无关。落点回调更新投影，动作结束后进入短暂停留的 `result` 阶段，再交接行动方和天干。`ActionResultView` 保存上一招归属、天干、动作与所有真实阴阳等级变化，跨回合保留，可展开查看；重开时清空。
4. **同心双环语义**：内环恒为己方盘、外环恒为对方盘；外环相对内环逆时针偏移 2 格，每根射线满足「己方克对方」。该几何是契约而非样式（板盘测试按坐标断言）。
5. **候选路径查询**：`BoardView.setActivePaths(paths: readonly BoardActivePath[])` 保留 `(kind, from)` 查询契约（`TRANS`/`BURST` → 相生，`ATK`/`BURST_ATK` → 相克，其余无路径）；盘面不绘制候选连线，避免与状态编码混合。
6. **阴阳与归属投影**：每个节点为一对 S 形太极鱼，左阴、右阳，各自读取该极性等级。等级走亮度阶梯（ADR 0018）：道损为暗化元素色 + 裂纹，虚空为空心（只留元素色淡描边），点亮为元素色实心，加持为元素色实心 + 径向光晕 + 闪点；五行色相只表身份，任何等级都保留元素色描边。节点级状态另占主印外侧一环：归一 = 一圈金环、亢极 = 双层金环（中性金、不脉动，内外两盘一视同仁）。元素名置于鱼形外。内环恒为“你”、外环恒为“天道”，归属由环带的实线 / 虚线与标签承担，不靠整体变暗。盘下方显示双方归元进度与一行状态图例（四个样例统一用木色并标「木示例」）。`BoardView.resize(width, height, bounds?)` 可接收原生顶部胶囊与操作区之间的内容边界；未传边界时保留默认几何。符文中心同步棋盘中心，操作面板重新排版后才计算边界。
7. **操作面板定位**：`ActionBarView.contentHeight` 返回最近一次排版的实测内容高度（按钮总高 + 行间距）；`GameScene` 据此把面板底对齐到安全区底部（`y = height - safeBottom - contentHeight`），不预留固定空高。

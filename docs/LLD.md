# 归元弈 (Guiyuan) - LLD (详细设计文档)

## 1. 架构范式: 纯数据驱动 (Data-Driven / Immutable)

基于 `HLD.md` 中 AI-First 的原则以及对无头推演的强需求，核心逻辑层（Layer 1）采用**纯数据驱动（Immutable State）**。
* **数据与逻辑分离**：状态（State）仅为只读的普通数据对象（Plain Data Objects），不包含任何业务方法。
* **状态不可变性（Immutability）**：所有动作指令都会通过纯函数生成全新的状态树，不直接在原状态上做修改。极大地方便了 AI 推演树的克隆、分支模拟与状态回滚。

## 2. 核心状态数据结构 (State Data Models)

状态被设计为完全支持序列化（如 JSON）的友好结构。

### 2.1 游戏总状态 (`GameState`)
```typescript
export interface GameState {
  readonly round: number;                                    // 当前回合数 (1 ~ 60)
  readonly maxRounds: number;                                // 回合上限 (60)
  readonly currentPlayer: PlayerId;                          // 当前行动玩家 ('P1' | 'P2')
  readonly players: Readonly<Record<PlayerId, PlayerState>>; // 双方玩家状态
  readonly currentTianGan: TianGanInfo | null;               // 本回合抽取的天干
  readonly isGameOver: boolean;                              // 终局标志
  readonly winner: PlayerId | 'DRAW' | null;                 // 获胜方
  readonly endReason: 'GUI_YUAN' | 'MAX_ROUNDS' | null;      // 终局原因
}

export type PlayerId = 'P1' | 'P2';

export interface PlayerState {
  readonly id: PlayerId;
  readonly score: number;                                    // 玩家累计分数
  readonly board: BoardState;                                // 玩家独立五行棋盘
}
```

### 2.2 棋盘与节点状态 (`BoardState` & `NodeData`)
双方各自拥有木、火、土、金、水 5 个五行节点。
```typescript
export type BoardState = Readonly<Record<WuXing, NodeData>>;

export enum WuXing {
  WOOD = 'WOOD',
  FIRE = 'FIRE',
  EARTH = 'EARTH',
  METAL = 'METAL',
  WATER = 'WATER'
}

// 节点状态: 道损 (-1), 虚空 (0), 点亮 (1), 加持 (2)
export type NodeLevel = -1 | 0 | 1 | 2;
export enum Polarity {
  YIN = 'yin',
  YANG = 'yang'
}

export interface NodeData {
  readonly yin: NodeLevel;   // 阴侧状态
  readonly yang: NodeLevel;  // 阳侧状态
}
```

## 3. 核心接口与业务契约

### 3.1 动作类型 (`ActionType` & `ActionPayload`)
对应《GDD》与《HLD》定义的基础动作与爆发动作。
```typescript
export enum ActionType {
  AUTO = 'AUTO',             // 吸纳 (基础吸收)
  CONVERT = 'CONVERT',       // 调息 (同节点内阴阳转移)
  TRANS = 'TRANS',           // 化 (相生路径强化己方)
  ATK = 'ATK',               // 破 (相克路径削弱敌方)
  BURST = 'BURST',           // 强化 (消耗己方归一节点强化相生，连动)
  BURST_ATK = 'BURST_ATK',   // 强破 (消耗己方归一节点削弱敌相克，连动)
}

export interface ActionPayload {
  readonly actionType: ActionType;
  readonly player: PlayerId;
  readonly element?: WuXing;
  readonly targetElement?: WuXing;
  readonly polarity?: Polarity;
  readonly sourceElement?: WuXing;
  readonly consumePolarity?: Polarity;
}
```

### 3.2 动作解析器 (`ActionResolver`) 与回合调度器 (`TurnManager`)
- **`ActionResolver`**：纯函数动作处理器，接收 `GameState` 与 `ActionPayload`，基于轻量增量 Patch 与结构共享返回包含 `nextState`、`scoreDelta` 与 `extraTurn` 的 `ActionResult`。
- **`TurnManager`**：生命周期状态机驱动器，调度抽天干 -> 生成合法候选动作（`ActionCandidates`）-> 校验执行 -> 连动判定 -> 终局检测。

## 4. 与表现层的解耦与交互机制 (EventBus & GameManager)

核心计算层（Layer 1）与表现层（Layer 3）完全解耦：

1. **指令输入**：玩家通过微信小游戏触控点击底部动作按钮，或由 `Strategy.ts` 产生 AI 决策，生成 `ActionPayload`。
2. **状态推进**：通过 `turnManager.executeAction(action)` 驱动核心状态机演进。
3. **事件总线 (`EventBus`)**：核心层抛出生命周期事件（`turn:start`、`action:executed`、`burst:triggered`、`game:over` 等）。
4. **小游戏渲染管线 (`GameManager`)**：Layer 3 订阅事件或轮询状态快照，驱动 2D Canvas 进行程序化像素网格重绘、角色动作切换、生克攻击弹道与战报展示。

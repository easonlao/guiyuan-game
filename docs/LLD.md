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
  readonly round: number;                 // 当前回合数 (如 Max: 60)
  readonly currentPlayerId: PlayerID;     // 当前行动玩家
  readonly players: Record<PlayerID, PlayerState>; // 双方玩家状态
  readonly board: BoardState;             // 棋盘五行节点状态
  readonly status: GameStatus;            // 游戏进程状态 (Playing, Finished)
  readonly winner: PlayerID | null;       // 获胜方
}

export type PlayerID = 'P1' | 'P2';
export type GameStatus = 'PLAYING' | 'FINISHED';

export interface PlayerState {
  readonly id: PlayerID;
  readonly score: number;                 // 玩家当前分数 (用于回合用尽时的判负)
}
```

### 2.2 棋盘与节点状态 (`BoardState` & `NodeState`)
棋盘上每一方各有 5 个五行节点。
```typescript
export interface BoardState {
  // P1 和 P2 各自的五行节点集合
  readonly p1Nodes: Record<WuXing, NodeData>;
  readonly p2Nodes: Record<WuXing, NodeData>;
}

export type WuXing = 'METAL' | 'WOOD' | 'WATER' | 'FIRE' | 'EARTH';

// 节点状态枚举: 道损 (-1), 虚空 (0), 点亮 (1), 加持 (2)
export type NodeLevel = -1 | 0 | 1 | 2;
export type Polarity = 'YIN' | 'YANG';

export interface NodeData {
  readonly element: WuXing;
  readonly yin: NodeLevel;   // 阴极状态
  readonly yang: NodeLevel;  // 阳极状态
}
```

## 3. 核心接口与业务契约

### 3.1 动作类型 (`ActionType` & `ActionPayload`)
对应 `HLD.md` 中定义的基础动作与爆发动作。
```typescript
export enum ActionType {
  AUTO = 'AUTO',             // 吸纳 (回合开始时的自动动作)
  CONVERT = 'CONVERT',       // 调息 (同节点内阴阳转移)
  TRANS = 'TRANS',           // 化 (相生路径强化己方)
  ATK = 'ATK',               // 破 (相克路径削弱敌方)
  BURST = 'BURST',           // 强化 (消耗“归一”节点能量强化己方)
  BURST_ATK = 'BURST_ATK',   // 强破 (消耗“归一”节点能量削弱敌方)
}

export interface ActionPayload {
  readonly type: ActionType;
  readonly sourceElement?: WuXing;  // 发起动作的五行节点
  readonly targetElement?: WuXing;  // 目标五行节点 (如相克时的被攻击方)
  readonly polarity?: Polarity;     // 针对的极性 (调息或强化时可能需要)
}
```

### 3.2 动作解析器 (`ActionResolver`)
它是整个游戏逻辑的心脏，作为一个**纯函数处理器**。它接收当前状态和动作，返回新的状态。
```typescript
export class ActionResolver {
  /**
   * 执行动作并返回新状态
   * @param state 变更前的只读状态
   * @param action 玩家或 AI 提交的动作
   * @returns 全新的游戏状态 (Immutable)
   */
  static execute(state: GameState, action: ActionPayload): GameState;
  
  /**
   * 校验该动作在当前状态下是否合法 (例如：是否越权、是否能量不足)
   */
  static isValid(state: GameState, action: ActionPayload): boolean;
}
```

## 4. 与 Cocos 引擎的交互机制 (EventBus)

因为核心逻辑抛弃了传统的对象内部修改状态并抛出事件的方式，我们需要一个简单的对比机制来派发 UI 事件给 Cocos：

1. **指令输入**：UI 按钮点击 或 AI 决策完成，生成 `ActionPayload`。
2. **状态更新**：调用 `const newState = ActionResolver.execute(oldState, action)`。
3. **Diff 计算与事件派发 (EventBus)**：系统通过比对 `oldState` 和 `newState`，派发具体的颗粒事件。
   * `onNodeLevelChanged(playerId, element, polarity, oldLevel, newLevel)`
   * `onScoreChanged(playerId, newScore)`
   * `onGameFinished(winnerId)`
4. **Cocos 监听器**：Layer 3（视图层）仅仅监听这些纯粹的 UI 表现事件并播放特效，**绝不包含任何业务计算**。

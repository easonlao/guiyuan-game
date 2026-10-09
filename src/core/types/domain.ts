/**
 * 归元弈 (Guiyuan) - 核心领域模型与类型契约
 * 遵循 GLOSSARY.md 与 HLD.md 定义的规范
 */

/** 五行属性 */
export enum WuXing {
  WOOD = 'WOOD',
  FIRE = 'FIRE',
  EARTH = 'EARTH',
  METAL = 'METAL',
  WATER = 'WATER'
}

/** 阴阳极性 */
export enum Polarity {
  YIN = 'yin',
  YANG = 'yang'
}

/**
 * 节点一侧的状态数值 (NodeLevel)
 * -1: 道损 (DAMAGE)
 *  0: 虚空 (VOID)
 *  1: 点亮 (LIT)
 *  2: 加持 (BLESSED)
 */
export type NodeLevel = -1 | 0 | 1 | 2;

export const NodeLevelEnum = {
  DAMAGE: -1 as NodeLevel,
  VOID: 0 as NodeLevel,
  LIT: 1 as NodeLevel,
  BLESSED: 2 as NodeLevel
} as const;

/** 单个五行节点状态 (不可变数据) */
export interface NodeData {
  readonly yin: NodeLevel;
  readonly yang: NodeLevel;
}

/** 棋盘五行节点集合 */
export type BoardState = Readonly<Record<WuXing, NodeData>>;

/** 动作类型 */
export enum ActionType {
  AUTO = 'AUTO',             // 吸纳
  CONVERT = 'CONVERT',       // 调息
  TRANS = 'TRANS',           // 化 (相生)
  ATK = 'ATK',               // 破 (相克)
  BURST = 'BURST',           // 强化 (归一消耗相生)
  BURST_ATK = 'BURST_ATK',   // 强破 (归一消耗相克)
  DISSIPATE = 'DISSIPATE'    // 亢极散气 (满溢回落)
}

/** 玩家代号 */
export type PlayerId = 'P1' | 'P2';

/** 单个玩家状态 */
export interface PlayerState {
  readonly id: PlayerId;
  readonly score: number;
  readonly board: BoardState;
}

/** 十天干定义 */
export interface TianGanInfo {
  readonly name: string;
  readonly element: WuXing;
  readonly polarity: Polarity;
}

/** 十天干枚举映射 */
export const TIAN_GAN_LIST: readonly TianGanInfo[] = [
  { name: '甲', element: WuXing.WOOD, polarity: Polarity.YANG },
  { name: '乙', element: WuXing.WOOD, polarity: Polarity.YIN },
  { name: '丙', element: WuXing.FIRE, polarity: Polarity.YANG },
  { name: '丁', element: WuXing.FIRE, polarity: Polarity.YIN },
  { name: '戊', element: WuXing.EARTH, polarity: Polarity.YANG },
  { name: '己', element: WuXing.EARTH, polarity: Polarity.YIN },
  { name: '庚', element: WuXing.METAL, polarity: Polarity.YANG },
  { name: '辛', element: WuXing.METAL, polarity: Polarity.YIN },
  { name: '壬', element: WuXing.WATER, polarity: Polarity.YANG },
  { name: '癸', element: WuXing.WATER, polarity: Polarity.YIN }
] as const;

/** 五行相生关系: 木生火，火生土，土生金，金生水，水生木 */
export const GENERATION_CYCLE: Readonly<Record<WuXing, WuXing>> = {
  [WuXing.WOOD]: WuXing.FIRE,
  [WuXing.FIRE]: WuXing.EARTH,
  [WuXing.EARTH]: WuXing.METAL,
  [WuXing.METAL]: WuXing.WATER,
  [WuXing.WATER]: WuXing.WOOD
};

/** 五行相克关系: 木克土，土克水，水克火，火克金，金克木 */
export const OVERCOMING_CYCLE: Readonly<Record<WuXing, WuXing>> = {
  [WuXing.WOOD]: WuXing.EARTH,
  [WuXing.EARTH]: WuXing.WATER,
  [WuXing.WATER]: WuXing.FIRE,
  [WuXing.FIRE]: WuXing.METAL,
  [WuXing.METAL]: WuXing.WOOD
};

/** 全局只读游戏状态 */
export interface GameState {
  readonly round: number;
  readonly maxRounds: number;
  readonly currentPlayer: PlayerId;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly currentTianGan: TianGanInfo | null;
  readonly isGameOver: boolean;
  readonly winner: PlayerId | 'DRAW' | null;
  readonly endReason: 'GUI_YUAN' | 'MAX_ROUNDS' | null;
  readonly lockedGuiYuan?: Readonly<Record<PlayerId, boolean>>;
}

/** 动作参数 */
export interface ActionPayload {
  readonly actionType: ActionType;
  readonly player: PlayerId;
  readonly element?: WuXing;
  readonly targetElement?: WuXing;
  readonly polarity?: Polarity;
  readonly sourceElement?: WuXing;
  readonly consumePolarity?: Polarity;
}

/** 动作解析结果 */
export interface ActionResult {
  readonly nextState: GameState;
  readonly success: boolean;
  readonly scoreDelta: number;
  readonly extraTurn: boolean;
  readonly message?: string;
}

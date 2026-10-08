/**
 * src/js/types/models.ts
 * 
 * 归元弈 (Guiyuan) - Core Domain Models
 * 严格遵循 SRS.md 规范的强类型定义
 */

/**
 * 五行元素 (Five Elements)
 */
export enum Element {
    WOOD = 'WOOD',
    FIRE = 'FIRE',
    EARTH = 'EARTH',
    METAL = 'METAL',
    WATER = 'WATER'
}

/**
 * 阴阳极性 (Yin-Yang Polarity)
 */
export enum Polarity {
    YIN = 'YIN',
    YANG = 'YANG'
}

/**
 * 节点侧状态值 (Node Side State Value)
 * 严格约束于 [-1, 2] 区间
 */
export enum NodeStateValue {
    DAMAGED = -1,  // 道损
    VOID = 0,      // 虚空
    LIT = 1,       // 点亮
    EMPOWERED = 2  // 加持
}

/**
 * 玩家动作类型 (Player Action Type)
 */
export enum ActionType {
    AUTO = 'AUTO',             // 吸纳
    CONVERT = 'CONVERT',       // 调息
    TRANS = 'TRANS',           // 化
    ATK = 'ATK',               // 破
    BURST = 'BURST',           // 强化 (消耗阴)
    BURST_ATK = 'BURST_ATK'    // 强破 (消耗阳)
}

/**
 * 五行节点状态结构
 */
export interface ElementNodeState {
    element: Element;
    yin: NodeStateValue;
    yang: NodeStateValue;
}

/**
 * 天干 (Heavenly Stem) - 每回合的触发源
 */
export interface HeavenlyStem {
    element: Element;
    polarity: Polarity;
    name: string; // 例如: 甲, 乙, 丙, 丁...
}

/**
 * 玩家标识
 */
export enum PlayerID {
    PLAYER_1 = 'PLAYER_1',
    PLAYER_2 = 'PLAYER_2'
}

/**
 * 执行动作的数据载荷 (Action Payload)
 */
export interface PlayerAction {
    type: ActionType;
    playerId: PlayerID;
    targetElement: Element; // 动作相关的核心五行节点
    polarity?: Polarity;    // 对于需要明确极性的动作（如调息转换、爆发消耗）
}

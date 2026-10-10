/**
 * 归元弈 (Guiyuan) - 核心状态构造与不可变变换纯函数
 */

import {
  WuXing,
  Polarity,
  NodeData,
  BoardState,
  PlayerId,
  PlayerState,
  GameState,
  NodeLevel,
  TianGanInfo,
  GENERATION_CYCLE
} from '../types/domain.js';

/** 创建空白五行棋盘 (所有节点阴阳均为虚空 0) */
export function createEmptyBoard(): BoardState {
  return {
    [WuXing.WOOD]: { yin: 0, yang: 0 },
    [WuXing.FIRE]: { yin: 0, yang: 0 },
    [WuXing.EARTH]: { yin: 0, yang: 0 },
    [WuXing.METAL]: { yin: 0, yang: 0 },
    [WuXing.WATER]: { yin: 0, yang: 0 }
  };
}

/** 创建初始玩家状态 */
export function createInitialPlayer(id: PlayerId): PlayerState {
  return {
    id,
    score: 0,
    board: createEmptyBoard()
  };
}

/** 创建初始全局游戏状态 */
export function createInitialGameState(maxRounds = 30): GameState {
  return {
    round: 1,
    maxRounds,
    currentPlayer: 'P1',
    players: {
      P1: createInitialPlayer('P1'),
      P2: createInitialPlayer('P2')
    },
    currentTianGan: null,
    isGameOver: false,
    winner: null,
    endReason: null,
    lockedGuiYuan: {
      P1: false,
      P2: false
    }
  };
}

/** 判定单节点是否达成“归一” (阴阳两侧均 >= 1) */
export function isNodeGuiYi(node: NodeData): boolean {
  return node.yin >= 1 && node.yang >= 1;
}

/** 判定单节点是否达成“亢极” (阴阳两侧均 == 2) */
export function isNodeKangJi(node: NodeData): boolean {
  return node.yin === 2 && node.yang === 2;
}

/** 判定棋盘是否达成“五行归元” (己方五个节点全部归一) */
export function isBoardGuiYuan(board: BoardState): boolean {
  const elements = Object.values(WuXing);
  return elements.every(element => isNodeGuiYi(board[element]));
}

/**
 * 统计盘面上已点亮 (>= 1) 的侧数
 * 盘面总共有 5 个五行节点 * 2 侧 (阴/阳) = 10 侧
 */
export function countLightedSides(board: BoardState): number {
  let count = 0;
  for (const element of Object.values(WuXing)) {
    if (board[element].yin >= 1) count++;
    if (board[element].yang >= 1) count++;
  }
  return count;
}

/**
 * 统计盘面上未点亮 (< 1，包含虚空 0 与道损 -1) 的侧数
 */
export function countUnlightedSides(board: BoardState): number {
  return 10 - countLightedSides(board);
}

/**
 * 判定盘面是否处于“听牌临界态” (TingPai)
 * ADR 0007 规范：己方盘面剩余未点亮侧数 (即等级 < 1 的侧数) 严格等于 1 时，判定为听牌临界态
 * （在终轮天命揭牌中单抽具备理论归元可能；未点亮侧数 >= 2 时单抽在数学上无法归元，判定为未听牌）
 */
export function isBoardTingPai(board: BoardState): boolean {
  return countUnlightedSides(board) === 1;
}

/**
 * 获取盘面上唯一未点亮侧的信息
 * 仅当未点亮侧数严格等于 1 时返回该侧的五行属性与极性；否则返回 null
 */
export function getUnlightedSide(board: BoardState): { element: WuXing; polarity: Polarity } | null {
  let unlighted: { element: WuXing; polarity: Polarity } | null = null;
  let count = 0;
  for (const element of Object.values(WuXing)) {
    if (board[element].yin < 1) {
      unlighted = { element, polarity: Polarity.YIN };
      count++;
    }
    if (board[element].yang < 1) {
      unlighted = { element, polarity: Polarity.YANG };
      count++;
    }
  }
  return count === 1 ? unlighted : null;
}

/**
 * 判定抽取的天干是否能通过合法操作（自动吸纳 AUTO、调息 CONVERT、化气 TRANS）
 * 补全点亮盘面上唯一的未点亮侧（使其等级达到 >= 1）
 *
 * 规则（遵循 ADR 0007 与 GDD 规则）：
 * 1. 目标侧当前等级提升 1 级后必须 >= 1（若当前为道损 -1，提升 1 级仅为 0 仍未点亮，故道损无法单抽点亮）
 * 2. 自动吸纳 (AUTO)：天干五行与极性与未点亮侧完全相同
 * 3. 调息 (CONVERT)：天干五行与未点亮侧相同但极性相反，且天干所在极性侧处于中位态 (>= 1)
 * 4. 化气 (TRANS)：天干为阴天干 (polarity === YIN)，且相生目标五行等于未点亮侧五行 (GENERATION_CYCLE[stemElement] === targetElement)：
 *    - 阴干优先原则：若未点亮侧为阴极（且 < 2），化气优先提升阴极，点亮成功；
 *    - 若未点亮侧为阳极，则只有在目标节点阴极已满 2 时，化气才会提升阳极并点亮。
 */
export function canTianGanLightUnlightedSide(board: BoardState, tianGan: TianGanInfo): boolean {
  const unlighted = getUnlightedSide(board);
  if (!unlighted) {
    return false;
  }
  const { element: targetElement, polarity: targetPolarity } = unlighted;
  const targetCurrentLevel = board[targetElement][targetPolarity];

  // 若当前等级提升 1 级后依然 < 1（例如道损 -1 提升至 0），单抽天干无法点亮
  if (targetCurrentLevel + 1 < 1) {
    return false;
  }

  // 1. AUTO (自动吸纳): 天干五行与极性与未点亮侧完全一致
  if (tianGan.element === targetElement && tianGan.polarity === targetPolarity) {
    return true;
  }

  // 2. CONVERT (调息): 同五行但相反极性，且天干所在极性侧处于中位态 (>= 1)
  if (
    tianGan.element === targetElement &&
    tianGan.polarity !== targetPolarity &&
    board[targetElement][tianGan.polarity] >= 1
  ) {
    return true;
  }

  // 3. TRANS (化气): 抽中阴天干，且相生目标为未点亮侧五行
  if (
    tianGan.polarity === Polarity.YIN &&
    GENERATION_CYCLE[tianGan.element] === targetElement
  ) {
    // 阴干优先原则：
    // 若未点亮侧是阴极 (当前等级 < 1 < 2)，化气优先提升阴极
    if (targetPolarity === Polarity.YIN) {
      return true;
    }
    // 若未点亮侧是阳极，只有在阴极已满 2 时，化气才会强化阳极
    if (targetPolarity === Polarity.YANG && board[targetElement].yin === 2) {
      return true;
    }
  }

  return false;
}

/**
 * 调整节点一侧等级，严格限制在 [-1, 2] 范围内
 * -1: 道损, 0: 虚空, 1: 点亮, 2: 加持
 */
export function clampNodeLevel(level: number): NodeLevel {
  if (level <= -1) return -1;
  if (level >= 2) return 2;
  return level as NodeLevel;
}

/**
 * 盘面差分度量 (BoardDiff)
 * constructionLevels: 所有侧等级上升量之和 (建设)
 * suppressionLevels:  所有侧等级下降量之和 (压制)
 */
export interface BoardDiff {
  readonly constructionLevels: number;
  readonly suppressionLevels: number;
}

/**
 * 度量两张盘面之间的等级变化量。
 * 关键口径：压制必须按“等级下降量”统计，而非“未点亮侧数”。
 * 因此 加持 2 -> 点亮 1 记为 1 次削弱（而非 0），1 -> 0 与 0 -> -1 各记 1 次。
 * 传入对手盘面即可得到施加于对手的压制度量。
 */
export function measureBoardDiff(prevBoard: BoardState, nextBoard: BoardState): BoardDiff {
  let constructionLevels = 0;
  let suppressionLevels = 0;

  for (const element of Object.values(WuXing)) {
    const prevNode = prevBoard[element];
    const nextNode = nextBoard[element];

    const yinDelta = nextNode.yin - prevNode.yin;
    if (yinDelta > 0) constructionLevels += yinDelta;
    else if (yinDelta < 0) suppressionLevels += -yinDelta;

    const yangDelta = nextNode.yang - prevNode.yang;
    if (yangDelta > 0) constructionLevels += yangDelta;
    else if (yangDelta < 0) suppressionLevels += -yangDelta;
  }

  return { constructionLevels, suppressionLevels };
}

/** 计算盘面的残留道损总数 (阴阳两侧为 -1 的数量之和) */
export function countBoardDamage(board: BoardState): number {
  let count = 0;
  for (const element of Object.values(WuXing)) {
    if (board[element].yin === -1) count++;
    if (board[element].yang === -1) count++;
  }
  return count;
}

/** 计算盘面上已达成归一的节点数量 */
export function countBoardGuiYi(board: BoardState): number {
  let count = 0;
  for (const element of Object.values(WuXing)) {
    if (isNodeGuiYi(board[element])) count++;
  }
  return count;
}



/**
 * 归元弈 (Guiyuan) - 核心状态构造与不可变变换纯函数
 */

import {
  WuXing,
  NodeData,
  BoardState,
  PlayerId,
  PlayerState,
  GameState,
  NodeLevel
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
export function createInitialGameState(maxRounds = 60): GameState {
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
    endReason: null
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
 * 调整节点一侧等级，严格限制在 [-1, 2] 范围内
 * -1: 道损, 0: 虚空, 1: 点亮, 2: 加持
 */
export function clampNodeLevel(level: number): NodeLevel {
  if (level <= -1) return -1;
  if (level >= 2) return 2;
  return level as NodeLevel;
}

/** 计算盘面上的残留道损总数 (阴阳两侧为 -1 的数量之和) */
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


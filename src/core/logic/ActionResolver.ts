/**
 * 归元弈 (Guiyuan) - 动作解析器 (ActionResolver)
 * 纯函数核心逻辑：接收 GameState 与 ActionPayload，返回全新的 GameState
 */

import {
  ActionType,
  ActionPayload,
  ActionResult,
  GameState,
  PlayerId,
  Polarity,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE,
  NodeLevel,
  WuXing,
  BoardState
} from '../types/domain.js';
import {
  clampNodeLevel,
  isBoardGuiYuan,
  isNodeGuiYi
} from './State.js';
import { ScoreCalculator } from './ScoreCalculator.js';

type MutableNodeData = { yin: NodeLevel; yang: NodeLevel };
type MutableBoardState = Record<WuXing, MutableNodeData>;

export class ActionResolver {
  constructor(private readonly scoreCalculator: ScoreCalculator = new ScoreCalculator()) {}

  /**
   * 解析动作执行
   */
  resolve(state: GameState, payload: ActionPayload): ActionResult {
    if (state.isGameOver) {
      return {
        nextState: state,
        success: false,
        scoreDelta: 0,
        extraTurn: false,
        message: '对局已结束'
      };
    }

    const activePlayerId = payload.player;
    const opponentPlayerId: PlayerId = activePlayerId === 'P1' ? 'P2' : 'P1';

    const activePlayer = state.players[activePlayerId];
    const opponentPlayer = state.players[opponentPlayerId];

    // 深拷贝棋盘，确保不可变性
    const nextActiveBoard: MutableBoardState = Object.fromEntries(
      Object.entries(activePlayer.board).map(([k, v]) => [k, { ...v }])
    ) as MutableBoardState;
    const nextOpponentBoard: MutableBoardState = Object.fromEntries(
      Object.entries(opponentPlayer.board).map(([k, v]) => [k, { ...v }])
    ) as MutableBoardState;

    let scoreDelta = 0;
    let extraTurn = false;
    let success = false;
    let message = '';

    switch (payload.actionType) {
      case ActionType.AUTO: {
        const element = payload.element || state.currentTianGan?.element;
        const polarity = payload.polarity || state.currentTianGan?.polarity;
        if (!element || !polarity) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '缺少天干属性或极性' };
        }
        const node = nextActiveBoard[element];
        const prevLevel = node[polarity];
        if (prevLevel >= 2) {
          message = '节点已达最高加持状态';
          success = true; // 动作仍算完成，但不再提升
        } else {
          const newLevel = clampNodeLevel(prevLevel + 1);
          node[polarity] = newLevel;
          scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel);
          success = true;
        }
        break;
      }

      case ActionType.CONVERT: {
        const element = payload.element || state.currentTianGan?.element;
        if (!element) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '缺少指定元素' };
        }
        // 调息转到相反极性
        const targetPolarity = payload.polarity || (state.currentTianGan?.polarity === Polarity.YANG ? Polarity.YIN : Polarity.YANG);
        const node = nextActiveBoard[element];
        const prevLevel = node[targetPolarity];
        if (prevLevel < 2) {
          const newLevel = clampNodeLevel(prevLevel + 1);
          node[targetPolarity] = newLevel;
          scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel);
        }
        success = true;
        break;
      }

      case ActionType.TRANS: {
        const sourceElement = payload.sourceElement || payload.element || state.currentTianGan?.element;
        if (!sourceElement) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '缺少源五行' };
        }
        const targetElement = GENERATION_CYCLE[sourceElement];
        const polarity = payload.polarity || Polarity.YANG;
        const targetNode = nextActiveBoard[targetElement];
        const prevLevel = targetNode[polarity];
        if (prevLevel < 2) {
          const newLevel = clampNodeLevel(prevLevel + 1);
          targetNode[polarity] = newLevel;
          scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel);
        }
        success = true;
        break;
      }

      case ActionType.ATK: {
        const sourceElement = payload.sourceElement || payload.element || state.currentTianGan?.element;
        if (!sourceElement) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '缺少源五行' };
        }
        const targetElement = OVERCOMING_CYCLE[sourceElement];
        const polarity = payload.polarity || Polarity.YANG;
        const targetNode = nextOpponentBoard[targetElement];
        const prevLevel = targetNode[polarity];
        const newLevel = clampNodeLevel(prevLevel - 1);
        targetNode[polarity] = newLevel;
        scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.ATK);
        success = true;
        break;
      }

      case ActionType.BURST: {
        const sourceElement = payload.sourceElement;
        const consumePolarity = payload.consumePolarity || Polarity.YIN;
        if (!sourceElement) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '爆发需指定归一源节点' };
        }
        const sourceNode = nextActiveBoard[sourceElement];
        if (!isNodeGuiYi(sourceNode)) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '源节点未达成归一，无法爆发' };
        }
        // 消耗源节点一侧
        sourceNode[consumePolarity] = clampNodeLevel(sourceNode[consumePolarity] - 1);
        // 强化相生节点
        const targetElement = GENERATION_CYCLE[sourceElement];
        const targetPolarity = payload.polarity || Polarity.YANG;
        const targetNode = nextActiveBoard[targetElement];
        const prevLevel = targetNode[targetPolarity];
        targetNode[targetPolarity] = clampNodeLevel(prevLevel + 1);
        scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.BURST);
        extraTurn = true;
        success = true;
        break;
      }

      case ActionType.BURST_ATK: {
        const sourceElement = payload.sourceElement;
        const consumePolarity = payload.consumePolarity || Polarity.YANG;
        if (!sourceElement) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '强破需指定归一源节点' };
        }
        const sourceNode = nextActiveBoard[sourceElement];
        if (!isNodeGuiYi(sourceNode)) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '源节点未达成归一，无法强破' };
        }
        // 消耗源节点一侧
        sourceNode[consumePolarity] = clampNodeLevel(sourceNode[consumePolarity] - 1);
        // 削弱相克对手节点
        const targetElement = OVERCOMING_CYCLE[sourceElement];
        const targetPolarity = payload.polarity || Polarity.YANG;
        const targetNode = nextOpponentBoard[targetElement];
        targetNode[targetPolarity] = clampNodeLevel(targetNode[targetPolarity] - 1);
        scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.BURST_ATK);
        extraTurn = true;
        success = true;
        break;
      }
    }

    if (!success) {
      return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message };
    }

    const nextScore = activePlayer.score + scoreDelta;

    // 检查是否达成“五行归元”
    const hasGuiYuan = isBoardGuiYuan(nextActiveBoard as unknown as BoardState);
    let isGameOver = false;
    let winner: PlayerId | 'DRAW' | null = null;
    let endReason: 'GUI_YUAN' | 'MAX_ROUNDS' | null = null;

    if (hasGuiYuan) {
      isGameOver = true;
      winner = activePlayerId;
      endReason = 'GUI_YUAN';
    } else if (!extraTurn && state.round >= state.maxRounds) {
      // 回合上限结算
      isGameOver = true;
      endReason = 'MAX_ROUNDS';
      if (nextScore > opponentPlayer.score) {
        winner = activePlayerId;
      } else if (opponentPlayer.score > nextScore) {
        winner = opponentPlayerId;
      } else {
        winner = 'DRAW';
      }
    }

    const nextRound = (!extraTurn && !isGameOver) ? state.round + 1 : state.round;
    const nextCurrentPlayer = (!extraTurn && !isGameOver) ? opponentPlayerId : activePlayerId;

    const nextState: GameState = {
      ...state,
      round: nextRound,
      currentPlayer: nextCurrentPlayer,
      players: {
        ...state.players,
        [activePlayerId]: {
          ...activePlayer,
          score: nextScore,
          board: nextActiveBoard as unknown as BoardState
        },
        [opponentPlayerId]: {
          ...opponentPlayer,
          board: nextOpponentBoard as unknown as BoardState
        }
      },
      isGameOver,
      winner,
      endReason
    };

    return {
      nextState,
      success: true,
      scoreDelta,
      extraTurn,
      message
    };
  }
}

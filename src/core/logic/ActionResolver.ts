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
  WuXing,
  BoardState,
  NodeData
} from '../types/domain.js';
import {
  clampNodeLevel,
  isBoardGuiYuan,
  isNodeGuiYi,
  countBoardDamage
} from './State.js';
import { ScoreCalculator } from './ScoreCalculator.js';


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

    // 增量状态更新：采用结构共享 (Structural Sharing)
    // 仅浅拷贝被修改的节点，保持未修改节点的引用不变，消除全局深拷贝 GC 压力
    let nextActiveBoard: BoardState = activePlayer.board;
    let nextOpponentBoard: BoardState = opponentPlayer.board;

    const patchActiveNode = (element: WuXing, patch: Partial<NodeData>) => {
      const current = nextActiveBoard[element];
      nextActiveBoard = {
        ...nextActiveBoard,
        [element]: {
          ...current,
          ...patch
        }
      };
    };

    const patchOpponentNode = (element: WuXing, patch: Partial<NodeData>) => {
      const current = nextOpponentBoard[element];
      nextOpponentBoard = {
        ...nextOpponentBoard,
        [element]: {
          ...current,
          ...patch
        }
      };
    };

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
        scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.AUTO);
        const node = nextActiveBoard[element];
        const prevLevel = node[polarity];
        if (prevLevel >= 2) {
          message = '节点已达最高加持状态';
          success = true; // 动作仍算完成，但不再提升
        } else {
          const newLevel = clampNodeLevel(prevLevel + 1);
          patchActiveNode(element, { [polarity]: newLevel });
          scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, polarity, false);
          success = true;
        }
        break;
      }

      case ActionType.CONVERT: {
        const element = payload.element || state.currentTianGan?.element;
        if (!element) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '缺少指定元素' };
        }
        scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.CONVERT);
        // 调息转到相反极性
        const targetPolarity = payload.polarity || (state.currentTianGan?.polarity === Polarity.YANG ? Polarity.YIN : Polarity.YANG);
        const node = nextActiveBoard[element];
        const prevLevel = node[targetPolarity];
        if (prevLevel < 2) {
          const newLevel = clampNodeLevel(prevLevel + 1);
          patchActiveNode(element, { [targetPolarity]: newLevel });
          scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, targetPolarity, false);
        }
        success = true;
        break;
      }

      case ActionType.TRANS: {
        const sourceElement = payload.sourceElement || payload.element || state.currentTianGan?.element;
        if (!sourceElement) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '缺少源五行' };
        }
        scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.TRANS);
        const targetElement = GENERATION_CYCLE[sourceElement];
        const polarity = payload.polarity || Polarity.YANG;
        const targetNode = nextActiveBoard[targetElement];
        const prevLevel = targetNode[polarity];
        if (prevLevel < 2) {
          const newLevel = clampNodeLevel(prevLevel + 1);
          patchActiveNode(targetElement, { [polarity]: newLevel });
          scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, polarity, false);
        }
        success = true;
        break;
      }

      case ActionType.ATK: {
        const sourceElement = payload.sourceElement || payload.element || state.currentTianGan?.element;
        if (!sourceElement) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '缺少源五行' };
        }
        scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.ATK);
        const targetElement = OVERCOMING_CYCLE[sourceElement];
        const polarity = payload.polarity || Polarity.YANG;
        const targetNode = nextOpponentBoard[targetElement];
        const prevLevel = targetNode[polarity];
        const newLevel = clampNodeLevel(prevLevel - 1);
        patchOpponentNode(targetElement, { [polarity]: newLevel });
        scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, polarity, true);
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
        scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.BURST);
        // 消耗源节点一侧
        patchActiveNode(sourceElement, {
          [consumePolarity]: clampNodeLevel(sourceNode[consumePolarity] - 1)
        });
        // 强化相生节点
        const targetElement = GENERATION_CYCLE[sourceElement];
        const targetPolarity = payload.polarity || Polarity.YANG;
        const targetNode = nextActiveBoard[targetElement];
        const prevLevel = targetNode[targetPolarity];
        const newLevel = clampNodeLevel(prevLevel + 1);
        patchActiveNode(targetElement, {
          [targetPolarity]: newLevel
        });
        scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, targetPolarity, false);
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
        scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.BURST_ATK);
        // 消耗源节点一侧
        patchActiveNode(sourceElement, {
          [consumePolarity]: clampNodeLevel(sourceNode[consumePolarity] - 1)
        });
        // 削弱相克对手节点
        const targetElement = OVERCOMING_CYCLE[sourceElement];
        const targetPolarity = payload.polarity || Polarity.YANG;
        const targetNode = nextOpponentBoard[targetElement];
        const prevLevel = targetNode[targetPolarity];
        const newLevel = clampNodeLevel(prevLevel - 1);
        patchOpponentNode(targetElement, {
          [targetPolarity]: newLevel
        });
        scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, targetPolarity, true);
        extraTurn = true;
        success = true;
        break;
      }

      case ActionType.DISSIPATE: {
        const element = payload.element || state.currentTianGan?.element;
        const polarity = payload.polarity || state.currentTianGan?.polarity;
        if (!element || !polarity) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '缺少天干属性或极性' };
        }
        const node = nextActiveBoard[element];
        const prevLevel = node[polarity];
        const newLevel = clampNodeLevel(prevLevel - 1);
        patchActiveNode(element, { [polarity]: newLevel });
        // 亢极散气：计 0 分，不消耗/获得额外行动
        scoreDelta = 0;
        success = true;
        message = '亢极散气：极位能量满溢回落';
        break;
      }
    }

    if (!success) {
      return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message };
    }

    // 检查节点归一里程碑增量 (guiYiDelta)
    let guiYiDelta = 0;
    for (const element of Object.values(WuXing)) {
      const prevGuiYi = isNodeGuiYi(activePlayer.board[element]);
      const nextGuiYi = isNodeGuiYi(nextActiveBoard[element]);
      if (!prevGuiYi && nextGuiYi) {
        guiYiDelta++;
      }
    }

    if (guiYiDelta > 0) {
      scoreDelta += this.scoreCalculator.calculateGuiYiMilestonePoints(guiYiDelta);
    }

    const nextScore = activePlayer.score + scoreDelta;

    // 检查是否达成“五行归元”
    const hasGuiYuan = isBoardGuiYuan(nextActiveBoard);
    let isGameOver = false;
    let winner: PlayerId | 'DRAW' | null = null;
    let endReason: 'GUI_YUAN' | 'MAX_ROUNDS' | null = null;

    let finalActiveScore = nextScore;
    let finalOpponentScore = opponentPlayer.score;

    if (hasGuiYuan) {
      isGameOver = true;
      winner = activePlayerId;
      endReason = 'GUI_YUAN';
    } else if (!extraTurn && state.round >= state.maxRounds) {
      // 回合上限结算：残留道损扣分惩罚 (-50分/道损)
      isGameOver = true;
      endReason = 'MAX_ROUNDS';

      const activeDamage = countBoardDamage(nextActiveBoard);
      const opponentDamage = countBoardDamage(nextOpponentBoard);

      finalActiveScore -= this.scoreCalculator.calculateDamagePenalty(activeDamage);
      finalOpponentScore -= this.scoreCalculator.calculateDamagePenalty(opponentDamage);

      if (finalActiveScore > finalOpponentScore) {
        winner = activePlayerId;
      } else if (finalOpponentScore > finalActiveScore) {
        winner = opponentPlayerId;
      } else {
        // GDD 规则：若分数相同，则判定后手 (P2) 获胜
        winner = 'P2';
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
          score: finalActiveScore,
          board: nextActiveBoard
        },
        [opponentPlayerId]: {
          ...opponentPlayer,
          score: finalOpponentScore,
          board: nextOpponentBoard
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

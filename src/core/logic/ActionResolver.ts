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
  getOppositePolarity,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE,
  WuXing,
  BoardState,
  NodeData,
  NodeLevel
} from '../types/domain.js';
import {
  clampNodeLevel,
  isBoardGuiYuan,
  isNodeGuiYi,
  countBoardDamage,
  countBoardGuiYi,
  isBoardTingPai
} from './State.js';
import { ScoreCalculator } from './ScoreCalculator.js';


export class ActionResolver {
  constructor(private readonly scoreCalculator: ScoreCalculator = new ScoreCalculator()) {}

  /**
   * 攻击状态分按行动前对手盘面归一进度定价（ticket 05 候选 A）。
   *
   * 只缩放攻击状态分（CAUSE_DMG / BREAK_LIGHT / WEAKEN）；行为分、里程碑与
   * 己方建设分不受影响。`ATTACK_PROGRESS_SCALE` 未配置时恒等。
   */
  private scaledAttackTransitionPoints(
    prevLevel: NodeLevel,
    newLevel: NodeLevel,
    polarity: Polarity,
    opponentBoardBeforeAction: BoardState
  ): number {
    const points = this.scoreCalculator.calculateTransitionPoints(
      prevLevel,
      newLevel,
      polarity,
      true
    );
    const scale = this.scoreCalculator.attackProgressScale(
      countBoardGuiYi(opponentBoardBeforeAction)
    );
    return Math.round(points * scale);
  }

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
        // 调息转到相反极性
        const targetPolarity = payload.polarity || (state.currentTianGan ? getOppositePolarity(state.currentTianGan.polarity) : Polarity.YANG);
        const node = nextActiveBoard[element];
        const prevLevel = node[targetPolarity];
        // 防御性拦截：目标侧若已处于点亮 (1) 或加持 (2)，严禁调息
        if (prevLevel >= 1) {
          return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: '目标极性已处于点亮或加持状态，严禁调息' };
        }
        scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.CONVERT);
        const newLevel = clampNodeLevel(prevLevel + 1);
        patchActiveNode(element, { [targetPolarity]: newLevel });
        scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, targetPolarity, false);
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
        scoreDelta += this.scaledAttackTransitionPoints(
          prevLevel,
          newLevel,
          polarity,
          opponentPlayer.board
        );
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
        scoreDelta += this.scaledAttackTransitionPoints(
          prevLevel,
          newLevel,
          targetPolarity,
          opponentPlayer.board
        );
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

      case ActionType.PASS: {
        // 消散过牌：计 0 分，不修改盘面，自然交接回合
        scoreDelta = 0;
        success = true;
        message = '消散过牌：无有效动作，流转回合';
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
    const prevLockedGuiYuan: Readonly<Record<PlayerId, boolean>> = state.lockedGuiYuan ?? {
      P1: false,
      P2: false
    };

    // 五行归元为不可逆终极里程碑成就：一旦在行动中达成即锁定记录（后续受攻击降级不撤销）
    const nextLockedGuiYuan: Record<PlayerId, boolean> = {
      P1: prevLockedGuiYuan.P1 || (activePlayerId === 'P1' && hasGuiYuan),
      P2: prevLockedGuiYuan.P2 || (activePlayerId === 'P2' && hasGuiYuan)
    };

    let isGameOver = false;
    let winner: PlayerId | 'DRAW' | null = null;
    let endReason: 'GUI_YUAN' | 'MAX_ROUNDS' | null = null;

    let finalActiveScore = nextScore;
    let finalOpponentScore = opponentPlayer.score;

    if (activePlayerId === 'P1') {
      // 先手 (P1) 行动阶段
      if (nextLockedGuiYuan.P1) {
        // P1 已达成五行归元成就
        if (!isBoardTingPai(nextOpponentBoard)) {
          // 常规秒结 (后手未听牌，即未点亮侧数 != 1，占 ~97%)：系统即刻当场判定先手获胜，对局立即终结
          isGameOver = true;
          winner = 'P1';
          endReason = 'GUI_YUAN';
          extraTurn = false;
        } else {
          // 终轮天命揭牌决胜 (后手严格差 1 侧听牌)：对局流转至 P2 进行天命揭牌决胜，不派发常规候选动作
          isGameOver = false;
          extraTurn = false;
        }
      }
    } else {
      // 后手 (P2) 行动阶段
      if (nextLockedGuiYuan.P2) {
        // 后手达成归元：
        // 1. 若 P1 此前已锁定归元，根据平局后手胜原则 (后发制人)，判定后手获胜
        // 2. 若后手先达成归元，因本大回合已然闭合，直接判定后手获胜
        isGameOver = true;
        winner = 'P2';
        endReason = 'GUI_YUAN';
        extraTurn = false;
      } else if (!extraTurn) {
        // P2 未达成归元，且完成了非连动常规行动 (大回合闭合)
        if (nextLockedGuiYuan.P1) {
          // P1 此前已锁定归元，P2 追平失败 -> 判定先手获胜
          isGameOver = true;
          winner = 'P1';
          endReason = 'GUI_YUAN';
        } else if (state.round >= state.maxRounds) {
          // 双方均未归元，且达到回合上限 -> MAX_ROUNDS 终局结算
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
            // 平局后手胜
            winner = 'P2';
          }
        }
      }
    }

    let nextRound = state.round;
    let nextCurrentPlayer: PlayerId = activePlayerId;

    if (isGameOver) {
      nextRound = state.round;
      nextCurrentPlayer = activePlayerId;
    } else if (extraTurn) {
      nextRound = state.round;
      nextCurrentPlayer = activePlayerId;
    } else {
      if (activePlayerId === 'P1') {
        // 半回合交接：大回合不递增，切换到 P2
        nextRound = state.round;
        nextCurrentPlayer = 'P2';
      } else {
        // P2 常规行动完毕且未终局：大回合闭合，进入下一大回合，切换回 P1
        nextRound = state.round + 1;
        nextCurrentPlayer = 'P1';
      }
    }

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
      endReason,
      lockedGuiYuan: nextLockedGuiYuan
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

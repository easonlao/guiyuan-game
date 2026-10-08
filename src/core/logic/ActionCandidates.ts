/**
 * 归元弈 (Guiyuan) - 合法动作候选生成器 (ActionCandidates)
 * 纯函数核心逻辑：根据当前 GameState 与抽取的 TianGanInfo 生成所有合法动作选项
 * 遵循 GDD 与 GLOSSARY 规范
 */

import {
  ActionPayload,
  ActionType,
  GameState,
  NodeData,
  Polarity,
  TianGanInfo,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE
} from '../types/domain.js';
import { isNodeGuiYi } from './State.js';

/**
 * 获取加法（相生）候选目标极性
 * 遵循阴干优先规则：
 * 若阴侧未满（< 2），优先强化阴侧；若阴侧已满（= 2）且阳侧未满（< 2），强化阳侧；均满则无有效目标。
 */
export function getPlusTargetPolarity(node: NodeData): Polarity | null {
  if (node.yin < 2) {
    return Polarity.YIN;
  }
  if (node.yang < 2) {
    return Polarity.YANG;
  }
  return null;
}

/**
 * 获取减法（相克）候选目标极性
 * 遵循阴干优先规则：
 * 若对手阴侧未降至最低（> -1），优先压制阴侧；若对手阴侧已为道损（= -1）且阳侧 > -1，压制阳侧；均已达下限则无有效目标。
 */
export function getMinusTargetPolarity(node: NodeData): Polarity | null {
  if (node.yin > -1) {
    return Polarity.YIN;
  }
  if (node.yang > -1) {
    return Polarity.YANG;
  }
  return null;
}

export interface ActionCandidatesOptions {
  readonly isExtraTurn?: boolean;
}

/**
 * 生成当前玩家面对抽取的天干时所有合法的行动候选
 * @param state 当前游戏全局状态
 * @param tianGan 当前抽取的天干
 * @param options 候选动作选项 (如连动限制)
 * @returns 合法动作列表
 */
export function getAvailableActions(
  state: GameState,
  tianGan: TianGanInfo,
  options?: ActionCandidatesOptions
): ActionPayload[] {
  if (state.isGameOver) {
    return [];
  }

  const playerId = state.currentPlayer;
  const opponentId = playerId === 'P1' ? 'P2' : 'P1';
  const playerBoard = state.players[playerId].board;
  const opponentBoard = state.players[opponentId].board;

  const stemElement = tianGan.element;
  const stemPolarity = tianGan.polarity;
  const stemNode = playerBoard[stemElement];
  const stemLevel = stemNode[stemPolarity];

  // 1. 若对应节点侧处于虚空 (0) 或道损 (-1)，必须且只能执行自动吸纳 (AUTO)
  if (stemLevel <= 0) {
    return [
      {
        actionType: ActionType.AUTO,
        player: playerId,
        element: stemElement,
        polarity: stemPolarity
      }
    ];
  }

  const actions: ActionPayload[] = [];

  // 2. 当对应节点侧已点亮 (1) 或加持 (2) 时
  if (stemLevel >= 1) {
    // 2.1 调息 (CONVERT): 转到同一元素的另一极性
    const oppositePolarity = stemPolarity === Polarity.YANG ? Polarity.YIN : Polarity.YANG;
    if (stemNode[oppositePolarity] < 2) {
      actions.push({
        actionType: ActionType.CONVERT,
        player: playerId,
        element: stemElement,
        polarity: oppositePolarity
      });
    }

    // 2.2 若为阳天干，且目标克制节点未达下限，支持相克破 (ATK)
    if (stemPolarity === Polarity.YANG) {
      const keEl = OVERCOMING_CYCLE[stemElement];
      const targetPolarity = getMinusTargetPolarity(opponentBoard[keEl]);
      if (targetPolarity !== null) {
        actions.push({
          actionType: ActionType.ATK,
          player: playerId,
          sourceElement: stemElement,
          polarity: targetPolarity
        });
      }
    }

    // 2.3 若为阴天干，且目标相生节点未达上限，支持相生化 (TRANS)
    if (stemPolarity === Polarity.YIN) {
      const shengEl = GENERATION_CYCLE[stemElement];
      const targetPolarity = getPlusTargetPolarity(playerBoard[shengEl]);
      if (targetPolarity !== null) {
        actions.push({
          actionType: ActionType.TRANS,
          player: playerId,
          sourceElement: stemElement,
          polarity: targetPolarity
        });
      }
    }
  }

  // 3. 爆发动作：规则 A（爆发严格绑定当前天干归一）
  // 仅当当前抽取的天干所属节点已经达成归一（阴阳两侧均 >= 1）时，才允许基于该天干节点发起强化 (BURST) 或强破 (BURST_ATK)
  // 连动限制：若当前处于 extraTurn，过滤掉 BURST/BURST_ATK，确保一次大回合内禁止二次爆发
  if (!options?.isExtraTurn && isNodeGuiYi(stemNode)) {
    // 3.1 强化 (BURST): 消耗阴侧，强化相生节点
    const shengEl = GENERATION_CYCLE[stemElement];
    const shengTargetPolarity = getPlusTargetPolarity(playerBoard[shengEl]);
    if (shengTargetPolarity !== null) {
      actions.push({
        actionType: ActionType.BURST,
        player: playerId,
        sourceElement: stemElement,
        consumePolarity: Polarity.YIN,
        polarity: shengTargetPolarity
      });
    }

    // 3.2 强破 (BURST_ATK): 消耗阳侧，削弱相克节点
    const keEl = OVERCOMING_CYCLE[stemElement];
    const keTargetPolarity = getMinusTargetPolarity(opponentBoard[keEl]);
    if (keTargetPolarity !== null) {
      actions.push({
        actionType: ActionType.BURST_ATK,
        player: playerId,
        sourceElement: stemElement,
        consumePolarity: Polarity.YANG,
        polarity: keTargetPolarity
      });
    }
  }

  // 兜底：如果因特殊状态（如节点已满或无法调息等）没有任何动作可选，但满足 AUTO 规则，允许 AUTO 保持心跳
  if (actions.length === 0) {
    actions.push({
      actionType: ActionType.AUTO,
      player: playerId,
      element: stemElement,
      polarity: stemPolarity
    });
  }

  return actions;
}

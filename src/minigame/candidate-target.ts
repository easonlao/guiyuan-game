/**
 * 候选落点的解析（ADR 0018「弧只归这次打哪」，票 03）：把一个候选动作解析成
 * 「落在哪一方、哪个五行、哪一侧」——决策期候选弧的落点只由这里决定。
 *
 * 与 `BoardView.resolveActionPath` 的分工：那条回答「会走哪条**连线**」（化 / 强化走内环相生边、
 * 破 / 强破走跨环径向线），本模块回答「会变的是哪一侧**槽位**」。两者都只读候选载荷与盘面快照，
 * 不写回任何状态。
 *
 * 极性口径（票 03 明令）：取候选载荷的 `polarity`，**不要**从抽中天干的极性推导——
 * 吸纳 / 调息 / 散气落在源节点、化 / 破落在目标节点，天干极性只是抽签时的来源。
 * 只有爆发两类的载荷不带 `polarity`（核心 `ActionResolver` 解析时逐次重读盘面、阴优先各自决定作用侧），
 * 这里按同一套阴优先规则从盘面推出第一次会变的那一侧，与核心层共用
 * `getPlusTargetPolarity` / `getMinusTargetPolarity` 这个真源，不另写一份。
 */

import {
  ActionPayload,
  ActionType,
  BoardState,
  NodeData,
  Polarity,
  PlayerId,
  TianGanInfo,
  WuXing,
} from '../core/types/domain.js';
import { getMinusTargetPolarity, getPlusTargetPolarity } from '../core/logic/ActionCandidates.js';
import { getActionTargetElement } from './action-button-formatter.js';

/** 一个候选动作在法盘上的落点：作用到哪一方的哪个五行、哪一侧。 */
export interface CandidateTarget {
  readonly player: PlayerId;
  readonly element: WuXing;
  readonly polarity: Polarity;
}

/** 解析候选落点所需的只读上下文：抽中天干（兜底用）+ 双方盘面快照。 */
export interface CandidateTargetContext {
  /** 当前抽中的天干；`null` 时按木兜底（生产不可达：候选恒来自某颗天干）。 */
  readonly tianGan: TianGanInfo | null;
  /** 双方只读棋盘快照（键为玩家代号）。 */
  readonly boards: Readonly<Record<PlayerId, BoardState>>;
}

/**
 * 把一个候选动作解析成落点：吸纳 / 调息 / 散气落在**源节点**（行动方盘），
 * 化 / 强化落在行动方盘的相生节点，破 / 强破落在对方盘的相克节点。
 * 目标五行与按钮文案共用 `getActionTargetElement`（`action-button-formatter.ts`），
 * 因此「按钮说打哪」与「弧画在哪」不会分叉。
 *
 * 返回 `null` 表示这一下不落在任何槽位上，不画弧：`PASS` 原地消散；
 * 强破打在双侧均已道损的目标上时核心层「见底即止」，同样无落点。
 */
export function resolveCandidateTarget(
  action: ActionPayload,
  context: CandidateTargetContext,
): CandidateTarget | null {
  switch (action.actionType) {
    case ActionType.PASS:
      return null;
    case ActionType.AUTO:
    case ActionType.CONVERT:
    case ActionType.DISSIPATE:
    case ActionType.TRANS:
    case ActionType.BURST:
      return onOwnBoard(action, context);
    case ActionType.ATK:
    case ActionType.BURST_ATK:
      return onOpponentBoard(action, context);
    default: {
      // 类型穷举保护：新增动作必须显式给出落点，不许静默归入「不指向任何位置」。
      const unhandled: never = action.actionType;
      throw new Error(`未处理的动作类型：${String(unhandled)}`);
    }
  }
}

/** 作用在行动方自己盘上的候选：源节点动作 / 相生目标。 */
function onOwnBoard(action: ActionPayload, context: CandidateTargetContext): CandidateTarget {
  const element = getActionTargetElement(action, context.tianGan?.element);
  const node = context.boards[action.player][element];
  return {
    player: action.player,
    element,
    polarity: action.polarity ?? ownSide(action, node, context),
  };
}

/** 作用在对方盘上的候选：相克目标（破 / 强破）。 */
function onOpponentBoard(
  action: ActionPayload,
  context: CandidateTargetContext,
): CandidateTarget | null {
  const player = opponentOf(action.player);
  const element = getActionTargetElement(action, context.tianGan?.element);
  const node = context.boards[player][element];
  const polarity = action.polarity ?? opponentSide(action, node);
  if (polarity === null) {
    // 强破打在双侧均已道损的目标上：核心层两次 -1 都被「见底即止」吃掉，没有会变的一侧。
    return null;
  }
  return { player, element, polarity };
}

/**
 * 己方盘候选缺极性时的目标侧。只有强化不带极性：核心层按阴优先逐次选侧，
 * 目标 (2,2) 时改为阴侧 -1（满溢则亏，与亢极散气一致），因此兜底也是阴侧。
 */
function ownSide(action: ActionPayload, node: NodeData, context: CandidateTargetContext): Polarity {
  if (action.actionType === ActionType.BURST) {
    return getPlusTargetPolarity(node) ?? Polarity.YIN;
  }
  // 吸纳 / 调息 / 散气 / 化的载荷恒带极性；缺省时退回天干极性（防御，生产不可达）。
  return context.tianGan?.polarity ?? Polarity.YIN;
}

/** 对方盘候选缺极性时的目标侧。只有强破不带极性：核心层阴优先，无从压制时无落点。 */
function opponentSide(action: ActionPayload, node: NodeData): Polarity | null {
  if (action.actionType === ActionType.BURST_ATK) {
    return getMinusTargetPolarity(node);
  }
  // 破的载荷恒带极性（候选生成时就按对方盘定好了）。
  return action.polarity ?? Polarity.YIN;
}

/** 另一个玩家。 */
function opponentOf(player: PlayerId): PlayerId {
  return player === 'P1' ? 'P2' : 'P1';
}

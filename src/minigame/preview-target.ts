/**
 * 按住预览的幽灵态解析（票 04）：**真跑一遍核心解析器**，取到目标节点结算后的真实等级。
 *
 * 为什么不能沿用近似落点：强化 / 强破的载荷**不带目标侧**，核心层解析时逐次重读盘面、
 * 各自按阴侧优先决定作用侧，而且爆发两类各作用**两次**（`ActionResolver` 的 `BURST_PASSES`）。
 * 两次 ±1 可能落在同一侧、也可能落到两侧，甚至在目标已 (2, 2) 时互相抵消（净零变化）。
 * 只有真的跑一遍 `ActionResolver`，幽灵态才与结算逐侧一致——按第一次会变的一侧去画，就是伪造预览。
 *
 * 本模块只读快照、调用纯函数解析器，不写回任何游戏状态；作用侧与结算共用核心同一份真源，
 * 不在这里重抄一遍阴优先规则。
 */

import { ActionPayload, GameState, NodeData, PlayerId, WuXing } from '../core/types/domain.js';
import { ActionResolver } from '../core/logic/ActionResolver.js';
import { resolveCandidateTarget } from './candidate-target.js';

/** 目标侧结算前后的形态：`before` / `after` 是该节点两侧的等级。 */
export interface PreviewGhost {
  readonly player: PlayerId;
  readonly element: WuXing;
  /** 结算前的目标节点（当前盘面）。 */
  readonly before: NodeData;
  /** 结算后的目标节点（解析器的结果）。 */
  readonly after: NodeData;
}

/** 预览用的解析器：`resolve` 是纯函数，构造一次复用即可（不用进回合管理器的实例）。 */
const PREVIEW_RESOLVER = new ActionResolver();

/**
 * 解析一个候选动作的幽灵态：先按票 03 的口径取目标节点，再真跑解析器读它结算后的等级。
 *
 * 返回 `null` 表示这一下没有可预览的净变化，不画幽灵态：`PASS` 原地消散；
 * 强破打在双侧均已道损的目标上核心层「见底即止」；以及目标节点两侧结算前后完全相同
 * （例如强化打在相生目标 (2, 2) 上时，两次 ±1 互相抵消）。
 */
export function resolvePreviewGhost(action: ActionPayload, state: GameState): PreviewGhost | null {
  const target = resolveCandidateTarget(action, {
    tianGan: state.currentTianGan,
    boards: {
      P1: state.players.P1.board,
      P2: state.players.P2.board,
    },
  });
  if (target === null) {
    return null;
  }
  const before = state.players[target.player].board[target.element];
  // 真跑一遍解析器：爆发两类的目标侧不在载荷里，只有解析结果才是真实落点。
  const after = PREVIEW_RESOLVER.resolve(state, action).nextState.players[target.player].board[
    target.element
  ];
  if (after.yin === before.yin && after.yang === before.yang) {
    return null;
  }
  return { player: target.player, element: target.element, before, after };
}

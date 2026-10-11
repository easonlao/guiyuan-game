/**
 * 动作语义的共享判定（Layer 3 表现层）：法盘连线、飞行落点、角色表情与震屏都要回答
 * 「这个动作是不是攻击」，判定只在这里有一份——新增攻击类动作时，下面的穷举保护会在编译期
 * 点名所有需要跟改的地方，而不是让某个调用点静默按「非攻击」处理。
 */

import { ActionType } from '../core/types/domain.js';

/**
 * 是否攻击类动作（`破` / `强破`）：作用在对方盘上、走跨环径向线、触发受击表情与震屏。
 * 返回类型是类型谓词，调用方的穷举 switch 因此能继续用 `never` 兜底。
 */
export function isAttackAction(
  actionType: ActionType,
): actionType is typeof ActionType.ATK | typeof ActionType.BURST_ATK {
  switch (actionType) {
    case ActionType.ATK:
    case ActionType.BURST_ATK:
      return true;
    case ActionType.AUTO:
    case ActionType.CONVERT:
    case ActionType.TRANS:
    case ActionType.BURST:
    case ActionType.DISSIPATE:
    case ActionType.PASS:
      return false;
    default: {
      // 类型穷举保护：新增动作必须在这里显式归入攻击 / 非攻击。
      const unhandled: never = actionType;
      throw new Error(`未处理的动作类型：${String(unhandled)}`);
    }
  }
}

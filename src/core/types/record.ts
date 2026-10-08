/**
 * 归元弈 (Guiyuan) - 轻量对局记录契约 (GameRecord)
 * 纯 TS 结构，仅保留种子与每步决策序列，达成 100% 确定性回放
 */

import { ActionPayload, PlayerId } from './domain.js';

/** 单步操作记录 */
export interface ActionRecord {
  readonly round: number;
  readonly player: PlayerId;
  readonly action: ActionPayload;
}

/** 完整轻量对局记录契约 */
export interface GameRecord {
  /** 初始随机种子 */
  readonly seed: number;
  /** 最大回合数设置，默认为 60 */
  readonly maxRounds: number;
  /** 每步行动日志序列 */
  readonly actions: readonly ActionRecord[];
}

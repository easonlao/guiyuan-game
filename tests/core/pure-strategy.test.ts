import { describe, it, expect } from 'vitest';
import {
  ActionType,
  GameState,
  Polarity,
  TIAN_GAN_LIST,
  WuXing
} from '../../src/core/types/domain.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import {
  PURE_RUSH_WEIGHTS,
  PURE_SUPPRESS_WEIGHTS,
  pureRushStrategy,
  pureSuppressStrategy
} from '../../src/core/ai/Strategy.js';

/**
 * 构造“自身归元 vs 破坏对手归元”的二选一困境：
 * - P1 木阳=1、木阴=0：可 CONVERT 木阴达成己方木归一（纯推进轴）
 * - P2 土归一 (1,1)：可 ATK 木克土，压制 P2 土阴 1 -> 0 破其归一（纯压制轴）
 */
function buildDilemmaState(): GameState {
  const base = createInitialGameState();
  return {
    ...base,
    players: {
      ...base.players,
      P1: {
        ...base.players.P1,
        board: {
          ...base.players.P1.board,
          [WuXing.WOOD]: { yin: 0, yang: 1 }
        }
      },
      P2: {
        ...base.players.P2,
        board: {
          ...base.players.P2.board,
          [WuXing.EARTH]: { yin: 1, yang: 1 }
        }
      }
    }
  };
}

describe('Pure single-axis strategy presets (Ticket 03)', () => {
  const jiaWoodYang = TIAN_GAN_LIST[0]; // 甲木 (阳)

  const convertAction = {
    actionType: ActionType.CONVERT,
    player: 'P1' as const,
    element: WuXing.WOOD,
    polarity: Polarity.YIN
  };

  const atkAction = {
    actionType: ActionType.ATK,
    player: 'P1' as const,
    sourceElement: WuXing.WOOD,
    polarity: Polarity.YIN
  };

  it('pureRush picks the own-progress action over opponent suppression', () => {
    const choice = pureRushStrategy(buildDilemmaState(), jiaWoodYang, [atkAction, convertAction]);
    expect(choice).toEqual(convertAction);
  });

  it('pureSuppress picks the opponent-suppression action over own progress', () => {
    const choice = pureSuppressStrategy(buildDilemmaState(), jiaWoodYang, [convertAction, atkAction]);
    expect(choice).toEqual(atkAction);
  });

  it('zeroes the cross axis and the score-delta axis in both presets', () => {
    expect(PURE_RUSH_WEIGHTS.breakOpponentGuiYi).toBe(0);
    expect(PURE_RUSH_WEIGHTS.causeDamage).toBe(0);
    expect(PURE_RUSH_WEIGHTS.suppressNode).toBe(0);
    expect(PURE_RUSH_WEIGHTS.scoreDeltaWeight).toBe(0);

    expect(PURE_SUPPRESS_WEIGHTS.repairDamage).toBe(0);
    expect(PURE_SUPPRESS_WEIGHTS.reachGuiYi).toBe(0);
    expect(PURE_SUPPRESS_WEIGHTS.lightVoid).toBe(0);
    expect(PURE_SUPPRESS_WEIGHTS.reachKangJi).toBe(0);
    expect(PURE_SUPPRESS_WEIGHTS.guiyuanProgress).toBe(0);
    expect(PURE_SUPPRESS_WEIGHTS.scoreDeltaWeight).toBe(0);
  });
});

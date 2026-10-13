import { describe, it, expect } from 'vitest';
import { resolvePreviewGhost } from '../../src/minigame/preview-target.js';
import {
  ActionType,
  TIAN_GAN_LIST,
  Polarity,
  WuXing,
  type ActionPayload,
  type GameState,
} from '../../src/core/types/domain.js';
import { gameStateWith } from '../../tools/BoardFixture.js';

/** 甲木（木·阳）/ 乙木（木·阴）：源节点都是木，用来构造相生 / 相克目标。 */
const JIA = TIAN_GAN_LIST[0];
const YI = TIAN_GAN_LIST[1];

/** 盘面覆盖 + 抽中天干拼成预览上下文；未覆盖的节点保持虚空。 */
function stateWith(
  options: Parameters<typeof gameStateWith>[0],
  tianGan: (typeof TIAN_GAN_LIST)[number],
): GameState {
  return { ...gameStateWith(options), currentTianGan: tianGan };
}

describe('resolvePreviewGhost: 幽灵态真跑解析器（票 04）', () => {
  it('破：目标是对手相克节点，按载荷极性单次 -1', () => {
    const state = stateWith({ P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } } }, JIA);
    const action: ActionPayload = {
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: Polarity.YIN,
    };

    expect(resolvePreviewGhost(action, state)).toEqual({
      player: 'P2',
      element: WuXing.EARTH,
      before: { yin: 0, yang: 0 },
      after: { yin: -1, yang: 0 },
    });
  });

  it('化：目标是己方相生节点，按载荷极性单次 +1', () => {
    const state = stateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } } }, YI);
    const action: ActionPayload = {
      actionType: ActionType.TRANS,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: Polarity.YIN,
    };

    expect(resolvePreviewGhost(action, state)).toEqual({
      player: 'P1',
      element: WuXing.FIRE,
      before: { yin: 0, yang: 0 },
      after: { yin: 1, yang: 0 },
    });
  });

  it('强化：目标侧不在载荷里，两次 +1 由解析器逐次选侧（同侧连加）', () => {
    // 相生火 (0,0)：两次 +1 都按阴优先落在阴侧，0 -> 1 -> 2。
    const state = stateWith(
      { P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } }, P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } } },
      JIA,
    );
    const action: ActionPayload = {
      actionType: ActionType.BURST,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      consumePolarity: Polarity.YIN,
    };

    expect(resolvePreviewGhost(action, state)).toEqual({
      player: 'P1',
      element: WuXing.FIRE,
      before: { yin: 0, yang: 0 },
      after: { yin: 2, yang: 0 },
    });
  });

  it('强化：第二次 +1 重新读盘面后落到另一侧（阴已满则转阳）', () => {
    // 相生火 (1,0)：第一次阴 1 -> 2，第二次阴侧已满、转阳 0 -> 1。
    const state = stateWith(
      {
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: 1, yang: 0 },
        },
      },
      JIA,
    );
    const action: ActionPayload = {
      actionType: ActionType.BURST,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      consumePolarity: Polarity.YIN,
    };

    expect(resolvePreviewGhost(action, state)?.after).toEqual({ yin: 2, yang: 1 });
  });

  it('强化：目标已 (2, 2) 时两次 ±1 互相抵消，净零变化不画幽灵态', () => {
    const state = stateWith(
      {
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: 2, yang: 2 },
        },
      },
      JIA,
    );
    const action: ActionPayload = {
      actionType: ActionType.BURST,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      consumePolarity: Polarity.YIN,
    };

    expect(resolvePreviewGhost(action, state)).toBeNull();
  });

  it('强破：两次 -1 由解析器逐次选侧（先阴后阳，见底即止的反面）', () => {
    // 对手土 (0,0)：第一次阴 0 -> -1，第二次阴已见底、转阳 0 -> -1。
    const state = stateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } } }, JIA);
    const action: ActionPayload = {
      actionType: ActionType.BURST_ATK,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      consumePolarity: Polarity.YANG,
    };

    expect(resolvePreviewGhost(action, state)).toEqual({
      player: 'P2',
      element: WuXing.EARTH,
      before: { yin: 0, yang: 0 },
      after: { yin: -1, yang: -1 },
    });
  });

  it('强破：目标双侧已 (-1,-1) 时核心层见底即止，无幽灵态', () => {
    const state = stateWith(
      { P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } }, P2: { [WuXing.EARTH]: { yin: -1, yang: -1 } } },
      JIA,
    );
    const action: ActionPayload = {
      actionType: ActionType.BURST_ATK,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      consumePolarity: Polarity.YANG,
    };

    expect(resolvePreviewGhost(action, state)).toBeNull();
  });

  it('PASS 没有落点：不伪造幽灵态', () => {
    const state = stateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } } }, JIA);
    const action: ActionPayload = {
      actionType: ActionType.PASS,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG,
    };

    expect(resolvePreviewGhost(action, state)).toBeNull();
  });
});

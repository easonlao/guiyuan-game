import { describe, it, expect } from 'vitest';
import { resolveCandidateTarget } from '../../src/minigame/candidate-target.js';
import {
  ActionType,
  Polarity,
  PlayerId,
  WuXing,
  type ActionPayload,
  type BoardState,
} from '../../src/core/types/domain.js';
import { TIAN_GAN_LIST } from '../../src/core/types/domain.js';
import { boardWith } from '../../tools/BoardFixture.js';

/** 解析上下文：默认 P1 行动、抽中天干为甲木（木·阳），双方盘面可覆盖。 */
function context(
  overrides: {
    actor?: PlayerId;
    stemPolarity?: Polarity;
    P1?: BoardState;
    P2?: BoardState;
  } = {},
) {
  return {
    tianGan: {
      name: '甲',
      element: WuXing.WOOD,
      polarity: overrides.stemPolarity ?? Polarity.YANG,
    },
    boards: {
      P1: overrides.P1 ?? boardWith(),
      P2: overrides.P2 ?? boardWith(),
    } as Readonly<Record<PlayerId, BoardState>>,
  };
}

/** 载荷载具的简写构造。 */
function payload(over: Partial<ActionPayload> & { actionType: ActionType }): ActionPayload {
  return { player: 'P1', ...over } as ActionPayload;
}

describe('resolveCandidateTarget: 候选 → 弧的落点（票 03）', () => {
  it('吸纳 / 调息 / 散气落在源节点、取载荷极性，不从天干极性推导', () => {
    // 甲木（阳）抽中的就是源节点；载荷给哪侧就落哪侧。
    expect(
      resolveCandidateTarget(
        payload({ actionType: ActionType.AUTO, element: WuXing.WOOD, polarity: Polarity.YIN }),
        context(),
      ),
    ).toEqual({ player: 'P1', element: WuXing.WOOD, polarity: Polarity.YIN });

    expect(
      resolveCandidateTarget(
        payload({
          actionType: ActionType.CONVERT,
          element: WuXing.FIRE,
          polarity: Polarity.YANG,
        }),
        context(),
      ),
    ).toEqual({ player: 'P1', element: WuXing.FIRE, polarity: Polarity.YANG });

    expect(
      resolveCandidateTarget(
        payload({
          actionType: ActionType.DISSIPATE,
          element: WuXing.WATER,
          polarity: Polarity.YIN,
        }),
        context({ stemPolarity: Polarity.YIN }),
      ),
    ).toEqual({ player: 'P1', element: WuXing.WATER, polarity: Polarity.YIN });
  });

  it('化落在己方相生节点、破落在对方相克节点，极性取载荷', () => {
    // 木生火：化落在 P1 火；木克土：破落在 P2 土。
    expect(
      resolveCandidateTarget(
        payload({
          actionType: ActionType.TRANS,
          sourceElement: WuXing.WOOD,
          polarity: Polarity.YANG,
        }),
        context(),
      ),
    ).toEqual({ player: 'P1', element: WuXing.FIRE, polarity: Polarity.YANG });

    expect(
      resolveCandidateTarget(
        payload({
          actionType: ActionType.ATK,
          sourceElement: WuXing.WOOD,
          polarity: Polarity.YIN,
        }),
        context(),
      ),
    ).toEqual({ player: 'P2', element: WuXing.EARTH, polarity: Polarity.YIN });
  });

  it('强化 / 强破的载荷不带极性：按核心层同一套阴优先从盘面推出第一次会变的一侧', () => {
    const P2 = boardWith({ [WuXing.EARTH]: { yin: 1, yang: 0 } });
    // 强化木：相生目标火 (0,0) → 阴优先 → 阴侧。
    expect(
      resolveCandidateTarget(
        payload({ actionType: ActionType.BURST, sourceElement: WuXing.WOOD }),
        {
          tianGan: { name: '甲', element: WuXing.WOOD, polarity: Polarity.YANG },
          boards: { P1: boardWith(), P2 },
        },
      ),
    ).toEqual({ player: 'P1', element: WuXing.FIRE, polarity: Polarity.YIN });

    // 强破木：相克目标土 (1,0) → 阴未损优先压制阴侧。
    expect(
      resolveCandidateTarget(
        payload({ actionType: ActionType.BURST_ATK, sourceElement: WuXing.WOOD }),
        context({ P2 }),
      ),
    ).toEqual({ player: 'P2', element: WuXing.EARTH, polarity: Polarity.YIN });

    // 阴侧已道损时强破落到阳侧；两侧都道损则无落点（核心层「见底即止」）。
    const damaged = boardWith({ [WuXing.EARTH]: { yin: -1, yang: 0 } });
    const bothDamaged = boardWith({ [WuXing.EARTH]: { yin: -1, yang: -1 } });
    expect(
      resolveCandidateTarget(
        payload({ actionType: ActionType.BURST_ATK, sourceElement: WuXing.WOOD }),
        context({ P2: damaged }),
      ),
    ).toEqual({ player: 'P2', element: WuXing.EARTH, polarity: Polarity.YANG });
    expect(
      resolveCandidateTarget(
        payload({ actionType: ActionType.BURST_ATK, sourceElement: WuXing.WOOD }),
        context({ P2: bothDamaged }),
      ),
    ).toBeNull();

    // 强化打在 (2,2) 目标上：核心层改为阴侧 -1（满溢则亏），仍是阴侧。
    expect(
      resolveCandidateTarget(
        payload({ actionType: ActionType.BURST, sourceElement: WuXing.WOOD }),
        context({ P1: boardWith({ [WuXing.FIRE]: { yin: 2, yang: 2 } }) }),
      ),
    ).toEqual({ player: 'P1', element: WuXing.FIRE, polarity: Polarity.YIN });
  });

  it('PASS 没有落点，不画弧', () => {
    expect(
      resolveCandidateTarget(
        payload({ actionType: ActionType.PASS, element: WuXing.WOOD }),
        context(),
      ),
    ).toBeNull();
  });

  it('目标五行优先取载荷字段（与按钮文案同源）', () => {
    expect(
      resolveCandidateTarget(
        payload({
          actionType: ActionType.TRANS,
          sourceElement: WuXing.WOOD,
          targetElement: WuXing.WATER,
          polarity: Polarity.YIN,
        }),
        context(),
      ),
    ).toEqual({ player: 'P1', element: WuXing.WATER, polarity: Polarity.YIN });
  });

  it('作用方决定内环 / 外环：攻击落在对方盘，其余落在行动方盘', () => {
    const boards = { P1: boardWith(), P2: boardWith() } as Readonly<Record<PlayerId, BoardState>>;
    const tianGan = TIAN_GAN_LIST[0];
    const p2Actor = {
      tianGan: { ...tianGan, element: WuXing.WOOD },
      boards,
    };
    // 己方（P2）抽中木：强破应落在 P1 的土上（外环逻辑镜像）。
    expect(
      resolveCandidateTarget(
        payload({ actionType: ActionType.BURST_ATK, player: 'P2', sourceElement: WuXing.WOOD }),
        p2Actor,
      ),
    ).toEqual({ player: 'P1', element: WuXing.EARTH, polarity: Polarity.YIN });
  });
});

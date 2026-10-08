import { describe, it, expect } from 'vitest';
import {
  ActionType,
  WuXing,
  Polarity,
  TIAN_GAN_LIST
} from '../../src/core/types/domain.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import {
  getAvailableActions,
  getPlusTargetPolarity,
  getMinusTargetPolarity
} from '../../src/core/logic/ActionCandidates.js';

describe('ActionCandidates (Legal Action Generator)', () => {
  it('1. When stem node is VOID (0), should propose AUTO only', () => {
    const state = createInitialGameState();
    const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG

    const actions = getAvailableActions(state, jiaWood);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      actionType: ActionType.AUTO,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG
    });
  });

  it('2. When stem node is DAMAGE (-1), should also propose AUTO', () => {
    let state = createInitialGameState();
    state = {
      ...state,
      players: {
        ...state.players,
        P1: {
          ...state.players.P1,
          board: {
            ...state.players.P1.board,
            [WuXing.WOOD]: { yin: 0, yang: -1 }
          }
        }
      }
    };

    const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
    const actions = getAvailableActions(state, jiaWood);
    expect(actions).toContainEqual({
      actionType: ActionType.AUTO,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG
    });
  });

  it('3. When stem node is LIT (1) with YANG stem (甲 WOOD YANG), should propose CONVERT and ATK (WOOD -> EARTH)', () => {
    let state = createInitialGameState();
    state = {
      ...state,
      players: {
        ...state.players,
        P1: {
          ...state.players.P1,
          board: {
            ...state.players.P1.board,
            [WuXing.WOOD]: { yin: 0, yang: 1 }
          }
        }
      }
    };

    const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
    const actions = getAvailableActions(state, jiaWood);

    // Should include CONVERT to YIN
    expect(actions).toContainEqual({
      actionType: ActionType.CONVERT,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YIN
    });

    // Should include ATK against P2 EARTH (yin preferred first when yin > -1)
    expect(actions).toContainEqual({
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: Polarity.YIN
    });
  });

  it('4. When stem node is LIT (1) with YIN stem (乙 WOOD YIN), should propose CONVERT and TRANS (WOOD -> FIRE)', () => {
    let state = createInitialGameState();
    state = {
      ...state,
      players: {
        ...state.players,
        P1: {
          ...state.players.P1,
          board: {
            ...state.players.P1.board,
            [WuXing.WOOD]: { yin: 1, yang: 0 }
          }
        }
      }
    };

    const yiWood = TIAN_GAN_LIST.find((tg) => tg.name === '乙')!; // WOOD, YIN
    const actions = getAvailableActions(state, yiWood);

    // Should include CONVERT to YANG
    expect(actions).toContainEqual({
      actionType: ActionType.CONVERT,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG
    });

    // Should include TRANS to FIRE (yin preferred when yin < 2)
    expect(actions).toContainEqual({
      actionType: ActionType.TRANS,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: Polarity.YIN
    });
  });

  it('5. When any node achieves GuiYi (1, 1), should generate BURST and BURST_ATK', () => {
    let state = createInitialGameState();
    state = {
      ...state,
      players: {
        ...state.players,
        P1: {
          ...state.players.P1,
          board: {
            ...state.players.P1.board,
            [WuXing.METAL]: { yin: 1, yang: 1 }
          }
        }
      }
    };

    // Draw Bing Fire (丙 FIRE YANG, level 0)
    const bingFire = TIAN_GAN_LIST.find((tg) => tg.name === '丙')!;
    const actions = getAvailableActions(state, bingFire);

    // Regular stem action: AUTO on FIRE YANG
    expect(actions).toContainEqual({
      actionType: ActionType.AUTO,
      player: 'P1',
      element: WuXing.FIRE,
      polarity: Polarity.YANG
    });

    // Burst action: METAL GuiYi -> BURST (METAL生WATER) consuming YIN
    expect(actions).toContainEqual({
      actionType: ActionType.BURST,
      player: 'P1',
      sourceElement: WuXing.METAL,
      consumePolarity: Polarity.YIN,
      polarity: Polarity.YIN
    });

    // Burst action: METAL GuiYi -> BURST_ATK (METAL克WOOD) consuming YANG
    expect(actions).toContainEqual({
      actionType: ActionType.BURST_ATK,
      player: 'P1',
      sourceElement: WuXing.METAL,
      consumePolarity: Polarity.YANG,
      polarity: Polarity.YIN
    });
  });

  it('6. Priority selectors: getPlusTargetPolarity & getMinusTargetPolarity', () => {
    // Plus: yin < 2 first
    expect(getPlusTargetPolarity({ yin: 0, yang: 0 })).toBe(Polarity.YIN);
    expect(getPlusTargetPolarity({ yin: 1, yang: 0 })).toBe(Polarity.YIN);
    expect(getPlusTargetPolarity({ yin: 2, yang: 0 })).toBe(Polarity.YANG);
    expect(getPlusTargetPolarity({ yin: 2, yang: 2 })).toBeNull();

    // Minus: yin > -1 first
    expect(getMinusTargetPolarity({ yin: 0, yang: 0 })).toBe(Polarity.YIN);
    expect(getMinusTargetPolarity({ yin: 1, yang: 1 })).toBe(Polarity.YIN);
    expect(getMinusTargetPolarity({ yin: -1, yang: 0 })).toBe(Polarity.YANG);
    expect(getMinusTargetPolarity({ yin: -1, yang: -1 })).toBeNull();
  });

  it('7. Game Over state should yield 0 actions', () => {
    let state = createInitialGameState();
    state = { ...state, isGameOver: true, winner: 'P1' };
    const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!;
    expect(getAvailableActions(state, jiaWood)).toHaveLength(0);
  });
});

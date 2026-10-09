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

  it('2. When stem node is DAMAGE (-1), should propose AUTO only', () => {
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
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
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

  it('5. When drawn stem node achieves GuiYi (1, 1), should generate BURST and BURST_ATK for its element', () => {
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

    // Draw Geng Metal (庚 METAL YANG, level 1, node is GuiYi)
    const gengMetal = TIAN_GAN_LIST.find((tg) => tg.name === '庚')!;
    const actions = getAvailableActions(state, gengMetal);

    // Regular stem actions: CONVERT to YIN and ATK against P2 WOOD
    expect(actions).toContainEqual({
      actionType: ActionType.CONVERT,
      player: 'P1',
      element: WuXing.METAL,
      polarity: Polarity.YIN
    });
    expect(actions).toContainEqual({
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: WuXing.METAL,
      polarity: Polarity.YIN
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

  describe('8. Comprehensive 5-Element Coverage: Void (0) and Damage (-1) AUTO Exclusivity', () => {
    const ALL_ELEMENTS = [
      WuXing.WOOD,
      WuXing.FIRE,
      WuXing.EARTH,
      WuXing.METAL,
      WuXing.WATER
    ];

    for (const element of ALL_ELEMENTS) {
      const yangStem = TIAN_GAN_LIST.find(
        (tg) => tg.element === element && tg.polarity === Polarity.YANG
      )!;
      const yinStem = TIAN_GAN_LIST.find(
        (tg) => tg.element === element && tg.polarity === Polarity.YIN
      )!;

      it(`returns EXACTLY 1 action (AUTO) when ${element} YANG stem is VOID (0)`, () => {
        const state = createInitialGameState();
        const actions = getAvailableActions(state, yangStem);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toEqual({
          actionType: ActionType.AUTO,
          player: 'P1',
          element,
          polarity: Polarity.YANG
        });
      });

      it(`returns EXACTLY 1 action (AUTO) when ${element} YIN stem is VOID (0)`, () => {
        const state = createInitialGameState();
        const actions = getAvailableActions(state, yinStem);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toEqual({
          actionType: ActionType.AUTO,
          player: 'P1',
          element,
          polarity: Polarity.YIN
        });
      });

      it(`returns EXACTLY 1 action (AUTO) when ${element} YANG stem is DAMAGE (-1)`, () => {
        let state = createInitialGameState();
        state = {
          ...state,
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [element]: { yin: 0, yang: -1 }
              }
            }
          }
        };
        const actions = getAvailableActions(state, yangStem);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toEqual({
          actionType: ActionType.AUTO,
          player: 'P1',
          element,
          polarity: Polarity.YANG
        });
      });

      it(`returns EXACTLY 1 action (AUTO) when ${element} YIN stem is DAMAGE (-1)`, () => {
        let state = createInitialGameState();
        state = {
          ...state,
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [element]: { yin: -1, yang: 0 }
              }
            }
          }
        };
        const actions = getAvailableActions(state, yinStem);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toEqual({
          actionType: ActionType.AUTO,
          player: 'P1',
          element,
          polarity: Polarity.YIN
        });
      });

      it(`returns EXACTLY 1 action (AUTO) when ${element} is VOID (0) even if all other 4 elements are GuiYi`, () => {
        let state = createInitialGameState();
        const boardWithOtherGuiYi = { ...state.players.P1.board };
        for (const otherEl of ALL_ELEMENTS) {
          if (otherEl !== element) {
            boardWithOtherGuiYi[otherEl] = { yin: 1, yang: 1 };
          }
        }
        state = {
          ...state,
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: boardWithOtherGuiYi
            }
          }
        };

        const actions = getAvailableActions(state, yangStem);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toEqual({
          actionType: ActionType.AUTO,
          player: 'P1',
          element,
          polarity: Polarity.YANG
        });
      });

      it(`returns EXACTLY 1 action (AUTO) when ${element} is DAMAGE (-1) even if all other 4 elements are GuiYi`, () => {
        let state = createInitialGameState();
        const boardWithOtherGuiYi = { ...state.players.P1.board };
        for (const otherEl of ALL_ELEMENTS) {
          if (otherEl !== element) {
            boardWithOtherGuiYi[otherEl] = { yin: 1, yang: 1 };
          }
        }
        boardWithOtherGuiYi[element] = { yin: 0, yang: -1 };
        state = {
          ...state,
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: boardWithOtherGuiYi
            }
          }
        };

        const actions = getAvailableActions(state, yangStem);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toEqual({
          actionType: ActionType.AUTO,
          player: 'P1',
          element,
          polarity: Polarity.YANG
        });
      });
    }
  });

  describe('9. Comprehensive 5-Element Coverage: Current Drawn TianGan GuiYi Burst Gate (Rule A)', () => {
    const ALL_ELEMENTS = [
      WuXing.WOOD,
      WuXing.FIRE,
      WuXing.EARTH,
      WuXing.METAL,
      WuXing.WATER
    ];

    for (const element of ALL_ELEMENTS) {
      const yangStem = TIAN_GAN_LIST.find(
        (tg) => tg.element === element && tg.polarity === Polarity.YANG
      )!;
      const yinStem = TIAN_GAN_LIST.find(
        (tg) => tg.element === element && tg.polarity === Polarity.YIN
      )!;

      it(`generates BURST & BURST_ATK for ${element} when drawn YANG stem (${yangStem.name}) node is GuiYi (1, 1)`, () => {
        let state = createInitialGameState();
        state = {
          ...state,
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [element]: { yin: 1, yang: 1 }
              }
            }
          }
        };

        const actions = getAvailableActions(state, yangStem);

        const burstActions = actions.filter((a) => a.actionType === ActionType.BURST);
        expect(burstActions.length).toBeGreaterThan(0);
        for (const burst of burstActions) {
          expect(burst.sourceElement).toBe(element);
          expect(burst.consumePolarity).toBe(Polarity.YIN);
        }

        const burstAtkActions = actions.filter((a) => a.actionType === ActionType.BURST_ATK);
        expect(burstAtkActions.length).toBeGreaterThan(0);
        for (const burstAtk of burstAtkActions) {
          expect(burstAtk.sourceElement).toBe(element);
          expect(burstAtk.consumePolarity).toBe(Polarity.YANG);
        }

        // Must also provide normal actions (CONVERT, ATK)
        expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(true);
        expect(actions.some((a) => a.actionType === ActionType.ATK)).toBe(true);
      });

      it(`generates BURST & BURST_ATK for ${element} when drawn YIN stem (${yinStem.name}) node is GuiYi (1, 1)`, () => {
        let state = createInitialGameState();
        state = {
          ...state,
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [element]: { yin: 1, yang: 1 }
              }
            }
          }
        };

        const actions = getAvailableActions(state, yinStem);

        const burstActions = actions.filter((a) => a.actionType === ActionType.BURST);
        expect(burstActions.length).toBeGreaterThan(0);
        for (const burst of burstActions) {
          expect(burst.sourceElement).toBe(element);
          expect(burst.consumePolarity).toBe(Polarity.YIN);
        }

        const burstAtkActions = actions.filter((a) => a.actionType === ActionType.BURST_ATK);
        expect(burstAtkActions.length).toBeGreaterThan(0);
        for (const burstAtk of burstAtkActions) {
          expect(burstAtk.sourceElement).toBe(element);
          expect(burstAtk.consumePolarity).toBe(Polarity.YANG);
        }

        // Must also provide normal actions (CONVERT, TRANS)
        expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(true);
        expect(actions.some((a) => a.actionType === ActionType.TRANS)).toBe(true);
      });
    }
  });

  describe('10. Comprehensive 5-Element Coverage: Single-Lit Non-GuiYi Strictly Excludes Burst Even When Other Elements Are GuiYi', () => {
    const ALL_ELEMENTS = [
      WuXing.WOOD,
      WuXing.FIRE,
      WuXing.EARTH,
      WuXing.METAL,
      WuXing.WATER
    ];

    for (const element of ALL_ELEMENTS) {
      const yangStem = TIAN_GAN_LIST.find(
        (tg) => tg.element === element && tg.polarity === Polarity.YANG
      )!;
      const yinStem = TIAN_GAN_LIST.find(
        (tg) => tg.element === element && tg.polarity === Polarity.YIN
      )!;

      it(`strictly excludes BURST and BURST_ATK when drawn YANG stem (${yangStem.name}) is single-lit (yang:1, yin:0) and all other 4 elements are GuiYi`, () => {
        let state = createInitialGameState();
        const board = { ...state.players.P1.board };
        for (const otherEl of ALL_ELEMENTS) {
          board[otherEl] = otherEl === element ? { yin: 0, yang: 1 } : { yin: 1, yang: 1 };
        }
        state = {
          ...state,
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board
            }
          }
        };

        const actions = getAvailableActions(state, yangStem);

        // Under Rule A, only current stem's element can burst, and it's not GuiYi!
        const burstActions = actions.filter(
          (a) => a.actionType === ActionType.BURST || a.actionType === ActionType.BURST_ATK
        );
        expect(burstActions).toHaveLength(0);

        // Normal actions should still be available
        expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(true);
        expect(actions.some((a) => a.actionType === ActionType.ATK)).toBe(true);
      });

      it(`strictly excludes BURST and BURST_ATK when drawn YIN stem (${yinStem.name}) is single-lit (yin:1, yang:0) and all other 4 elements are GuiYi`, () => {
        let state = createInitialGameState();
        const board = { ...state.players.P1.board };
        for (const otherEl of ALL_ELEMENTS) {
          board[otherEl] = otherEl === element ? { yin: 1, yang: 0 } : { yin: 1, yang: 1 };
        }
        state = {
          ...state,
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board
            }
          }
        };

        const actions = getAvailableActions(state, yinStem);

        // Under Rule A, only current stem's element can burst, and it's not GuiYi!
        const burstActions = actions.filter(
          (a) => a.actionType === ActionType.BURST || a.actionType === ActionType.BURST_ATK
        );
        expect(burstActions).toHaveLength(0);

        // Normal actions should still be available
        expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(true);
        expect(actions.some((a) => a.actionType === ActionType.TRANS)).toBe(true);
      });
    }
  });

  describe('KangJi Dissipation (亢极散气 - 极位态强制流转)', () => {
    it('forces DISSIPATE on YANG side when node is at (2, 2) and YANG stem is drawn', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: 2, yang: 2 }
            }
          }
        }
      };

      const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
      const actions = getAvailableActions(state, jiaWood);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        actionType: ActionType.DISSIPATE,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });
    });

    it('forces DISSIPATE on YIN side when node is at (2, 2) and YIN stem is drawn', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.FIRE]: { yin: 2, yang: 2 }
            }
          }
        }
      };

      const dingFire = TIAN_GAN_LIST.find((tg) => tg.name === '丁')!; // FIRE, YIN
      const actions = getAvailableActions(state, dingFire);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        actionType: ActionType.DISSIPATE,
        player: 'P1',
        element: WuXing.FIRE,
        polarity: Polarity.YIN
      });
    });

    it('does NOT trigger DISSIPATE when node is at intermediate state with single blessed side (1, 2)', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 2 }
            }
          }
        }
      };

      const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
      const actions = getAvailableActions(state, jiaWood);

      expect(actions.some((a) => a.actionType === ActionType.DISSIPATE)).toBe(false);
      expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(true);
      expect(actions.some((a) => a.actionType === ActionType.ATK)).toBe(true);
      expect(actions.some((a) => a.actionType === ActionType.BURST)).toBe(true);
      expect(actions.some((a) => a.actionType === ActionType.BURST_ATK)).toBe(true);
    });

    it('does NOT trigger DISSIPATE or BURST when node is at (2, 0)', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: 0, yang: 2 }
            }
          }
        }
      };

      const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
      const actions = getAvailableActions(state, jiaWood);

      expect(actions.some((a) => a.actionType === ActionType.DISSIPATE)).toBe(false);
      expect(actions.some((a) => a.actionType === ActionType.BURST)).toBe(false);
      expect(actions.some((a) => a.actionType === ActionType.BURST_ATK)).toBe(false);
      expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(true);
      expect(actions.some((a) => a.actionType === ActionType.ATK)).toBe(true);
    });
  });
});

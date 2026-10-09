import { describe, it, expect } from 'vitest';
import {
  ActionType,
  WuXing,
  Polarity,
  TIAN_GAN_LIST,
  GameState,
  NodeData
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

    // Opposite polarity is LIT (1), so CONVERT is strictly prohibited under tightened gate
    expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(false);
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

        // CONVERT is prohibited because opposite is LIT (1); ATK remains available
        expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(false);
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

        // CONVERT is prohibited because opposite is LIT (1); TRANS remains available
        expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(false);
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
      expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(false);
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

  describe('Ticket 01: CONVERT Gate Tightening & PASS Resolution', () => {
    it('prohibits CONVERT when opposite polarity is LIT (1)', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 }
            }
          }
        }
      };

      const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
      const actions = getAvailableActions(state, jiaWood);
      expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(false);
    });

    it('prohibits CONVERT when opposite polarity is BLESSED (2)', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: 2, yang: 1 }
            }
          }
        }
      };

      const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
      const actions = getAvailableActions(state, jiaWood);
      expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(false);
    });

    it('allows CONVERT when opposite polarity is VOID (0)', () => {
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
      expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(true);
    });

    it('allows CONVERT when opposite polarity is DAMAGE (-1)', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: -1, yang: 1 }
            }
          }
        }
      };

      const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
      const actions = getAvailableActions(state, jiaWood);
      expect(actions.some((a) => a.actionType === ActionType.CONVERT)).toBe(true);
    });

    it('generates PASS (and strictly NOT AUTO) when mid-state player has no legal actions', () => {
      let state = createInitialGameState();
      // P1 has WOOD at (1, 1), P2 has EARTH (WOOD overcomes EARTH) at (-1, -1)
      // Burst actions are disabled during extra turn
      state = {
        ...state,
        players: {
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 }
            }
          },
          P2: {
            ...state.players.P2,
            board: {
              ...state.players.P2.board,
              [WuXing.EARTH]: { yin: -1, yang: -1 }
            }
          }
        }
      };

      const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
      // In extraTurn, burst is prohibited
      const actions = getAvailableActions(state, jiaWood, { isExtraTurn: true });

      // No CONVERT because yin = 1
      // No ATK because P2 EARTH is (-1, -1)
      // No BURST because isExtraTurn: true
      // Therefore, actions MUST be PASS!
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        actionType: ActionType.PASS,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });
    });
  });

  describe('Ticket 02: Symmetric Low-State Redirect (Variant B, default OFF)', () => {
    const ALL_ELEMENTS = [
      WuXing.WOOD,
      WuXing.FIRE,
      WuXing.EARTH,
      WuXing.METAL,
      WuXing.WATER
    ];

    const buildState = (
      p1: Partial<Record<WuXing, NodeData>>,
      p2: Partial<Record<WuXing, NodeData>> = {}
    ): GameState => {
      const base = createInitialGameState();
      return {
        ...base,
        players: {
          P1: { ...base.players.P1, board: { ...base.players.P1.board, ...p1 } },
          P2: { ...base.players.P2, board: { ...base.players.P2.board, ...p2 } }
        }
      };
    };

    const AUTO_ONLY = (element: WuXing, polarity: Polarity) => [
      { actionType: ActionType.AUTO, player: 'P1', element, polarity }
    ];

    it('keeps low-state at AUTO-only when the switch is absent or explicitly false', () => {
      const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
      const state = buildState({});

      expect(getAvailableActions(state, jiaWood)).toEqual(AUTO_ONLY(WuXing.WOOD, Polarity.YANG));
      expect(getAvailableActions(state, jiaWood, { lowStateRedirect: false })).toEqual(
        AUTO_ONLY(WuXing.WOOD, Polarity.YANG)
      );
    });

    it('ON + YIN stem low-state proposes exactly [AUTO, TRANS] toward the generation node', () => {
      const yiWood = TIAN_GAN_LIST.find((tg) => tg.name === '乙')!; // WOOD, YIN
      const state = buildState({ [WuXing.WOOD]: { yin: 0, yang: 0 } });

      const actions = getAvailableActions(state, yiWood, { lowStateRedirect: true });

      expect(actions).toEqual([
        { actionType: ActionType.AUTO, player: 'P1', element: WuXing.WOOD, polarity: Polarity.YIN },
        {
          actionType: ActionType.TRANS,
          player: 'P1',
          sourceElement: WuXing.WOOD,
          polarity: Polarity.YIN
        }
      ]);
    });

    it('ON + YANG stem low-state proposes exactly [AUTO, ATK] toward the overcoming node', () => {
      const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
      const state = buildState({ [WuXing.WOOD]: { yin: 0, yang: 0 } });

      const actions = getAvailableActions(state, jiaWood, { lowStateRedirect: true });

      expect(actions).toEqual([
        { actionType: ActionType.AUTO, player: 'P1', element: WuXing.WOOD, polarity: Polarity.YANG },
        {
          actionType: ActionType.ATK,
          player: 'P1',
          sourceElement: WuXing.WOOD,
          polarity: Polarity.YIN
        }
      ]);
    });

    it('ON + YIN low-state falls back to [AUTO] when the generation node is already KangJi (2,2)', () => {
      const yiWood = TIAN_GAN_LIST.find((tg) => tg.name === '乙')!;
      const state = buildState({
        [WuXing.WOOD]: { yin: 0, yang: 0 },
        [WuXing.FIRE]: { yin: 2, yang: 2 } // 相生节点已亢极，【化】无有效目标
      });

      const actions = getAvailableActions(state, yiWood, { lowStateRedirect: true });
      expect(actions).toEqual(AUTO_ONLY(WuXing.WOOD, Polarity.YIN));
    });

    it('ON + YANG low-state falls back to [AUTO] when the opponent overcoming node is fully DAMAGE (-1,-1)', () => {
      const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!;
      const state = buildState(
        { [WuXing.WOOD]: { yin: 0, yang: 0 } },
        { [WuXing.EARTH]: { yin: -1, yang: -1 } } // 对手相克节点已全道损，【破】无有效目标
      );

      const actions = getAvailableActions(state, jiaWood, { lowStateRedirect: true });
      expect(actions).toEqual(AUTO_ONLY(WuXing.WOOD, Polarity.YANG));
    });

    it('ON + drawn node already KangJi (2,2) still forces only [DISSIPATE]', () => {
      const yiWood = TIAN_GAN_LIST.find((tg) => tg.name === '乙')!;
      const state = buildState({ [WuXing.WOOD]: { yin: 2, yang: 2 } });

      const actions = getAvailableActions(state, yiWood, { lowStateRedirect: true });
      expect(actions).toEqual([
        {
          actionType: ActionType.DISSIPATE,
          player: 'P1',
          element: WuXing.WOOD,
          polarity: Polarity.YIN
        }
      ]);
    });

    it('ON + extra turn behaves exactly like OFF (no new branch)', () => {
      const yiWood = TIAN_GAN_LIST.find((tg) => tg.name === '乙')!;
      const state = buildState({ [WuXing.WOOD]: { yin: 0, yang: 0 } });

      expect(getAvailableActions(state, yiWood, { lowStateRedirect: true, isExtraTurn: true })).toEqual(
        AUTO_ONLY(WuXing.WOOD, Polarity.YIN)
      );
      expect(getAvailableActions(state, yiWood, { isExtraTurn: true })).toEqual(
        AUTO_ONLY(WuXing.WOOD, Polarity.YIN)
      );
    });

    it('ON preserves yin↔TRANS / yang↔ATK symmetry across all five elements', () => {
      for (const element of ALL_ELEMENTS) {
        const yangStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === element && tg.polarity === Polarity.YANG
        )!;
        const yinStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === element && tg.polarity === Polarity.YIN
        )!;
        const state = buildState({});

        const yinActions = getAvailableActions(state, yinStem, { lowStateRedirect: true });
        expect(yinActions.map((a) => a.actionType)).toEqual([ActionType.AUTO, ActionType.TRANS]);
        expect(yinActions[1]).toMatchObject({ sourceElement: element, polarity: Polarity.YIN });

        const yangActions = getAvailableActions(state, yangStem, { lowStateRedirect: true });
        expect(yangActions.map((a) => a.actionType)).toEqual([ActionType.AUTO, ActionType.ATK]);
        expect(yangActions[1]).toMatchObject({ sourceElement: element, polarity: Polarity.YIN });
      }
    });
  });
});


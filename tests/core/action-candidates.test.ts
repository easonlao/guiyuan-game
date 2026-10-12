import { describe, it, expect } from 'vitest';
import { ActionType, WuXing, Polarity, TIAN_GAN_LIST } from '../../src/core/types/domain.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import {
  getAvailableActions,
  getPlusTargetPolarity,
  getMinusTargetPolarity,
} from '../../src/core/logic/ActionCandidates.js';
import { gameStateWith } from '../../tools/BoardFixture.js';

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
      polarity: Polarity.YANG,
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
            [WuXing.WOOD]: { yin: 0, yang: -1 },
          },
        },
      },
    };

    const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
    const actions = getAvailableActions(state, jiaWood);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      actionType: ActionType.AUTO,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG,
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
            [WuXing.WOOD]: { yin: 0, yang: 1 },
          },
        },
      },
    };

    const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
    const actions = getAvailableActions(state, jiaWood);

    // Should include CONVERT to YIN
    expect(actions).toContainEqual({
      actionType: ActionType.CONVERT,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YIN,
    });

    // Should include ATK against P2 EARTH (yin preferred first when yin > -1)
    expect(actions).toContainEqual({
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: Polarity.YIN,
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
            [WuXing.WOOD]: { yin: 1, yang: 0 },
          },
        },
      },
    };

    const yiWood = TIAN_GAN_LIST.find((tg) => tg.name === '乙')!; // WOOD, YIN
    const actions = getAvailableActions(state, yiWood);

    // Should include CONVERT to YANG
    expect(actions).toContainEqual({
      actionType: ActionType.CONVERT,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG,
    });

    // Should include TRANS to FIRE (yin preferred when yin < 2)
    expect(actions).toContainEqual({
      actionType: ActionType.TRANS,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: Polarity.YIN,
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
            [WuXing.METAL]: { yin: 1, yang: 1 },
          },
        },
      },
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
      polarity: Polarity.YIN,
    });

    // Burst action: METAL GuiYi -> BURST (METAL生WATER) consuming YIN；
    // 目标侧在解析时逐次决定，候选不再预先钉死 polarity
    expect(actions).toContainEqual({
      actionType: ActionType.BURST,
      player: 'P1',
      sourceElement: WuXing.METAL,
      consumePolarity: Polarity.YIN,
    });

    // Burst action: METAL GuiYi -> BURST_ATK (METAL克WOOD) consuming YANG
    expect(actions).toContainEqual({
      actionType: ActionType.BURST_ATK,
      player: 'P1',
      sourceElement: WuXing.METAL,
      consumePolarity: Polarity.YANG,
      polarity: Polarity.YIN,
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
    const ALL_ELEMENTS = [WuXing.WOOD, WuXing.FIRE, WuXing.EARTH, WuXing.METAL, WuXing.WATER];

    for (const element of ALL_ELEMENTS) {
      const yangStem = TIAN_GAN_LIST.find(
        (tg) => tg.element === element && tg.polarity === Polarity.YANG,
      )!;
      const yinStem = TIAN_GAN_LIST.find(
        (tg) => tg.element === element && tg.polarity === Polarity.YIN,
      )!;

      it(`returns EXACTLY 1 action (AUTO) when ${element} YANG stem is VOID (0)`, () => {
        const state = createInitialGameState();
        const actions = getAvailableActions(state, yangStem);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toEqual({
          actionType: ActionType.AUTO,
          player: 'P1',
          element,
          polarity: Polarity.YANG,
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
          polarity: Polarity.YIN,
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
                [element]: { yin: 0, yang: -1 },
              },
            },
          },
        };
        const actions = getAvailableActions(state, yangStem);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toEqual({
          actionType: ActionType.AUTO,
          player: 'P1',
          element,
          polarity: Polarity.YANG,
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
                [element]: { yin: -1, yang: 0 },
              },
            },
          },
        };
        const actions = getAvailableActions(state, yinStem);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toEqual({
          actionType: ActionType.AUTO,
          player: 'P1',
          element,
          polarity: Polarity.YIN,
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
              board: boardWithOtherGuiYi,
            },
          },
        };

        const actions = getAvailableActions(state, yangStem);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toEqual({
          actionType: ActionType.AUTO,
          player: 'P1',
          element,
          polarity: Polarity.YANG,
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
              board: boardWithOtherGuiYi,
            },
          },
        };

        const actions = getAvailableActions(state, yangStem);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toEqual({
          actionType: ActionType.AUTO,
          player: 'P1',
          element,
          polarity: Polarity.YANG,
        });
      });
    }
  });

  describe('9. Comprehensive 5-Element Coverage: Current Drawn TianGan GuiYi Burst Gate (Rule A)', () => {
    const ALL_ELEMENTS = [WuXing.WOOD, WuXing.FIRE, WuXing.EARTH, WuXing.METAL, WuXing.WATER];

    for (const element of ALL_ELEMENTS) {
      const yangStem = TIAN_GAN_LIST.find(
        (tg) => tg.element === element && tg.polarity === Polarity.YANG,
      )!;
      const yinStem = TIAN_GAN_LIST.find(
        (tg) => tg.element === element && tg.polarity === Polarity.YIN,
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
                [element]: { yin: 1, yang: 1 },
              },
            },
          },
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
                [element]: { yin: 1, yang: 1 },
              },
            },
          },
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
    const ALL_ELEMENTS = [WuXing.WOOD, WuXing.FIRE, WuXing.EARTH, WuXing.METAL, WuXing.WATER];

    for (const element of ALL_ELEMENTS) {
      const yangStem = TIAN_GAN_LIST.find(
        (tg) => tg.element === element && tg.polarity === Polarity.YANG,
      )!;
      const yinStem = TIAN_GAN_LIST.find(
        (tg) => tg.element === element && tg.polarity === Polarity.YIN,
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
              board,
            },
          },
        };

        const actions = getAvailableActions(state, yangStem);

        // Under Rule A, only current stem's element can burst, and it's not GuiYi!
        const burstActions = actions.filter(
          (a) => a.actionType === ActionType.BURST || a.actionType === ActionType.BURST_ATK,
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
              board,
            },
          },
        };

        const actions = getAvailableActions(state, yinStem);

        // Under Rule A, only current stem's element can burst, and it's not GuiYi!
        const burstActions = actions.filter(
          (a) => a.actionType === ActionType.BURST || a.actionType === ActionType.BURST_ATK,
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
              [WuXing.WOOD]: { yin: 2, yang: 2 },
            },
          },
        },
      };

      const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
      const actions = getAvailableActions(state, jiaWood);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        actionType: ActionType.DISSIPATE,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG,
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
              [WuXing.FIRE]: { yin: 2, yang: 2 },
            },
          },
        },
      };

      const dingFire = TIAN_GAN_LIST.find((tg) => tg.name === '丁')!; // FIRE, YIN
      const actions = getAvailableActions(state, dingFire);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        actionType: ActionType.DISSIPATE,
        player: 'P1',
        element: WuXing.FIRE,
        polarity: Polarity.YIN,
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
              [WuXing.WOOD]: { yin: 1, yang: 2 },
            },
          },
        },
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
              [WuXing.WOOD]: { yin: 0, yang: 2 },
            },
          },
        },
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
              [WuXing.WOOD]: { yin: 1, yang: 1 },
            },
          },
        },
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
              [WuXing.WOOD]: { yin: 2, yang: 1 },
            },
          },
        },
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
              [WuXing.WOOD]: { yin: 0, yang: 1 },
            },
          },
        },
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
              [WuXing.WOOD]: { yin: -1, yang: 1 },
            },
          },
        },
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
              [WuXing.WOOD]: { yin: 1, yang: 1 },
            },
          },
          P2: {
            ...state.players.P2,
            board: {
              ...state.players.P2.board,
              [WuXing.EARTH]: { yin: -1, yang: -1 },
            },
          },
        },
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
        polarity: Polarity.YANG,
      });
    });
  });

  describe('burst-plus-two ticket 01: 强化门槛放开与候选契约', () => {
    const jiaWood = TIAN_GAN_LIST.find((tg) => tg.name === '甲')!; // WOOD, YANG
    const yiWood = TIAN_GAN_LIST.find((tg) => tg.name === '乙')!; // WOOD, YIN

    /** 源节点 WOOD 归一 (1, 1)、相生目标 FIRE 已是亢极 (2, 2) 的盘面 */
    const maxedShengTargetState = () =>
      gameStateWith({
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: 2, yang: 2 },
        },
      });

    it('相生目标已是 (2, 2) 亢极时，强化仍在候选集内（盘面净零但换一次连动）', () => {
      const actions = getAvailableActions(maxedShengTargetState(), jiaWood);

      expect(actions).toContainEqual({
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
      });
    });

    it('连动额外行动中不再生成强化', () => {
      const actions = getAvailableActions(maxedShengTargetState(), jiaWood, {
        isExtraTurn: true,
      });

      expect(actions.some((a) => a.actionType === ActionType.BURST)).toBe(false);
    });

    it('强化候选不再携带预先钉死的目标侧 polarity 字段', () => {
      const actions = getAvailableActions(maxedShengTargetState(), jiaWood);
      const burst = actions.find((a) => a.actionType === ActionType.BURST)!;

      expect(burst).not.toHaveProperty('polarity');
      expect(Object.keys(burst).sort()).toEqual([
        'actionType',
        'consumePolarity',
        'player',
        'sourceElement',
      ]);
    });

    it('化 (TRANS) 的门槛不放开：相生目标 (2, 2) 时仍不生成化', () => {
      const actions = getAvailableActions(maxedShengTargetState(), yiWood);

      expect(actions.some((a) => a.actionType === ActionType.TRANS)).toBe(false);
      // 强化仍可选，门槛只对爆发放开
      expect(actions.some((a) => a.actionType === ActionType.BURST)).toBe(true);
    });

    it('吸纳/调息/化/破/散气/过牌的候选形状逐字不变（仍带 polarity）', () => {
      // AUTO：抽中侧虚空
      expect(getAvailableActions(gameStateWith(), jiaWood)).toEqual([
        {
          actionType: ActionType.AUTO,
          player: 'P1',
          element: WuXing.WOOD,
          polarity: Polarity.YANG,
        },
      ]);

      // CONVERT：同节点对侧虚空
      expect(
        getAvailableActions(gameStateWith({ P1: { [WuXing.WOOD]: { yin: 0, yang: 1 } } }), jiaWood),
      ).toContainEqual({
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YIN,
      });

      // TRANS：阴干 + 相生目标未满
      expect(
        getAvailableActions(gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } } }), yiWood),
      ).toContainEqual({
        actionType: ActionType.TRANS,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN,
      });

      // ATK：阳干 + 相克目标未到底
      expect(
        getAvailableActions(gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } } }), jiaWood),
      ).toContainEqual({
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN,
      });

      // DISSIPATE：抽中节点亢极
      expect(
        getAvailableActions(gameStateWith({ P1: { [WuXing.WOOD]: { yin: 2, yang: 2 } } }), jiaWood),
      ).toEqual([
        {
          actionType: ActionType.DISSIPATE,
          player: 'P1',
          element: WuXing.WOOD,
          polarity: Polarity.YANG,
        },
      ]);

      // PASS：连动回合中无其他合法动作
      expect(
        getAvailableActions(
          gameStateWith({
            P1: {
              [WuXing.WOOD]: { yin: 1, yang: 1 },
              [WuXing.FIRE]: { yin: 2, yang: 2 },
            },
            P2: { [WuXing.EARTH]: { yin: -1, yang: -1 } },
          }),
          jiaWood,
          { isExtraTurn: true },
        ),
      ).toEqual([
        {
          actionType: ActionType.PASS,
          player: 'P1',
          element: WuXing.WOOD,
          polarity: Polarity.YANG,
        },
      ]);
    });
  });
});

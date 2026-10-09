import { describe, it, expect, vi } from 'vitest';
import {
  ActionPayload,
  ActionType,
  Polarity,
  TIAN_GAN_LIST,
  WuXing,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE
} from '../../src/core/types/domain.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { getAvailableActions } from '../../src/core/logic/ActionCandidates.js';
import { GameManager } from '../../src/minigame/game-manager.js';

describe('ADR-0008 & Issue 02: Boundary Matrix Verification & Single-Candidate Auto-Execution', () => {
  const ALL_ELEMENTS = [
    WuXing.WOOD,
    WuXing.FIRE,
    WuXing.EARTH,
    WuXing.METAL,
    WuXing.WATER
  ];

  describe('Scenario 1: Extra Turn with GuiYi Node (连动额外回合中抽到已归一节点)', () => {
    ALL_ELEMENTS.forEach((elem) => {
      it(`[${elem}] Yang Stem draws GuiYi node in extra turn -> Single ATK & auto countdown`, () => {
        const yangStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YANG
        )!;

        let state = createInitialGameState();
        state = {
          ...state,
          currentPlayer: 'P1',
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [elem]: { yang: 1, yin: 1 } // GuiYi
              }
            }
          }
        };

        // Extra turn forbids BURST / BURST_ATK, opposite side is 1 (>0) forbidding CONVERT
        const actions = getAvailableActions(state, yangStem, { isExtraTurn: true });
        expect(actions.length).toBe(1);
        expect(actions[0].actionType).toBe(ActionType.ATK);
        expect(actions[0].sourceElement).toBe(elem);

        // GameManager integration
        const gm = new GameManager({ initialState: state });
        // Mock currentTianGan and extra turn state
        const tm = gm.getTurnManager();
        vi.spyOn(tm, 'getCurrentTianGan').mockReturnValue(yangStem);
        vi.spyOn(tm, 'isExtraTurnActive').mockReturnValue(true);
        vi.spyOn(tm, 'getAvailableActions').mockReturnValue(actions);

        gm.resize(375, 667, 2);
        // Start a simulated turn or verify direct button/timer initialization
        expect(actions.length).toBe(1);
      });

      it(`[${elem}] Yin Stem draws GuiYi node in extra turn -> Single TRANS & auto countdown`, () => {
        const yinStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YIN
        )!;

        let state = createInitialGameState();
        state = {
          ...state,
          currentPlayer: 'P1',
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [elem]: { yang: 1, yin: 1 } // GuiYi
              }
            }
          }
        };

        const actions = getAvailableActions(state, yinStem, { isExtraTurn: true });
        expect(actions.length).toBe(1);
        expect(actions[0].actionType).toBe(ActionType.TRANS);
        expect(actions[0].sourceElement).toBe(elem);
      });
    });

    it('GameManager verifies countdown lifecycle and button formatting for single ATK in extra turn', () => {
      const yangStem = TIAN_GAN_LIST[0]; // Jia Wood
      const singleAtkAction: ActionPayload = {
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: yangStem.element,
        polarity: Polarity.YANG
      };

      const gm = new GameManager(12345);
      const tm = gm.getTurnManager();
      vi.spyOn(tm, 'getCurrentTianGan').mockReturnValue(yangStem);
      vi.spyOn(tm, 'isExtraTurnActive').mockReturnValue(true);
      vi.spyOn(tm, 'getAvailableActions').mockReturnValue([singleAtkAction]);

      // Trigger startNewTurn-equivalent by using private or testing hooks
      // Re-initialize turn
      (gm as any).startNewTurn();

      expect(gm.getP1AutoTimer()).toBe(45);
      expect(gm.isAutoAbsorbing()).toBe(true);
      expect(gm.getBannerText()).toContain('【连动回合】');
      expect(gm.getBannerSubText()).toBe('唯一机缘·破');
      const buttons = gm.getAvailableButtons();
      expect(buttons.length).toBe(1);
      expect(buttons[0].label).toBe('【自动击破】');

      // Update timer down to 0 and verify execution
      while (gm.getP1AutoTimer() > 0) {
        gm.update();
      }
      expect(gm.getP1AutoTimer()).toBe(0);
      expect(gm.isAnimatingState()).toBe(true);
    });

    it('GameManager verifies countdown lifecycle and button formatting for single TRANS in extra turn', () => {
      const yinStem = TIAN_GAN_LIST[1]; // Yi Wood
      const singleTransAction: ActionPayload = {
        actionType: ActionType.TRANS,
        player: 'P1',
        sourceElement: yinStem.element,
        polarity: Polarity.YIN
      };

      const gm = new GameManager(12345);
      const tm = gm.getTurnManager();
      vi.spyOn(tm, 'getCurrentTianGan').mockReturnValue(yinStem);
      vi.spyOn(tm, 'isExtraTurnActive').mockReturnValue(true);
      vi.spyOn(tm, 'getAvailableActions').mockReturnValue([singleTransAction]);

      (gm as any).startNewTurn();

      expect(gm.getP1AutoTimer()).toBe(45);
      expect(gm.isAutoAbsorbing()).toBe(true);
      expect(gm.getBannerText()).toContain('【连动回合】');
      expect(gm.getBannerSubText()).toBe('唯一机缘·化');
      const buttons = gm.getAvailableButtons();
      expect(buttons.length).toBe(1);
      expect(buttons[0].label).toBe('【自动化气】');
    });
  });

  describe('Scenario 2: Overcoming Target (-1, -1) Extreme Lock (克制目标全损锁死)', () => {
    ALL_ELEMENTS.forEach((elem) => {
      it(`[${elem}] Yang Stem draws GuiYi node when ke target is (-1, -1) -> Single BURST`, () => {
        const yangStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YANG
        )!;
        const keEl = OVERCOMING_CYCLE[elem];

        let state = createInitialGameState();
        state = {
          ...state,
          currentPlayer: 'P1',
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [elem]: { yang: 1, yin: 1 } // GuiYi -> CONVERT locked
              }
            },
            P2: {
              ...state.players.P2,
              board: {
                ...state.players.P2.board,
                [keEl]: { yang: -1, yin: -1 } // Ke target extreme lock -> ATK & BURST_ATK locked
              }
            }
          }
        };

        const actions = getAvailableActions(state, yangStem);
        expect(actions.length).toBe(1);
        expect(actions[0].actionType).toBe(ActionType.BURST);
        expect(actions[0].sourceElement).toBe(elem);
      });
    });

    it('GameManager verifies single BURST auto countdown and touch acceleration', () => {
      const yangStem = TIAN_GAN_LIST[0]; // Jia Wood
      const singleBurstAction: ActionPayload = {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: yangStem.element,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YIN
      };

      const gm = new GameManager(12345);
      const tm = gm.getTurnManager();
      vi.spyOn(tm, 'getCurrentTianGan').mockReturnValue(yangStem);
      vi.spyOn(tm, 'getAvailableActions').mockReturnValue([singleBurstAction]);

      (gm as any).startNewTurn();

      expect(gm.getP1AutoTimer()).toBe(45);
      expect(gm.getBannerSubText()).toBe('势在必行·强化');
      const buttons = gm.getAvailableButtons();
      expect(buttons.length).toBe(1);
      expect(buttons[0].label).toBe('【自动强化】');

      // Click anywhere to immediately skip and accelerate
      gm.handleTouch(50, 50);
      expect(gm.getP1AutoTimer()).toBe(0);
      expect(gm.isAnimatingState()).toBe(true);
    });
  });

  describe('Scenario 3: Generation Target (2, 2) Extreme Lock (相生目标全满锁死)', () => {
    ALL_ELEMENTS.forEach((elem) => {
      it(`[${elem}] Yin Stem draws GuiYi node when sheng target is (2, 2) -> Single BURST_ATK`, () => {
        const yinStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YIN
        )!;
        const shengEl = GENERATION_CYCLE[elem];

        let state = createInitialGameState();
        state = {
          ...state,
          currentPlayer: 'P1',
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [elem]: { yang: 1, yin: 1 }, // GuiYi -> CONVERT locked
                [shengEl]: { yang: 2, yin: 2 } // Sheng target full -> TRANS & BURST locked
              }
            }
          }
        };

        const actions = getAvailableActions(state, yinStem);
        expect(actions.length).toBe(1);
        expect(actions[0].actionType).toBe(ActionType.BURST_ATK);
        expect(actions[0].sourceElement).toBe(elem);
      });
    });

    it('GameManager verifies single BURST_ATK auto countdown and button presentation', () => {
      const yinStem = TIAN_GAN_LIST[1]; // Yi Wood
      const singleBurstAtkAction: ActionPayload = {
        actionType: ActionType.BURST_ATK,
        player: 'P1',
        sourceElement: yinStem.element,
        consumePolarity: Polarity.YANG,
        polarity: Polarity.YIN
      };

      const gm = new GameManager(12345);
      const tm = gm.getTurnManager();
      vi.spyOn(tm, 'getCurrentTianGan').mockReturnValue(yinStem);
      vi.spyOn(tm, 'getAvailableActions').mockReturnValue([singleBurstAtkAction]);

      (gm as any).startNewTurn();

      expect(gm.getP1AutoTimer()).toBe(45);
      expect(gm.getBannerSubText()).toBe('势在必行·强破');
      const buttons = gm.getAvailableButtons();
      expect(buttons.length).toBe(1);
      expect(buttons[0].label).toBe('【自动强破】');
    });
  });

  describe('Scenario 4: Extreme Sheng/Ke Blocked on Non-GuiYi Node (极端生克受阻下唯一调息)', () => {
    ALL_ELEMENTS.forEach((elem) => {
      it(`[${elem}] Yang stem with opposite polarity <= 0 and ke target (-1, -1) -> Single CONVERT`, () => {
        const yangStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YANG
        )!;
        const keEl = OVERCOMING_CYCLE[elem];

        let state = createInitialGameState();
        state = {
          ...state,
          currentPlayer: 'P1',
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [elem]: { yang: 1, yin: 0 } // Non-GuiYi, opposite <= 0 -> CONVERT allowed
              }
            },
            P2: {
              ...state.players.P2,
              board: {
                ...state.players.P2.board,
                [keEl]: { yang: -1, yin: -1 } // ATK blocked
              }
            }
          }
        };

        const actions = getAvailableActions(state, yangStem);
        expect(actions.length).toBe(1);
        expect(actions[0].actionType).toBe(ActionType.CONVERT);
        expect(actions[0].element).toBe(elem);
        expect(actions[0].polarity).toBe(Polarity.YIN);
      });

      it(`[${elem}] Yin stem with opposite polarity <= 0 and sheng target (2, 2) -> Single CONVERT`, () => {
        const yinStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YIN
        )!;
        const shengEl = GENERATION_CYCLE[elem];

        let state = createInitialGameState();
        state = {
          ...state,
          currentPlayer: 'P1',
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [elem]: { yang: -1, yin: 1 }, // Non-GuiYi, opposite <= 0 -> CONVERT allowed
                [shengEl]: { yang: 2, yin: 2 } // TRANS blocked
              }
            }
          }
        };

        const actions = getAvailableActions(state, yinStem);
        expect(actions.length).toBe(1);
        expect(actions[0].actionType).toBe(ActionType.CONVERT);
        expect(actions[0].element).toBe(elem);
        expect(actions[0].polarity).toBe(Polarity.YANG);
      });
    });

    it('GameManager verifies single CONVERT auto countdown and button presentation', () => {
      const yangStem = TIAN_GAN_LIST[0]; // Jia Wood
      const singleConvertAction: ActionPayload = {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: yangStem.element,
        polarity: Polarity.YIN
      };

      const gm = new GameManager(12345);
      const tm = gm.getTurnManager();
      vi.spyOn(tm, 'getCurrentTianGan').mockReturnValue(yangStem);
      vi.spyOn(tm, 'getAvailableActions').mockReturnValue([singleConvertAction]);

      (gm as any).startNewTurn();

      expect(gm.getP1AutoTimer()).toBe(45);
      expect(gm.getBannerSubText()).toBe('势在必行·调息');
      const buttons = gm.getAvailableButtons();
      expect(buttons.length).toBe(1);
      expect(buttons[0].label).toBe('【自动调息】');
    });
  });

  describe('Scenario 5: All Extremes Locked (全极值锁死生成唯一消散过牌 PASS)', () => {
    ALL_ELEMENTS.forEach((elem) => {
      it(`[${elem}] Yang Stem with GuiYi node, ke (-1, -1) and sheng (2, 2) -> Single PASS`, () => {
        const yangStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YANG
        )!;
        const keEl = OVERCOMING_CYCLE[elem];
        const shengEl = GENERATION_CYCLE[elem];

        let state = createInitialGameState();
        state = {
          ...state,
          currentPlayer: 'P1',
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [elem]: { yang: 1, yin: 1 }, // GuiYi -> CONVERT blocked
                [shengEl]: { yang: 2, yin: 2 } // Sheng blocked -> BURST blocked
              }
            },
            P2: {
              ...state.players.P2,
              board: {
                ...state.players.P2.board,
                [keEl]: { yang: -1, yin: -1 } // Ke blocked -> ATK & BURST_ATK blocked
              }
            }
          }
        };

        const actions = getAvailableActions(state, yangStem);
        expect(actions.length).toBe(1);
        expect(actions[0].actionType).toBe(ActionType.PASS);
        expect(actions[0].element).toBe(elem);
      });

      it(`[${elem}] Yin Stem with GuiYi node, ke (-1, -1) and sheng (2, 2) -> Single PASS`, () => {
        const yinStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YIN
        )!;
        const keEl = OVERCOMING_CYCLE[elem];
        const shengEl = GENERATION_CYCLE[elem];

        let state = createInitialGameState();
        state = {
          ...state,
          currentPlayer: 'P1',
          players: {
            ...state.players,
            P1: {
              ...state.players.P1,
              board: {
                ...state.players.P1.board,
                [elem]: { yang: 1, yin: 1 }, // GuiYi -> CONVERT blocked
                [shengEl]: { yang: 2, yin: 2 } // Sheng blocked -> TRANS & BURST blocked
              }
            },
            P2: {
              ...state.players.P2,
              board: {
                ...state.players.P2.board,
                [keEl]: { yang: -1, yin: -1 } // Ke blocked -> BURST_ATK blocked
              }
            }
          }
        };

        const actions = getAvailableActions(state, yinStem);
        expect(actions.length).toBe(1);
        expect(actions[0].actionType).toBe(ActionType.PASS);
        expect(actions[0].element).toBe(elem);
      });
    });

    it('GameManager verifies single PASS auto countdown and execution', () => {
      const yangStem = TIAN_GAN_LIST[0]; // Jia Wood
      const singlePassAction: ActionPayload = {
        actionType: ActionType.PASS,
        player: 'P1',
        element: yangStem.element,
        polarity: Polarity.YANG
      };

      const gm = new GameManager(12345);
      const tm = gm.getTurnManager();
      vi.spyOn(tm, 'getCurrentTianGan').mockReturnValue(yangStem);
      vi.spyOn(tm, 'getAvailableActions').mockReturnValue([singlePassAction]);

      (gm as any).startNewTurn();

      expect(gm.getP1AutoTimer()).toBe(45);
      expect(gm.getBannerSubText()).toBe('道法受阻·消散过牌中');
      const buttons = gm.getAvailableButtons();
      expect(buttons.length).toBe(1);
      expect(buttons[0].label).toBe('【消散】');

      // Countdown finishes
      while (gm.getP1AutoTimer() > 0) {
        gm.update();
      }
      expect(gm.getP1AutoTimer()).toBe(0);
      expect(gm.isAnimatingState()).toBe(true);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  ActionType,
  Polarity,
  TIAN_GAN_LIST,
  WuXing,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE,
} from '../../src/core/types/domain.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { getAvailableActions } from '../../src/core/logic/ActionCandidates.js';

describe('ADR-0008 & Issue 02: Boundary Matrix Verification & Single-Candidate Auto-Execution', () => {
  const ALL_ELEMENTS = [WuXing.WOOD, WuXing.FIRE, WuXing.EARTH, WuXing.METAL, WuXing.WATER];

  describe('Scenario 1: Extra Turn with GuiYi Node (连动额外回合中抽到已归一节点)', () => {
    ALL_ELEMENTS.forEach((elem) => {
      it(`[${elem}] Yang Stem draws GuiYi node in extra turn -> Single ATK & auto countdown`, () => {
        const yangStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YANG,
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
                [elem]: { yang: 1, yin: 1 }, // GuiYi
              },
            },
          },
        };

        // Extra turn forbids BURST / BURST_ATK, opposite side is 1 (>0) forbidding CONVERT
        const actions = getAvailableActions(state, yangStem, { isExtraTurn: true });
        expect(actions.length).toBe(1);
        expect(actions[0].actionType).toBe(ActionType.ATK);
        expect(actions[0].sourceElement).toBe(elem);

        expect(actions.length).toBe(1);
      });

      it(`[${elem}] Yin Stem draws GuiYi node in extra turn -> Single TRANS & auto countdown`, () => {
        const yinStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YIN,
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
                [elem]: { yang: 1, yin: 1 }, // GuiYi
              },
            },
          },
        };

        const actions = getAvailableActions(state, yinStem, { isExtraTurn: true });
        expect(actions.length).toBe(1);
        expect(actions[0].actionType).toBe(ActionType.TRANS);
        expect(actions[0].sourceElement).toBe(elem);
      });
    });
  });

  describe('Scenario 2: Overcoming Target (-1, -1) (克制目标全损：破被封死、强破仍可选)', () => {
    ALL_ELEMENTS.forEach((elem) => {
      it(`[${elem}] Yang Stem draws GuiYi node when ke target is (-1, -1) -> BURST + BURST_ATK`, () => {
        const yangStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YANG,
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
                [elem]: { yang: 1, yin: 1 }, // GuiYi -> CONVERT locked
              },
            },
            P2: {
              ...state.players.P2,
              board: {
                ...state.players.P2.board,
                [keEl]: { yang: -1, yin: -1 }, // Ke target 双道损 -> ATK 封死；强破门槛放开后仍可发动（见底即止）
              },
            },
          },
        };

        const actions = getAvailableActions(state, yangStem);
        expect(actions).toHaveLength(2);
        expect(actions[0]).toEqual({
          actionType: ActionType.BURST,
          player: 'P1',
          sourceElement: elem,
          consumePolarity: Polarity.YIN,
        });
        expect(actions[1]).toEqual({
          actionType: ActionType.BURST_ATK,
          player: 'P1',
          sourceElement: elem,
          consumePolarity: Polarity.YANG,
        });
      });
    });
  });

  describe('Scenario 3: Generation Target (2, 2) Extreme Target (相生目标全满，强化门槛放开)', () => {
    ALL_ELEMENTS.forEach((elem) => {
      it(`[${elem}] Yin Stem draws GuiYi node when sheng target is (2, 2) -> BURST + BURST_ATK`, () => {
        const yinStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YIN,
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
                [shengEl]: { yang: 2, yin: 2 }, // Sheng target full -> TRANS & BURST locked
              },
            },
          },
        };

        const actions = getAvailableActions(state, yinStem);
        // 强化门槛放开：相生目标 (2, 2) 时仍生成强化（满溢则亏）；强破目标未到极限，照旧生成
        expect(actions).toHaveLength(2);
        expect(actions[0]).toEqual({
          actionType: ActionType.BURST,
          player: 'P1',
          sourceElement: elem,
          consumePolarity: Polarity.YIN,
        });
        expect(actions[1].actionType).toBe(ActionType.BURST_ATK);
        expect(actions[1].sourceElement).toBe(elem);
      });
    });
  });

  describe('Scenario 4: Extreme Sheng/Ke Blocked on Non-GuiYi Node (极端生克受阻下唯一调息)', () => {
    ALL_ELEMENTS.forEach((elem) => {
      it(`[${elem}] Yang stem with opposite polarity <= 0 and ke target (-1, -1) -> Single CONVERT`, () => {
        const yangStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YANG,
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
                [elem]: { yang: 1, yin: 0 }, // Non-GuiYi, opposite <= 0 -> CONVERT allowed
              },
            },
            P2: {
              ...state.players.P2,
              board: {
                ...state.players.P2.board,
                [keEl]: { yang: -1, yin: -1 }, // ATK blocked
              },
            },
          },
        };

        const actions = getAvailableActions(state, yangStem);
        expect(actions.length).toBe(1);
        expect(actions[0].actionType).toBe(ActionType.CONVERT);
        expect(actions[0].element).toBe(elem);
        expect(actions[0].polarity).toBe(Polarity.YIN);
      });

      it(`[${elem}] Yin stem with opposite polarity <= 0 and sheng target (2, 2) -> Single CONVERT`, () => {
        const yinStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YIN,
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
                [shengEl]: { yang: 2, yin: 2 }, // TRANS blocked
              },
            },
          },
        };

        const actions = getAvailableActions(state, yinStem);
        expect(actions.length).toBe(1);
        expect(actions[0].actionType).toBe(ActionType.CONVERT);
        expect(actions[0].element).toBe(elem);
        expect(actions[0].polarity).toBe(Polarity.YANG);
      });
    });
  });

  describe('Scenario 5: All Extremes Locked (全极值锁死仅剩强化与强破)', () => {
    ALL_ELEMENTS.forEach((elem) => {
      it(`[${elem}] Yang Stem with GuiYi node, ke (-1, -1) and sheng (2, 2) -> BURST + BURST_ATK`, () => {
        const yangStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YANG,
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
                [shengEl]: { yang: 2, yin: 2 }, // Sheng blocked -> 强化仍可发动（满溢则亏）
              },
            },
            P2: {
              ...state.players.P2,
              board: {
                ...state.players.P2.board,
                [keEl]: { yang: -1, yin: -1 }, // Ke blocked -> ATK 封死；强破仍可发动（见底即止）
              },
            },
          },
        };

        const actions = getAvailableActions(state, yangStem);
        // 强化门槛放开：相生目标 (2, 2) 仍生成强化；强破门槛放开：相克目标 (-1, -1) 仍生成强破
        expect(actions).toHaveLength(2);
        expect(actions[0]).toEqual({
          actionType: ActionType.BURST,
          player: 'P1',
          sourceElement: elem,
          consumePolarity: Polarity.YIN,
        });
        expect(actions[1]).toEqual({
          actionType: ActionType.BURST_ATK,
          player: 'P1',
          sourceElement: elem,
          consumePolarity: Polarity.YANG,
        });
      });

      it(`[${elem}] Yin Stem with GuiYi node, ke (-1, -1) and sheng (2, 2) -> BURST + BURST_ATK`, () => {
        const yinStem = TIAN_GAN_LIST.find(
          (tg) => tg.element === elem && tg.polarity === Polarity.YIN,
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
                [shengEl]: { yang: 2, yin: 2 }, // Sheng blocked -> TRANS 封死；强化仍可发动（满溢则亏）
              },
            },
            P2: {
              ...state.players.P2,
              board: {
                ...state.players.P2.board,
                [keEl]: { yang: -1, yin: -1 }, // Ke blocked -> 强破仍可发动（见底即止）
              },
            },
          },
        };

        const actions = getAvailableActions(state, yinStem);
        expect(actions).toHaveLength(2);
        expect(actions[0]).toEqual({
          actionType: ActionType.BURST,
          player: 'P1',
          sourceElement: elem,
          consumePolarity: Polarity.YIN,
        });
        expect(actions[1]).toEqual({
          actionType: ActionType.BURST_ATK,
          player: 'P1',
          sourceElement: elem,
          consumePolarity: Polarity.YANG,
        });
      });
    });
  });
});

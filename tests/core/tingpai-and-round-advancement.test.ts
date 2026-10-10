import { describe, it, expect } from 'vitest';
import {
  WuXing,
  Polarity,
  ActionType
} from '../../src/core/types/domain.js';
import {
  countLightedSides,
  countUnlightedSides,
  isBoardTingPai
} from '../../src/core/logic/State.js';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';
import { TurnManager } from '../../src/core/logic/TurnManager.js';
import { EventBus } from '../../src/core/logic/EventBus.js';
import { boardWith, gameStateWith } from '../../src/core/headless/BoardFixture.js';

describe('TingPai Detection & 30-Round Advancement Model', () => {
  describe('1. 盘面听牌检测算法 (countLightedSides & isBoardTingPai)', () => {
    it('countLightedSides accurately counts sides with level >= 1', () => {
      const emptyBoard = boardWith();
      expect(countLightedSides(emptyBoard)).toBe(0);
      expect(countUnlightedSides(emptyBoard)).toBe(10);
      expect(isBoardTingPai(emptyBoard)).toBe(false);

      // 1 side lighted (level 1)
      const board1 = boardWith({ [WuXing.WOOD]: { yin: 1, yang: 0 } });
      expect(countLightedSides(board1)).toBe(1);
      expect(countUnlightedSides(board1)).toBe(9);
      expect(isBoardTingPai(board1)).toBe(false);

      // Level 2 (KangJi/Blessed) also counts as lighted (>= 1)
      const boardKangJi = boardWith({ [WuXing.WOOD]: { yin: 2, yang: 2 } });
      expect(countLightedSides(boardKangJi)).toBe(2);
      expect(countUnlightedSides(boardKangJi)).toBe(8);

      // Damage (-1) does not count as lighted (< 1)
      const boardDamage = boardWith({ [WuXing.WOOD]: { yin: -1, yang: 1 } });
      expect(countLightedSides(boardDamage)).toBe(1);
      expect(countUnlightedSides(boardDamage)).toBe(9);
    });

    it('isBoardTingPai boundary conditions (7 sides -> false, 8 sides -> false, 9 sides -> true, 10 sides -> false/GuiYuan)', () => {
      // 7 sides lighted (3 unlighted sides) -> NOT TingPai
      const board7 = boardWith({
        [WuXing.WOOD]: { yin: 1, yang: 1 },
        [WuXing.FIRE]: { yin: 1, yang: 1 },
        [WuXing.EARTH]: { yin: 1, yang: 1 },
        [WuXing.METAL]: { yin: 1, yang: 0 },
        [WuXing.WATER]: { yin: 0, yang: 0 }
      });
      expect(countLightedSides(board7)).toBe(7);
      expect(countUnlightedSides(board7)).toBe(3);
      expect(isBoardTingPai(board7)).toBe(false);

      // 8 sides lighted (2 unlighted sides) -> NOT TingPai (ADR 0007: 差2侧单抽无法归元，未听牌)
      const board8 = boardWith({
        ...board7,
        [WuXing.METAL]: { yin: 1, yang: 1 } // unlighted: WATER yin (0), WATER yang (0)
      });
      expect(countLightedSides(board8)).toBe(8);
      expect(countUnlightedSides(board8)).toBe(2);
      expect(isBoardTingPai(board8)).toBe(false);

      // 9 sides lighted (1 unlighted side) -> TingPai临界态 (ADR 0007: 严格差1侧)
      const board9 = boardWith({
        ...board8,
        [WuXing.WATER]: { yin: 1, yang: 0 } // unlighted: WATER yang (0)
      });
      expect(countLightedSides(board9)).toBe(9);
      expect(countUnlightedSides(board9)).toBe(1);
      expect(isBoardTingPai(board9)).toBe(true);

      // 10 sides lighted (0 unlighted side) -> NOT TingPai (GuiYuan 已全点亮归元，非听牌)
      const board10 = boardWith({
        ...board9,
        [WuXing.WATER]: { yin: 1, yang: 1 }
      });
      expect(countLightedSides(board10)).toBe(10);
      expect(countUnlightedSides(board10)).toBe(0);
      expect(isBoardTingPai(board10)).toBe(false);
    });

    it('isBoardTingPai correctly handles damage (-1) sides as unlighted', () => {
      // 8 sides lighted, 1 void (0), 1 damaged (-1) -> unlighted = 2 sides -> NOT TingPai
      const boardWith2DamageOrVoid = boardWith({
        [WuXing.WOOD]: { yin: 1, yang: 1 },
        [WuXing.FIRE]: { yin: 1, yang: 1 },
        [WuXing.EARTH]: { yin: 1, yang: 1 },
        [WuXing.METAL]: { yin: 1, yang: 1 },
        [WuXing.WATER]: { yin: -1, yang: 0 }
      });
      expect(countLightedSides(boardWith2DamageOrVoid)).toBe(8);
      expect(countUnlightedSides(boardWith2DamageOrVoid)).toBe(2);
      expect(isBoardTingPai(boardWith2DamageOrVoid)).toBe(false);

      // 9 sides lighted, 1 damaged (-1) -> unlighted = 1 side -> TingPai!
      const boardWith1Damage = boardWith({
        ...boardWith2DamageOrVoid,
        [WuXing.WATER]: { yin: -1, yang: 1 }
      });
      expect(countLightedSides(boardWith1Damage)).toBe(9);
      expect(countUnlightedSides(boardWith1Damage)).toBe(1);
      expect(isBoardTingPai(boardWith1Damage)).toBe(true);

      // 7 sides lighted, 2 void (0), 1 damaged (-1) -> unlighted = 3 sides -> NOT TingPai
      const boardNotTing = boardWith({
        [WuXing.WOOD]: { yin: 1, yang: 1 },
        [WuXing.FIRE]: { yin: 1, yang: 1 },
        [WuXing.EARTH]: { yin: 1, yang: 1 },
        [WuXing.METAL]: { yin: 1, yang: 0 },
        [WuXing.WATER]: { yin: -1, yang: 0 }
      });
      expect(countLightedSides(boardNotTing)).toBe(7);
      expect(countUnlightedSides(boardNotTing)).toBe(3);
      expect(isBoardTingPai(boardNotTing)).toBe(false);
    });
  });

  describe('2. 30 大回合推进模型 (30-Round Lifecycle Model)', () => {
    const resolver = new ActionResolver();

    it('defaults maxRounds to 30 in createInitialGameState', () => {
      const state = gameStateWith();
      expect(state.maxRounds).toBe(30);
      expect(state.round).toBe(1);
      expect(state.currentPlayer).toBe('P1');
    });

    it('P1 action does NOT advance round, but transfers turn to P2 within the same round', () => {
      const state = gameStateWith({ maxRounds: 30 });
      const res = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(res.success).toBe(true);
      expect(res.nextState.round).toBe(1); // Round remains 1!
      expect(res.nextState.currentPlayer).toBe('P2');
      expect(res.nextState.isGameOver).toBe(false);
    });

    it('P2 action completes the round, advancing round to 2 and transferring turn to P1', () => {
      const state = gameStateWith({ maxRounds: 30 });
      const res1 = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      const res2 = resolver.resolve(res1.nextState, {
        actionType: ActionType.AUTO,
        player: 'P2',
        element: WuXing.FIRE,
        polarity: Polarity.YANG
      });

      expect(res2.success).toBe(true);
      expect(res2.nextState.round).toBe(2); // Round advances to 2!
      expect(res2.nextState.currentPlayer).toBe('P1'); // Back to P1!
      expect(res2.nextState.isGameOver).toBe(false);
    });

    it('burst extra turn preserves round and current player for both P1 and P2', () => {
      // P1 BURST
      const state = gameStateWith({
        maxRounds: 30,
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } }
      });

      const resP1Burst = resolver.resolve(state, {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YANG
      });

      expect(resP1Burst.success).toBe(true);
      expect(resP1Burst.extraTurn).toBe(true);
      expect(resP1Burst.nextState.round).toBe(1);
      expect(resP1Burst.nextState.currentPlayer).toBe('P1');

      // P2 BURST
      const stateP2 = gameStateWith({
        round: 5,
        currentPlayer: 'P2',
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.FIRE]: { yin: 1, yang: 1 } }
      });

      const resP2Burst = resolver.resolve(stateP2, {
        actionType: ActionType.BURST,
        player: 'P2',
        sourceElement: WuXing.FIRE,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YANG
      });

      expect(resP2Burst.success).toBe(true);
      expect(resP2Burst.extraTurn).toBe(true);
      expect(resP2Burst.nextState.round).toBe(5);
      expect(resP2Burst.nextState.currentPlayer).toBe('P2');
    });

    it('P1 action on final round (round 30) does NOT trigger MAX_ROUNDS game over, allowing P2 to act', () => {
      const state = gameStateWith({ maxRounds: 30, round: 30, currentPlayer: 'P1' });

      const resP1 = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(resP1.success).toBe(true);
      expect(resP1.nextState.isGameOver).toBe(false);
      expect(resP1.nextState.round).toBe(30);
      expect(resP1.nextState.currentPlayer).toBe('P2');
    });

    it('P2 action on final round (round 30) triggers MAX_ROUNDS game over with damage penalty and tie-break', () => {
      const state = gameStateWith({
        maxRounds: 30,
        round: 30,
        currentPlayer: 'P2',
        score: { P1: 200, P2: 100 }
      });

      const resP2 = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P2',
        element: WuXing.EARTH,
        polarity: Polarity.YANG
      });

      expect(resP2.success).toBe(true);
      expect(resP2.nextState.isGameOver).toBe(true);
      expect(resP2.nextState.endReason).toBe('MAX_ROUNDS');
      expect(resP2.nextState.round).toBe(30);
    });

    it('TurnManager drives through a complete 2-round match with 4 normal steps (P1, P2, P1, P2)', () => {
      const bus = new EventBus();
      const manager = new TurnManager({
        initialState: gameStateWith({ maxRounds: 2 }),
        eventBus: bus
      });

      // Step 1: P1 acts in Round 1
      const res1 = manager.step();
      expect(res1.success).toBe(true);
      expect(manager.getState().round).toBe(1);
      expect(manager.getState().currentPlayer).toBe('P2');
      expect(manager.getState().isGameOver).toBe(false);

      // Step 2: P2 acts in Round 1 (round 1 completes)
      const res2 = manager.step();
      expect(res2.success).toBe(true);
      expect(manager.getState().round).toBe(2);
      expect(manager.getState().currentPlayer).toBe('P1');
      expect(manager.getState().isGameOver).toBe(false);

      // Step 3: P1 acts in Round 2
      const res3 = manager.step();
      expect(res3.success).toBe(true);
      expect(manager.getState().round).toBe(2);
      expect(manager.getState().currentPlayer).toBe('P2');
      expect(manager.getState().isGameOver).toBe(false);

      // Step 4: P2 acts in Round 2 (round 2 completes, reaches maxRounds=2)
      const res4 = manager.step();
      expect(res4.success).toBe(true);
      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().endReason).toBe('MAX_ROUNDS');
      expect(manager.getState().round).toBe(2);
    });
  });
});

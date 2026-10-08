import { describe, it, expect } from 'vitest';
import {
  ActionType,
  WuXing,
  Polarity
} from '../../src/core/types/index.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';
import {
  ScoreCalculator,
  POINTS_CONFIG
} from '../../src/core/logic/ScoreCalculator.js';

describe('Ticket 01: 双轨制行为分与己方建设状态分全链路实装', () => {
  const calculator = new ScoreCalculator();
  const resolver = new ActionResolver(calculator);

  describe('1. 核心计分配置 (POINTS_CONFIG)', () => {
    it('defines accurate ACTION base points', () => {
      expect(POINTS_CONFIG.ACTION.AUTO).toBe(0);
      expect(POINTS_CONFIG.ACTION.CONVERT).toBe(50);
      expect(POINTS_CONFIG.ACTION.TRANS).toBe(30);
      expect(POINTS_CONFIG.ACTION.ATK).toBe(40);
      expect(POINTS_CONFIG.ACTION.BURST).toBe(100);
      expect(POINTS_CONFIG.ACTION.BURST_ATK).toBe(80);
    });

    it('defines accurate STATE_CHANGE construction points', () => {
      expect(POINTS_CONFIG.STATE_CHANGE.LIGHT_UP).toBe(100);
      expect(POINTS_CONFIG.STATE_CHANGE.BLESSING).toBe(200);
      // REPAIR_DMG can be 200 or { yang: 200, yin: 200 }
      const repairYang = typeof POINTS_CONFIG.STATE_CHANGE.REPAIR_DMG === 'number'
        ? POINTS_CONFIG.STATE_CHANGE.REPAIR_DMG
        : POINTS_CONFIG.STATE_CHANGE.REPAIR_DMG.yang;
      const repairYin = typeof POINTS_CONFIG.STATE_CHANGE.REPAIR_DMG === 'number'
        ? POINTS_CONFIG.STATE_CHANGE.REPAIR_DMG
        : POINTS_CONFIG.STATE_CHANGE.REPAIR_DMG.yin;
      expect(repairYang).toBe(200);
      expect(repairYin).toBe(200);
    });
  });

  describe('2. ScoreCalculator 行为分与建设状态分纯函数计算', () => {
    it('calculates action base points correctly for all 6 actions', () => {
      expect(calculator.calculateActionPoints(ActionType.AUTO)).toBe(0);
      expect(calculator.calculateActionPoints(ActionType.CONVERT)).toBe(50);
      expect(calculator.calculateActionPoints(ActionType.TRANS)).toBe(30);
      expect(calculator.calculateActionPoints(ActionType.ATK)).toBe(40);
      expect(calculator.calculateActionPoints(ActionType.BURST)).toBe(100);
      expect(calculator.calculateActionPoints(ActionType.BURST_ATK)).toBe(80);
    });

    it('calculates construction state transitions correctly', () => {
      // 修复道损: -1 -> 0 => 200
      expect(calculator.calculateTransitionPoints(-1, 0, Polarity.YANG, false)).toBe(200);
      expect(calculator.calculateTransitionPoints(-1, 0, Polarity.YIN, false)).toBe(200);
      // 点亮虚空: 0 -> 1 => 100
      expect(calculator.calculateTransitionPoints(0, 1, Polarity.YANG, false)).toBe(100);
      expect(calculator.calculateTransitionPoints(0, 1, Polarity.YIN, false)).toBe(100);
      // 加持: 1 -> 2 => 200
      expect(calculator.calculateTransitionPoints(1, 2, Polarity.YANG, false)).toBe(200);
      expect(calculator.calculateTransitionPoints(1, 2, Polarity.YIN, false)).toBe(200);
    });
  });

  describe('3. ActionResolver 外部行为全链路结算与累加', () => {
    it('AUTO: adds transition score (0 + 100 = 100) when lighting up a node', () => {
      const state = createInitialGameState();
      const res = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBe(100); // 0 action + 100 light_up
      expect(res.nextState.players.P1.score).toBe(100);
    });

    it('AUTO: adds repair score (0 + 200 = 200) when repairing damaged node', () => {
      const baseState = createInitialGameState();
      const stateWithDmg = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: -1 as const, yang: 0 as const }
            }
          }
        }
      };

      const res = resolver.resolve(stateWithDmg, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YIN
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBe(200); // 0 action + 200 repair
      expect(res.nextState.players.P1.score).toBe(200);
    });

    it('AUTO: adds blessing score (0 + 200 = 200) when blessing already lit node', () => {
      const baseState = createInitialGameState();
      const stateWithLit = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 0 as const, yang: 1 as const }
            }
          }
        }
      };

      const res = resolver.resolve(stateWithLit, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBe(200); // 0 action + 200 blessing
      expect(res.nextState.players.P1.score).toBe(200);
    });

    it('CONVERT: adds 50 behavior points + 100 light_up points = 150 points', () => {
      const state = createInitialGameState();
      const res = resolver.resolve(state, {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YIN
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBe(150); // 50 action + 100 light_up
      expect(res.nextState.players.P1.score).toBe(150);
    });

    it('TRANS: adds 30 behavior points + 100 light_up points = 130 points', () => {
      const state = createInitialGameState();
      const res = resolver.resolve(state, {
        actionType: ActionType.TRANS,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBe(130); // 30 action + 100 light_up
      expect(res.nextState.players.P1.score).toBe(130);
    });

    it('ATK: awards 40 behavior points', () => {
      const state = createInitialGameState();
      const res = resolver.resolve(state, {
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBeGreaterThanOrEqual(40);
    });

    it('BURST: awards 100 behavior points + 100 target light_up points = 200 points', () => {
      const baseState = createInitialGameState();
      const stateGuiYi = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 1 as const, yang: 1 as const }
            }
          }
        }
      };

      const res = resolver.resolve(stateGuiYi, {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YANG // Target FIRE yang 0 -> 1
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBe(200); // 100 action + 100 light_up
      expect(res.nextState.players.P1.score).toBe(200);
    });

    it('BURST_ATK: awards 80 behavior points', () => {
      const baseState = createInitialGameState();
      const stateGuiYi = {
        ...baseState,
        players: {
          ...baseState.players,
          P1: {
            ...baseState.players.P1,
            board: {
              ...baseState.players.P1.board,
              [WuXing.WOOD]: { yin: 1 as const, yang: 1 as const }
            }
          }
        }
      };

      const res = resolver.resolve(stateGuiYi, {
        actionType: ActionType.BURST_ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YANG,
        polarity: Polarity.YANG
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBeGreaterThanOrEqual(80);
    });
  });
});

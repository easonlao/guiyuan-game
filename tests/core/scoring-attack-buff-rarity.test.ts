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

describe('Ticket 02: 2.5倍攻击压制状态分与爆发动作稀有度黑名单豁免实装', () => {
  const calculator = new ScoreCalculator();
  const resolver = new ActionResolver(calculator);

  describe('1. 计分配置常量 (POINTS_CONFIG)', () => {
    it('defines 2.5x attack suppression points matching ADR 0002', () => {
      // 致道损: 阳 300 / 阴 250
      expect(POINTS_CONFIG.STATE_CHANGE.CAUSE_DMG.yang).toBe(300);
      expect(POINTS_CONFIG.STATE_CHANGE.CAUSE_DMG.yin).toBe(250);

      // 破点亮: 阳 200 / 阴 150
      expect(POINTS_CONFIG.STATE_CHANGE.BREAK_LIGHT.yang).toBe(200);
      expect(POINTS_CONFIG.STATE_CHANGE.BREAK_LIGHT.yin).toBe(150);

      // 削弱加持: 200
      expect(POINTS_CONFIG.STATE_CHANGE.WEAKEN).toBe(200);
    });

    it('defines rarity multiplier and blacklisted actions', () => {
      expect(POINTS_CONFIG.RARITY_MULTIPLIER).toBe(1.5);
      expect(POINTS_CONFIG.NO_RARITY_ACTIONS).toContain(ActionType.BURST);
      expect(POINTS_CONFIG.NO_RARITY_ACTIONS).toContain(ActionType.BURST_ATK);
    });
  });

  describe('2. ScoreCalculator 攻击状态分计算与稀有度黑名单过滤', () => {
    it('calculates 3 types of attack damage across yin and yang correctly', () => {
      // 1. 致道损: 0 -> -1
      expect(calculator.calculateTransitionPoints(0, -1, Polarity.YANG, true)).toBe(300);
      expect(calculator.calculateTransitionPoints(0, -1, Polarity.YIN, true)).toBe(250);

      // 2. 破点亮: 1 -> 0
      expect(calculator.calculateTransitionPoints(1, 0, Polarity.YANG, true)).toBe(200);
      expect(calculator.calculateTransitionPoints(1, 0, Polarity.YIN, true)).toBe(150);

      // 3. 削弱加持: 2 -> 1
      expect(calculator.calculateTransitionPoints(2, 1, Polarity.YANG, true)).toBe(200);
      expect(calculator.calculateTransitionPoints(2, 1, Polarity.YIN, true)).toBe(200);

      // 无变化或非法跃迁
      expect(calculator.calculateTransitionPoints(-1, -1, Polarity.YANG, true)).toBe(0);
      expect(calculator.calculateTransitionPoints(0, 0, Polarity.YIN, true)).toBe(0);
    });

    it('strictly bypasses rarity bonus for BURST and BURST_ATK', () => {
      expect(calculator.isNoRarityAction(ActionType.BURST)).toBe(true);
      expect(calculator.isNoRarityAction(ActionType.BURST_ATK)).toBe(true);

      // 爆发动作直接返回原始分值，绝不施加乘数
      expect(calculator.applyRarityBonus(100, ActionType.BURST)).toBe(100);
      expect(calculator.applyRarityBonus(200, ActionType.BURST)).toBe(200);
      expect(calculator.applyRarityBonus(80, ActionType.BURST_ATK)).toBe(80);
      expect(calculator.applyRarityBonus(380, ActionType.BURST_ATK)).toBe(380);
    });

    it('applies rarity multiplier bonus for regular actions (CONVERT, TRANS, ATK)', () => {
      expect(calculator.isNoRarityAction(ActionType.CONVERT)).toBe(false);
      expect(calculator.isNoRarityAction(ActionType.TRANS)).toBe(false);
      expect(calculator.isNoRarityAction(ActionType.ATK)).toBe(false);

      // 普通动作应用 1 + (1 - prob) * 1.5 增益
      const convertScore = calculator.applyRarityBonus(100, ActionType.CONVERT);
      expect(convertScore).toBeGreaterThan(100);
      expect(convertScore).toBe(Math.round(100 + 100 * (1 - 0.167) * 1.5)); // 225

      const transScore = calculator.applyRarityBonus(100, ActionType.TRANS);
      expect(transScore).toBeGreaterThan(100);
      expect(transScore).toBe(Math.round(100 + 100 * (1 - 0.243) * 1.5)); // 214

      const atkScore = calculator.applyRarityBonus(100, ActionType.ATK);
      expect(atkScore).toBeGreaterThan(100);
      expect(atkScore).toBe(Math.round(100 + 100 * (1 - 0.518) * 1.5)); // 172
    });
  });

  describe('3. ActionResolver ATK 与 BURST_ATK 攻击压制状态分端到端结算', () => {
    it('ATK: 0 -> -1 致阳道损 awards 40 behavior + 300 attack points = 340', () => {
      const state = createInitialGameState();
      // P1 木克 P2 土，初始 P2 土阳为 0 -> -1
      const res = resolver.resolve(state, {
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBe(340);
      expect(res.nextState.players.P1.score).toBe(340);
      expect(res.nextState.players.P2.board[WuXing.EARTH].yang).toBe(-1);
    });

    it('ATK: 0 -> -1 致阴道损 awards 40 behavior + 250 attack points = 290', () => {
      const state = createInitialGameState();
      const res = resolver.resolve(state, {
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBe(290);
      expect(res.nextState.players.P1.score).toBe(290);
      expect(res.nextState.players.P2.board[WuXing.EARTH].yin).toBe(-1);
    });

    it('ATK: 1 -> 0 破阳点亮 awards 40 behavior + 200 attack points = 240', () => {
      const baseState = createInitialGameState();
      const stateWithLitOpponent = {
        ...baseState,
        players: {
          ...baseState.players,
          P2: {
            ...baseState.players.P2,
            board: {
              ...baseState.players.P2.board,
              [WuXing.EARTH]: { yin: 0 as const, yang: 1 as const }
            }
          }
        }
      };

      const res = resolver.resolve(stateWithLitOpponent, {
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBe(240);
      expect(res.nextState.players.P1.score).toBe(240);
      expect(res.nextState.players.P2.board[WuXing.EARTH].yang).toBe(0);
    });

    it('ATK: 1 -> 0 破阴点亮 awards 40 behavior + 150 attack points = 190', () => {
      const baseState = createInitialGameState();
      const stateWithLitOpponent = {
        ...baseState,
        players: {
          ...baseState.players,
          P2: {
            ...baseState.players.P2,
            board: {
              ...baseState.players.P2.board,
              [WuXing.EARTH]: { yin: 1 as const, yang: 0 as const }
            }
          }
        }
      };

      const res = resolver.resolve(stateWithLitOpponent, {
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBe(190);
      expect(res.nextState.players.P1.score).toBe(190);
      expect(res.nextState.players.P2.board[WuXing.EARTH].yin).toBe(0);
    });

    it('ATK: 2 -> 1 削弱加持 awards 40 behavior + 200 attack points = 240', () => {
      const baseState = createInitialGameState();
      const stateWithBlessedOpponent = {
        ...baseState,
        players: {
          ...baseState.players,
          P2: {
            ...baseState.players.P2,
            board: {
              ...baseState.players.P2.board,
              [WuXing.EARTH]: { yin: 0 as const, yang: 2 as const }
            }
          }
        }
      };

      const res = resolver.resolve(stateWithBlessedOpponent, {
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBe(240);
      expect(res.nextState.players.P1.score).toBe(240);
      expect(res.nextState.players.P2.board[WuXing.EARTH].yang).toBe(1);
    });

    it('BURST_ATK: 0 -> -1 致阳道损 awards 80 behavior + 300 attack points = 380', () => {
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
        polarity: Polarity.YANG // Opponent EARTH yang 0 -> -1
      });

      expect(res.success).toBe(true);
      expect(res.scoreDelta).toBe(380);
      expect(res.nextState.players.P1.score).toBe(380);
      expect(res.nextState.players.P2.board[WuXing.EARTH].yang).toBe(-1);
    });
  });
});

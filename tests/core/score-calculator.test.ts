import { describe, it, expect } from 'vitest';
import { ScoreCalculator, POINTS_CONFIG } from '../../src/core/logic/ScoreCalculator.js';
import { ActionType } from '../../src/core/types/index.js';

describe('ScoreCalculator', () => {
  const calculator = new ScoreCalculator();

  it('should award points for repair, light up and bless transitions', () => {
    // Repair: -1 -> 0
    expect(calculator.calculateTransitionPoints(-1, 0)).toBe(POINTS_CONFIG.STATE_CHANGE.REPAIR_DMG.yang);
    // Light up: 0 -> 1
    expect(calculator.calculateTransitionPoints(0, 1)).toBe(POINTS_CONFIG.STATE_CHANGE.LIGHT_UP);
    // Bless: 1 -> 2
    expect(calculator.calculateTransitionPoints(1, 2)).toBe(POINTS_CONFIG.STATE_CHANGE.BLESSING);
    // No change / invalid
    expect(calculator.calculateTransitionPoints(1, 1)).toBe(0);
  });

  it('should award bonus points for attack and burst actions', () => {
    expect(calculator.calculateActionPoints(ActionType.ATK)).toBe(POINTS_CONFIG.ACTION.ATK);
    expect(calculator.calculateActionPoints(ActionType.BURST)).toBe(POINTS_CONFIG.ACTION.BURST);
    expect(calculator.calculateActionPoints(ActionType.AUTO)).toBe(0);
  });
});

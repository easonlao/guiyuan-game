import { describe, it, expect } from 'vitest';
import { ScoreCalculator, DEFAULT_SCORE_CONFIG } from '../../src/core/logic/ScoreCalculator.js';
import { ActionType } from '../../src/core/types/index.js';

describe('ScoreCalculator', () => {
  const calculator = new ScoreCalculator();

  it('should award points for repair, light up and bless transitions', () => {
    // Repair: -1 -> 0
    expect(calculator.calculateTransitionPoints(-1, 0)).toBe(DEFAULT_SCORE_CONFIG.repairPoints);
    // Light up: 0 -> 1
    expect(calculator.calculateTransitionPoints(0, 1)).toBe(DEFAULT_SCORE_CONFIG.lightUpPoints);
    // Bless: 1 -> 2
    expect(calculator.calculateTransitionPoints(1, 2)).toBe(DEFAULT_SCORE_CONFIG.blessPoints);
    // No change / invalid
    expect(calculator.calculateTransitionPoints(1, 1)).toBe(0);
  });

  it('should award bonus points for attack and burst actions', () => {
    expect(calculator.calculateActionPoints(ActionType.ATK)).toBe(DEFAULT_SCORE_CONFIG.damageEnemyPoints);
    expect(calculator.calculateActionPoints(ActionType.BURST)).toBe(DEFAULT_SCORE_CONFIG.burstBonusPoints);
    expect(calculator.calculateActionPoints(ActionType.AUTO)).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  ScoreCalculator,
  POINTS_CONFIG,
  DAMAGE_PENALTY,
  type PointsConfig,
} from '../../src/core/logic/ScoreCalculator.js';
import { ActionType, Polarity } from '../../src/core/types/index.js';

describe('ScoreCalculator', () => {
  const calculator = new ScoreCalculator();

  it('should award points for repair, light up and bless transitions', () => {
    // Repair: -1 -> 0
    expect(calculator.calculateTransitionPoints(-1, 0)).toBe(
      POINTS_CONFIG.STATE_CHANGE.REPAIR_DMG.yang,
    );
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

  it('should score every suppression pattern on both polarities', () => {
    // 致道损: 0 -> -1（阳/阴两套分值）
    expect(calculator.calculateTransitionPoints(0, -1, Polarity.YANG, true)).toBe(
      POINTS_CONFIG.STATE_CHANGE.CAUSE_DMG.yang,
    );
    expect(calculator.calculateTransitionPoints(0, -1, Polarity.YIN, true)).toBe(
      POINTS_CONFIG.STATE_CHANGE.CAUSE_DMG.yin,
    );
    // 破点亮: 1 -> 0
    expect(calculator.calculateTransitionPoints(1, 0, Polarity.YANG, true)).toBe(
      POINTS_CONFIG.STATE_CHANGE.BREAK_LIGHT.yang,
    );
    expect(calculator.calculateTransitionPoints(1, 0, Polarity.YIN, true)).toBe(
      POINTS_CONFIG.STATE_CHANGE.BREAK_LIGHT.yin,
    );
    // 削弱加持: 2 -> 1（阴阳同分）
    expect(calculator.calculateTransitionPoints(2, 1, Polarity.YANG, true)).toBe(
      POINTS_CONFIG.STATE_CHANGE.WEAKEN,
    );
    expect(calculator.calculateTransitionPoints(2, 1, Polarity.YIN, true)).toBe(
      POINTS_CONFIG.STATE_CHANGE.WEAKEN,
    );
  });

  it('should return 0 for attack transitions that match no suppression pattern', () => {
    // 攻击只造成「下降一步」；升级或跳级都不属于任何压制档位
    expect(calculator.calculateTransitionPoints(0, 1, Polarity.YANG, true)).toBe(0);
    expect(calculator.calculateTransitionPoints(1, 2, Polarity.YANG, true)).toBe(0);
    expect(calculator.calculateTransitionPoints(1, -1, Polarity.YANG, true)).toBe(0);
    expect(calculator.calculateTransitionPoints(2, 0, Polarity.YANG, true)).toBe(0);
  });

  it('should return 0 for construction transitions that match no construction pattern', () => {
    // 建设只造成「上升一步」；降级或跳级都不计建设分
    expect(calculator.calculateTransitionPoints(1, 0, Polarity.YANG, false)).toBe(0);
    expect(calculator.calculateTransitionPoints(0, 2, Polarity.YANG, false)).toBe(0);
    expect(calculator.calculateTransitionPoints(-1, 1, Polarity.YANG, false)).toBe(0);
    expect(calculator.calculateTransitionPoints(2, 1, Polarity.YANG, false)).toBe(0);
  });

  it('should fall back to the built-in damage penalty when config omits DAMAGE_PENALTY', () => {
    const configWithoutPenalty: PointsConfig = {
      ACTION: POINTS_CONFIG.ACTION,
      STATE_CHANGE: POINTS_CONFIG.STATE_CHANGE,
    };

    const withFallback = new ScoreCalculator(configWithoutPenalty);
    expect(withFallback.damagePenalty).toBe(DAMAGE_PENALTY);
    expect(withFallback.calculateDamagePenalty(2)).toBe(100);

    // 显式配置时以配置值为准
    const custom = new ScoreCalculator({ ...configWithoutPenalty, DAMAGE_PENALTY: 7 });
    expect(custom.damagePenalty).toBe(7);
    expect(custom.calculateDamagePenalty(3)).toBe(21);
  });
});

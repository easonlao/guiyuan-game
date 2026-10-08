import { describe, it, expect } from 'vitest';
import {
  WuXing,
  Polarity,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE,
  TIAN_GAN_LIST,
  NodeLevelEnum
} from '../../src/core/types/index.js';

describe('Domain Model Contracts (GLOSSARY.md)', () => {
  it('should define exactly five WuXing elements in correct generation cycle', () => {
    expect(GENERATION_CYCLE[WuXing.WOOD]).toBe(WuXing.FIRE);
    expect(GENERATION_CYCLE[WuXing.FIRE]).toBe(WuXing.EARTH);
    expect(GENERATION_CYCLE[WuXing.EARTH]).toBe(WuXing.METAL);
    expect(GENERATION_CYCLE[WuXing.METAL]).toBe(WuXing.WATER);
    expect(GENERATION_CYCLE[WuXing.WATER]).toBe(WuXing.WOOD);
  });

  it('should define correct overcoming cycle', () => {
    expect(OVERCOMING_CYCLE[WuXing.WOOD]).toBe(WuXing.EARTH);
    expect(OVERCOMING_CYCLE[WuXing.EARTH]).toBe(WuXing.WATER);
    expect(OVERCOMING_CYCLE[WuXing.WATER]).toBe(WuXing.FIRE);
    expect(OVERCOMING_CYCLE[WuXing.FIRE]).toBe(WuXing.METAL);
    expect(OVERCOMING_CYCLE[WuXing.METAL]).toBe(WuXing.WOOD);
  });

  it('should define ten TianGan with proper element and polarity', () => {
    expect(TIAN_GAN_LIST).toHaveLength(10);
    const jia = TIAN_GAN_LIST.find(t => t.name === '甲');
    expect(jia).toEqual({ name: '甲', element: WuXing.WOOD, polarity: Polarity.YANG });
    const yi = TIAN_GAN_LIST.find(t => t.name === '乙');
    expect(yi).toEqual({ name: '乙', element: WuXing.WOOD, polarity: Polarity.YIN });
  });

  it('should adhere to node level limits: -1, 0, 1, 2', () => {
    expect(NodeLevelEnum.DAMAGE).toBe(-1);
    expect(NodeLevelEnum.VOID).toBe(0);
    expect(NodeLevelEnum.LIT).toBe(1);
    expect(NodeLevelEnum.BLESSED).toBe(2);
  });
});

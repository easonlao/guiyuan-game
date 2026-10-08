import { describe, it, expect } from 'vitest';
import {
  ActionPayload,
  ActionType,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE,
  Polarity,
  WuXing
} from '../../src/core/types/domain.js';
import { formatActionButton } from '../../src/minigame/action-button-formatter.js';
import { WUXING_PALETTE } from '../../src/minigame/pixel-art.js';

describe('Minigame Action Button Presentation Logic', () => {
  describe('a) AUTO action presentation', () => {
    it('formats single AUTO action as 【吸纳】 with specific void/damage hint', () => {
      const act: ActionPayload = {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      };
      const formatted = formatActionButton(act, 1);
      expect(formatted.label).toBe('【吸纳】');
      expect(formatted.subLabel).toBe('天干能量吸纳（充盈虚空/修复道损）');
      expect(formatted.isBurst).toBe(false);
    });

    it('formats AUTO action when multiple actions available with element and polarity hint', () => {
      const act: ActionPayload = {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.FIRE,
        polarity: Polarity.YIN
      };
      const formatted = formatActionButton(act, 2);
      expect(formatted.label).toBe('【吸纳】');
      expect(formatted.subLabel).toBe('火(阴)+1');
      expect(formatted.isBurst).toBe(false);
    });
  });

  describe('b) BURST action across all 5 elements', () => {
    const allElements: WuXing[] = [
      WuXing.WOOD,
      WuXing.FIRE,
      WuXing.EARTH,
      WuXing.METAL,
      WuXing.WATER
    ];

    allElements.forEach((src) => {
      it(`formats BURST correctly for source element ${src}`, () => {
        const target = GENERATION_CYCLE[src];
        const srcName = WUXING_PALETTE[src].name;
        const targetName = WUXING_PALETTE[target].name;

        const act: ActionPayload = {
          actionType: ActionType.BURST,
          player: 'P1',
          sourceElement: src,
          consumePolarity: Polarity.YIN,
          polarity: Polarity.YANG
        };

        const formatted = formatActionButton(act, 3);
        expect(formatted.label).toBe('【强化】');
        expect(formatted.subLabel).toBe(`消耗${srcName}·生${targetName}+2`);
        expect(formatted.isBurst).toBe(true);
      });
    });
  });

  describe('c) BURST_ATK action across all 5 elements', () => {
    const allElements: WuXing[] = [
      WuXing.WOOD,
      WuXing.FIRE,
      WuXing.EARTH,
      WuXing.METAL,
      WuXing.WATER
    ];

    allElements.forEach((src) => {
      it(`formats BURST_ATK correctly for source element ${src}`, () => {
        const target = OVERCOMING_CYCLE[src];
        const srcName = WUXING_PALETTE[src].name;
        const targetName = WUXING_PALETTE[target].name;

        const act: ActionPayload = {
          actionType: ActionType.BURST_ATK,
          player: 'P1',
          sourceElement: src,
          consumePolarity: Polarity.YANG,
          polarity: Polarity.YIN
        };

        const formatted = formatActionButton(act, 3);
        expect(formatted.label).toBe('【强破】');
        expect(formatted.subLabel).toBe(`消耗${srcName}·克${targetName}-2`);
        expect(formatted.isBurst).toBe(true);
      });
    });
  });

  describe('d) TRANS and ATK presentation targets', () => {
    it('formats TRANS using generation target element name and polarity', () => {
      const act: ActionPayload = {
        actionType: ActionType.TRANS,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN
      };
      // WOOD generates FIRE
      const formatted = formatActionButton(act, 2);
      expect(formatted.label).toBe('【化】');
      expect(formatted.subLabel).toBe('生火(阴)+1');
      expect(formatted.isBurst).toBe(false);
    });

    it('formats ATK using overcoming target element name and polarity', () => {
      const act: ActionPayload = {
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      };
      // WOOD overcomes EARTH
      const formatted = formatActionButton(act, 2);
      expect(formatted.label).toBe('【破】');
      expect(formatted.subLabel).toBe('克敌土(阳)-1');
      expect(formatted.isBurst).toBe(false);
    });

    it('formats CONVERT correctly', () => {
      const act: ActionPayload = {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YIN
      };
      const formatted = formatActionButton(act, 2);
      expect(formatted.label).toBe('【调息】');
      expect(formatted.subLabel).toBe('转同属阴');
      expect(formatted.isBurst).toBe(false);
    });
  });
});

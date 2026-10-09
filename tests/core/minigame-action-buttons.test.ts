import { describe, it, expect } from 'vitest';
import {
  ActionPayload,
  ActionType,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE,
  Polarity,
  WuXing
} from '../../src/core/types/domain.js';
import {
  formatActionButton,
  getActionTargetElement
} from '../../src/minigame/action-button-formatter.js';
import { WUXING_PALETTE } from '../../src/minigame/pixel-art.js';

describe('Minigame Action Button Presentation Logic', () => {
  describe('a) AUTO action presentation', () => {
    it('formats AUTO action as 【吸纳】 with specific void/damage hint', () => {
      const act: ActionPayload = {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      };
      const formatted = formatActionButton(act);
      expect(formatted.label).toBe('【吸纳】');
      expect(formatted.subLabel).toBe('天干能量吸纳（充盈虚空/修复道损）');
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

        const formatted = formatActionButton(act);
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

        const formatted = formatActionButton(act);
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
      const formatted = formatActionButton(act);
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
      const formatted = formatActionButton(act);
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
      const formatted = formatActionButton(act);
      expect(formatted.label).toBe('【调息】');
      expect(formatted.subLabel).toBe('转同属阴');
      expect(formatted.isBurst).toBe(false);
    });
  });

  describe('e) getActionTargetElement resolution helper', () => {
    it('resolves generation target for TRANS and BURST', () => {
      const transAct: ActionPayload = {
        actionType: ActionType.TRANS,
        player: 'P1',
        sourceElement: WuXing.WOOD
      };
      expect(getActionTargetElement(transAct)).toBe(WuXing.FIRE);

      const burstAct: ActionPayload = {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WATER
      };
      expect(getActionTargetElement(burstAct)).toBe(WuXing.WOOD);
    });

    it('resolves overcoming target for ATK and BURST_ATK', () => {
      const atkAct: ActionPayload = {
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD
      };
      expect(getActionTargetElement(atkAct)).toBe(WuXing.EARTH);

      const burstAtkAct: ActionPayload = {
        actionType: ActionType.BURST_ATK,
        player: 'P1',
        sourceElement: WuXing.FIRE
      };
      expect(getActionTargetElement(burstAtkAct)).toBe(WuXing.METAL);
    });

    it('resolves self/element for AUTO and CONVERT', () => {
      const autoAct: ActionPayload = {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.EARTH
      };
      expect(getActionTargetElement(autoAct)).toBe(WuXing.EARTH);

      const convertAct: ActionPayload = {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.METAL
      };
      expect(getActionTargetElement(convertAct)).toBe(WuXing.METAL);
    });

    it('respects explicit targetElement when provided', () => {
      const explicitAct: ActionPayload = {
        actionType: ActionType.TRANS,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        targetElement: WuXing.METAL
      };
      expect(getActionTargetElement(explicitAct)).toBe(WuXing.METAL);
    });

    it('formats PASS action button presentation', () => {
      const passAct: ActionPayload = {
        actionType: ActionType.PASS,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      };
      const formatted = formatActionButton(passAct);
      expect(formatted.label).toBe('【消散】');
      expect(formatted.isBurst).toBe(false);
      expect(formatted.subLabel).toContain('消散过牌');
    });
  });

  describe('f) isAutoAbsorb = true formatting across all action types', () => {
    it('formats AUTO with countdown hints', () => {
      const act: ActionPayload = {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      };
      const formatted = formatActionButton(act, true);
      expect(formatted.label).toBe('【自动吸纳】');
      expect(formatted.subLabel).toBe('天干能量自动吸纳中（点击可立即吸纳）');
      expect(formatted.color).toBe('#68d391');
      expect(formatted.isBurst).toBe(false);
    });

    it('formats CONVERT with auto hints for both polarities', () => {
      const actYang: ActionPayload = {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.FIRE,
        polarity: Polarity.YANG
      };
      expect(formatActionButton(actYang, true)).toEqual({
        label: '【自动调息】',
        subLabel: '转同属阳（点击立即调息）',
        color: '#63b3ed',
        isBurst: false
      });

      const actYin: ActionPayload = {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.FIRE,
        polarity: Polarity.YIN
      };
      expect(formatActionButton(actYin, true).subLabel).toBe('转同属阴（点击立即调息）');
    });

    it('formats TRANS with auto hints', () => {
      const act: ActionPayload = {
        actionType: ActionType.TRANS,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      };
      const formatted = formatActionButton(act, true);
      expect(formatted.label).toBe('【自动化气】');
      expect(formatted.subLabel).toBe('生火(阳)+1（点击立即化气）');
      expect(formatted.color).toBe('#4fd1c5');
      expect(formatted.isBurst).toBe(false);
    });

    it('formats ATK with auto hints', () => {
      const act: ActionPayload = {
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN
      };
      const formatted = formatActionButton(act, true);
      expect(formatted.label).toBe('【自动击破】');
      expect(formatted.subLabel).toBe('克敌土(阴)-1（点击立即击破）');
      expect(formatted.color).toBe('#fc8181');
      expect(formatted.isBurst).toBe(false);
    });

    it('formats BURST with auto hints', () => {
      const act: ActionPayload = {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WATER,
        polarity: Polarity.YANG
      };
      const formatted = formatActionButton(act, true);
      expect(formatted.label).toBe('【自动强化】');
      expect(formatted.subLabel).toBe('消耗水·生木+2（点击立即强化）');
      expect(formatted.color).toBe('#f6e05e');
      expect(formatted.isBurst).toBe(true);
    });

    it('formats BURST_ATK with auto hints', () => {
      const act: ActionPayload = {
        actionType: ActionType.BURST_ATK,
        player: 'P1',
        sourceElement: WuXing.METAL,
        polarity: Polarity.YIN
      };
      const formatted = formatActionButton(act, true);
      expect(formatted.label).toBe('【自动强破】');
      expect(formatted.subLabel).toBe('消耗金·克木-2（点击立即强破）');
      expect(formatted.color).toBe('#f56565');
      expect(formatted.isBurst).toBe(true);
    });

    it('formats DISSIPATE with auto hints', () => {
      const act: ActionPayload = {
        actionType: ActionType.DISSIPATE,
        player: 'P1',
        element: WuXing.EARTH,
        polarity: Polarity.YANG
      };
      const formatted = formatActionButton(act, true);
      expect(formatted.label).toBe('【亢极散气】');
      expect(formatted.subLabel).toBe('亢极满溢自动散气中（点击立即散气）');
      expect(formatted.color).toBe('#e2e8f0');
      expect(formatted.isBurst).toBe(false);
    });

    it('formats PASS with auto hints vs non-auto hints', () => {
      const act: ActionPayload = {
        actionType: ActionType.PASS,
        player: 'P1',
        element: WuXing.EARTH,
        polarity: Polarity.YANG
      };
      const formattedAuto = formatActionButton(act, true);
      expect(formattedAuto.label).toBe('【消散】');
      expect(formattedAuto.subLabel).toBe('无有效动作·消散过牌中（点击立即消散）');
      expect(formattedAuto.color).toBe('#a0aec0');
      expect(formattedAuto.isBurst).toBe(false);

      const formattedManual = formatActionButton(act, false);
      expect(formattedManual.label).toBe('【消散】');
      expect(formattedManual.subLabel).toBe('无有效动作·消散过牌交接回合');
    });
  });
});

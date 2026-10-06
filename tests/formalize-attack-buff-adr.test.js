import { describe, expect, it } from 'vitest';
import { POINTS_CONFIG } from '../src/js/config/game-config.js';
import { createScoreCalculator, DefaultScoreCalculator } from '../src/js/logic/actions/ScoreCalculator.js';
import { rarityAdjustedScore } from '../src/js/state/StateScoreRecorder.js';
import { createScoringConfig } from '../src/js/logic/actions/ScoringConfig.js';
import { createInitialHeadlessState, runHeadlessMatch } from '../src/js/logic/headless/HeadlessMatch.js';

function currentOpportunity(overrides = {}) {
  return createInitialHeadlessState({
    phase: 'DECISION',
    turnCount: 1,
    maxTurns: 2,
    currentStem: { name: '甲', element: 0, color: '#2dcc70' },
    ...overrides
  });
}

function evaluate(initialState, scoringConfig, selectAction = () => null) {
  return runHeadlessMatch({
    initialState,
    stems: [],
    scoringConfig,
    strategies: {
      P1: context => selectAction(context),
      P2: () => null
    }
  });
}

function choose(type) {
  return context => context.candidates.find(candidate => candidate.type === type);
}

describe('Issue 11: Formalize Attack Buff and Burst Rarity Nerf (ADR 0002)', () => {
  describe('Seam 1: POINTS_CONFIG hardcoded 2.5x attack state scores and NO_RARITY_ACTIONS', () => {
    it('statically incorporates 2.5x attack state change scores', () => {
      // CAUSE_DMG: 120 * 2.5 = 300, 100 * 2.5 = 250
      expect(POINTS_CONFIG.STATE_CHANGE.CAUSE_DMG).toEqual({ yang: 300, yin: 250 });
      // BREAK_LIGHT: 80 * 2.5 = 200, 60 * 2.5 = 150
      expect(POINTS_CONFIG.STATE_CHANGE.BREAK_LIGHT).toEqual({ yang: 200, yin: 150 });
      // WEAKEN: 80 * 2.5 = 200
      expect(POINTS_CONFIG.STATE_CHANGE.WEAKEN).toBe(200);

      // Defense / construction scores remain unchanged
      expect(POINTS_CONFIG.STATE_CHANGE.LIGHT_UP).toBe(100);
      expect(POINTS_CONFIG.STATE_CHANGE.BLESSING).toBe(200);
      expect(POINTS_CONFIG.STATE_CHANGE.REPAIR_DMG).toEqual({ yang: 200, yin: 200 });
    });

    it('contains NO_RARITY_ACTIONS blacklist with BURST and BURST_ATK', () => {
      expect(POINTS_CONFIG.NO_RARITY_ACTIONS).toEqual(['BURST', 'BURST_ATK']);
    });
  });

  describe('Seam 2: ScoreCalculator and StateScoreRecorder default rarity bonus filtering', () => {
    it('bypasses rarity bonus for actions in POINTS_CONFIG.NO_RARITY_ACTIONS by default', () => {
      const calculator = createScoreCalculator();

      // BURST and BURST_ATK should return score unmodified
      expect(calculator._applyRarityBonus(100, 'BURST')).toBe(100);
      expect(calculator._applyRarityBonus(100, 'BURST_ATK')).toBe(100);

      // Other actions keep their rarity bonus
      const convertScore = calculator._applyRarityBonus(100, 'CONVERT');
      expect(convertScore).toBe(225);

      const atkScore = calculator._applyRarityBonus(100, 'ATK');
      expect(atkScore).toBeGreaterThan(100);
    });

    it('bypasses rarity bonus in StateScoreRecorder.rarityAdjustedScore by default', () => {
      expect(rarityAdjustedScore(100, 'BURST')).toBe(100);
      expect(rarityAdjustedScore(100, 'BURST_ATK')).toBe(100);
      expect(rarityAdjustedScore(100, 'CONVERT')).toBe(225);
    });

    it('supports NO_RARITY_ACTIONS from scoringConfig.pointsConfig if provided', () => {
      const customConfig = createScoringConfig();
      expect(customConfig.pointsConfig.NO_RARITY_ACTIONS).toEqual(['BURST', 'BURST_ATK']);

      const calculator = createScoreCalculator(undefined, customConfig);
      expect(calculator._applyRarityBonus(100, 'BURST')).toBe(100);
      expect(calculator._applyRarityBonus(100, 'BURST_ATK')).toBe(100);
      expect(rarityAdjustedScore(100, 'BURST', customConfig)).toBe(100);
      expect(rarityAdjustedScore(100, 'BURST_ATK', customConfig)).toBe(100);
    });

    it('returns statically scaled attack state scores in ScoreCalculator without extra multipliers', () => {
      const calculator = createScoreCalculator();

      expect(calculator._getStateChangeScore(0, -1, true, true, 'ATK')).toBe(300);
      expect(calculator._getStateChangeScore(0, -1, false, true, 'ATK')).toBe(250);
      expect(calculator._getStateChangeScore(1, 0, true, true, 'ATK')).toBe(200);
      expect(calculator._getStateChangeScore(1, 0, false, true, 'ATK')).toBe(150);
      expect(calculator._getStateChangeScore(2, 1, false, true, 'ATK')).toBe(200);
    });
  });

  describe('Seam 3: Default HeadlessMatch execution under formal rules', () => {
    it('awards unadjusted behavior scores for BURST in default headless match', () => {
      const initialState = currentOpportunity({
        nodeStates: {
          ...createInitialHeadlessState().nodeStates,
          'P1-0': { yang: 1, yin: 1 },
          'P1-1': { yang: 0, yin: 0 }
        }
      });

      const match = evaluate(initialState, undefined, choose('BURST'));

      // 3 substeps of BURST with 100 behavior score each, no rarity multiplier
      expect(match.finalState.actionScores.P1['强化']).toBe(300);
      // Target state improvements
      expect(match.finalState.stateScores.P1['点亮']).toBe(100);
      expect(match.finalState.stateScores.P1['加持']).toBe(200);
      // Self sacrifice state score: BREAK_LIGHT yin is now 150
      expect(match.finalState.stateScores.P1['破阴点亮']).toBe(150);
    });
  });
});

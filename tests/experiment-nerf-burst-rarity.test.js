import { describe, expect, it } from 'vitest';
import { POINTS_CONFIG } from '../src/js/config/game-config.js';
import { createScoringConfig } from '../src/js/logic/actions/ScoringConfig.js';
import { createScoreCalculator } from '../src/js/logic/actions/ScoreCalculator.js';
import { rarityAdjustedScore } from '../src/js/state/StateScoreRecorder.js';
import { createInitialHeadlessState, runHeadlessMatch } from '../src/js/logic/headless/HeadlessMatch.js';
import { decomposePlayerScores } from '../src/js/logic/headless/ScoreUnityOverlapDiagnostic.js';
import { decomposePlayerScoresWithReanalysis } from '../src/js/logic/headless/ScoreRarityReanalysis.js';

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

describe('Issue 09: Nerf Burst Rarity Scoring Experiment', () => {
  const nerfBurstConfig = createScoringConfig({
    noRarityActions: ['BURST', 'BURST_ATK']
  });

  describe('ScoreCalculator and StateScoreRecorder seams', () => {
    it('bypasses rarity bonus for actions in noRarityActions while keeping bonus for other actions', () => {
      const calculator = createScoreCalculator(undefined, nerfBurstConfig);

      // BURST and BURST_ATK should have 0 rarity bonus (score returned unchanged)
      expect(calculator._applyRarityBonus(100, 'BURST')).toBe(100);
      expect(calculator._applyRarityBonus(100, 'BURST_ATK')).toBe(100);

      // Other actions like CONVERT, TRANS, ATK should keep their rarity bonus
      const convertScore = calculator._applyRarityBonus(100, 'CONVERT');
      expect(convertScore).toBeGreaterThan(100);
      expect(convertScore).toBe(225); // 100 * (1 + 1.5 * (1 - 0.167))

      const atkScore = calculator._applyRarityBonus(100, 'ATK');
      expect(atkScore).toBeGreaterThan(100);

      // StateScoreRecorder.rarityAdjustedScore
      expect(rarityAdjustedScore(100, 'BURST', nerfBurstConfig)).toBe(100);
      expect(rarityAdjustedScore(100, 'BURST_ATK', nerfBurstConfig)).toBe(100);
      expect(rarityAdjustedScore(100, 'CONVERT', nerfBurstConfig)).toBe(225);
    });
  });

  describe('Headless match execution with noRarityActions', () => {
    it('strips rarity bonus from BURST while preserving board effects and extra turn', () => {
      const initialState = currentOpportunity({
        nodeStates: {
          ...createInitialHeadlessState().nodeStates,
          'P1-0': { yang: 1, yin: 1 },
          'P1-1': { yang: 0, yin: 0 }
        }
      });

      const baseline = evaluate(initialState, undefined, choose('BURST'));
      const nerfed = evaluate(initialState, { noRarityActions: ['BURST', 'BURST_ATK'] }, choose('BURST'));

      // Effects should be identical
      expect(nerfed.finalState.nodeStates).toEqual(baseline.finalState.nodeStates);
      expect(nerfed.finalState.isExtraTurn).toBe(baseline.finalState.isExtraTurn);
      expect(nerfed.finalState.pendingBurstPlayer).toBe(baseline.finalState.pendingBurstPlayer);

      // Baseline BURST awards rarity bonus on behavior (100 -> 245 * 3 substeps = 735)
      expect(baseline.finalState.actionScores.P1['强化']).toBe(735);

      // Nerfed BURST awards exact unadjusted scores: behavior 100 * 3 substeps = 300
      expect(nerfed.finalState.actionScores.P1['强化']).toBe(300);
      expect(nerfed.finalState.stateScores.P1['点亮']).toBe(100); // 1 lit up step * 100
      expect(nerfed.finalState.stateScores.P1['加持']).toBe(200); // 1 blessing step * 200
      expect(nerfed.finalState.stateScores.P1['破阴点亮']).toBe(60); // 1 self sacrifice * 60

      // Score change amounts should match unadjusted sum:
      // Substep 1: self sacrifice (100 action + 60 BREAK_LIGHT.yin = 160)
      // Substep 2: target yin light-up (100 action + 100 LIGHT_UP = 200)
      // Substep 3: target yin blessing (100 action + 200 BLESSING = 300)
      const nerfedScoreAmounts = nerfed.actionRecords[0].scoreChanges.map(sc => sc.amount);
      expect(nerfedScoreAmounts).toEqual([160, 200, 300]);

      // Verify decompositions show 0 rarity for BURST
      const standardBreakdown = decomposePlayerScores(nerfed, nerfed.scoringConfig);
      expect(standardBreakdown.P1.rarity).toBe(0);
      expect(standardBreakdown.P1.total).toBe(nerfed.finalState.players.P1.score);

      const reanalysisBreakdown = decomposePlayerScoresWithReanalysis(nerfed, nerfed.scoringConfig);
      expect(reanalysisBreakdown.P1.rarityByAction.BURST).toBe(0);
      expect(reanalysisBreakdown.P1.rarity).toBe(0);
      expect(reanalysisBreakdown.P1.total).toBe(nerfed.finalState.players.P1.score);
    });

    it('strips rarity bonus from BURST_ATK while preserving effects', () => {
      const initialState = currentOpportunity({
        nodeStates: {
          ...createInitialHeadlessState().nodeStates,
          'P1-0': { yang: 1, yin: 1 },
          'P2-2': { yang: 0, yin: 0 }
        }
      });

      const nerfed = evaluate(initialState, { noRarityActions: ['BURST', 'BURST_ATK'] }, choose('BURST_ATK'));

      expect(nerfed.finalState.actionScores.P1['强破']).toBe(240); // 3 substeps * 80 = 240
      const reanalysisBreakdown = decomposePlayerScoresWithReanalysis(nerfed, nerfed.scoringConfig);
      expect(reanalysisBreakdown.P1.rarityByAction.BURST_ATK).toBe(0);
      expect(reanalysisBreakdown.P1.rarity).toBe(0);
      expect(reanalysisBreakdown.P1.total).toBe(nerfed.finalState.players.P1.score);
    });

    it('preserves rarity bonus for non-burst actions when noRarityActions is configured', () => {
      const initialState = currentOpportunity({
        nodeStates: {
          ...createInitialHeadlessState().nodeStates,
          'P1-0': { yang: 1, yin: 0 }
        }
      });

      const baseline = evaluate(initialState, undefined, choose('CONVERT'));
      const nerfed = evaluate(initialState, { noRarityActions: ['BURST', 'BURST_ATK'] }, choose('CONVERT'));

      // CONVERT should still receive rarity bonus unchanged
      expect(nerfed.actionRecords[0].scoreChanges[0].amount).toBe(baseline.actionRecords[0].scoreChanges[0].amount);
      expect(nerfed.finalState.actionScores.P1['调息']).toBe(baseline.finalState.actionScores.P1['调息']);
      expect(nerfed.finalState.stateScores.P1['点亮']).toBe(baseline.finalState.stateScores.P1['点亮']);

      const reanalysisBreakdown = decomposePlayerScoresWithReanalysis(nerfed, nerfed.scoringConfig);
      expect(reanalysisBreakdown.P1.rarityByAction.CONVERT).toBeGreaterThan(0);
      expect(reanalysisBreakdown.P1.total).toBe(nerfed.finalState.players.P1.score);
    });
  });

  describe('Experiment runner and report generator', () => {
    it('runs small experiment sweep, attaches reanalysis, and builds markdown report', async () => {
      const { runNerfBurstExperiment, buildNerfBurstExperimentReportMarkdown } = await import('../src/js/logic/headless/ExperimentNerfBurstRarity.js');
      const expResult = runNerfBurstExperiment({
        maxTurns: 20,
        seeds: [202603],
        pairingKeys: ['rule-vs-rule']
      });

      expect(expResult).toHaveProperty('experimentConfig');
      expect(expResult.experimentConfig.noRarityActions).toEqual(['BURST', 'BURST_ATK']);
      expect(expResult).toHaveProperty('reanalysis');
      expect(expResult.reanalysis.rarityDistribution.BURST.sum).toBe(0);
      expect(expResult.reanalysis.rarityDistribution.BURST_ATK.sum).toBe(0);

      const markdown = buildNerfBurstExperimentReportMarkdown(expResult, expResult);
      expect(markdown).toContain('# 实验 01：剥夺爆发类动作稀有度加成');
      expect(markdown).toContain('ADR 0001');
      expect(markdown).toContain('BURST');
    });
  });
});

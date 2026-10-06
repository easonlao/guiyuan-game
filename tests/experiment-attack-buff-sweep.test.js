import { describe, expect, it } from 'vitest';
import { createScoringConfig, SCORING_CONFIG_VERSION } from '../src/js/logic/actions/ScoringConfig.js';
import { createScoreCalculator } from '../src/js/logic/actions/ScoreCalculator.js';
import { createInitialHeadlessState, runHeadlessMatch } from '../src/js/logic/headless/HeadlessMatch.js';
import { decomposePlayerScores } from '../src/js/logic/headless/ScoreUnityOverlapDiagnostic.js';
import { decomposePlayerScoresWithReanalysis } from '../src/js/logic/headless/ScoreRarityReanalysis.js';

describe('Issue 10: Attack Buff Sweep Experiment', () => {
  describe('Seam 1: ScoringConfig with attackScoreMultiplier', () => {
    it('defaults attackScoreMultiplier to 1 and keeps name as formal-baseline', () => {
      const config = createScoringConfig();
      expect(config.attackScoreMultiplier).toBe(1);
      expect(config.name).toBe('formal-baseline');
      expect(Object.isFrozen(config)).toBe(true);
    });

    it('accepts positive attackScoreMultiplier and marks config as experimental', () => {
      const config = createScoringConfig({ attackScoreMultiplier: 2.0 });
      expect(config.attackScoreMultiplier).toBe(2.0);
      expect(config.name).toBe('experimental');
      expect(config.version).toBe(SCORING_CONFIG_VERSION);
    });

    it.each([
      [0],
      [-1],
      [-0.5],
      ['2.0'],
      [NaN],
      [Infinity],
      [null]
    ])('rejects invalid attackScoreMultiplier: %s', (invalidVal) => {
      expect(() => createScoringConfig({ attackScoreMultiplier: invalidVal })).toThrow(TypeError);
    });
  });

  describe('Seam 2: ScoreCalculator attack state scaling', () => {
    it('multiplies pure attack state scores by attackScoreMultiplier while leaving defense and behavior untouched', () => {
      const config2x = createScoringConfig({ attackScoreMultiplier: 2.0, noRarityActions: ['BURST', 'BURST_ATK'] });
      const calculator = createScoreCalculator(undefined, config2x);

      // Attack state changes scaled by 2.0x
      expect(calculator._getStateChangeScore(0, -1, true, true, 'ATK')).toBe(240);  // CAUSE_DMG.yang: 120 * 2
      expect(calculator._getStateChangeScore(0, -1, false, true, 'ATK')).toBe(200); // CAUSE_DMG.yin: 100 * 2
      expect(calculator._getStateChangeScore(1, 0, true, true, 'ATK')).toBe(160);   // BREAK_LIGHT.yang: 80 * 2
      expect(calculator._getStateChangeScore(1, 0, false, true, 'ATK')).toBe(120);  // BREAK_LIGHT.yin: 60 * 2
      expect(calculator._getStateChangeScore(2, 1, false, true, 'ATK')).toBe(160);  // WEAKEN: 80 * 2

      // Defense / construction state changes NOT scaled
      expect(calculator._getStateChangeScore(0, 1, true, false, 'AUTO')).toBe(100);   // LIGHT_UP: 100
      expect(calculator._getStateChangeScore(1, 2, true, false, 'CONVERT')).toBe(200); // BLESSING: 200
      expect(calculator._getStateChangeScore(-1, 0, true, false, 'CONVERT')).toBe(200); // REPAIR_DMG.yang: 200
      expect(calculator._getStateChangeScore(-1, 0, false, false, 'CONVERT')).toBe(200); // REPAIR_DMG.yin: 200

      // Action behavior scores NOT scaled
      expect(calculator._getActionScore('ATK')).toBe(40);
      expect(calculator._getActionScore('BURST_ATK')).toBe(80);
      expect(calculator._getActionScore('BURST')).toBe(100);
      expect(calculator._getActionScore('CONVERT')).toBe(50);
    });

    it('scales attack state scores with fractional multiplier 1.5x and 2.5x accurately', () => {
      const config15 = createScoringConfig({ attackScoreMultiplier: 1.5 });
      const calc15 = createScoreCalculator(undefined, config15);
      expect(calc15._getStateChangeScore(0, -1, true, true, 'ATK')).toBe(180);  // 120 * 1.5
      expect(calc15._getStateChangeScore(0, -1, false, true, 'ATK')).toBe(150); // 100 * 1.5
      expect(calc15._getStateChangeScore(1, 0, true, true, 'ATK')).toBe(120);   // 80 * 1.5
      expect(calc15._getStateChangeScore(1, 0, false, true, 'ATK')).toBe(90);    // 60 * 1.5
      expect(calc15._getStateChangeScore(2, 1, false, true, 'ATK')).toBe(120);  // 80 * 1.5

      const config25 = createScoringConfig({ attackScoreMultiplier: 2.5 });
      const calc25 = createScoreCalculator(undefined, config25);
      expect(calc25._getStateChangeScore(0, -1, true, true, 'ATK')).toBe(300);  // 120 * 2.5
      expect(calc25._getStateChangeScore(0, -1, false, true, 'ATK')).toBe(250); // 100 * 2.5
      expect(calc25._getStateChangeScore(1, 0, true, true, 'ATK')).toBe(200);   // 80 * 2.5
      expect(calc25._getStateChangeScore(1, 0, false, true, 'ATK')).toBe(150);  // 60 * 2.5
      expect(calc25._getStateChangeScore(2, 1, false, true, 'ATK')).toBe(200);  // 80 * 2.5
    });
  });

  describe('Seam 3: Match execution & score decomposition sum invariant', () => {
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

    it('correctly attributes amplified attack points in decomposePlayerScores and preserves sum invariant', () => {
      const scoringConfig = {
        attackScoreMultiplier: 2.0,
        noRarityActions: ['BURST', 'BURST_ATK']
      };

      const initialState = currentOpportunity({
        nodeStates: {
          ...createInitialHeadlessState().nodeStates,
          'P1-0': { yang: 1, yin: 0 },
          'P2-2': { yang: 1, yin: -1 } // Opponent target for ATK (element 2 clashes with wood 0; yin is -1 so yang 1->0 BREAK_LIGHT)
        }
      });

      const match = evaluate(initialState, scoringConfig, choose('ATK'));

      // BREAK_LIGHT.yang base = 80, multiplied by 2 = 160
      expect(match.finalState.stateScores.P1['破阳点亮']).toBe(276); // 160 state score with ATK rarity (160 * (1 + 1.5 * (1 - 0.518)) = 276)
      expect(match.finalState.actionScores.P1['破']).toBe(69);        // 40 action score with ATK rarity (40 * 1.723 = 69)
      expect(match.finalState.players.P1.score).toBe(345);           // Total = 345

      // Decompose standard
      const breakdown = decomposePlayerScores(match, match.scoringConfig);
      expect(breakdown.P1.attack).toBe(160); // Scaled attack state score
      expect(breakdown.P1.behavior).toBe(40);
      expect(breakdown.P1.rarity).toBe(145); // 345 - (160 + 40) = 145
      expect(breakdown.P1.total).toBe(match.finalState.players.P1.score);

      // Decompose with reanalysis
      const reanalysisBreakdown = decomposePlayerScoresWithReanalysis(match, match.scoringConfig);
      expect(reanalysisBreakdown.P1.attack).toBe(160);
      expect(reanalysisBreakdown.P1.behavior).toBe(40);
      expect(reanalysisBreakdown.P1.rarity).toBe(145);
      expect(reanalysisBreakdown.P1.total).toBe(match.finalState.players.P1.score);
    });

    it('preserves noRarityActions for BURST_ATK while scaling its attack score', () => {
      const scoringConfig = {
        attackScoreMultiplier: 2.0,
        noRarityActions: ['BURST', 'BURST_ATK']
      };

      const initialState = currentOpportunity({
        nodeStates: {
          ...createInitialHeadlessState().nodeStates,
          'P1-0': { yang: 1, yin: 1 },
          'P2-2': { yang: 1, yin: 0 }
        }
      });

      const match = evaluate(initialState, scoringConfig, choose('BURST_ATK'));

      const breakdown = decomposePlayerScoresWithReanalysis(match, match.scoringConfig);
      expect(breakdown.P1.rarityByAction.BURST_ATK).toBe(0);
      expect(breakdown.P1.rarity).toBe(0);
      expect(breakdown.P1.attack).toBeGreaterThan(0);
      expect(breakdown.P1.total).toBe(match.finalState.players.P1.score);
    });
  });

  describe('Seam 4: Experiment sweep runner & report generator', () => {
    it('evaluates candidate multipliers and automatically selects optimal multiplier', async () => {
      const { evaluateSweepCandidates } = await import('../src/js/logic/headless/ExperimentAttackBuffSweep.js');

      // Candidate 1: strong win rate 62% (<65% fails guardrail 2)
      // Candidate 2: strong win rate 68% (>=65% passes), midgame divergent win rate 48% (distance 0.02)
      // Candidate 3: strong win rate 70% (>=65% passes), midgame divergent win rate 54% (distance 0.04)
      const mockCandidates = [
        { multiplier: 1.5, strongWinRate: 0.62, divergentScoreLeaderWinRate: 0.46 },
        { multiplier: 2.0, strongWinRate: 0.68, divergentScoreLeaderWinRate: 0.48 },
        { multiplier: 2.5, strongWinRate: 0.70, divergentScoreLeaderWinRate: 0.54 }
      ];

      const evaluation = evaluateSweepCandidates(mockCandidates);
      expect(evaluation.selectedMultiplier).toBe(2.0);
      expect(evaluation.candidates[0].guardrail2Pass).toBe(false);
      expect(evaluation.candidates[1].guardrail2Pass).toBe(true);
      expect(evaluation.candidates[2].guardrail2Pass).toBe(true);
      expect(evaluation.rationale).toContain('2.0x');
    });

    it('falls back to highest strong win rate if no candidate passes guardrail 2', async () => {
      const { evaluateSweepCandidates } = await import('../src/js/logic/headless/ExperimentAttackBuffSweep.js');

      const mockCandidates = [
        { multiplier: 1.5, strongWinRate: 0.61, divergentScoreLeaderWinRate: 0.45 },
        { multiplier: 2.0, strongWinRate: 0.63, divergentScoreLeaderWinRate: 0.47 },
        { multiplier: 2.5, strongWinRate: 0.64, divergentScoreLeaderWinRate: 0.49 }
      ];

      const evaluation = evaluateSweepCandidates(mockCandidates);
      expect(evaluation.selectedMultiplier).toBe(2.5); // Highest strong win rate
      expect(evaluation.rationale).toContain('2.5x');
    });

    it('runs small sweep and generates comprehensive markdown report', async () => {
      const {
        runAttackBuffSweep,
        runFullAttackBuffExperiment,
        buildAttackBuffExperimentReportMarkdown
      } = await import('../src/js/logic/headless/ExperimentAttackBuffSweep.js');

      // Run tiny sweep with 1 seed
      const sweepResult = runAttackBuffSweep({
        sweepMultipliers: [1.5, 2.0],
        seeds: [202603],
        sweepPairings: ['strong-d1-vs-rule'],
        maxTurns: 10
      });

      expect(sweepResult).toHaveProperty('selectedMultiplier');
      expect([1.5, 2.0]).toContain(sweepResult.selectedMultiplier);

      // Run small full experiment
      const fullExp = runFullAttackBuffExperiment({
        multiplier: sweepResult.selectedMultiplier,
        maxTurns: 10,
        seeds: [202603],
        pairingKeys: ['strong-d1-vs-rule']
      });

      expect(fullExp.scoringConfig.attackScoreMultiplier).toBe(sweepResult.selectedMultiplier);
      expect(fullExp.scoringConfig.noRarityActions).toEqual(['BURST', 'BURST_ATK']);

      const report = buildAttackBuffExperimentReportMarkdown({
        sweepSummary: sweepResult,
        fullExperimentData: fullExp,
        baselineData: fullExp,
        exp01Data: fullExp
      });

      expect(report).toContain('# 实验 02：攻击压制收益参数扫描与计分路线确立');
      expect(report).toContain('参数扫描');
      expect(report).toContain('ADR 0001');
      expect(report).toContain('护栏 2');
    });
  });
});

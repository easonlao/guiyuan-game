import { describe, expect, it } from 'vitest';
import { createInitialHeadlessState } from '../src/js/logic/headless/HeadlessMatch.js';
import { runSeededMatch } from '../src/js/logic/headless/SeededMatch.js';
import {
  decomposePlayerScores,
  analyzeTurnLimitOverlap,
  analyzeMidgamePrediction,
  runScoreUnityOverlapDiagnostic,
  buildScoreUnityOverlapReportMarkdown,
  wilsonScoreInterval
} from '../src/js/logic/headless/ScoreUnityOverlapDiagnostic.js';
import { SWEEP_PAIRINGS } from '../src/js/logic/headless/Phase1SweepRunner.js';

describe('issue 07: Score and Unity Overlap Diagnostic', () => {
  describe('decomposePlayerScores', () => {
    it('decomposes player score exactly into construction, attack, behavior, dividend, penalty, and rarity', () => {
      const match = runSeededMatch({
        initialState: createInitialHeadlessState({ maxTurns: 60 }),
        seed: 202603,
        strategies: { P1: 'situation-responsive', P2: 'build-priority' }
      });

      const breakdown = decomposePlayerScores(match);
      expect(breakdown).toHaveProperty('P1');
      expect(breakdown).toHaveProperty('P2');

      for (const pid of ['P1', 'P2']) {
        const playerStats = breakdown[pid];
        expect(playerStats).toHaveProperty('construction');
        expect(playerStats).toHaveProperty('attack');
        expect(playerStats).toHaveProperty('behavior');
        expect(playerStats).toHaveProperty('dividend');
        expect(playerStats).toHaveProperty('penalty');
        expect(playerStats).toHaveProperty('rarity');
        expect(playerStats).toHaveProperty('total');

        const sum = playerStats.construction +
          playerStats.attack +
          playerStats.behavior +
          playerStats.dividend +
          playerStats.penalty +
          playerStats.rarity;

        expect(sum).toBe(match.finalState.players[pid].score);
        expect(playerStats.total).toBe(match.finalState.players[pid].score);
      }
    });
  });

  describe('analyzeTurnLimitOverlap', () => {
    it('correctly categorizes matches where score leader equals lit leader, lit sides are equal, or score leader has fewer lit sides', () => {
      // Mock matches ending at turn limit
      const matches = [
        // Case 1: P1 leads score (1000 vs 500) and P1 leads lit (8 vs 6) -> aligned
        {
          terminalResult: { winner: 'P1', reason: '回合上限' },
          finalState: {
            players: { P1: { score: 1000 }, P2: { score: 500 } },
            nodeStates: {
              'P1-0': { yang: 1, yin: 1 }, 'P1-1': { yang: 1, yin: 1 },
              'P1-2': { yang: 1, yin: 1 }, 'P1-3': { yang: 1, yin: 1 }, 'P1-4': { yang: 0, yin: 0 },
              'P2-0': { yang: 1, yin: 1 }, 'P2-1': { yang: 1, yin: 1 },
              'P2-2': { yang: 1, yin: 1 }, 'P2-3': { yang: 0, yin: 0 }, 'P2-4': { yang: 0, yin: 0 }
            }
          }
        },
        // Case 2: P1 leads score (1200 vs 800) but lit sides are equal (6 vs 6) -> lit sides equal
        {
          terminalResult: { winner: 'P1', reason: '回合上限' },
          finalState: {
            players: { P1: { score: 1200 }, P2: { score: 800 } },
            nodeStates: {
              'P1-0': { yang: 1, yin: 1 }, 'P1-1': { yang: 1, yin: 1 }, 'P1-2': { yang: 1, yin: 1 },
              'P1-3': { yang: 0, yin: 0 }, 'P1-4': { yang: 0, yin: 0 },
              'P2-0': { yang: 1, yin: 1 }, 'P2-1': { yang: 1, yin: 1 }, 'P2-2': { yang: 1, yin: 1 },
              'P2-3': { yang: 0, yin: 0 }, 'P2-4': { yang: 0, yin: 0 }
            }
          }
        },
        // Case 3: P1 leads score (1500 vs 900) but P2 leads lit sides (4 vs 6) -> score leader fewer lit
        {
          terminalResult: { winner: 'P1', reason: '回合上限' },
          finalState: {
            players: { P1: { score: 1500 }, P2: { score: 900 } },
            nodeStates: {
              'P1-0': { yang: 1, yin: 1 }, 'P1-1': { yang: 1, yin: 1 },
              'P1-2': { yang: 0, yin: 0 }, 'P1-3': { yang: 0, yin: 0 }, 'P1-4': { yang: 0, yin: 0 },
              'P2-0': { yang: 1, yin: 1 }, 'P2-1': { yang: 1, yin: 1 }, 'P2-2': { yang: 1, yin: 1 },
              'P2-3': { yang: 0, yin: 0 }, 'P2-4': { yang: 0, yin: 0 }
            }
          }
        },
        // Case 4: Unity victory match -> excluded from turn limit metrics
        {
          terminalResult: { winner: 'P1', reason: '所有天干点亮' },
          finalState: {
            players: { P1: { score: 2000 }, P2: { score: 500 } },
            nodeStates: {}
          }
        }
      ];

      const metrics = analyzeTurnLimitOverlap(matches);
      expect(metrics.totalMatches).toBe(4);
      expect(metrics.turnLimitMatchesCount).toBe(3);
      expect(metrics.scoreLeaderEqualsLitLeaderCount).toBe(1);
      expect(metrics.scoreLeaderEqualsLitLeaderRate).toBeCloseTo(1 / 3, 4);
      expect(metrics.litEqualCount).toBe(1);
      expect(metrics.litEqualRate).toBeCloseTo(1 / 3, 4);
      expect(metrics.scoreLeaderFewerLitCount).toBe(1);
      expect(metrics.scoreLeaderFewerLitRate).toBeCloseTo(1 / 3, 4);
    });
  });

  describe('analyzeMidgamePrediction', () => {
    it('analyzes consistency between score leader and lit leader at turn 30 and tracks final outcomes', () => {
      const createNodes = (p1Lit, p2Lit) => {
        const nodes = {};
        for (let i = 0; i < 5; i++) {
          nodes[`P1-${i}`] = { yang: 0, yin: 0 };
          nodes[`P2-${i}`] = { yang: 0, yin: 0 };
        }
        let p1Set = 0;
        for (let i = 0; i < 5 && p1Set < p1Lit; i++) {
          if (p1Set < p1Lit) { nodes[`P1-${i}`].yang = 1; p1Set++; }
          if (p1Set < p1Lit) { nodes[`P1-${i}`].yin = 1; p1Set++; }
        }
        let p2Set = 0;
        for (let i = 0; i < 5 && p2Set < p2Lit; i++) {
          if (p2Set < p2Lit) { nodes[`P2-${i}`].yang = 1; p2Set++; }
          if (p2Set < p2Lit) { nodes[`P2-${i}`].yin = 1; p2Set++; }
        }
        return nodes;
      };

      const matches = [
        // Match 1: At turn 30, P1 leads score (1000 vs 500) and P1 leads lit (6 vs 4) -> ALIGNED. P1 wins by unity.
        {
          terminalResult: { winner: 'P1', reason: '所有天干点亮' },
          trajectory: [
            {
              opportunity: 30,
              event: 'turn-start',
              state: {
                players: { P1: { score: 1000 }, P2: { score: 500 } },
                nodeStates: createNodes(6, 4)
              }
            }
          ]
        },
        // Match 2: At turn 30, P1 leads score (1000 vs 500) but P2 leads lit (4 vs 6) -> DIVERGENT. P2 wins by unity.
        {
          terminalResult: { winner: 'P2', reason: '所有天干点亮' },
          trajectory: [
            {
              opportunity: 30,
              event: 'turn-start',
              state: {
                players: { P1: { score: 1000 }, P2: { score: 500 } },
                nodeStates: createNodes(4, 6)
              }
            }
          ]
        },
        // Match 3: Ended before turn 30
        {
          terminalResult: { winner: 'P1', reason: '所有天干点亮' },
          trajectory: [
            { opportunity: 20, event: 'turn-start', state: { players: { P1: { score: 800 }, P2: { score: 300 } }, nodeStates: {} } }
          ]
        }
      ];

      const midgame = analyzeMidgamePrediction(matches, 30);
      expect(midgame.totalMatches).toBe(3);
      expect(midgame.reachedMidgameCount).toBe(2);
      expect(midgame.endedBeforeMidgameCount).toBe(1);
      expect(midgame.alignedCount).toBe(1);
      expect(midgame.divergentCount).toBe(1);

      // Aligned match outcome
      expect(midgame.aligned.leaderWonCount).toBe(1);
      expect(midgame.aligned.leaderUnityWonCount).toBe(1);
      expect(midgame.aligned.trailerWonCount).toBe(0);

      // Divergent match outcome
      expect(midgame.divergent.litLeaderWonCount).toBe(1);
      expect(midgame.divergent.scoreLeaderWonCount).toBe(0);
    });
  });

  describe('runScoreUnityOverlapDiagnostic and buildScoreUnityOverlapReportMarkdown', () => {
    it('runs small diagnostic sweep, computes all required metrics, and generates markdown report with 问题—证据—边界', () => {
      const diagnostic = runScoreUnityOverlapDiagnostic({
        maxTurns: 60,
        seeds: [202603, 202604],
        pairingKeys: ['rule-vs-rule', 'search-d1-score']
      });

      expect(diagnostic.schemaVersion).toBe(1);
      expect(diagnostic.diagnosticPhase).toBe('score-unity-overlap');
      expect(diagnostic.totalMatches).toBe(8); // 2 pairings * 2 seeds * 2 starters
      expect(diagnostic.pairings).toHaveLength(2);

      // Check per-pairing metrics
      for (const pairing of diagnostic.pairings) {
        expect(pairing).toHaveProperty('turnLimitOverlap');
        expect(pairing).toHaveProperty('midgamePrediction');
        expect(pairing).toHaveProperty('scoreComposition');
        expect(pairing.scoreComposition.winner).toHaveProperty('construction');
        expect(pairing.scoreComposition.winner).toHaveProperty('attack');
        expect(pairing.scoreComposition.winner).toHaveProperty('behavior');
        expect(pairing.scoreComposition.winner).toHaveProperty('dividend');
        expect(pairing.scoreComposition.winner).toHaveProperty('penalty');
        expect(pairing.scoreComposition.winner).toHaveProperty('rarity');
      }

      // Check overall metrics
      expect(diagnostic.overall).toHaveProperty('turnLimitOverlap');
      expect(diagnostic.overall).toHaveProperty('midgamePrediction');
      expect(diagnostic.overall).toHaveProperty('scoreComposition');
      expect(diagnostic).toHaveProperty('adr0001Evaluation');
      expect(diagnostic.adr0001Evaluation).toHaveProperty('guardrail1UnityRate');
      expect(diagnostic.adr0001Evaluation).toHaveProperty('guardrail2StrongWinRate');
      expect(diagnostic.adr0001Evaluation).toHaveProperty('guardrail3StarterCI');

      // Check report generation
      const markdown = buildScoreUnityOverlapReportMarkdown(diagnostic, {
        revision: { commit: 'test-commit', sourceSha256: 'test-sha' },
        replayCommand: 'node scripts/generate-score-unity-overlap.js --seeds 2'
      });

      expect(markdown).toContain('# 计分与五行归元进度重合度诊断报告');
      expect(markdown).toContain('## 1. 核心问题回答（问题—证据—边界）');
      expect(markdown).toContain('证据充足度评估：证据不足');
      expect(markdown).toContain('分高者 = 点亮侧数多者');
      expect(markdown).toContain('得分结构');
      expect(markdown).toContain('第 30 回合');
      expect(markdown).toContain('## 2. 诊断数据表');
      expect(markdown).toContain('建设');
      expect(markdown).toContain('攻击');
      expect(markdown).toContain('行为分');
      expect(markdown).toContain('亢极分红');
      expect(markdown).toContain('道损扣分');
      expect(markdown).toContain('稀有度加成');
      expect(markdown).toContain('## 3. ADR 0001 护栏基线对照');
    });

    it('computes wilson score interval accurately', () => {
      expect(wilsonScoreInterval(0, 0)).toEqual({ low: 0, high: 0 });
      const ci = wilsonScoreInterval(50, 100);
      expect(ci.low).toBeGreaterThan(0.39);
      expect(ci.high).toBeLessThan(0.61);
      expect((ci.low + ci.high) / 2).toBeCloseTo(0.5, 2);
    });

    it('verifies score decomposition sum invariant across all 6 pairings and starter swaps', () => {
      const diagnostic = runScoreUnityOverlapDiagnostic({
        maxTurns: 60,
        seeds: [202603],
        pairingKeys: Object.keys(SWEEP_PAIRINGS)
      });

      expect(diagnostic.pairings).toHaveLength(6);
      expect(diagnostic.totalMatches).toBe(12); // 6 pairings * 1 seed * 2 starters

      for (const p of diagnostic.pairings) {
        expect(p.totalMatches).toBe(2);
        // Scores add up properly
        const w = p.scoreComposition.winner;
        const l = p.scoreComposition.loser;
        expect(w.total.mean).toBeGreaterThan(0);
        expect(l.total.mean).toBeGreaterThan(0);
      }
    });

    it('handles edge case where all matches end by unity victory without division by zero', () => {
      const unityMatches = [
        {
          terminalResult: { winner: 'P1', reason: '所有天干点亮' },
          finalState: { players: { P1: { score: 2000 }, P2: { score: 1000 } }, nodeStates: {} }
        }
      ];

      const overlap = analyzeTurnLimitOverlap(unityMatches);
      expect(overlap.totalMatches).toBe(1);
      expect(overlap.turnLimitMatchesCount).toBe(0);
      expect(overlap.scoreLeaderEqualsLitLeaderRate).toBe(0);
      expect(overlap.litEqualRate).toBe(0);
      expect(overlap.scoreLeaderFewerLitRate).toBe(0);

      const midgame = analyzeMidgamePrediction(unityMatches, 30);
      expect(midgame.totalMatches).toBe(1);
      expect(midgame.reachedMidgameCount).toBe(0);
      expect(midgame.endedBeforeMidgameCount).toBe(1);
      expect(midgame.alignedRate).toBe(0);
      expect(midgame.divergentRate).toBe(0);
    });
  });
});


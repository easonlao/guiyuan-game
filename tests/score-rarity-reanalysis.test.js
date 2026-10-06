import { describe, expect, it } from 'vitest';
import { createInitialHeadlessState } from '../src/js/logic/headless/HeadlessMatch.js';
import { runSeededMatch } from '../src/js/logic/headless/SeededMatch.js';
import {
  decomposePlayerScoresWithReanalysis,
  extractMatchBreakdown,
  performScoreRarityReanalysis,
  buildScoreRarityReanalysisReportMarkdown
} from '../src/js/logic/headless/ScoreRarityReanalysis.js';

describe('issue 08: Score Rarity Reanalysis', () => {
  describe('decomposePlayerScoresWithReanalysis', () => {
    it('decomposes score, separates BURST self-cost from attack, and breaks down rarity by action', () => {
      const match = runSeededMatch({
        initialState: createInitialHeadlessState({ maxTurns: 60 }),
        seed: 202603,
        strategies: { P1: 'situation-responsive', P2: 'build-priority' }
      });

      const breakdown = decomposePlayerScoresWithReanalysis(match);
      expect(breakdown).toHaveProperty('P1');
      expect(breakdown).toHaveProperty('P2');

      for (const pid of ['P1', 'P2']) {
        const stats = breakdown[pid];
        expect(stats).toHaveProperty('construction');
        expect(stats).toHaveProperty('attack');
        expect(stats).toHaveProperty('behavior');
        expect(stats).toHaveProperty('dividend');
        expect(stats).toHaveProperty('penalty');
        expect(stats).toHaveProperty('rarity');
        expect(stats).toHaveProperty('burstSelfCost');
        expect(stats).toHaveProperty('rarityByAction');
        expect(stats).toHaveProperty('total');

        // Sum invariant: categories must sum up to total player score
        const categorySum = stats.construction +
          stats.attack +
          stats.behavior +
          stats.dividend +
          stats.penalty +
          stats.rarity;

        expect(categorySum).toBe(match.finalState.players[pid].score);
        expect(stats.total).toBe(match.finalState.players[pid].score);

        // Rarity breakdown invariant: sum of action rarities must equal total rarity
        const raritySum = Object.values(stats.rarityByAction).reduce((acc, v) => acc + v, 0);
        expect(raritySum).toBe(stats.rarity);
      }
    });

    it('reclassifies BURST self-cost away from attack into construction', () => {
      // Mock match with a BURST action that weakens own node
      const mockMatch = {
        actionRecords: [
          {
            playerId: 'P1',
            action: { type: 'BURST' },
            stateChanges: [
              { playerId: 'P1', elementIndex: 0, side: 'yin', before: 1, after: 0 },
              { playerId: 'P1', elementIndex: 1, side: 'yin', before: 0, after: 1 }
            ],
            scoreChanges: [
              // Self weaken in BURST (BREAK_LIGHT yin = 60 pts, rarity baseAction 100 + baseState 60 = 160, unadjusted 160, rarity bonus = 232 - 160 = 72)
              { playerId: 'P1', amount: 392, reason: '强化·破阴点亮', actionType: 'BURST' },
              // Self lighting
              { playerId: 'P1', amount: 490, reason: '强化·点亮', actionType: 'BURST' }
            ],
            passiveScoreChanges: []
          }
        ],
        finalState: {
          players: {
            P1: { score: 882 },
            P2: { score: 0 }
          }
        }
      };

      const breakdown = decomposePlayerScoresWithReanalysis(mockMatch);
      const p1 = breakdown.P1;

      // Burst self cost is 150 (baseState of 破阴点亮)
      expect(p1.burstSelfCost).toBe(150);
      // Attack must be 0 because BURST self-cost was removed from attack!
      expect(p1.attack).toBe(0);
      // Construction includes baseState for 点亮 (100) + burstSelfCost (150) = 250
      expect(p1.construction).toBe(250);
      // Total score invariant holds
      expect(p1.total).toBe(882);
      expect(p1.construction + p1.attack + p1.behavior + p1.dividend + p1.penalty + p1.rarity).toBe(882);
    });
  });

  describe('performScoreRarityReanalysis', () => {
    it('filters only turn-limit matches and computes winner vs loser deltas and rarity distribution', () => {
      const mockBreakdowns = [
        // Turn limit match 1: P1 wins
        {
          pairingId: 'pairing-a',
          winner: 'P1',
          reason: '回合上限',
          turns: 60,
          breakdown: {
            P1: { construction: 3000, attack: 500, behavior: 1500, dividend: 400, penalty: 0, rarity: 5000, burstSelfCost: 200, rarityByAction: { BURST: 4000, CONVERT: 1000 }, total: 10400 },
            P2: { construction: 2500, attack: 400, behavior: 1200, dividend: 300, penalty: -20, rarity: 4000, burstSelfCost: 100, rarityByAction: { BURST: 3000, CONVERT: 1000 }, total: 8380 }
          }
        },
        // Turn limit match 2: P2 wins
        {
          pairingId: 'pairing-a',
          winner: 'P2',
          reason: '回合上限',
          turns: 60,
          breakdown: {
            P1: { construction: 2000, attack: 300, behavior: 1000, dividend: 200, penalty: 0, rarity: 3000, burstSelfCost: 50, rarityByAction: { BURST: 2500, CONVERT: 500 }, total: 6500 },
            P2: { construction: 2800, attack: 600, behavior: 1400, dividend: 500, penalty: 0, rarity: 4800, burstSelfCost: 150, rarityByAction: { BURST: 3800, CONVERT: 1000 }, total: 10100 }
          }
        },
        // Unity match: should be filtered out!
        {
          pairingId: 'pairing-a',
          winner: 'P1',
          reason: '所有天干点亮',
          turns: 32,
          breakdown: {
            P1: { construction: 1500, attack: 100, behavior: 800, dividend: 100, penalty: 0, rarity: 2000, burstSelfCost: 0, rarityByAction: { BURST: 2000 }, total: 4500 },
            P2: { construction: 1200, attack: 100, behavior: 700, dividend: 100, penalty: 0, rarity: 1500, burstSelfCost: 0, rarityByAction: { BURST: 1500 }, total: 3600 }
          }
        }
      ];

      const result = performScoreRarityReanalysis({ matchBreakdowns: mockBreakdowns, totalMatches: 3 });

      expect(result.totalMatches).toBe(3);
      expect(result.turnLimitMatchesCount).toBe(2);
      expect(result.turnLimitRate).toBeCloseTo(2 / 3);

      // Score composition for turn limit
      const comp = result.scoreComposition;
      expect(comp.winner.count).toBe(2);
      expect(comp.loser.count).toBe(2);

      // Winner total mean: (10400 + 10100) / 2 = 10250
      expect(comp.winner.total.mean).toBe(10250);
      // Loser total mean: (8380 + 6500) / 2 = 7440
      expect(comp.loser.total.mean).toBe(7440);

      // Delta: 10250 - 7440 = 2810
      expect(comp.delta.total).toBe(2810);
      expect(comp.delta.construction).toBe(( (3000 + 2800)/2 ) - ( (2500 + 2000)/2 )); // 2900 - 2250 = 650
      expect(comp.delta.rarity).toBe(( (5000 + 4800)/2 ) - ( (4000 + 3000)/2 )); // 4900 - 3500 = 1400

      // Rarity distribution
      expect(result.rarityDistribution).toHaveProperty('BURST');
      expect(result.rarityDistribution).toHaveProperty('CONVERT');
      const totalRarity = (5000 + 4800 + 4000 + 3000); // 16800
      expect(result.rarityDistribution.BURST.sum).toBe(4000 + 3800 + 3000 + 2500); // 13300
      expect(result.rarityDistribution.BURST.percent).toBeCloseTo((13300 / 16800) * 100);
    });
  });

  describe('buildScoreRarityReanalysisReportMarkdown', () => {
    it('generates structured Markdown following 问题—证据—边界 with deltas and rarity distribution', () => {
      const mockResult = {
        totalMatches: 2400,
        turnLimitMatchesCount: 896,
        turnLimitRate: 896 / 2400,
        scoreComposition: {
          winner: {
            count: 896,
            total: { mean: 12500 },
            construction: { mean: 3100, percent: 24.8 },
            attack: { mean: 650, percent: 5.2 },
            behavior: { mean: 1850, percent: 14.8 },
            dividend: { mean: 600, percent: 4.8 },
            penalty: { mean: -10, percent: -0.1 },
            rarity: { mean: 6310, percent: 50.5 }
          },
          loser: {
            count: 896,
            total: { mean: 10200 },
            construction: { mean: 2800, percent: 27.5 },
            attack: { mean: 550, percent: 5.4 },
            behavior: { mean: 1500, percent: 14.7 },
            dividend: { mean: 500, percent: 4.9 },
            penalty: { mean: -30, percent: -0.3 },
            rarity: { mean: 4880, percent: 47.8 }
          },
          delta: {
            total: 2300,
            construction: 300,
            attack: 100,
            behavior: 350,
            dividend: 100,
            penalty: 20,
            rarity: 1430
          }
        },
        burstCorrection: {
          winnerSelfCostMean: 180,
          loserSelfCostMean: 160,
          impactSummary: '将每局均值约 160-180 分的自耗从攻击类剔除并归入建设/防守成本'
        },
        rarityDistribution: {
          BURST: { name: '强化 (BURST)', sum: 8500000, percent: 84.5, winnerMean: 5350, loserMean: 4135 },
          BURST_ATK: { name: '强破 (BURST_ATK)', sum: 450000, percent: 4.5, winnerMean: 280, loserMean: 220 },
          CONVERT: { name: '调息 (CONVERT)', sum: 650000, percent: 6.5, winnerMean: 410, loserMean: 315 },
          TRANS: { name: '化 (TRANS)', sum: 350000, percent: 3.5, winnerMean: 220, loserMean: 170 },
          ATK: { name: '破 (ATK)', sum: 100000, percent: 1.0, winnerMean: 60, loserMean: 50 },
          AUTO: { name: '吸纳 (AUTO)', sum: 0, percent: 0, winnerMean: 0, loserMean: 0 }
        }
      };

      const markdown = buildScoreRarityReanalysisReportMarkdown(mockResult, {
        dataSource: 'reports/balance-diagnostics/score-unity-overlap/data.json'
      });

      expect(markdown).toContain('# 计分数据再分析与稀有度溯源补充报告');
      expect(markdown).toContain('## 1. 核心发现与口径修正回答（问题—证据—边界）');
      expect(markdown).toContain('限定样本（回合上限 896 局）下胜负分差');
      expect(markdown).toContain('修正强化（BURST）自耗归属');
      expect(markdown).toContain('稀有度加成（Rarity Bonus）动作溯源拆解');
      expect(markdown).toContain('## 2. 诊断对比数据表');
      expect(markdown).toContain('表 1：896 局回合上限结算下胜方 vs 输方各项得分均值及净分差表');
      expect(markdown).toContain('表 2：稀有度加成在各具体动作中的分布与溯源明细');
      expect(markdown).toContain('## 3. 对第二阶段计分实验的指导建议');
    });
  });

  describe('scripts/analyze-score-rarity.js CLI', () => {
    it('executes CLI with --data and --out flags successfully', async () => {
      const { execSync } = await import('node:child_process');
      const { writeFileSync, unlinkSync, existsSync, readFileSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { resolve } = await import('node:path');

      const tempJson = resolve(tmpdir(), 'temp-reanalysis-test.json');
      const tempReport = resolve(tmpdir(), 'temp-reanalysis-report.md');

      const mockData = {
        totalMatches: 2,
        matchBreakdowns: [
          {
            pairingId: 'p1',
            winner: 'P1',
            reason: '回合上限',
            turns: 60,
            breakdown: {
              P1: { construction: 3000, attack: 400, behavior: 1500, dividend: 400, penalty: 0, rarity: 5000, burstSelfCost: 100, rarityByAction: { BURST: 4000, CONVERT: 1000 }, total: 10300 },
              P2: { construction: 2500, attack: 300, behavior: 1200, dividend: 300, penalty: -20, rarity: 4000, burstSelfCost: 100, rarityByAction: { BURST: 3000, CONVERT: 1000 }, total: 8280 }
            }
          }
        ]
      };

      try {
        writeFileSync(tempJson, JSON.stringify(mockData), 'utf8');
        execSync(`node scripts/analyze-score-rarity.js --data ${tempJson} --out ${tempReport}`, { stdio: 'pipe' });

        expect(existsSync(tempReport)).toBe(true);
        const reportContent = readFileSync(tempReport, 'utf8');
        expect(reportContent).toContain('# 计分数据再分析与稀有度溯源补充报告');
        expect(reportContent).toContain('回合上限结算下胜方 vs 输方各项得分均值');
      } finally {
        if (existsSync(tempJson)) unlinkSync(tempJson);
        if (existsSync(tempReport)) unlinkSync(tempReport);
      }
    });
  });
});


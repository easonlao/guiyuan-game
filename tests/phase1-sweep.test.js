import { describe, expect, it } from 'vitest';
import {
  computeCellMetrics,
  runPhase1Sweep,
  buildPhase1ReportMarkdown,
  SWEEP_PAIRINGS
} from '../src/js/logic/headless/Phase1SweepRunner.js';

describe('issue 05: Phase 1 balance sweep', () => {
  it('computes all 6 required balance metrics for a cell', () => {
    // Run a small sweep with 5 seeds across 12 and 60 turns
    const sweep = runPhase1Sweep({
      maxTurnsList: [12, 60],
      seeds: [202603, 202604, 202605, 202606, 202607],
      pairingKeys: ['rule-vs-rule', 'strong-d2-vs-rule']
    });

    expect(sweep.cells.length).toBe(4);
    for (const cell of sweep.cells) {
      // 1. 五行归元获胜占比及达成回合
      expect(cell.unityVictory).toHaveProperty('rate');
      expect(cell.unityVictory).toHaveProperty('count');

      // 2. 先手胜率及区间
      expect(cell.starterAdvantage).toHaveProperty('winRate');
      expect(cell.starterAdvantage).toHaveProperty('interval95');

      // 3. 回合上限结算的分差与输方得分分布
      expect(cell.settlementDistributions).toHaveProperty('scoreDiff');
      expect(cell.settlementDistributions).toHaveProperty('loserScore');

      // 4. 逆转率与中盘落后定义
      expect(cell.reversal).toHaveProperty('rate');
      expect(cell.reversal).toHaveProperty('definition');

      // 5. 排除强制吸纳后的动作选择占比与每局真实决策次数
      expect(cell.decisionMetrics).toHaveProperty('decisionsPerMatch');
      expect(cell.decisionMetrics).toHaveProperty('actionDistribution');

      // 6. 强弱对阵胜率
      expect(cell.strongVsWeak).toBeDefined();
    }
  });

  it('generates structured Markdown report following 问题—证据—边界 without modifying formal rules', () => {
    const sweep = runPhase1Sweep({
      maxTurnsList: [12, 60],
      seeds: [202603, 202604, 202605],
      pairingKeys: ['rule-vs-rule', 'strong-d1-vs-rule', 'strong-d2-vs-rule']
    });

    const markdown = buildPhase1ReportMarkdown(sweep, {
      revision: { commit: 'test-commit', sourceSha256: 'test-sha' },
      replayCommand: 'npm test'
    });

    expect(markdown).toContain('# 第一阶段体检：回合上限与电脑强度平衡扫描报告');
    expect(markdown).toContain('## 1. 核心问题回答（问题—证据—边界）');
    expect(markdown).toContain('## 2. 第一阶段扫描全景数据表');
    expect(markdown).toContain('五行归元');
    expect(markdown).toContain('先手胜率');
    expect(markdown).toContain('逆转率');
    expect(markdown).toContain('真实决策');
  });
});
